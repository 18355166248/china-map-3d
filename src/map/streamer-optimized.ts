import * as THREE from 'three';
import type { BboxOption } from '../geo/camera';

export interface StreamerStyle {
  color?: string;       // 流光颜色
  linewidth?: number;   // 线宽（像素）
  speed?: number;       // 动画速度倍率（1 = 每秒绕环一周）
  opacity?: number;     // 不透明度
  dashRatio?: number;   // 亮段占环周长比例（0~1，默认 0.05 即 5%）
  minLength?: number;   // 环周长最小阈值，低于此值跳过（过滤掉太小的岛屿/飞地）
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
 * 提取所有 ring 并计算每个 ring 的周长
 * 返回：{ positions: 所有顶点, ringData: 每个ring的[startIndex, length, totalSize] }
 */
function extractRingsWithMetadata(
  geojson: GeoJSON.FeatureCollection,
  zValue: number,
  minLength: number
): {
  positions: number[];
  ringData: Array<{ startIndex: number; vertexCount: number; totalSize: number }>;
} {
  const positions: number[] = [];
  const ringData: Array<{ startIndex: number; vertexCount: number; totalSize: number }> = [];

  for (const feature of geojson.features) {
    const geom = feature.geometry;
    const polys: number[][][][] =
      geom.type === 'Polygon'
        ? [(geom as GeoJSON.Polygon).coordinates]
        : geom.type === 'MultiPolygon'
          ? (geom as GeoJSON.MultiPolygon).coordinates
          : [];

    for (const poly of polys) {
      // 只取外环（index 0），跳过内环/孔洞
      const ring = poly[0];
      if (ring.length < 2) continue;

      const startIndex = positions.length / 3;
      const ringPositions: number[] = [];

      for (const [x, y] of ring) {
        ringPositions.push(x, y, zValue);
      }

      // 计算周长
      let totalSize = 0;
      for (let i = 3; i < ringPositions.length; i += 3) {
        const dx = ringPositions[i] - ringPositions[i - 3];
        const dy = ringPositions[i + 1] - ringPositions[i - 2];
        const dz = ringPositions[i + 2] - ringPositions[i - 1];
        totalSize += Math.hypot(dx, dy, dz);
      }

      // 过滤太小的 ring
      if (totalSize < minLength) continue;

      positions.push(...ringPositions);
      ringData.push({
        startIndex,
        vertexCount: ringPositions.length / 3,
        totalSize,
      });
    }
  }

  return { positions, ringData };
}

/**
 * 优化版流光系统：所有 ring 合并为单个 LineSegments，通过 shader attribute 控制每个 ring 的独立动画
 *
 * 优化效果：34 个省份从 34 个 draw call 降低到 1 个 draw call
 *
 * Shader 原理：
 * - attribute aRingId: 每个顶点所属的 ring 编号
 * - attribute aLineDistance: 沿线累积距离（类似 Line2.computeLineDistances）
 * - uniform uRingParams: 每个 ring 的 [totalSize, dashSize, gapSize, dashOffset]
 * - fragment shader 根据 aLineDistance 和 ring 参数计算是否在亮段内
 */
export function buildStreamerLinesOptimized(
  geojson: GeoJSON.FeatureCollection,
  bboxOption: BboxOption,
  sizes: { width: number; height: number },
  style: StreamerStyle = {}
): StreamerLines {
  const {
    color = '#00ffff',
    speed = 1,
    opacity = 1,
    dashRatio = 0.05,
    minLength = 0,
  } = style;

  const { baseHeight } = bboxOption;
  const topZ = baseHeight * 1.03;

  const { positions, ringData } = extractRingsWithMetadata(geojson, topZ, minLength);

  if (ringData.length === 0) {
    // 没有有效 ring，返回空对象
    const emptyGroup = new THREE.Group();
    return {
      group: emptyGroup,
      tick: () => {},
      setResolution: () => {},
      dispose: () => {},
    };
  }

  // 构建 LineSegments 几何（每两个顶点一段）
  const segmentPositions: number[] = [];
  const ringIds: number[] = [];
  const lineDistances: number[] = [];

  ringData.forEach((ring, ringId) => {
    const { startIndex, vertexCount } = ring;
    let accumulatedDist = 0;

    for (let i = 0; i < vertexCount - 1; i++) {
      const idx = (startIndex + i) * 3;
      const nextIdx = (startIndex + i + 1) * 3;

      // 线段起点
      segmentPositions.push(
        positions[idx],
        positions[idx + 1],
        positions[idx + 2]
      );
      ringIds.push(ringId);
      lineDistances.push(accumulatedDist);

      // 线段终点
      segmentPositions.push(
        positions[nextIdx],
        positions[nextIdx + 1],
        positions[nextIdx + 2]
      );

      const dx = positions[nextIdx] - positions[idx];
      const dy = positions[nextIdx + 1] - positions[idx + 1];
      const dz = positions[nextIdx + 2] - positions[idx + 2];
      accumulatedDist += Math.hypot(dx, dy, dz);

      ringIds.push(ringId);
      lineDistances.push(accumulatedDist);
    }
  });

  // 准备参数数据：每个 ring 的 [totalSize, dashSize, gapSize, dashOffset]
  // 使用 DataTexture 传递，避免 uniform 数组大小限制
  const ringParams = new Float32Array(ringData.length * 4);
  ringData.forEach((ring, i) => {
    const { totalSize } = ring;
    const dashSize = totalSize * dashRatio;
    const gapSize = totalSize * (1 - dashRatio);
    ringParams[i * 4 + 0] = totalSize;
    ringParams[i * 4 + 1] = dashSize;
    ringParams[i * 4 + 2] = gapSize;
    ringParams[i * 4 + 3] = 0; // dashOffset 初始值
  });

  // 创建 1D 纹理存储参数（宽度 = ringData.length，高度 = 1，RGBA = 4 个参数）
  const paramsTexture = new THREE.DataTexture(
    ringParams,
    ringData.length,
    1,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  paramsTexture.needsUpdate = true;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(segmentPositions, 3));
  geometry.setAttribute('aRingId', new THREE.Float32BufferAttribute(ringIds, 1));
  geometry.setAttribute('aLineDistance', new THREE.Float32BufferAttribute(lineDistances, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uRingParams: { value: paramsTexture },
      uRingCount: { value: ringData.length },
    },
    vertexShader: /* glsl */ `
      attribute float aRingId;
      attribute float aLineDistance;
      uniform sampler2D uRingParams;
      uniform float uRingCount;

      varying float vAlpha;

      void main() {
        // 从纹理读取 ring 参数
        float u = (aRingId + 0.5) / uRingCount;
        vec4 params = texture2D(uRingParams, vec2(u, 0.5));

        float totalSize = params.x;
        float dashSize = params.y;
        float dashOffset = params.w;

        // 计算当前位置在 dash 循环中的相对位置
        float dist = mod(aLineDistance - dashOffset, totalSize);

        // 在 dashSize 范围内显示，否则透明
        vAlpha = (dist < dashSize) ? 1.0 : 0.0;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;

      void main() {
        if (vAlpha < 0.5) discard;
        gl_FragColor = vec4(uColor, uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

  const lineSegments = new THREE.LineSegments(geometry, material);
  lineSegments.name = 'streamer-optimized';

  const group = new THREE.Group();
  group.add(lineSegments);

  return {
    group,
    tick: (deltaTime: number) => {
      const dt = deltaTime ?? 1 / 60;
      // 更新每个 ring 的 dashOffset
      for (let i = 0; i < ringData.length; i++) {
        const totalSize = ringParams[i * 4 + 0];
        ringParams[i * 4 + 3] -= totalSize * speed * dt;

        // 归一化防止浮点精度丢失
        if (ringParams[i * 4 + 3] < -totalSize * 1000) {
          ringParams[i * 4 + 3] += totalSize * 1000;
        }
      }
      paramsTexture.needsUpdate = true;
    },
    setResolution: () => {
      // LineSegments 不需要 resolution，保留接口兼容性
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
      paramsTexture.dispose();
    },
  };
}
