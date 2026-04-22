import { computeKV } from "../geo/camera";
import { loadGeoJSON } from "../geo/loader";
import { projectGeoJSON } from "../geo/transform";
import { buildGeometry } from "../geo/triangulate";
import { buildMergedBoundary } from "../map/mergedBoundary";
import { DrillController } from "../map/drill";
import { buildGradientTexture } from "../map/gradientTexture";
import { loadTexture } from "../map/texture";
import { buildTerrainTexture } from "../map/terrainTexture";
import { buildTileTexture } from "../map/tileTexture";
import { MapLayer } from "../map/MapLayer";
import { DEFAULT_MAP_SCENE_CONFIG } from "./defaults";
import {
  FlylineModule,
  GridModule,
  HighlightModule,
  LabelModule,
  ParticleModule,
} from "./modules";
import type {
  LevelState,
  MapLevelName,
  MapSceneConfig,
  MapSceneModule,
  MapTextureConfig,
  NormalTextureConfig,
} from "./types";

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

function depthToLevelName(depth: number): MapLevelName {
  if (depth >= 3) return "county";
  if (depth === 2) return "city";
  return "province";
}

function cloneSceneConfig(config: MapSceneConfig): MapSceneConfig {
  return mergeDeep(DEFAULT_MAP_SCENE_CONFIG, config);
}

export class MapSceneRuntime {
  private config: MapSceneConfig;
  private layer: MapLayer;
  private modules: MapSceneModule[] = [];
  private drill?: DrillController;
  private currentLevel?: LevelState;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, config: MapSceneConfig) {
    this.canvas = canvas;
    this.config = cloneSceneConfig(config);
    this.layer = new MapLayer(canvas);
  }

  async init(): Promise<void> {
    const rootRaw = await loadGeoJSON(this.config.data.rootUrl);
    const projected = projectGeoJSON(rootRaw) as GeoJSON.FeatureCollection;
    const kv = computeKV({
      geojsonProj: projected,
      ...this.config.camera,
    });
    const initialLevel: LevelState = {
      name: "province",
      depth: 1,
      projected,
      bboxProj: kv.bboxOption.bboxProj,
      bboxOption: kv.bboxOption,
    };

    this.layer.camera.applyStatus(kv.cameraStatus);
    await this.rebuildBaseScene(initialLevel);
    this.setupModules(initialLevel);
    this.setupDrill(initialLevel, kv);
    await this.notifyLevelChange(initialLevel);
  }

  async updateConfig(nextConfig: Partial<MapSceneConfig>): Promise<void> {
    this.config = mergeDeep(this.config, nextConfig);
    if (!this.currentLevel) return;
    this.disposeModules();
    await this.rebuildBaseScene(this.currentLevel);
    this.setupModules(this.currentLevel);
    this.setupDrill(
      this.currentLevel,
      computeKV({
        geojsonProj: this.currentLevel.projected,
        ...this.config.camera,
      }),
    );
    await this.notifyLevelChange(this.currentLevel);
  }

  destroy(): void {
    this.disposeModules();
    this.drill?.dispose();
    this.canvas.style.cursor = "default";
    this.layer.destroy();
  }

  private async rebuildBaseScene(level: LevelState): Promise<void> {
    const mergedBoundary = buildMergedBoundary(level.projected);
    const geomGroup = buildGeometry(level.projected, level.bboxProj);

    this.layer.buildMeshes(geomGroup, level.bboxOption, {
      topColor: this.config.baseLayer?.topColor,
      bottomColor: this.config.baseLayer?.bottomColor,
      lod: this.config.baseLayer?.lod,
      topMaterial: this.config.baseLayer?.topMaterial,
    });

    this.layer.applyInnerShadow(
      mergedBoundary,
      level.bboxOption,
      this.config.baseLayer?.innerShadow,
    );

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
        mergedBoundary,
        level.bboxOption,
        this.resolveLevelStyle(this.config.streamer, level),
      );
    } else {
      this.layer.clearStreamer();
    }

    await this.applyTextures(level);
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
      case "gradient":
        this.layer.applyTextureObject(
          "map",
          buildGradientTexture(level.bboxOption, config.style),
          config.resetColor ?? true,
        );
        return;
      case "tile":
        this.layer.applyTextureObject(
          "map",
          await buildTileTexture(level.bboxProj, config.layer ?? "img"),
          config.resetColor ?? true,
        );
        return;
      case "image": {
        const url =
          typeof config.url === "function" ? config.url(level) : config.url;
        const texture = await loadTexture(url);
        this.layer.applyTextureObject(
          "map",
          texture,
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
      case "terrain":
        this.layer.applyTextureObject(
          "normalMap",
          await buildTerrainTexture(level.bboxOption, config.style),
        );
        return;
      case "image": {
        const url =
          typeof config.url === "function" ? config.url(level) : config.url;
        const texture = await loadTexture(url);
        this.layer.applyTextureObject("normalMap", texture);
        return;
      }
    }
  }

  private setupModules(initialLevel: LevelState): void {
    if (this.config.background?.grid) {
      this.modules.push(
        new GridModule(this.layer, this.config.background.grid, initialLevel),
      );
    }
    if (this.config.labels) {
      this.modules.push(new LabelModule(this.layer, this.config.labels, initialLevel));
    }
    if (this.config.highlight) {
      this.modules.push(
        new HighlightModule(this.layer, this.config.highlight, initialLevel),
      );
    }
    if (this.config.flylines) {
      this.modules.push(
        new FlylineModule(this.layer, this.config.flylines, initialLevel),
      );
    }
    if (this.config.particles) {
      this.modules.push(
        new ParticleModule(this.layer, this.config.particles, initialLevel),
      );
    }
  }

  private setupDrill(initialLevel: LevelState, initialKv: ReturnType<typeof computeKV>): void {
    this.drill?.dispose();
    if (this.config.data.drill?.enabled === false) return;

    this.drill = new DrillController(this.layer, {
      maxDepth: this.config.data.drill?.maxDepth,
      getDataUrl: this.config.data.drill?.getDataUrl,
      boundaryStyle: this.resolveLevelStyle(this.config.boundary, initialLevel),
      getStreamerStyle: (depth) =>
        this.resolveLevelStyle(this.config.streamer, {
          ...initialLevel,
          depth,
          name: depthToLevelName(depth),
        }) ?? {},
      rebuildLevel: (level, context) => {
        const nextLevel: LevelState = {
          name: depthToLevelName(context.depth),
          depth: context.depth,
          projected: level.projected,
          bboxProj: level.bboxProj,
          bboxOption: level.kv.bboxOption,
        };
        return this.rebuildBaseScene(nextLevel);
      },
    });

    this.drill.onLevelChange = (projected, bboxOption, depth) => {
      const level: LevelState = {
        name: depthToLevelName(depth),
        depth,
        projected,
        bboxOption,
        bboxProj: bboxOption.bboxProj,
      };
      this.currentLevel = level;
      void this.notifyLevelChange(level);
    };
    this.drill.init({
      projected: initialLevel.projected,
      bboxProj: initialLevel.bboxProj,
      kv: initialKv,
    });
  }

  private async notifyLevelChange(level: LevelState): Promise<void> {
    for (const module of this.modules) {
      await module.onLevelChange?.(level);
    }
    this.currentLevel = level;
  }

  private disposeModules(): void {
    this.modules.forEach((module) => module.dispose());
    this.modules = [];
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
}

export async function createMapScene(
  canvas: HTMLCanvasElement,
  config: MapSceneConfig,
): Promise<MapSceneRuntime> {
  const runtime = new MapSceneRuntime(canvas, config);
  await runtime.init();
  return runtime;
}
