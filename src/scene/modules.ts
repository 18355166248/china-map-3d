import { FlylineController } from "../map/flyline";
import { HighlightController } from "../map/highlight";
import { LabelController } from "../map/label";
import { ParticleController } from "../map/particle";
import { RotatingRings } from "../map/rotatingRings";
import type { MapLayer } from "../map/MapLayer";
import type {
  LevelState,
  MapLevelName,
  MapSceneConfig,
  MapSceneModule,
  SceneModuleKey,
} from "./types";

type RotatingRingsModuleConfig = Exclude<
  NonNullable<MapSceneConfig["background"]>["rotatingRings"],
  undefined
>;

function getLevelStyle<T>(
  config: {
    style?: T;
    byLevel?: Partial<Record<MapLevelName, Partial<T>>>;
  },
  level: MapLevelName,
): T | undefined {
  if (!config.style) return undefined;
  return {
    ...config.style,
    ...config.byLevel?.[level],
  };
}

export class RotatingRingsModule implements MapSceneModule {
  key: SceneModuleKey = "rotatingRings";
  private rings?: RotatingRings;
  private config: RotatingRingsModuleConfig;

  constructor(
    layer: MapLayer,
    config: RotatingRingsModuleConfig,
    initialLevel: LevelState,
  ) {
    this.config = config;
    if (config?.enabled === false) return;

    const center: [number, number] = [
      initialLevel.bboxOption.centerProj[0],
      initialLevel.bboxOption.centerProj[1],
    ];
    const baseSize = this.computeSize(initialLevel);
    this.rings = new RotatingRings(layer.scene, layer.time, {
      size: baseSize,
      center,
      positionZ: -Math.max(1, initialLevel.bboxOption.baseHeight * 0.02),
      outerSpeed: config.outerSpeed,
      innerSpeed: config.innerSpeed,
      color: config.color,
      outerOpacity: config.outerOpacity,
      innerOpacity: config.innerOpacity,
    });
  }

  onLevelChange(level: LevelState): void {
    if (!this.rings) return;
    const center: [number, number] = [
      level.bboxOption.centerProj[0],
      level.bboxOption.centerProj[1],
    ];
    const baseSize = this.computeSize(level);
    this.rings.update({
      center,
      size: baseSize,
      positionZ: -Math.max(1, level.bboxOption.baseHeight * 0.02),
    });
  }

  dispose(): void {
    this.rings?.dispose();
  }

  private computeSize(level: LevelState): number {
    const maxSize = Math.max(
      level.bboxOption.size.width,
      level.bboxOption.size.height,
    );
    const lvl = this.config.byLevel?.[level.name];
    if (lvl?.size !== undefined) return lvl.size;
    const ratio = lvl?.sizeRatio ?? this.config.sizeRatio ?? undefined;
    if (ratio !== undefined) return maxSize * ratio;
    // fallback: if legacy absolute size provided, use it; otherwise default 0.8 ratio
    return this.config.size ? this.config.size : maxSize * 0.8;
  }
}

export class LabelModule implements MapSceneModule {
  key: SceneModuleKey = "labels";
  private labels: LabelController;
  private config: NonNullable<MapSceneConfig["labels"]>;

  constructor(
    layer: MapLayer,
    config: NonNullable<MapSceneConfig["labels"]>,
    initialLevel: LevelState,
  ) {
    this.config = config;
    this.labels = new LabelController(layer.scene, {
      classNames: {
        1: config.classNames?.province,
        2: config.classNames?.city,
        3: config.classNames?.county,
      },
    });
    if (config.enabled !== false) {
      this.onLevelChange(initialLevel);
    }
  }

  onLevelChange(level: LevelState): void {
    if (this.config.enabled === false) return;
    this.labels.update(level.projected, level.bboxOption, level.depth);
  }

  dispose(): void {
    this.labels.dispose();
  }
}

export class HighlightModule implements MapSceneModule {
  key: SceneModuleKey = "highlight";
  private highlight: HighlightController;
  private config: NonNullable<MapSceneConfig["highlight"]>;

  constructor(
    layer: MapLayer,
    config: NonNullable<MapSceneConfig["highlight"]>,
    initialLevel: LevelState,
  ) {
    this.config = config;
    this.highlight = new HighlightController(layer, config.style);
    if (config.enabled !== false) {
      this.onLevelChange(initialLevel);
    }
  }

  onLevelChange(level: LevelState): void {
    if (this.config.enabled === false) return;
    this.highlight.update(level.projected, level.bboxOption);
  }

  dispose(): void {
    this.highlight.dispose();
  }
}

export class FlylineModule implements MapSceneModule {
  key: SceneModuleKey = "flylines";
  private flylines: FlylineController;
  private config: NonNullable<MapSceneConfig["flylines"]>;

  constructor(
    layer: MapLayer,
    config: NonNullable<MapSceneConfig["flylines"]>,
    initialLevel: LevelState,
  ) {
    this.config = config;
    this.flylines = new FlylineController(layer);
    if (config.enabled !== false) {
      this.onLevelChange(initialLevel);
    }
  }

  onLevelChange(level: LevelState): void {
    if (this.config.enabled === false) return;
    const data =
      typeof this.config.data === "function"
        ? this.config.data(level)
        : this.config.data;

    // 如果数据为空或未定义，清空飞线
    if (!data || data.length === 0) {
      this.flylines.setData([], level.bboxOption, {
        ...this.config.style,
        ...this.config.byLevel?.[level.name],
      });
      return;
    }

    this.flylines.setData(data, level.bboxOption, {
      ...this.config.style,
      ...this.config.byLevel?.[level.name],
    });
  }

  dispose(): void {
    this.flylines.dispose();
  }
}

export class ParticleModule implements MapSceneModule {
  key: SceneModuleKey = "particles";
  private particles: ParticleController;
  private config: NonNullable<MapSceneConfig["particles"]>;

  constructor(
    layer: MapLayer,
    config: NonNullable<MapSceneConfig["particles"]>,
    initialLevel: LevelState,
  ) {
    this.config = config;
    this.particles = new ParticleController(layer);
    if (config.enabled !== false) {
      this.onLevelChange(initialLevel);
    }
  }

  onLevelChange(level: LevelState): void {
    if (this.config.enabled === false) return;
    this.particles.setData(
      level.bboxOption,
      getLevelStyle(this.config, level.name) ?? {},
    );
  }

  dispose(): void {
    this.particles.dispose();
  }
}
