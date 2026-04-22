import { useEffect, useRef } from "react";
import { projectGeoJSON } from "./geo/transform";
import { computeKV } from "./geo/camera";
import { loadGeoJSON } from "./geo/loader";
import { buildGeometry } from "./geo/triangulate";
import { MapLayer } from "./map/MapLayer";
import { DrillController } from "./map/drill";
import { LabelController } from "./map/label";
import { HighlightController } from "./map/highlight";
import { FlylineController } from "./map/flyline";
import { ParticleController } from "./map/particle";
import { buildGradientTexture } from "./map/gradientTexture";
import { buildTerrainTexture } from "./map/terrainTexture";
import { GridBackground } from "./map/grid";
import { buildMergedBoundary } from "./map/mergedBoundary";
import * as turf from "@turf/turf";
import "./App.css";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    // MapLayer 构造时立即启动渲染循环（TimeManager RAF），无需手动调用 start
    const layer = new MapLayer(canvas);
    let cancelled = false;
    let drill: DrillController | null = null;
    let labels: LabelController | null = null;
    let highlight: HighlightController | null = null;
    let flylines: FlylineController | null = null;
    let particles: ParticleController | null = null;
    let grid: GridBackground | null = null;

    (async () => {
      // 数据管线：加载 GeoJSON → Mercator 投影 → 计算相机/bbox → 三角剖分 → 构建 Mesh
      const raw = await loadGeoJSON("/json/china-province.json");
      if (cancelled) return;

      // projected 坐标系与 Three.js 场景坐标系一致（Mercator 平面坐标）
      const projected = projectGeoJSON(raw) as GeoJSON.FeatureCollection;
      const bboxProj = turf.bbox(projected) as [number, number, number, number];
      const kv = computeKV({ geojsonProj: projected, pitch: 10, rotation: 4 });
      const mergedBoundary = buildMergedBoundary(projected);

      layer.camera.applyStatus(kv.cameraStatus);

      // 背景网格：在地图底面之下，扩散光环动画
      // rotation=4 与相机方位角一致，消除视角偏斜
      grid = new GridBackground(layer.scene, layer.time, kv.bboxOption, {}, 4);

      const geomGroup = buildGeometry(projected, bboxProj);
      layer.buildMeshes(geomGroup, kv.bboxOption);

      // 内阴影在 buildMeshes 之后应用，需要 innerShadowMesh 已存在
      layer.applyInnerShadow(mergedBoundary, kv.bboxOption, { debug: false });

      // 省级边界线（顶面 + 底面）
      layer.addBoundary(projected, kv.bboxOption, {
        color: "#4fc3f7",
        linewidth: 1,
        opacity: 0.9,
      });

      // 流光动画：flatten 拍平 MultiPolygon → dissolve 合并为整体外轮廓 → 一个亮点沿边界转动
      // dissolve 只接受 Polygon，需先用 flatten 把 MultiPolygon 拆成独立 Polygon
      layer.addStreamer(mergedBoundary, kv.bboxOption, {
        color: "#00ffff",
        linewidth: 2,
        speed: 0.3,
        minLength: 2000,
      });

      // 渐变纹理：径向渐变，中心亮蓝 → 边缘深蓝，科技感配色
      const gradientTexture = buildGradientTexture(kv.bboxOption, {
        type: "radial",
        colors: ["#3a7db0", "#2a6496", "#1a4d7a"],
        resolution: 2000,
      });
      layer.applyTextureObject("map", gradientTexture, true);

      // 地形法线贴图：从 Mapzen Terrarium 瓦片服务加载真实地形数据
      // Terrarium 格式：RGB 编码高度 (height = (R * 256 + G + B / 256) - 32768)
      const terrainTexture = await buildTerrainTexture(kv.bboxOption, {
        type: "tile",
        tileUrl:
          "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
        normalScale: 1.0, // 法线强度
        resolution: 2048,
      });
      console.log("地形法线贴图加载完成:", terrainTexture);
      layer.applyTextureObject("normalMap", terrainTexture, false);

      // 飞线示例（北京→上海→广州→成都→北京）
      flylines = new FlylineController(layer);
      flylines.setData(
        [
          { from: [116.4, 39.9], to: [121.47, 31.23] },
          { from: [121.47, 31.23], to: [113.26, 23.13] },
          { from: [113.26, 23.13], to: [104.07, 30.67] },
          { from: [104.07, 30.67], to: [116.4, 39.9] },
        ],
        kv.bboxOption,
        { color: "#00d4ff", speed: 0.6 },
      );

      // 地图表面漂浮粒子
      particles = new ParticleController(layer);
      particles.setData(kv.bboxOption, {
        color: "#00d4ff",
        count: 150,
        sizeMin: 300,
        sizeMax: 500,
      });

      // 钻取交互：双击省份飞入城市级，右键退回
      drill = new DrillController(layer);
      labels = new LabelController(layer.scene);
      highlight = new HighlightController(layer);

      // 钻取时同步更新渐变纹理和地形法线贴图
      drill.onAfterRebuild = async (drillBboxProj) => {
        const bboxOption = { ...kv.bboxOption, bboxProj: drillBboxProj };

        const tex = buildGradientTexture(bboxOption, {
          type: "radial",
          colors: ["#3a7db0", "#2a6496", "#1a4d7a"],
          resolution: 2000,
        });
        layer.applyTextureObject("map", tex, true);

        // 同步更新地形法线贴图
        const terrainTex = await buildTerrainTexture(bboxOption, {
          type: "tile",
          tileUrl:
            "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
          normalScale: 1.0,
          resolution: 2048,
        });
        layer.applyTextureObject("normalMap", terrainTex, false);
      };

      // 层级切换时同步更新标注和高亮
      drill.onLevelChange = (projected, bboxOption, depth) => {
        labels!.update(projected, bboxOption, depth);
        highlight!.update(projected, bboxOption);
      };

      drill.init({ projected, bboxProj, kv });
    })();

    return () => {
      cancelled = true;
      drill?.dispose();
      labels?.dispose();
      highlight?.dispose();
      flylines?.dispose();
      particles?.dispose();
      grid?.dispose();
      layer.destroy();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100vw", height: "100vh", display: "block" }}
    />
  );
}
