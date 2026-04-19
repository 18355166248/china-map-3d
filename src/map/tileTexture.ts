import * as THREE from "three";
import { unproject } from "../geo/projection";

const TOKEN = import.meta.env.VITE_TIANDITU_TOKEN as string;

/** 天地图图层：img=卫星影像，vec=矢量，ter=地形 */
export type TiandituLayer = "img" | "vec" | "ter";

/**
 * 根据经度跨度选择合适的瓦片缩放级别
 * 避免瓦片数量过多（全国约 5×5=25 张，省级约 3×3=9 张）
 */
function chooseTileZoom(lonSpan: number): number {
  if (lonSpan > 40) return 5; // 全国
  if (lonSpan > 15) return 6; // 大省
  if (lonSpan > 5) return 7;  // 中省
  return 8;                    // 小省/市
}

/**
 * 经纬度 → 瓦片像素坐标（不取整，保留小数用于精确裁剪）
 * Y 轴向下，与 Canvas/屏幕坐标系一致
 */
function lonLatToPixelExact(
  lon: number,
  lat: number,
  zoom: number,
): [number, number] {
  const size = Math.pow(2, zoom) * 256;
  const x = ((lon + 180) / 360) * size;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  // Mercator Y：0.5 在赤道，向上减小（北极趋近 0），向下增大（南极趋近 1）
  const y =
    (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * size;
  return [x, y];
}

/**
 * 拉取单张天地图 WMTS 瓦片
 * 通过 Vite 代理 /tianditu → https://t0.tianditu.gov.cn 绕过 CORS
 * 同源请求无需 crossOrigin，canvas 不会被污染
 */
function fetchTile(
  layer: TiandituLayer,
  z: number,
  x: number,
  y: number,
): Promise<HTMLImageElement> {
  const url =
    `/tianditu/${layer}_w/wmts` +
    `?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
    `&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles` +
    `&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}&tk=${TOKEN}`;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * 根据 bboxProj（Mercator 坐标）拼接天地图瓦片，返回 Three.js 纹理
 *
 * UV 对齐原理：
 *   triangulate.ts 中 UV = (x_mercator - bbox_min) / bbox_size
 *   Mercator 坐标与瓦片像素坐标是线性关系，因此 canvas 像素坐标与 UV 线性对应
 *   canvas 北在上（y=0），Three.js CanvasTexture 默认 flipY=true 自动翻转
 *   翻转后 UV v=1 对应北（canvas 顶部），与 triangulate.ts 的 UV 生成一致
 */
export async function buildTileTexture(
  bboxProj: [number, number, number, number],
  layer: TiandituLayer = "img",
): Promise<THREE.Texture> {
  // Mercator 坐标转回经纬度，用于计算瓦片范围
  const [minLon, minLat] = unproject(bboxProj[0], bboxProj[1]);
  const [maxLon, maxLat] = unproject(bboxProj[2], bboxProj[3]);

  const zoom = chooseTileZoom(maxLon - minLon);

  // 精确像素坐标（Y 轴向下）
  // 西南角（minLon, minLat）→ 像素 x 最小，y 最大（南 = 下）
  // 东北角（maxLon, maxLat）→ 像素 x 最大，y 最小（北 = 上）
  const [pxLeft, pxBottom] = lonLatToPixelExact(minLon, minLat, zoom);
  const [pxRight, pxTop] = lonLatToPixelExact(maxLon, maxLat, zoom);

  // 覆盖 bbox 的瓦片索引范围
  const tileMinX = Math.floor(pxLeft / 256);
  const tileMaxX = Math.floor(pxRight / 256);
  const tileMinY = Math.floor(pxTop / 256);   // pxTop < pxBottom
  const tileMaxY = Math.floor(pxBottom / 256);

  // canvas 尺寸 = bbox 的像素尺寸
  const canvasW = Math.round(pxRight - pxLeft);
  const canvasH = Math.round(pxBottom - pxTop);

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d")!;

  // 并行拉取所有瓦片，单张失败不影响整体
  const fetches: Promise<void>[] = [];
  for (let ty = tileMinY; ty <= tileMaxY; ty++) {
    for (let tx = tileMinX; tx <= tileMaxX; tx++) {
      fetches.push(
        fetchTile(layer, zoom, tx, ty)
          .then((img) => {
            // 瓦片在 canvas 中的偏移 = 瓦片像素起点 - bbox 像素起点
            const dx = Math.round(tx * 256 - pxLeft);
            const dy = Math.round(ty * 256 - pxTop);
            ctx.drawImage(img, dx, dy);
          })
          .catch(() => {}),
      );
    }
  }

  await Promise.all(fetches);

  return new THREE.CanvasTexture(canvas);
}
