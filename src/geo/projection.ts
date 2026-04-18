const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const EARTH_R = 63781.37; // 与原始代码一致
const BASE_RES = 1565.4303392804097;
export const WORLD_BBOX_SIZE = EARTH_R * Math.PI * 2;

/** Mercator 投影：经纬度 → 平面坐标 */
export function project(lon: number, lat: number): [number, number] {
  const MAX_LAT = 85.0511287798;
  lat = Math.max(Math.min(MAX_LAT, lat), -MAX_LAT);
  const x = lon * RAD * EARTH_R;
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2)) * EARTH_R;
  return [x, y];
}

/** 反投影：平面坐标 → 经纬度 */
export function unproject(x: number, y: number): [number, number] {
  return [(x / EARTH_R) * DEG, (2 * Math.atan(Math.exp(y / EARTH_R)) - Math.PI / 2) * DEG];
}

/** 经纬度 → 世界像素坐标（与 wV 一致） */
export function lonLatToPixel(lon: number, lat: number, zoom: number): [number, number] {
  const size = Math.pow(2, zoom) * 256;
  const x = Math.floor(((lon + 180) / 360) * size);
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = Math.floor((0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * size);
  return [x, y];
}

export function getResolution(zoom: number): number {
  return BASE_RES / Math.pow(2, zoom);
}
