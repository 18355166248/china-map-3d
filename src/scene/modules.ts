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

  setVisible(visible: boolean): void {
    this.rings?.setVisible(visible);
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

  setVisible(visible: boolean): void {
    this.labels.setVisible?.(visible);
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

  setVisible(visible: boolean): void {
    // 模块自身没有持久 mesh；通过暂停 hover 来“隐藏”交互和高亮
    this.highlight.setPaused(!visible);
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

    // 如果数据为空或未定义，清空并保持隐藏，等待下一次加载
    if (!data || data.length === 0) {
      this.flylines.setData([], level.bboxOption, {
        ...this.config.style,
        ...this.config.byLevel?.[level.name],
      });
      this.flylines.setVisible(false);
      return;
    }

    this.flylines.setData(data, level.bboxOption, {
      ...this.config.style,
      ...this.config.byLevel?.[level.name],
    });
    // 确保有数据时强制显示（避免此前因 loading 隐藏后未恢复的情况）
    this.flylines.setVisible(true);
  }

  setVisible(visible: boolean): void {
    // 若在 loading 结束时没有数据，仍保持隐藏
    if (visible && !(this.flylines as any).hasData?.()) {
      this.flylines.setVisible(false);
      return;
    }
    this.flylines.setVisible(visible);
  }

  dispose(): void {
    this.flylines.dispose();
  }
}

export class ParticleModule implements MapSceneModule {
  key: SceneModuleKey = "particles";
  private particles: ParticleController;
  private config: NonNullable<MapSceneConfig["particles"]>;
  private refSize: number; // 记录初始层 bbox 的 max(width,height)，作为等比缩放参考

  constructor(
    layer: MapLayer,
    config: NonNullable<MapSceneConfig["particles"]>,
    initialLevel: LevelState,
  ) {
    this.config = config;
    this.particles = new ParticleController(layer);
    this.refSize = Math.max(
      initialLevel.bboxOption.size.width,
      initialLevel.bboxOption.size.height,
    );
    if (config.enabled !== false) {
      this.onLevelChange(initialLevel);
    }
  }

  onLevelChange(level: LevelState): void {
    if (this.config.enabled === false) return;
    const base = getLevelStyle(this.config, level.name) ?? {};

    // 等比缩放：当前层 bbox 的 max(width,height) 相对于初始层的比例
    const currMax = Math.max(
      level.bboxOption.size.width,
      level.bboxOption.size.height,
    );
    const lin = Math.max(0.1, Math.min(1, currMax / this.refSize));
    // 二/三级略放大：给粒子尺寸与数量一个轻微的深度加成
    const depthBoost = level.depth === 1 ? 1.8 : level.depth === 2 ? 1.8 : 2;
    const sizeScale = Math.min(1.35, lin * 1.15 * depthBoost);
    const countScale = Math.max(0.1, Math.min(1, lin * lin * 1.15 * depthBoost));
    const motionScale = 0.7 + 0.3 * lin;

    this.particles.setData(level.bboxOption, {
      ...base,
      sizeMin: Math.max(1, Math.round((base.sizeMin ?? 2) * sizeScale)),
      sizeMax: Math.max(2, Math.round((base.sizeMax ?? 5) * sizeScale)),
      count: Math.max(100, Math.round((base.count ?? 2500) * countScale)),
      speedMin: (base.speedMin ?? 0.08) * motionScale,
      speedMax: (base.speedMax ?? 0.25) * motionScale,
      maxRiseFactor: (base.maxRiseFactor ?? 1.5) * motionScale,
    });
  }

  setVisible(visible: boolean): void {
    this.particles.setVisible?.(visible);
  }

  dispose(): void {
    this.particles.dispose();
  }
}
