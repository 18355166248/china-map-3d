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
    // MapLayer 构造时立即启动渲染循环（TimeManager RAF），无需手动调用 start
    const layer = new MapLayer(canvas);
    let cancelled = false;

    (async () => {
      // 数据管线：加载 GeoJSON → Mercator 投影 → 计算相机/bbox → 三角剖分 → 构建 Mesh
      const raw = await loadGeoJSON('/json/china.json');
      if (cancelled) return;

      // projected 坐标系与 Three.js 场景坐标系一致（Mercator 平面坐标）
      const projected = projectGeoJSON(raw) as GeoJSON.FeatureCollection;
      const bboxProj = turf.bbox(projected) as [number, number, number, number];
      const kv = computeKV({ geojsonProj: projected, pitch: 40, rotation: 4 });

      layer.camera.applyStatus(kv.cameraStatus);

      const geomGroup = buildGeometry(projected, bboxProj);
      layer.buildMeshes(geomGroup, kv.bboxOption);

      // 内阴影在 buildMeshes 之后应用，需要 innerShadowMesh 已存在
      layer.applyInnerShadow(projected, kv.bboxOption, { debug: false });
    })();

    return () => {
      cancelled = true;
      layer.destroy(); // 清理 GPU 资源和 RAF，防止组件卸载后持续渲染
    };
  }, []);

  return <canvas ref={canvasRef} style={{ width: '100vw', height: '100vh', display: 'block' }} />;
}
