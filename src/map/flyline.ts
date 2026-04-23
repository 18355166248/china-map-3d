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
  color?: string;
}

export interface FlylineStyle {
  color?: string;
  speed?: number;
  arcHeightFactor?: number;
  dashRatio?: number; // 亮段占弧长比例
  segments?: number; // 贝塞尔采样点数
}

function sampleBezier(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  segments: number,
): number[] {
  const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
  const pts = curve.getPoints(segments);
  const out: number[] = [];
  for (const p of pts) out.push(p.x, p.y, p.z);
  return out;
}

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

function buildLine(positions: number[], mat: LineMaterial): Line2 {
  const geo = new LineGeometry();
  geo.setPositions(positions);
  const line = new Line2(geo, mat);
  line.computeLineDistances();
  return line;
}

/** 生成径向渐变辉光纹理，用于头部精灵 */
function createGlowTexture(color: string): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, color);
  grad.addColorStop(0.2, color);
  grad.addColorStop(0.5, color + "66");
  grad.addColorStop(1, "transparent");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

interface FlyEntry {
  // 三层叠加：外辉光、中辉光、核心亮段
  outerMat: LineMaterial;
  midMat: LineMaterial;
  coreMat: LineMaterial;
  totalSize: number;
  curve: THREE.QuadraticBezierCurve3;
  headSprite: THREE.Sprite;
  glowTexture: THREE.Texture;
}

export class FlylineController {
  private layer: MapLayer;
  private group: THREE.Group;
  private entries: FlyEntry[] = [];
  private trailMats: LineMaterial[] = [];
  private tickFn?: (dt: number) => void;

  constructor(layer: MapLayer) {
    this.layer = layer;
    this.group = new THREE.Group();
    this.group.name = "flylines";
    layer.scene.add(this.group);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  setData(
    data: FlylineItem[],
    bboxOption: BboxOption,
    style: FlylineStyle = {},
  ): void {
    this.clear();

    const {
      color = "#00d4ff",
      speed = 0.7,
      arcHeightFactor = 0.35,
      dashRatio = 0.2,
      segments = 80,
    } = style;

    const { width, height } = this.layer.sizes;
    const baseZ = bboxOption.baseHeight * 1.06;
    // 头部精灵大小与地图尺寸成比例
    const headSize = bboxOption.size.bboxSize * 0.006;

    for (const item of data) {
      const c = item.color ?? color;
      const hex = new THREE.Color(c).getHex();

      const [x0, y0] = project(item.from[0], item.from[1]);
      const [x1, y1] = project(item.to[0], item.to[1]);
      const p0 = new THREE.Vector3(x0, y0, baseZ);
      const p2 = new THREE.Vector3(x1, y1, baseZ);
      const dist = p0.distanceTo(p2);
      const mid = new THREE.Vector3(
        (x0 + x1) / 2,
        (y0 + y1) / 2,
        baseZ + dist * arcHeightFactor,
      );
      const curve = new THREE.QuadraticBezierCurve3(p0, mid, p2);

      const positions = sampleBezier(p0, mid, p2, segments);
      const length = arcLength(positions);
      if (length <= 0) continue;

      // ── 轨迹底线（全弧）──────────────────────────────
      const trailMat = new LineMaterial({
        color: hex,
        linewidth: 1.5,
        opacity: 0.45,
        transparent: true,
        depthWrite: false,
      });
      trailMat.resolution.set(width, height);
      this.group.add(buildLine(positions, trailMat));
      this.trailMats.push(trailMat);

      // ── 三层叠加辉光移动段 ─────────────────────────────────
      const dashSize = length * dashRatio;
      const gapSize = length * (1 - dashRatio);
      const totalSize = dashSize + gapSize;

      // 外层：宽 + 极透明（模拟 bloom 扩散）
      const outerMat = new LineMaterial({
        color: hex,
        linewidth: 8,
        dashed: true,
        dashSize,
        gapSize,
        dashOffset: 0,
        opacity: 0.2,
        transparent: true,
        depthWrite: false,
      });
      outerMat.resolution.set(width, height);

      // 中层：中宽 + 半透明
      const midMat = new LineMaterial({
        color: hex,
        linewidth: 4,
        dashed: true,
        dashSize,
        gapSize,
        dashOffset: 0,
        opacity: 0.65,
        transparent: true,
        depthWrite: false,
      });
      midMat.resolution.set(width, height);

      // 核心：细 + 全亮
      const coreMat = new LineMaterial({
        color: 0xffffff,
        linewidth: 1.5,
        dashed: true,
        dashSize,
        gapSize,
        dashOffset: 0,
        opacity: 1,
        transparent: true,
        depthWrite: false,
      });
      coreMat.resolution.set(width, height);

      this.group.add(buildLine(positions, outerMat));
      this.group.add(buildLine(positions, midMat));
      this.group.add(buildLine(positions, coreMat));

      // ── 头部发光精灵 ───────────────────────────────────────
      const glowTexture = createGlowTexture(c);
      const headSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: hex,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending, // 叠加混合让辉光更亮
        }),
      );
      headSprite.scale.setScalar(headSize);
      headSprite.position.copy(p0);
      this.group.add(headSprite);

      this.entries.push({
        outerMat,
        midMat,
        coreMat,
        totalSize,
        curve,
        headSprite,
        glowTexture,
      });
    }

    // tick：推进 dashOffset + 更新头部位置
    this.tickFn = (dt: number) => {
      for (const e of this.entries) {
        e.coreMat.dashOffset -= e.totalSize * speed * dt;
        // 防止浮点累积
        if (e.coreMat.dashOffset < -e.totalSize * 1000)
          e.coreMat.dashOffset += e.totalSize * 1000;
        // 三层同步
        e.outerMat.dashOffset = e.coreMat.dashOffset;
        e.midMat.dashOffset = e.coreMat.dashOffset;

        // 头部精灵跟随亮段前沿
        const raw = -e.coreMat.dashOffset;
        const t =
          (((raw % e.totalSize) + e.totalSize) % e.totalSize) / e.totalSize;
        e.headSprite.position.copy(e.curve.getPointAt(Math.min(t, 1)));
      }
    };
    this.layer.time.on("tick", this.tickFn);
    this.layer.sizes.on("resize", this.onResize);
  }

  private onResize = (): void => {
    const { width, height } = this.layer.sizes;
    for (const e of this.entries) {
      e.outerMat.resolution.set(width, height);
      e.midMat.resolution.set(width, height);
      e.coreMat.resolution.set(width, height);
    }
    for (const m of this.trailMats) m.resolution.set(width, height);
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
    for (const e of this.entries) {
      e.outerMat.dispose();
      e.midMat.dispose();
      e.coreMat.dispose();
      e.glowTexture.dispose();
      (e.headSprite.material as THREE.SpriteMaterial).dispose();
    }
    for (const m of this.trailMats) m.dispose();
    this.entries = [];
    this.trailMats = [];
    this.group.clear();
  }

  dispose(): void {
    this.clear();
    this.layer.scene.remove(this.group);
  }

  /** 是否有可见数据（用于 loading 结束时按需恢复显隐） */
  hasData(): boolean {
    return this.entries.length > 0 || this.trailMats.length > 0;
  }
}
