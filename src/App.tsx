import { useEffect, useRef } from 'react';
import { projectGeoJSON } from './geo/transform';
import { computeKV } from './geo/camera';
import { loadGeoJSON } from './geo/loader';
import { buildGeometry } from './geo/triangulate';
import { MapLayer } from './map/MapLayer';
import * as turf from '@turf/turf';
import './App.css';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const layer = new MapLayer(canvas);
    let cancelled = false;

    (async () => {
      const raw = await loadGeoJSON('/json/china.json');
      if (cancelled) return;

      const projected = projectGeoJSON(raw) as GeoJSON.FeatureCollection;
      const bboxProj = turf.bbox(projected) as [number, number, number, number];
      const kv = computeKV({ geojsonProj: projected, pitch: 40, rotation: 4 });

      layer.camera.applyStatus(kv.cameraStatus);

      const geomGroup = buildGeometry(projected, bboxProj);
      layer.buildMeshes(geomGroup, kv.bboxOption);
    })();

    return () => {
      cancelled = true;
      layer.destroy();
    };
  }, []);

  return <canvas ref={canvasRef} style={{ width: '100vw', height: '100vh', display: 'block' }} />;
}
