// 角度/弧度转换系数
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// 地球半径（千米），与原始逆向代码 wV 保持一致，不得随意改动
const EARTH_R = 63781.37;

// zoom=0 时单像素对应的地面距离（千米/像素）
const BASE_RES = 1565.4303392804097;

// 世界坐标系的总宽度 = 地球周长（赤道），用于相机 bbox 计算
export const WORLD_BBOX_SIZE = EARTH_R * Math.PI * 2;

/**
 * Web Mercator 投影：经纬度 → 平面坐标（单位与 EARTH_R 相同）
 * 纬度裁剪到 ±85.0511°，超出范围会导致 ln(tan) 无穷大
 */
export function project(lon: number, lat: number): [number, number] {
  const MAX_LAT = 85.0511287798;
  lat = Math.max(Math.min(MAX_LAT, lat), -MAX_LAT);
  const x = lon * DEG_TO_RAD * EARTH_R;
  // Mercator 纬度公式：y = R * ln(tan(π/4 + φ/2))
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * DEG_TO_RAD) / 2)) * EARTH_R;
  return [x, y];
}

/** 反投影：平面坐标 → 经纬度 */
export function unproject(x: number, y: number): [number, number] {
  return [(x / EARTH_R) * RAD_TO_DEG, (2 * Math.atan(Math.exp(y / EARTH_R)) - Math.PI / 2) * RAD_TO_DEG];
}

/**
 * 经纬度 → 世界像素坐标（与原始 wV 函数一致）
 * zoom=0 时世界地图为 256×256 像素，每级翻倍
 */
export function lonLatToPixel(lon: number, lat: number, zoom: number): [number, number] {
  const size = Math.pow(2, zoom) * 256;
  const x = Math.floor(((lon + 180) / 360) * size);
  const sinLat = Math.sin((lat * Math.PI) / 180);
  // Y 轴向下，与 Canvas/屏幕坐标系一致
  const y = Math.floor((0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * size);
  return [x, y];
}

/** 给定 zoom 级别下每像素对应的地面距离（千米） */
export function getResolution(zoom: number): number {
  return BASE_RES / Math.pow(2, zoom);
}
