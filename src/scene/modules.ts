import { FlylineController } from "../map/flyline";
import { GridBackground } from "../map/grid";
import { HighlightController } from "../map/highlight";
import { LabelController } from "../map/label";
import { ParticleController } from "../map/particle";
import type { MapLayer } from "../map/MapLayer";
import type {
  LevelState,
  MapLevelName,
  MapSceneConfig,
  MapSceneModule,
} from "./types";

type GridModuleConfig = Exclude<
  NonNullable<MapSceneConfig["background"]>["grid"],
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

export class GridModule implements MapSceneModule {
  key = "grid";
  private grid?: GridBackground;
  private config: GridModuleConfig;

  constructor(
    layer: MapLayer,
    config: GridModuleConfig,
    initialLevel: LevelState,
  ) {
    this.config = config;
    if (config?.enabled === false) return;
    this.grid = new GridBackground(
      layer.scene,
      layer.time,
      initialLevel.bboxOption,
      getLevelStyle(config, initialLevel.name) ?? {},
      config?.rotation ?? 0,
    );
  }

  onLevelChange(level: LevelState): void {
    if (!this.grid || this.config?.enabled === false) return;
    this.grid.update(
      level.bboxOption,
      getLevelStyle(this.config, level.name) ?? {},
      this.config.rotation ?? 0,
    );
  }

  dispose(): void {
    this.grid?.dispose();
  }
}

export class LabelModule implements MapSceneModule {
  key = "labels";
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
  key = "highlight";
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
  key = "flylines";
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
  key = "particles";
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
