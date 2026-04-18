import Pbf from 'pbf';
import geobuf from 'geobuf';

export async function loadPbf(url: string): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  return geobuf.decode(new Pbf(buf)) as GeoJSON.FeatureCollection;
}

export async function loadGeoJSON(url: string): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(url);
  return res.json();
}
