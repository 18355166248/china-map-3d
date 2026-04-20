import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { BboxOption } from '../geo/camera';
import { buildStreamerLinesOptimized } from './streamer-optimized';

export interface StreamerStyle {
  color?: string;       // 流光颜色
  linewidth?: number;   // 线宽（像素）
  speed?: number;       // 动画速度倍率（1 = 每秒绕环一周）
  opacity?: number;     // 不透明度
  dashRatio?: number;   // 亮段占环周长比例（0~1，默认 0.05 即 5%）
  minLength?: number;   // 环周长最小阈值，低于此值跳过（过滤掉太小的岛屿/飞地）
  optimized?: boolean;  // 是否使用优化版本（合并几何，减少 draw call）
}

export interface StreamerLines {
  group: THREE.Group;
  /** 每帧由 TimeManager tick 事件调用，deltaTime 单位为秒 */
  tick: (deltaTime: number) => void;
  /** resize 时同步所有材质的 resolution */
  setResolution: (width: number, height: number) => void;
  dispose: () => void;
}

/**
 * 把 GeoJSON 多边形拆成一个个 ring（连续闭合路径），每个 ring 一个 positions 数组
 * Line2 需要连续路径（首尾相连），不同于 LineSegments2 的成对端点
 */
function extractRings(
  geojson: GeoJSON.FeatureCollection,
  zValue: number
): number[][] {
  const rings: number[][] = [];

  for (const feature of geojson.features) {
    const geom = feature.geometry;
    const polys: number[][][][] =
      geom.type === 'Polygon'
        ? [(geom as GeoJSON.Polygon).coordinates]
        : geom.type === 'MultiPolygon'
          ? (geom as GeoJSON.MultiPolygon).coordinates
          : [];

    for (const poly of polys) {
      // 只取外环（index 0），跳过内环/孔洞，保证每个多边形只有一个亮点
      const ring = poly[0];
      const positions: number[] = [];
      for (const [x, y] of ring) {
        positions.push(x, y, zValue);
      }
      if (positions.length >= 6) rings.push(positions);
    }
  }

  return rings;
}

/** 计算 ring 的总周长（顶点连续累加） */
function ringLength(positions: number[]): number {
  let total = 0;
  for (let i = 3; i < positions.length; i += 3) {
    const dx = positions[i]     - positions[i - 3];
    const dy = positions[i + 1] - positions[i - 2];
    const dz = positions[i + 2] - positions[i - 1];
    total += Math.hypot(dx, dy, dz);
  }
  return total;
}

/**
 * 构建流光动画线（顶面 + 底面）
 *
 * 流光原理：
 *  - 每个 ring 用 Line2 表示为一条连续路径，computeLineDistances() 写入沿线累积距离
 *  - 每个 ring 独立 LineMaterial：dashSize = ring周长 × dashRatio（亮段），
 *    gapSize = ring周长 × (1 - dashRatio)（空白），保证整圈只有一个亮点
 *  - 每帧 dashOffset 减少一个 totalSize × speed × dt 的比例，亮点沿环移动
 *  - 因为 dashSize + gapSize 等于周长，亮点正好绕环循环不重叠
 *
 * 性能优化：
 *  - 设置 optimized: true 使用优化版本，将所有 ring 合并为单个 LineSegments
 *  - 优化版本通过 shader attribute 控制每个 ring 的独立动画
 *  - 34 个省份从 34 个 draw call 降低到 1 个 draw call
 *
 * @param geojson    已投影的 GeoJSON（Mercator 坐标）
 * @param bboxOption computeKV 输出，用于获取 baseHeight
 * @param sizes      canvas 宽高，LineMaterial 计算像素线宽需要
 * @param style      流光样式配置
 */
export function buildStreamerLines(
  geojson: GeoJSON.FeatureCollection,
  bboxOption: BboxOption,
  sizes: { width: number; height: number },
  style: StreamerStyle = {}
): StreamerLines {
  // 使用优化版本
  if (style.optimized) {
    return buildStreamerLinesOptimized(geojson, bboxOption, sizes, style);
  }

  // 原始版本（兼容性保留）
  const {
    color = '#00ffff',
    linewidth = 2,
    speed = 1,
    opacity = 1,
    dashRatio = 0.05,
    minLength = 0,
  } = style;

  const { baseHeight } = bboxOption;

  // 流光顶线略高于边界线（1.03x baseHeight），避免 z-fighting
  const topZ = baseHeight * 1.03;

  const topRings = extractRings(geojson, topZ);

  const colorHex = new THREE.Color(color).getHex();
  const group = new THREE.Group();
  group.name = 'streamer';

  // 收集所有 (material, totalSize)，tick 时同步推进
  const entries: { material: LineMaterial; totalSize: number }[] = [];

  function buildRingLine(positions: number[]): Line2 | null {
    const length = ringLength(positions);
    // 周长为 0 或低于最小阈值时跳过，避免为不可见的小岛/飞地创建流光
    if (length <= 0 || length < minLength) return null;

    const dashSize  = length * dashRatio;
    const gapSize   = length * (1 - dashRatio);
    const totalSize = dashSize + gapSize; // == length

    const material = new LineMaterial({
      color: colorHex,
      linewidth,
      dashed: true,
      dashSize,
      gapSize,
      dashOffset: 0,
      opacity,
      transparent: true,
      depthWrite: false,
    });
    material.resolution.set(sizes.width, sizes.height);

    const geometry = new LineGeometry();
    geometry.setPositions(positions);

    entries.push({ material, totalSize });

    const line = new Line2(geometry, material);
    // 计算沿线累积距离，dash 图案才能按距离循环；不调用则 lineDistance=0 全线段同步闪烁
    line.computeLineDistances();
    return line;
  }

  for (const positions of topRings) {
    const line = buildRingLine(positions);
    if (line) {
      line.name = 'streamer-top-ring';
      group.add(line);
    }
  }

  return {
    group,
    // deltaTime 由 TimeManager 提供（秒），帧率无关
    // 每秒推进 speed × totalSize（恰好一圈），亮点循环绕环
    tick: (deltaTime: number) => {
      const dt = deltaTime ?? 1 / 60;
      for (const { material, totalSize } of entries) {
        material.dashOffset -= totalSize * speed * dt;
        // 长时间累积浮点精度丢失，按周长归一化保持精度
        if (material.dashOffset < -totalSize * 1000) {
          material.dashOffset += totalSize * 1000;
        }
      }
    },
    setResolution: (width: number, height: number) => {
      for (const { material } of entries) {
        material.resolution.set(width, height);
      }
    },
    dispose: () => {
      group.traverse(obj => {
        const line = obj as Line2;
        if (line.geometry) line.geometry.dispose();
      });
      for (const { material } of entries) material.dispose();
    },
  };
}

/** 窗口 resize 时更新所有材质分辨率 */
export function updateStreamerResolution(
  lines: StreamerLines,
  width: number,
  height: number
): void {
  lines.setResolution(width, height);
}
