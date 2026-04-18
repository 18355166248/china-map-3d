import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { BboxOption } from '../geo/camera';

export interface BoundaryStyle {
  color?: string;        // 边界线颜色
  linewidth?: number;    // 线宽（像素）
  opacity?: number;      // 不透明度
}

export interface BoundaryLines {
  top: LineSegments2;    // 顶部边界线，贴合顶面（z = baseHeight * 1.02）
  bottom: LineSegments2; // 底部边界线，位于地面（z = 0）
}

/**
 * 将 GeoJSON 多边形轮廓提取为线段端点数组（Line2 格式：每两个点一段）
 * 每条边 [A, B] 在数组中存为 [Ax, Ay, Az, Bx, By, Bz]
 */
function extractLinePositions(
  geojson: GeoJSON.FeatureCollection,
  zValue: number
): number[] {
  const positions: number[] = [];

  for (const feature of geojson.features) {
    const geom = feature.geometry;
    const polys: number[][][][] =
      geom.type === 'Polygon'
        ? [(geom as GeoJSON.Polygon).coordinates]
        : geom.type === 'MultiPolygon'
          ? (geom as GeoJSON.MultiPolygon).coordinates
          : [];

    for (const poly of polys) {
      for (const ring of poly) {
        // 将环上每相邻两点构成一段线段
        for (let i = 0; i < ring.length - 1; i++) {
          const [x1, y1] = ring[i];
          const [x2, y2] = ring[i + 1];
          positions.push(x1, y1, zValue, x2, y2, zValue);
        }
      }
    }
  }

  return positions;
}

/**
 * 构建省级边界线（顶面 + 底面各一套）
 * Line2 系列通过将线段转为四边形实现任意线宽，绕过 WebGL lineWidth=1 的限制
 *
 * @param geojson   已投影的 GeoJSON（Mercator 坐标）
 * @param bboxOption computeKV 输出的 bbox 参数，用于获取 baseHeight
 * @param sizes     canvas 宽高，LineMaterial 需要分辨率计算线宽
 * @param style     线条样式配置
 */
export function buildBoundaryLines(
  geojson: GeoJSON.FeatureCollection,
  bboxOption: BboxOption,
  sizes: { width: number; height: number },
  style: BoundaryStyle = {}
): BoundaryLines {
  const {
    color = '#ffffff',
    linewidth = 1,
    opacity = 0.8,
  } = style;

  const { baseHeight } = bboxOption;

  // 顶面边界线略高于顶面（1.02x），防止与顶面 z-fighting
  const topZValue = baseHeight * 1.02;

  const topPositions = extractLinePositions(geojson, topZValue);
  const bottomPositions = extractLinePositions(geojson, 0);

  function createLine(positions: number[]): LineSegments2 {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);

    // resolution 必须设置，否则 LineMaterial 无法正确计算像素线宽
    const material = new LineMaterial({
      color: new THREE.Color(color).getHex(),
      linewidth,
      opacity,
      transparent: opacity < 1,
      depthWrite: false, // 防止边界线遮挡顶面阴影层
    });
    material.resolution.set(sizes.width, sizes.height);

    return new LineSegments2(geometry, material);
  }

  return {
    top: createLine(topPositions),
    bottom: createLine(bottomPositions),
  };
}

/**
 * 更新所有边界线材质的分辨率（窗口 resize 时调用）
 * LineMaterial 依赖分辨率将线宽从像素转换为 NDC 单位
 */
export function updateBoundaryResolution(
  lines: BoundaryLines,
  width: number,
  height: number
): void {
  (lines.top.material as LineMaterial).resolution.set(width, height);
  (lines.bottom.material as LineMaterial).resolution.set(width, height);
}
