import * as turf from '@turf/turf';
import { project, unproject, WORLD_BBOX_SIZE } from './projection';

const RAD = Math.PI / 180;

// 中国地图基准尺寸（与原始 JV 常量一致）
const CHINA_BBOX = {
  bboxSize: 68016,
  width: 68565.51601500002,
  height: 50503.97002946732,
};

export interface BboxOption {
  bbox: [number, number, number, number];       // 反投影后的经纬度 bbox
  bboxProj: [number, number, number, number];   // 投影坐标 bbox
  center: [number, number, number];
  centerProj: [number, number, number];
  size: { width: number; height: number; minSize: number; maxSize: number; bboxSize: number };
  bboxScale: number;
  baseHeight: number;
}

export interface CameraStatus {
  near: number;
  far: number;
  target: [number, number, number];
  position: [number, number, number];
  up: [number, number, number];
}

export interface KVResult {
  bboxOption: BboxOption;
  cameraStatus: CameraStatus;
  layerFitValue: { xy: number; z: number; flylineWidth: number; straightLineWidth: number };
}

/** 角度转弧度 */
function toRad(deg: number): number {
  return deg * RAD;
}

/** 相机方向向量（pitch, rotation → position 方向单位向量） */
function cameraDirection(pitch: number, rotation: number): [number, number, number] {
  const p = toRad(pitch);
  const r = toRad(rotation);
  return [Math.sin(p) * Math.sin(r), -Math.sin(p) * Math.cos(r), Math.cos(p)];
}

/** 相机 up 向量 */
function cameraUp(pitch: number, rotation: number): [number, number, number] {
  const p = toRad(pitch);
  const r = toRad(rotation);
  return [-Math.cos(p) * Math.sin(r), Math.cos(p) * Math.cos(r), Math.sin(p)];
}

/** 取数组最大值（对应 window.ef） */
function maxOf(arr: number[]): number {
  return Math.max(...arr);
}

function calcBboxOptions(
  bboxProj: [number, number, number, number],
  worldBboxSize: number,
  heightFactor: number
): BboxOption {
  const [x0, y0, x1, y1] = bboxProj;
  const centerProj: [number, number, number] = [(x0 + x1) / 2, (y0 + y1) / 2, 0];

  // 反投影得到经纬度 bbox
  const [lon0, lat0] = unproject(x0, y0);
  const [lon1, lat1] = unproject(x1, y1);
  const bbox: [number, number, number, number] = [lon0, lat0, lon1, lat1];
  const center: [number, number, number] = [(lon0 + lon1) / 2, (lat0 + lat1) / 2, 0];

  const width = Math.abs(x1 - x0);
  const height = Math.abs(y1 - y0);
  const minSize = Math.min(width, height);
  const maxSize = Math.max(width, height);

  const bboxSize = maxOf([width / CHINA_BBOX.width, height / CHINA_BBOX.height]) * CHINA_BBOX.bboxSize;
  const bboxScale = bboxSize / worldBboxSize;
  const baseHeight = bboxSize * heightFactor * 0.05;

  return { bbox, bboxProj, center, centerProj, size: { width, height, minSize, maxSize, bboxSize }, bboxScale, baseHeight };
}

export interface KVOptions {
  geojsonProj: GeoJSON.GeoJSON;
  pitch?: number;
  rotation?: number;
  offset?: [number, number, number];
  heightFactor?: number;
}

export function computeKV(opts: KVOptions): KVResult {
  const {
    geojsonProj,
    pitch = 40,
    rotation = 4,
    offset = [0, 0, 1],
    heightFactor = 1,
  } = opts;

  const rawBbox = turf.bbox(geojsonProj as turf.AllGeoJSON) as [number, number, number, number];
  const bboxOption = calcBboxOptions(rawBbox, WORLD_BBOX_SIZE, heightFactor);

  const { bboxSize } = bboxOption.size;
  const [cx, cy] = bboxOption.centerProj;
  const scaledSize = bboxSize * offset[2];

  const dir = cameraDirection(pitch, rotation);
  const position: [number, number, number] = [
    dir[0] * scaledSize + cx + offset[0] * bboxSize,
    dir[1] * scaledSize + cy + offset[1] * bboxSize,
    dir[2] * scaledSize,
  ];

  const target: [number, number, number] = [
    cx + offset[0] * bboxSize,
    cy + offset[1] * bboxSize,
    0,
  ];

  return {
    bboxOption,
    cameraStatus: {
      near: bboxSize * 0.001,
      far: 10 * bboxSize,
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

/** 用经纬度中心 + zoom 计算投影 bbox（用于初始化） */
export function bboxFromCenter(
  center: [number, number],
  zoom: number
): [number, number, number, number] {
  const [cx, cy] = project(center[0], center[1]);
  const half = WORLD_BBOX_SIZE / Math.pow(2, zoom + 1);
  return [cx - half, cy - half, cx + half, cy + half];
}
