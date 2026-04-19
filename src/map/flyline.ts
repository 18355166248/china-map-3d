import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { project } from "../geo/projection";
import type { BboxOption } from "../geo/camera";
import type { MapLayer } from "./MapLayer";

export interface FlylineItem {
  from: [number, number]; // [lon, lat]
  to: [number, number]; // [lon, lat]
  color?: string; // 单条飞线颜色，覆盖全局 color
}

export interface FlylineStyle {
  color?: string; // 全局飞线颜色
  linewidth?: number; // 线宽（像素）
  speed?: number; // 移动速度倍率
  arcHeightFactor?: number; // 弧高 = 两点距离 × factor
  dashRatio?: number; // 亮段占弧长比例
  trailOpacity?: number; // 底层轨迹线不透明度
  segments?: number; // 贝塞尔曲线采样点数
}

/** 采样二次贝塞尔曲线，返回 [x,y,z, x,y,z, ...] */
function sampleBezier(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  segments: number,
): number[] {
  const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
  const points = curve.getPoints(segments);
  const positions: number[] = [];
  for (const p of points) positions.push(p.x, p.y, p.z);
  return positions;
}

function buildLine(positions: number[], material: LineMaterial): Line2 {
  const geo = new LineGeometry();
  geo.setPositions(positions);
  const line = new Line2(geo, material);
  line.computeLineDistances();
  return line;
}

/** 计算 positions 数组的总弧长 */
function arcLength(positions: number[]): number {
  let total = 0;
  for (let i = 3; i < positions.length; i += 3) {
    const dx = positions[i] - positions[i - 3];
    const dy = positions[i + 1] - positions[i - 2];
    const dz = positions[i + 2] - positions[i - 1];
    total += Math.hypot(dx, dy, dz);
  }
  return total;
}

export class FlylineController {
  private layer: MapLayer;
  private group: THREE.Group;
  private entries: { material: LineMaterial; totalSize: number }[] = [];
  private trailMaterials: LineMaterial[] = [];
  private tickFn?: (dt: number) => void;

  constructor(layer: MapLayer) {
    this.layer = layer;
    this.group = new THREE.Group();
    this.group.name = "flylines";
    layer.scene.add(this.group);
  }

  /**
   * 设置飞线数据，重复调用会先清除上一批
   * bboxOption 用于获取 baseHeight（飞线贴合地图顶面高度）
   */
  setData(
    data: FlylineItem[],
    bboxOption: BboxOption,
    style: FlylineStyle = {},
  ): void {
    this.clear();

    const {
      color = "#00ffff",
      linewidth = 1.5,
      speed = 0.8,
      arcHeightFactor = 0.3,
      dashRatio = 0.08,
      trailOpacity = 0.15,
      segments = 64,
    } = style;

    const { width, height } = this.layer.sizes;
    const baseZ = bboxOption.baseHeight * 1.05; // 略高于顶面

    for (const item of data) {
      const itemColor = item.color ?? color;
      const colorHex = new THREE.Color(itemColor).getHex();

      const [x0, y0] = project(item.from[0], item.from[1]);
      const [x1, y1] = project(item.to[0], item.to[1]);

      const p0 = new THREE.Vector3(x0, y0, baseZ);
      const p2 = new THREE.Vector3(x1, y1, baseZ);
      // 控制点：两点中点，z 抬高形成弧线
      const dist = p0.distanceTo(p2);
      const mid = new THREE.Vector3(
        (x0 + x1) / 2,
        (y0 + y1) / 2,
        baseZ + dist * arcHeightFactor,
      );

      const positions = sampleBezier(p0, mid, p2, segments);
      const length = arcLength(positions);
      if (length <= 0) continue;

      // 底层轨迹线（全弧，低透明度）
      const trailMat = new LineMaterial({
        color: colorHex,
        linewidth,
        opacity: trailOpacity,
        transparent: true,
        depthWrite: false,
      });
      trailMat.resolution.set(width, height);
      const trail = buildLine(positions, trailMat);
      trail.name = "flyline-trail";
      this.group.add(trail);
      this.trailMaterials.push(trailMat);

      // 移动亮段（dashOffset 动画）
      const dashSize = length * dashRatio;
      const gapSize = length * (1 - dashRatio);
      const flyMat = new LineMaterial({
        color: colorHex,
        linewidth: linewidth * 1.5,
        dashed: true,
        dashSize,
        gapSize,
        dashOffset: 0,
        transparent: true,
        depthWrite: false,
      });
      flyMat.resolution.set(width, height);
      const fly = buildLine(positions, flyMat);
      fly.name = "flyline-fly";
      this.group.add(fly);
      this.entries.push({ material: flyMat, totalSize: dashSize + gapSize });
    }

    // 注册 tick 驱动 dashOffset
    this.tickFn = (dt: number) => {
      for (const { material, totalSize } of this.entries) {
        material.dashOffset -= totalSize * speed * dt;
        if (material.dashOffset < -totalSize * 1000) {
          material.dashOffset += totalSize * 1000;
        }
      }
    };
    this.layer.time.on("tick", this.tickFn);

    // resize 时同步分辨率
    this.layer.sizes.on("resize", this.onResize);
  }

  private onResize = (): void => {
    const { width, height } = this.layer.sizes;
    for (const { material } of this.entries)
      material.resolution.set(width, height);
    for (const mat of this.trailMaterials) mat.resolution.set(width, height);
  };

  clear(): void {
    if (this.tickFn) {
      this.layer.time.off("tick", this.tickFn);
      this.tickFn = undefined;
    }
    this.layer.sizes.off("resize", this.onResize);

    this.group.traverse((obj) => {
      const line = obj as Line2;
      if (line.geometry) line.geometry.dispose();
    });
    for (const { material } of this.entries) material.dispose();
    for (const mat of this.trailMaterials) mat.dispose();
    this.entries = [];
    this.trailMaterials = [];
    this.group.clear();
  }

  dispose(): void {
    this.clear();
    this.layer.scene.remove(this.group);
  }
}
