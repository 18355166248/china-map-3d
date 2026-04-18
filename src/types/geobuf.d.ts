declare module 'geobuf' {
  import Pbf from 'pbf';
  export function decode(pbf: Pbf): GeoJSON.GeoJSON;
  export function encode(geojson: GeoJSON.GeoJSON, pbf: Pbf): Uint8Array;
}
