import { project } from './projection';

type Coord = number[];
type TransformFn = (coord: Coord) => Coord;

function transformGeometry(geometry: GeoJSON.Geometry, fn: TransformFn): void {
  const c = geometry.coordinates as Coord[][][] | Coord[][] | Coord[] | Coord;
  switch (geometry.type) {
    case 'Point':
      applyInPlace(c as Coord, fn);
      break;
    case 'LineString':
    case 'MultiPoint':
      for (const p of c as Coord[]) applyInPlace(p, fn);
      break;
    case 'Polygon':
    case 'MultiLineString':
      for (const ring of c as Coord[][]) for (const p of ring) applyInPlace(p, fn);
      break;
    case 'MultiPolygon':
      for (const poly of c as Coord[][][]) for (const ring of poly) for (const p of ring) applyInPlace(p, fn);
      break;
  }
}

function applyInPlace(coord: Coord, fn: TransformFn): void {
  const result = fn(coord);
  coord[0] = +result[0].toFixed(6);
  coord[1] = +result[1].toFixed(6);
}

/** 深拷贝 GeoJSON 并对所有坐标应用投影函数，保留 6 位小数 */
export function transformGeoJSON(
  geojson: GeoJSON.GeoJSON,
  transformFn: TransformFn
): GeoJSON.GeoJSON {
  const cloned = JSON.parse(JSON.stringify(geojson)) as GeoJSON.GeoJSON;
  switch (cloned.type) {
    case 'FeatureCollection':
      for (const f of cloned.features) transformGeometry(f.geometry, transformFn);
      break;
    case 'Feature':
      transformGeometry(cloned.geometry, transformFn);
      break;
    case 'GeometryCollection':
      for (const g of cloned.geometries) transformGeometry(g, transformFn);
      break;
    default:
      transformGeometry(cloned as GeoJSON.Geometry, transformFn);
  }
  return cloned;
}

/** 将 GeoJSON 经纬度坐标投影为 Mercator 平面坐标 */
export function projectGeoJSON(geojson: GeoJSON.GeoJSON): GeoJSON.GeoJSON {
  return transformGeoJSON(geojson, ([lon, lat, alt]) => {
    const [x, y] = project(lon, lat);
    return alt !== undefined ? [x, y, alt] : [x, y];
  });
}
