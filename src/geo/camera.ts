import * as turf from "@turf/turf";
import { project, unproject, WORLD_BBOX_SIZE } from "./projection";

const DEG_TO_RAD = Math.PI / 180;

// 中国地图基准尺寸，与原始逆向代码 KV.js 保持一致，用于 bboxScale 归一化
const CHINA_BBOX = {
  bboxSize: 68016,
  width: 68565.51601500002,
  height: 50503.97002946732,
};

export interface BboxOption {
  bbox: [number, number, number, number]; // 经纬度 bbox [minLon, minLat, maxLon, maxLat]
  bboxProj: [number, number, number, number]; // 投影坐标 bbox [x0, y0, x1, y1]
  center: [number, number, number]; // 经纬度中心点
  centerProj: [number, number, number]; // 投影坐标中心点
  size: {
    width: number;
    height: number;
    minSize: number;
    maxSize: number;
    bboxSize: number;
  };
  bboxScale: number; // 相对中国全图的缩放比例
  baseHeight: number; // 地图拉伸高度（bboxSize 的 5% × heightFactor）
}

export interface CameraStatus {
  near: number;
  far: number;
  minDistance: number; // OrbitControls 最近缩放距离
  maxDistance: number; // OrbitControls 最远缩放距离
  target: [number, number, number]; // OrbitControls 焦点（地图中心）
  position: [number, number, number]; // 相机世界坐标
  up: [number, number, number]; // 相机 up 向量
}

export interface KVResult {
  bboxOption: BboxOption;
  cameraStatus: CameraStatus;
  layerFitValue: {
    xy: number;
    z: number;
    flylineWidth: number;
    straightLineWidth: number;
  };
}

/**
 * 根据 pitch（仰角）和 rotation（方位角）计算相机方向单位向量
 * 坐标系：X 向东，Y 向北，Z 向上
 */
function cameraDirection(
  pitch: number,
  rotation: number,
): [number, number, number] {
  const pitchRad = pitch * DEG_TO_RAD;
  const rotationRad = rotation * DEG_TO_RAD;
  return [
    Math.sin(pitchRad) * Math.sin(rotationRad),
    -Math.sin(pitchRad) * Math.cos(rotationRad),
    Math.cos(pitchRad),
  ];
}

/**
 * 计算相机的 up 向量（与 cameraDirection 正交）
 * 保证视口在旋转时不发生倾斜
 */
function cameraUp(pitch: number, rotation: number): [number, number, number] {
  const pitchRad = pitch * DEG_TO_RAD;
  const rotationRad = rotation * DEG_TO_RAD;
  return [
    -Math.cos(pitchRad) * Math.sin(rotationRad),
    Math.cos(pitchRad) * Math.cos(rotationRad),
    Math.sin(pitchRad),
  ];
}

function maxOf(arr: number[]): number {
  return Math.max(...arr);
}

function calcBboxOptions(
  bboxProj: [number, number, number, number],
  worldBboxSize: number,
  heightFactor: number,
): BboxOption {
  const [minX, minY, maxX, maxY] = bboxProj;
  const centerProj: [number, number, number] = [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    0,
  ];

  const [minLon, minLat] = unproject(minX, minY);
  const [maxLon, maxLat] = unproject(maxX, maxY);
  const bbox: [number, number, number, number] = [
    minLon,
    minLat,
    maxLon,
    maxLat,
  ];
  const center: [number, number, number] = [
    (minLon + maxLon) / 2,
    (minLat + maxLat) / 2,
    0,
  ];

  const width = Math.abs(maxX - minX);
  const height = Math.abs(maxY - minY);
  const minSize = Math.min(width, height);
  const maxSize = Math.max(width, height);

  // bboxSize 按当前数据相对中国全图的比例缩放，保持各级别地图拉伸高度一致
  const bboxSize =
    maxOf([width / CHINA_BBOX.width, height / CHINA_BBOX.height]) *
    CHINA_BBOX.bboxSize;
  const bboxScale = bboxSize / worldBboxSize;

  // baseHeight = bboxSize * 5%，决定地图立体拉伸高度，可通过 heightFactor 调整
  const baseHeight = bboxSize * heightFactor * 0.05;

  return {
    bbox,
    bboxProj,
    center,
    centerProj,
    size: { width, height, minSize, maxSize, bboxSize },
    bboxScale,
    baseHeight,
  };
}

export interface KVOptions {
  geojsonProj: GeoJSON.GeoJSON;
  pitch?: number; // 仰角，默认 40°
  rotation?: number; // 水平旋转角，默认 4°
  offset?: [number, number, number]; // 相机位置偏移系数，z 分量控制镜头距离
  heightFactor?: number;
}

/**
 * 计算相机状态和地图尺寸参数（对应原始逆向代码 KV.js window.KV）
 * 输出的 cameraStatus 直接传给 CameraManager.applyStatus
 * 输出的 bboxOption 传给 buildGeometry 和 applyInnerShadow
 */
export function computeKV(opts: KVOptions): KVResult {
  const {
    geojsonProj,
    pitch = 40,
    rotation = 4,
    offset = [0, 0, 1],
    heightFactor = 1,
  } = opts;

  const rawBbox = turf.bbox(geojsonProj as turf.AllGeoJSON) as [
    number,
    number,
    number,
    number,
  ];
  const bboxOption = calcBboxOptions(rawBbox, WORLD_BBOX_SIZE, heightFactor);

  const { bboxSize } = bboxOption.size;
  const [centerX, centerY] = bboxOption.centerProj;

  // 相机沿方向向量放置在距地图中心 scaledSize 处
  const scaledSize = bboxSize * offset[2];
  const dir = cameraDirection(pitch, rotation);
  const position: [number, number, number] = [
    dir[0] * scaledSize + centerX + offset[0] * bboxSize,
    dir[1] * scaledSize + centerY + offset[1] * bboxSize,
    dir[2] * scaledSize,
  ];

  const target: [number, number, number] = [
    centerX + offset[0] * bboxSize,
    centerY + offset[1] * bboxSize,
    0,
  ];

  return {
    bboxOption,
    cameraStatus: {
      // near = bboxSize * 0.001 防止近裁剪面切穿地图表面（原始代码用 bboxSize 导致裁剪问题）
      near: bboxSize * 0.001,
      far: 10 * bboxSize,
      // 缩放限制随地图尺寸动态调整，省级/市级切换后自动更新
      minDistance: bboxSize * 0.05,
      maxDistance: bboxSize * 5,
      target,
      position,
      up: cameraUp(pitch, rotation),
    },
    layerFitValue: {
      xy: bboxSize >> 4,
      z: bboxSize >> 3,
      flylineWidth: bboxSize >> 12,
      straightLineWidth: bboxSize >> 6,
    },
  };
}

/** 用经纬度中心 + zoom 反算投影 bbox，用于初始化场景 */
export function bboxFromCenter(
  center: [number, number],
  zoom: number,
): [number, number, number, number] {
  const [centerX, centerY] = project(center[0], center[1]);
  const halfSize = WORLD_BBOX_SIZE / Math.pow(2, zoom + 1);
  return [
    centerX - halfSize,
    centerY - halfSize,
    centerX + halfSize,
    centerY + halfSize,
  ];
}
