import * as turf from "@turf/turf";
import { projectGeoJSON } from "../geo/transform";
import { computeKV, type BboxOption, type KVResult } from "../geo/camera";
import { loadGeoJSON } from "../geo/loader";
import { buildGeometry } from "../geo/triangulate";
import type { MapLayer } from "./MapLayer";
import type { BoundaryStyle } from "./boundary";
import { buildMergedBoundary } from "./mergedBoundary";
import type { StreamerStyle } from "./streamer";

export interface DrillLevel {
  projected: GeoJSON.FeatureCollection;
  bboxProj: [number, number, number, number];
  kv: KVResult;
}

export interface DrillControllerOptions {
  maxDepth?: number;
  boundaryStyle?: BoundaryStyle;
  getDataUrl?: (
    adcode: number,
    suffix: "city" | "county",
    depth: number,
  ) => string;
  getStreamerStyle?: (
    depth: number,
    direction: "down" | "up",
  ) => StreamerStyle;
  rebuildLevel?: (
    level: DrillLevel,
    context: {
      depth: number;
      direction: "down" | "up";
      suffix?: "city" | "county";
    },
  ) => void | Promise<void>;
}

const DEFAULT_BOUNDARY_STYLE: BoundaryStyle = {
  color: "#4fc3f7",
  linewidth: 1,
  opacity: 0.9,
};

/**
 * 钻取控制器只负责层级切换和数据加载，具体如何重建地图由外部注入，
 * 这样场景配置层才能决定边界、流光、纹理等表现。
 */
export class DrillController {
  private layer: MapLayer;
  private options: Required<
    Pick<DrillControllerOptions, "maxDepth" | "getDataUrl" | "getStreamerStyle">
  > &
    Pick<DrillControllerOptions, "boundaryStyle" | "rebuildLevel">;
  private stack: DrillLevel[] = [];
  private animating = false;

  /** 层级切换后触发，参数为新层的数据和当前深度（1=省 2=市 3=县） */
  onLevelChange?: (
    projected: GeoJSON.FeatureCollection,
    bboxOption: BboxOption,
    depth: number,
  ) => void;

  /** 重建 mesh 后、淡入前触发，可用于异步更新纹理（如拉取瓦片） */
  onAfterRebuild?: (bboxProj: [number, number, number, number]) => Promise<void>;

  /** 钻取加载状态变化，供外部展示 loading 标签 */
  onLoadingChange?: (loading: boolean) => void;

  constructor(layer: MapLayer, options: DrillControllerOptions = {}) {
    this.layer = layer;
    this.options = {
      maxDepth: options.maxDepth ?? 3,
      boundaryStyle: options.boundaryStyle,
      rebuildLevel: options.rebuildLevel,
      getDataUrl:
        options.getDataUrl ??
        ((adcode, suffix) => `/json/${adcode}-${suffix}.json`),
      getStreamerStyle:
        options.getStreamerStyle ??
        ((depth) => ({
          color: "#00ffff",
          linewidth: 2,
          speed: 0.3,
          minLength: depth >= 3 ? 100 : depth === 2 ? 500 : 2000,
        })),
    };
    layer.canvas.addEventListener("dblclick", this.onDblClick);
    layer.canvas.addEventListener("contextmenu", this.onRightClick);
  }

  /** 初始化根层（全国省级视图） */
  init(level: DrillLevel): void {
    this.stack = [level];
    this.onLevelChange?.(level.projected, level.kv.bboxOption, 1);
  }

  private onDblClick = async (e: MouseEvent): Promise<void> => {
    if (this.animating || !this.stack.length) return;
    if (this.stack.length >= this.options.maxDepth) return;
    const rect = this.layer.canvas.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const current = this.stack[this.stack.length - 1];
    const feature = this.layer.hitTest(ndcX, ndcY, current.projected);
    if (!feature) return;
    const adcode: number = feature.properties?.adcode;
    if (!adcode) return;
    await this.drillDown(adcode);
  };

  private onRightClick = async (e: MouseEvent): Promise<void> => {
    e.preventDefault();
    await this.drillUp();
  };

  private async drillDown(adcode: number): Promise<void> {
    const suffix = this.stack.length === 1 ? "city" : "county";
    const url = this.options.getDataUrl(adcode, suffix, this.stack.length);
    if (this.animating) return;
    this.animating = true;
    this.layer.camera.controls.enabled = false;
    this.onLoadingChange?.(true);

    let raw: GeoJSON.FeatureCollection;
    try {
      raw = await loadGeoJSON(url);
    } catch {
      this.onLoadingChange?.(false);
      this.layer.camera.controls.enabled = true;
      this.animating = false;
      return;
    }

    const projected = projectGeoJSON(raw) as GeoJSON.FeatureCollection;
    const bboxProj = turf.bbox(projected) as [number, number, number, number];
    const kv = computeKV({ geojsonProj: projected });
    const level: DrillLevel = { projected, bboxProj, kv };
    const nextDepth = this.stack.length + 1;

    try {
      this.layer.camera.applyStatus(kv.cameraStatus);
      await this.rebuildLevel(level, {
        depth: nextDepth,
        direction: "down",
        suffix,
      });
      if (this.onAfterRebuild) await this.onAfterRebuild(level.bboxProj);
      this.layer.setSceneOpacity(1);

      this.stack.push(level);
      this.onLevelChange?.(
        level.projected,
        level.kv.bboxOption,
        this.stack.length,
      );
    } finally {
      this.onLoadingChange?.(false);
      this.layer.camera.controls.enabled = true;
      this.animating = false;
    }
  }

  private async drillUp(): Promise<void> {
    if (this.stack.length <= 1 || this.animating) return;
    this.animating = true;
    this.layer.camera.controls.enabled = false;
    this.onLoadingChange?.(true);

    this.stack.pop();
    const prev = this.stack[this.stack.length - 1];

    try {
      this.layer.camera.applyStatus(prev.kv.cameraStatus);
      await this.rebuildLevel(prev, {
        depth: this.stack.length,
        direction: "up",
      });
      if (this.onAfterRebuild) await this.onAfterRebuild(prev.bboxProj);
      this.layer.setSceneOpacity(1);
      this.onLevelChange?.(
        prev.projected,
        prev.kv.bboxOption,
        this.stack.length,
      );
    } finally {
      this.onLoadingChange?.(false);
      this.layer.camera.controls.enabled = true;
      this.animating = false;
    }
  }

  private async rebuildLevel(
    level: DrillLevel,
    context: {
      depth: number;
      direction: "down" | "up";
      suffix?: "city" | "county";
    },
  ): Promise<void> {
    if (this.options.rebuildLevel) {
      await this.options.rebuildLevel(level, context);
      return;
    }

    const { projected, bboxProj, kv } = level;
    const mergedBoundary = buildMergedBoundary(projected);
    const geomGroup = buildGeometry(projected, bboxProj);
    this.layer.buildMeshes(geomGroup, kv.bboxOption);
    this.layer.applyInnerShadow(mergedBoundary, kv.bboxOption, { debug: false });
    this.layer.addBoundary(
      projected,
      kv.bboxOption,
      this.options.boundaryStyle ?? DEFAULT_BOUNDARY_STYLE,
    );
    this.layer.addStreamer(
      mergedBoundary,
      kv.bboxOption,
      this.options.getStreamerStyle(context.depth, context.direction),
    );
  }

  dispose(): void {
    this.layer.canvas.removeEventListener("dblclick", this.onDblClick);
    this.layer.canvas.removeEventListener("contextmenu", this.onRightClick);
  }
}
