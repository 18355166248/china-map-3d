import * as THREE from "three";
import * as turf from "@turf/turf";
import { projectGeoJSON } from "../geo/transform";
import { computeKV, type CameraStatus, type KVResult } from "../geo/camera";
import { loadGeoJSON } from "../geo/loader";
import { buildGeometry } from "../geo/triangulate";
import type { MapLayer } from "./MapLayer";
import type { BoundaryStyle } from "./boundary";
import type { StreamerStyle } from "./streamer";

interface DrillLevel {
  projected: GeoJSON.FeatureCollection;
  bboxProj: [number, number, number, number];
  kv: KVResult;
}

const BOUNDARY_STYLE: BoundaryStyle = {
  color: "#4fc3f7",
  linewidth: 1,
  opacity: 0.9,
};

/** 构建流光所需的 dissolved 外轮廓 */
function buildDissolved(
  projected: GeoJSON.FeatureCollection,
): GeoJSON.FeatureCollection {
  const flattened = turf.flatten(projected);
  const withGroup = {
    ...flattened,
    features: flattened.features.map((f) => ({
      ...f,
      properties: { ...f.properties, _group: "layer" },
    })),
  } as GeoJSON.FeatureCollection<GeoJSON.Polygon>;
  return turf.dissolve(withGroup, { propertyName: "_group" });
}

/** 重建当前层的所有场景对象 */
function rebuildLayer(
  layer: MapLayer,
  level: DrillLevel,
  streamerStyle: StreamerStyle,
): void {
  const { projected, bboxProj, kv } = level;
  const geomGroup = buildGeometry(projected, bboxProj);
  layer.buildMeshes(geomGroup, kv.bboxOption);
  layer.applyInnerShadow(projected, kv.bboxOption, { debug: false });
  layer.addBoundary(projected, kv.bboxOption, BOUNDARY_STYLE);
  layer.addStreamer(buildDissolved(projected), kv.bboxOption, streamerStyle);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

export class DrillController {
  private layer: MapLayer;
  private stack: DrillLevel[] = [];
  private animating = false;

  constructor(layer: MapLayer) {
    this.layer = layer;
    layer.canvas.addEventListener("click", this.onClick);
    layer.canvas.addEventListener("contextmenu", this.onRightClick);
  }

  /** 初始化根层（全国省级视图） */
  init(level: DrillLevel): void {
    this.stack = [level];
  }

  private onClick = async (e: MouseEvent): Promise<void> => {
    if (this.animating || !this.stack.length) return;
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
    // 动态路径：public/json/{adcode}-city.json，文件不存在时 fetch 返回 404 静默跳过
    const url = `/json/${adcode}-city.json`;
    if (this.animating) return;
    this.animating = true;
    this.layer.camera.controls.enabled = false;

    let raw: GeoJSON.FeatureCollection;
    try {
      raw = await loadGeoJSON(url);
    } catch {
      // 该省暂无城市数据（如台湾），静默跳过
      this.layer.camera.controls.enabled = true;
      this.animating = false;
      return;
    }
    const projected = projectGeoJSON(raw) as GeoJSON.FeatureCollection;
    const bboxProj = turf.bbox(projected) as [number, number, number, number];
    const kv = computeKV({ geojsonProj: projected });

    await this.animateCamera(kv.cameraStatus);

    const level: DrillLevel = { projected, bboxProj, kv };
    // minLength 城市级别比省级小，适当降低阈值
    rebuildLayer(this.layer, level, {
      color: "#00ffff",
      linewidth: 2,
      speed: 0.3,
      minLength: 500,
    });
    this.stack.push(level);

    this.layer.camera.controls.enabled = true;
    this.animating = false;
  }

  private async drillUp(): Promise<void> {
    if (this.stack.length <= 1 || this.animating) return;
    this.animating = true;
    this.layer.camera.controls.enabled = false;

    this.stack.pop();
    const prev = this.stack[this.stack.length - 1];

    await this.animateCamera(prev.kv.cameraStatus);
    rebuildLayer(this.layer, prev, {
      color: "#00ffff",
      linewidth: 2,
      speed: 0.3,
      minLength: 2000,
    });

    this.layer.camera.controls.enabled = true;
    this.animating = false;
  }

  /**
   * 相机飞行动画：在当前位置和目标状态之间 easeInOut 插值
   * 通过 time.on('tick') 驱动，duration 单位毫秒
   */
  private animateCamera(target: CameraStatus, duration = 800): Promise<void> {
    return new Promise((resolve) => {
      const cam = this.layer.camera.instance;
      const ctrl = this.layer.camera.controls;

      // 记录动画起始状态
      const startPos = cam.position.clone();
      const startTarget = ctrl.target.clone();
      const startNear = cam.near;
      const startFar = cam.far;
      const startTime = performance.now();

      const targetPos = new THREE.Vector3(...target.position);
      const targetTarget = new THREE.Vector3(...target.target);

      const tick = (): void => {
        const t = easeInOut(
          Math.min((performance.now() - startTime) / duration, 1),
        );

        cam.position.lerpVectors(startPos, targetPos, t);
        ctrl.target.lerpVectors(startTarget, targetTarget, t);
        cam.near = lerp(startNear, target.near, t);
        cam.far = lerp(startFar, target.far, t);
        cam.up.set(...target.up);
        cam.updateProjectionMatrix();
        ctrl.update();

        if (t >= 1) {
          this.layer.time.off("tick", tick);
          resolve();
        }
      };

      this.layer.time.on("tick", tick);
    });
  }

  dispose(): void {
    this.layer.canvas.removeEventListener("click", this.onClick);
    this.layer.canvas.removeEventListener("contextmenu", this.onRightClick);
  }
}
