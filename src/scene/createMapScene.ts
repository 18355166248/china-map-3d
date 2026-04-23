import * as THREE from "three";
import { computeKV, type KVResult } from "../geo/camera";
import { loadGeoJSON } from "../geo/loader";
import { projectGeoJSON } from "../geo/transform";
import { buildGeometry } from "../geo/triangulate";
import { buildMergedBoundary } from "../map/mergedBoundary";
import { DrillController, type DrillLevel } from "../map/drill";
import { loadTexture } from "../map/texture";
import { MapLayer } from "../map/MapLayer";
import { DEFAULT_MAP_SCENE_CONFIG } from "./defaults";
import type {
  LevelState,
  MapLevelName,
  MapSceneConfig,
  MapSceneModule,
  MapTextureConfig,
  NormalTextureConfig,
  SceneModuleKey,
} from "./types";

type GeomGroup = Parameters<MapLayer["buildMeshes"]>[0];
type MergedBoundary = ReturnType<typeof buildMergedBoundary>;

interface LevelBundle {
  level: LevelState;
  kv: KVResult;
}

interface BaseSceneCacheEntry {
  geometry: GeomGroup;
  mergedBoundary: MergedBoundary;
}

interface ModuleConstructorMap {
  RotatingRingsModule: new (
    layer: MapLayer,
    config: NonNullable<NonNullable<MapSceneConfig["background"]>["rotatingRings"]>,
    initialLevel: LevelState,
  ) => MapSceneModule;
  LabelModule: new (
    layer: MapLayer,
    config: NonNullable<MapSceneConfig["labels"]>,
    initialLevel: LevelState,
  ) => MapSceneModule;
  HighlightModule: new (
    layer: MapLayer,
    config: NonNullable<MapSceneConfig["highlight"]>,
    initialLevel: LevelState,
  ) => MapSceneModule;
  FlylineModule: new (
    layer: MapLayer,
    config: NonNullable<MapSceneConfig["flylines"]>,
    initialLevel: LevelState,
  ) => MapSceneModule;
  ParticleModule: new (
    layer: MapLayer,
    config: NonNullable<MapSceneConfig["particles"]>,
    initialLevel: LevelState,
  ) => MapSceneModule;
}

const MODULE_KEYS: SceneModuleKey[] = [
  "rotatingRings",
  "labels",
  "highlight",
  "flylines",
  "particles",
];

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function mergeDeep<T>(base: T, override?: Partial<T>): T {
  if (!override) return base;
  if (!isObject(base) || !isObject(override)) {
    return override as T;
  }

  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const current = result[key];
    result[key] =
      isObject(current) && isObject(value)
        ? mergeDeep(current, value)
        : value;
  }
  return result as T;
}

function cloneSceneConfig(config: MapSceneConfig): MapSceneConfig {
  return mergeDeep(DEFAULT_MAP_SCENE_CONFIG, config);
}

function depthToLevelName(depth: number): MapLevelName {
  if (depth >= 3) return "county";
  if (depth === 2) return "city";
  return "province";
}

function serializeForCache(value: unknown): string {
  return JSON.stringify(value, (_key, current) =>
    typeof current === "function" ? "[function]" : current,
  );
}

function cloneTexture<T extends THREE.Texture>(texture: T): T {
  const cloned = texture.clone() as T;
  cloned.needsUpdate = true;
  return cloned;
}

function createLevelCacheKey(
  sourceUrl: string,
  depth: number,
  name: MapLevelName,
  camera?: MapSceneConfig["camera"],
): string {
  return `${sourceUrl}|${name}|${depth}|${serializeForCache(camera ?? {})}`;
}

function getModuleConfig(
  config: MapSceneConfig,
  key: SceneModuleKey,
):
  | NonNullable<NonNullable<MapSceneConfig["background"]>["rotatingRings"]>
  | NonNullable<MapSceneConfig["labels"]>
  | NonNullable<MapSceneConfig["highlight"]>
  | NonNullable<MapSceneConfig["flylines"]>
  | NonNullable<MapSceneConfig["particles"]>
  | undefined {
  switch (key) {
    case "rotatingRings":
      return config.background?.rotatingRings;
    case "labels":
      return config.labels;
    case "highlight":
      return config.highlight;
    case "flylines":
      return config.flylines;
    case "particles":
      return config.particles;
  }
}

export class MapSceneRuntime {
  private config: MapSceneConfig;
  private layer: MapLayer;
  private drill?: DrillController;
  private currentLevel?: LevelState;
  private canvas: HTMLCanvasElement;

  private moduleRegistry = new Map<SceneModuleKey, MapSceneModule>();
  private moduleConstructorsPromise?: Promise<ModuleConstructorMap>;

  private levelBundleCache = new Map<string, Promise<LevelBundle>>();
  private baseSceneCache = new Map<string, BaseSceneCacheEntry>();
  private mapTextureCache = new Map<string, Promise<THREE.Texture>>();
  private normalTextureCache = new Map<string, Promise<THREE.Texture>>();

  constructor(canvas: HTMLCanvasElement, config: MapSceneConfig) {
    this.canvas = canvas;
    this.config = cloneSceneConfig(config);
    this.layer = new MapLayer(canvas);
  }

  async init(): Promise<void> {
    const initialBundle = await this.getLevelBundle({
      sourceUrl: this.config.data.rootUrl,
      depth: 1,
      name: "province",
    });
    this.layer.camera.applyStatus(initialBundle.kv.cameraStatus);
    await this.rebuildBaseScene(initialBundle.level);
    await this.syncModules(initialBundle.level, MODULE_KEYS);
    this.setupDrill(initialBundle.level, initialBundle.kv);
    await this.notifyLevelChange(initialBundle.level, MODULE_KEYS);
  }

  async updateConfig(nextConfig: Partial<MapSceneConfig>): Promise<void> {
    const previousConfig = this.config;
    this.config = mergeDeep(this.config, nextConfig);
    if (!this.currentLevel) return;

    const changedKeys = new Set<keyof MapSceneConfig>(
      Object.keys(nextConfig) as Array<keyof MapSceneConfig>,
    );
    const baseDomainsChanged =
      changedKeys.has("data") ||
      changedKeys.has("camera") ||
      changedKeys.has("baseLayer");
    const visualDomainsChanged =
      changedKeys.has("boundary") ||
      changedKeys.has("streamer") ||
      changedKeys.has("textures");
    const changedModules = this.getChangedModules(changedKeys);

    if (changedKeys.has("data") || changedKeys.has("camera")) {
      this.invalidateLevelCaches();
      this.invalidateTextureCaches();
      this.currentLevel = (
        await this.getLevelBundle({
          sourceUrl: this.currentLevel.sourceUrl,
          depth: this.currentLevel.depth,
          name: this.currentLevel.name,
          adcode: this.currentLevel.adcode,
        })
      ).level;
    } else if (changedKeys.has("baseLayer")) {
      this.invalidateBaseSceneCaches();
      this.invalidateTextureCaches();
    } else {
      if (changedKeys.has("textures")) {
        this.invalidateTextureCaches();
      }
    }

    if (baseDomainsChanged || visualDomainsChanged) {
      await this.rebuildBaseScene(this.currentLevel);
    }

    if (changedKeys.has("data") || changedKeys.has("camera")) {
      const kv = computeKV({
        geojsonProj: this.currentLevel.projected,
        ...this.config.camera,
      });
      this.layer.camera.applyStatus(kv.cameraStatus);
      this.setupDrill(this.currentLevel, kv);
    } else if (changedKeys.has("boundary") || changedKeys.has("streamer")) {
      const kv = computeKV({
        geojsonProj: this.currentLevel.projected,
        ...this.config.camera,
      });
      this.setupDrill(this.currentLevel, kv);
    } else if (changedKeys.has("data")) {
      // no-op: covered above
    } else if (previousConfig.data.drill?.enabled !== this.config.data.drill?.enabled) {
      const kv = computeKV({
        geojsonProj: this.currentLevel.projected,
        ...this.config.camera,
      });
      this.setupDrill(this.currentLevel, kv);
    }

    if (changedModules.length > 0) {
      await this.syncModules(this.currentLevel, changedModules);
      await this.notifyLevelChange(this.currentLevel, changedModules);
    } else if (baseDomainsChanged || visualDomainsChanged) {
      await this.notifyLevelChange(this.currentLevel, MODULE_KEYS);
    }
  }

  destroy(): void {
    this.disposeModules(MODULE_KEYS);
    this.drill?.dispose();
    this.canvas.style.cursor = "default";
    this.layer.destroy();
  }

  private async getLevelBundle(input: {
    sourceUrl: string;
    depth: number;
    name: MapLevelName;
    adcode?: number;
  }): Promise<LevelBundle> {
    const bundleKey = createLevelCacheKey(
      input.sourceUrl,
      input.depth,
      input.name,
      this.config.camera,
    );
    const existing = this.levelBundleCache.get(bundleKey);
    if (existing) {
      this.logCache("level", bundleKey, true);
      return existing;
    }

    this.logCache("level", bundleKey, false);
    const task = (async () => {
      const raw = await loadGeoJSON(input.sourceUrl);
      const projected = projectGeoJSON(raw) as GeoJSON.FeatureCollection;
      const kv = computeKV({
        geojsonProj: projected,
        ...this.config.camera,
      });
      const level: LevelState = {
        name: input.name,
        depth: input.depth,
        adcode: input.adcode,
        sourceUrl: input.sourceUrl,
        cacheKey: bundleKey,
        projected,
        bboxProj: kv.bboxOption.bboxProj,
        bboxOption: kv.bboxOption,
      };
      return { level, kv };
    })();
    this.levelBundleCache.set(bundleKey, task);
    return task;
  }

  private async rebuildBaseScene(
    level: LevelState,
    options: { rebuildMeshes?: boolean; rebuildTextures?: boolean } = {},
  ): Promise<void> {
    const { rebuildMeshes = true, rebuildTextures = true } = options;
    let cacheEntry = this.baseSceneCache.get(level.cacheKey);

    if (!cacheEntry) {
      this.logCache("base-scene", level.cacheKey, false);
      const startedAt = this.now();
      cacheEntry = {
        geometry: buildGeometry(level.projected, level.bboxProj),
        mergedBoundary: buildMergedBoundary(level.projected),
      };
      this.baseSceneCache.set(level.cacheKey, cacheEntry);
      this.logPerf("rebuildBaseScene.compute", startedAt, level);
    } else {
      this.logCache("base-scene", level.cacheKey, true);
    }

    if (rebuildMeshes) {
      this.layer.buildMeshes(cacheEntry.geometry, level.bboxOption, {
        topColor: this.config.baseLayer?.topColor,
        bottomColor: this.config.baseLayer?.bottomColor,
        lod: this.config.baseLayer?.lod,
        topMaterial: this.config.baseLayer?.topMaterial,
      });
      this.layer.applyInnerShadow(
        cacheEntry.mergedBoundary,
        level.bboxOption,
        this.config.baseLayer?.innerShadow,
      );
    }

    if (this.config.boundary?.enabled !== false) {
      this.layer.addBoundary(
        level.projected,
        level.bboxOption,
        this.resolveLevelStyle(this.config.boundary, level),
      );
    } else {
      this.layer.clearBoundary();
    }

    if (this.config.streamer?.enabled !== false) {
      this.layer.addStreamer(
        cacheEntry.mergedBoundary,
        level.bboxOption,
        this.resolveLevelStyle(this.config.streamer, level),
      );
    } else {
      this.layer.clearStreamer();
    }

    if (rebuildTextures) {
      await this.applyTextures(level);
    }
    this.layer.setSceneOpacity(1);
    this.currentLevel = level;
  }

  private async applyTextures(level: LevelState): Promise<void> {
    const mapTexture = this.config.textures?.map;
    const normalTexture = this.config.textures?.normal;

    if (mapTexture) {
      await this.applyMapTexture(level, mapTexture);
    }
    if (normalTexture) {
      await this.applyNormalTexture(level, normalTexture);
    }
  }

  private async applyMapTexture(
    level: LevelState,
    config: MapTextureConfig,
  ): Promise<void> {
    switch (config.mode) {
      case "none":
        this.layer.clearTexture("map");
        return;
      case "gradient": {
        const key = `map|gradient|${level.cacheKey}|${serializeForCache(config)}`;
        const baseTexture = await this.getOrCreateTexture(
          this.mapTextureCache,
          key,
          async () => {
            const { buildGradientTexture } = await import(
              "../map/gradientTexture"
            );
            return buildGradientTexture(level.bboxOption, config.style);
          },
        );
        this.layer.applyTextureObject(
          "map",
          cloneTexture(baseTexture),
          config.resetColor ?? true,
        );
        return;
      }
      case "tile": {
        const key = `map|tile|${level.cacheKey}|${serializeForCache(config)}`;
        const baseTexture = await this.getOrCreateTexture(
          this.mapTextureCache,
          key,
          async () => {
            const { buildTileTexture } = await import("../map/tileTexture");
            return buildTileTexture(level.bboxProj, config.layer ?? "img");
          },
        );
        this.layer.applyTextureObject(
          "map",
          cloneTexture(baseTexture),
          config.resetColor ?? true,
        );
        return;
      }
      case "image": {
        const url =
          typeof config.url === "function" ? config.url(level) : config.url;
        const key = `map|image|${url}`;
        const baseTexture = await this.getOrCreateTexture(
          this.mapTextureCache,
          key,
          async () => loadTexture(url),
        );
        this.layer.applyTextureObject(
          "map",
          cloneTexture(baseTexture),
          config.resetColor ?? true,
        );
        return;
      }
    }
  }

  private async applyNormalTexture(
    level: LevelState,
    config: NormalTextureConfig,
  ): Promise<void> {
    switch (config.mode) {
      case "none":
        this.layer.clearTexture("normalMap");
        return;
      case "terrain": {
        const key = `normal|terrain|${level.cacheKey}|${serializeForCache(config)}`;
        const baseTexture = await this.getOrCreateTexture(
          this.normalTextureCache,
          key,
          async () => {
            const { buildTerrainTexture } = await import(
              "../map/terrainTexture"
            );
            return buildTerrainTexture(level.bboxOption, config.style);
          },
        );
        this.layer.applyTextureObject("normalMap", cloneTexture(baseTexture));
        return;
      }
      case "image": {
        const url =
          typeof config.url === "function" ? config.url(level) : config.url;
        const key = `normal|image|${url}`;
        const baseTexture = await this.getOrCreateTexture(
          this.normalTextureCache,
          key,
          async () => loadTexture(url),
        );
        this.layer.applyTextureObject("normalMap", cloneTexture(baseTexture));
        return;
      }
    }
  }

  private async syncModules(
    level: LevelState,
    keys: SceneModuleKey[],
  ): Promise<void> {
    if (keys.length === 0) return;
    const constructors = await this.getModuleConstructors();

    for (const key of keys) {
      this.disposeModules([key]);
      const config = getModuleConfig(this.config, key);
      if (!config || config.enabled === false) continue;

      const module = this.createModuleFromKey(constructors, key, level);
      if (module) {
        this.moduleRegistry.set(key, module);
      }
    }
  }

  private createModuleFromKey(
    constructors: ModuleConstructorMap,
    key: SceneModuleKey,
    level: LevelState,
  ): MapSceneModule | undefined {
    switch (key) {
      case "rotatingRings":
        return this.config.background?.rotatingRings
          ? new constructors.RotatingRingsModule(
              this.layer,
              this.config.background.rotatingRings,
              level,
            )
          : undefined;
      case "labels":
        return this.config.labels
          ? new constructors.LabelModule(this.layer, this.config.labels, level)
          : undefined;
      case "highlight":
        return this.config.highlight
          ? new constructors.HighlightModule(
              this.layer,
              this.config.highlight,
              level,
            )
          : undefined;
      case "flylines":
        return this.config.flylines
          ? new constructors.FlylineModule(
              this.layer,
              this.config.flylines,
              level,
            )
          : undefined;
      case "particles":
        return this.config.particles
          ? new constructors.ParticleModule(
              this.layer,
              this.config.particles,
              level,
            )
          : undefined;
    }
  }

  private async getModuleConstructors(): Promise<ModuleConstructorMap> {
    if (!this.moduleConstructorsPromise) {
      this.moduleConstructorsPromise = import("./modules").then((module) => ({
        RotatingRingsModule: module.RotatingRingsModule,
        LabelModule: module.LabelModule,
        HighlightModule: module.HighlightModule,
        FlylineModule: module.FlylineModule,
        ParticleModule: module.ParticleModule,
      }));
    }
    return await this.moduleConstructorsPromise;
  }

  private setupDrill(initialLevel: LevelState, initialKv: KVResult): void {
    this.drill?.dispose();
    if (this.config.data.drill?.enabled === false) return;

    this.drill = new DrillController(this.layer, {
      maxDepth: this.config.data.drill?.maxDepth,
      getDataUrl: this.config.data.drill?.getDataUrl,
      loadLevel: async (adcode, suffix, depth) => {
        const sourceUrl =
          this.config.data.drill?.getDataUrl?.(adcode, suffix, depth) ??
          `/json/${adcode}-${suffix}.json`;
        try {
          const bundle = await this.getLevelBundle({
            sourceUrl,
            depth: depth + 1,
            name: depthToLevelName(depth + 1),
            adcode,
          });
          return {
            adcode,
            sourceUrl,
            cacheKey: bundle.level.cacheKey,
            projected: bundle.level.projected,
            bboxProj: bundle.level.bboxProj,
            kv: bundle.kv,
          };
        } catch {
          return null;
        }
      },
      boundaryStyle: this.resolveLevelStyle(this.config.boundary, initialLevel),
      getStreamerStyle: (depth) =>
        this.resolveLevelStyle(this.config.streamer, {
          ...initialLevel,
          depth,
          name: depthToLevelName(depth),
        }) ?? {},
      rebuildLevel: async (level, context) => {
        const nextLevel = this.toLevelState(level, context.depth);
        await this.rebuildBaseScene(nextLevel);
      },
    });

    this.drill.onLevelChange = (projected, bboxOption, depth) => {
      const level: LevelState = {
        ...this.currentLevel!,
        name: depthToLevelName(depth),
        depth,
        projected,
        bboxOption,
        bboxProj: bboxOption.bboxProj,
      };
      this.currentLevel = level;
      void this.notifyLevelChange(level, MODULE_KEYS);
    };
    this.drill.init({
      projected: initialLevel.projected,
      bboxProj: initialLevel.bboxProj,
      kv: initialKv,
    });
  }

  private toLevelState(level: DrillLevel, depth: number): LevelState {
    const sourceUrl =
      level.sourceUrl ?? this.currentLevel?.sourceUrl ?? this.config.data.rootUrl;
    const name = depthToLevelName(depth);
    return {
      name,
      depth,
      adcode: level.adcode ?? this.currentLevel?.adcode,
      sourceUrl,
      cacheKey:
        level.cacheKey ??
        createLevelCacheKey(sourceUrl, depth, name, this.config.camera),
      projected: level.projected,
      bboxProj: level.bboxProj,
      bboxOption: level.kv.bboxOption,
    };
  }

  private async notifyLevelChange(
    level: LevelState,
    keys: SceneModuleKey[],
  ): Promise<void> {
    for (const key of keys) {
      await this.moduleRegistry.get(key)?.onLevelChange?.(level);
    }
    this.currentLevel = level;
  }

  private disposeModules(keys: SceneModuleKey[]): void {
    keys.forEach((key) => {
      this.moduleRegistry.get(key)?.dispose();
      this.moduleRegistry.delete(key);
    });
  }

  private resolveLevelStyle<T>(
    config:
      | {
          style?: T;
          byLevel?: Partial<Record<MapLevelName, Partial<T>>>;
        }
      | undefined,
    level: LevelState,
  ): T | undefined {
    if (!config?.style) return undefined;
    return {
      ...config.style,
      ...config.byLevel?.[level.name],
    };
  }

  private getChangedModules(
    changedKeys: Set<keyof MapSceneConfig>,
  ): SceneModuleKey[] {
    const modules: SceneModuleKey[] = [];
    if (changedKeys.has("background")) modules.push("rotatingRings");
    if (changedKeys.has("labels")) modules.push("labels");
    if (changedKeys.has("highlight")) modules.push("highlight");
    if (changedKeys.has("flylines")) modules.push("flylines");
    if (changedKeys.has("particles")) modules.push("particles");
    return modules;
  }

  private invalidateLevelCaches(): void {
    this.levelBundleCache.clear();
    this.invalidateBaseSceneCaches();
  }

  private invalidateBaseSceneCaches(): void {
    this.baseSceneCache.clear();
  }

  private invalidateTextureCaches(): void {
    this.mapTextureCache.clear();
    this.normalTextureCache.clear();
  }

  private async getOrCreateTexture(
    store: Map<string, Promise<THREE.Texture>>,
    key: string,
    factory: () => Promise<THREE.Texture>,
  ): Promise<THREE.Texture> {
    const existing = store.get(key);
    if (existing) {
      this.logCache("texture", key, true);
      return existing;
    }
    this.logCache("texture", key, false);
    const task = factory();
    store.set(key, task);
    return task;
  }

  private logPerf(label: string, startedAt: number, level: LevelState): void {
    if (!this.config.debug?.perf) return;
    const duration = this.now() - startedAt;
    console.info(`[map-perf] ${label}`, {
      level: level.name,
      depth: level.depth,
      durationMs: Math.round(duration),
    });
  }

  private logCache(domain: string, key: string, hit: boolean): void {
    if (!this.config.debug?.cache) return;
    console.info(`[map-cache] ${domain} ${hit ? "hit" : "miss"}`, key);
  }

  private now(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }
}

export async function createMapScene(
  canvas: HTMLCanvasElement,
  config: MapSceneConfig,
): Promise<MapSceneRuntime> {
  const runtime = new MapSceneRuntime(canvas, config);
  await runtime.init();
  return runtime;
}
