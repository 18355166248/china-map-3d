import { project } from './projection';

type Coord = number[];
type TransformFn = (coord: Coord) => Coord;

// 原地修改坐标（避免对每个坐标点重新分配数组），保留 6 位小数与原始代码一致
function applyInPlace(coord: Coord, fn: TransformFn): void {
  const result = fn(coord);
  coord[0] = +result[0].toFixed(6);
  coord[1] = +result[1].toFixed(6);
}

// 按 GeoJSON 几何类型递归遍历所有坐标点并应用变换
// switch 内各分支已通过类型收窄确认 coordinates 存在，故无需在外部提前读取
function transformGeometry(geometry: GeoJSON.Geometry, fn: TransformFn): void {
  switch (geometry.type) {
    case 'Point':
      applyInPlace(geometry.coordinates as Coord, fn);
      break;
    case 'LineString':
    case 'MultiPoint':
      for (const coord of geometry.coordinates as Coord[]) applyInPlace(coord, fn);
      break;
    case 'Polygon':
    case 'MultiLineString':
      for (const ring of geometry.coordinates as Coord[][])
        for (const coord of ring) applyInPlace(coord, fn);
      break;
    case 'MultiPolygon':
      for (const poly of geometry.coordinates as Coord[][][])
        for (const ring of poly)
          for (const coord of ring) applyInPlace(coord, fn);
      break;
  }
}

/**
 * 深拷贝 GeoJSON 并对所有坐标点应用变换函数
 * 深拷贝是为了不污染原始数据，后续 bbox 计算仍需原始经纬度
 */
export function transformGeoJSON(
  geojson: GeoJSON.GeoJSON,
  transformFn: TransformFn
): GeoJSON.GeoJSON {
  const cloned = JSON.parse(JSON.stringify(geojson)) as GeoJSON.GeoJSON;
  switch (cloned.type) {
    case 'FeatureCollection':
      for (const feature of cloned.features) transformGeometry(feature.geometry, transformFn);
      break;
    case 'Feature':
      transformGeometry(cloned.geometry, transformFn);
      break;
    case 'GeometryCollection':
      for (const geometry of cloned.geometries) transformGeometry(geometry, transformFn);
      break;
    default:
      transformGeometry(cloned as GeoJSON.Geometry, transformFn);
  }
  return cloned;
}

/** 将 GeoJSON 经纬度坐标批量投影为 Mercator 平面坐标，保留高度维（z）不变 */
export function projectGeoJSON(geojson: GeoJSON.GeoJSON): GeoJSON.GeoJSON {
  return transformGeoJSON(geojson, ([lon, lat, altitude]) => {
    const [x, y] = project(lon, lat);
    return altitude !== undefined ? [x, y, altitude] : [x, y];
  });
}
