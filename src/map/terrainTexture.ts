import * as THREE from "three";
import type { BboxOption } from "../geo/camera";

export interface TerrainTextureStyle {
  type?: "tile" | "procedural"; // 瓦片服务或程序生成
  tileUrl?: string; // 瓦片 URL 模板，如 "https://example.com/{z}/{x}/{y}.png"
  normalScale?: number; // 法线强度，默认 0.5
  resolution?: number; // procedural 模式的 Canvas 分辨率
}

/**
 * 生成地形法线贴图（normalMap），用于模拟山峰凹凸效果
 *
 * 两种模式：
 *  1. tile：从瓦片服务加载真实地形数据（推荐，效果最好）
 *  2. procedural：程序生成噪声纹理（无需网络，适合演示）
 *
 * normalMap 原理：
 *  - RGB 通道编码法线方向 (R=X, G=Y, B=Z)
 *  - 不改变几何体，只改变光照计算
 *  - 配合 MeshStandardMaterial.normalScale 控制强度
 */
export async function buildTerrainTexture(
  bboxOption: BboxOption,
  style: TerrainTextureStyle = {},
): Promise<THREE.Texture> {
  const {
    type = "procedural",
    tileUrl,
    normalScale = 0.5,
    resolution = 1024,
  } = style;

  if (type === "tile" && tileUrl) {
    // 模式 1：从瓦片服务加载地形法线贴图
    return await loadTerrainTiles(bboxOption, tileUrl);
  } else {
    // 模式 2：程序生成噪声法线贴图
    return generateProceduralNormalMap(bboxOption, resolution, normalScale);
  }
}

/**
 * 从瓦片服务加载地形数据，解码高度并计算法线贴图
 *
 * 支持 Terrarium 格式：height = R*256 + G + B/256 - 32768
 */
async function loadTerrainTiles(
  bboxOption: BboxOption,
  tileUrl: string,
): Promise<THREE.Texture> {
  const [minLng, minLat, maxLng, maxLat] = bboxOption.bbox;

  const lngSpan = maxLng - minLng;
  let zoom = 5;
  if (lngSpan < 10) zoom = 8;
  else if (lngSpan < 20) zoom = 7;
  else if (lngSpan < 40) zoom = 6;

  const minTile = lngLatToTile(minLng, maxLat, zoom);
  const maxTile = lngLatToTile(maxLng, minLat, zoom);

  const tiles: Array<{
    x: number;
    y: number;
    url: string;
    img?: HTMLImageElement;
  }> = [];

  for (let x = minTile.x; x <= maxTile.x; x++) {
    for (let y = minTile.y; y <= maxTile.y; y++) {
      const url = tileUrl
        .replace("{z}", String(zoom))
        .replace("{x}", String(x))
        .replace("{y}", String(y));
      tiles.push({ x, y, url });
    }
  }

  await Promise.all(
    tiles.map(
      (tile) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            tile.img = img;
            resolve();
          };
          img.onerror = () => {
            console.warn(`瓦片加载失败: ${tile.url}`);
            resolve();
          };
          img.src = tile.url;
        }),
    ),
  );

  const tileSize = 256;
  const cols = maxTile.x - minTile.x + 1;
  const rows = maxTile.y - minTile.y + 1;
  const totalW = cols * tileSize;
  const totalH = rows * tileSize;

  // Step 1: 将所有瓦片拼接到一张 canvas，读取 RGB 像素
  const rawCanvas = document.createElement("canvas");
  rawCanvas.width = totalW;
  rawCanvas.height = totalH;
  const rawCtx = rawCanvas.getContext("2d")!;
  for (const tile of tiles) {
    if (!tile.img) continue;
    rawCtx.drawImage(
      tile.img,
      (tile.x - minTile.x) * tileSize,
      (tile.y - minTile.y) * tileSize,
      tileSize,
      tileSize,
    );
  }
  const rawPixels = rawCtx.getImageData(0, 0, totalW, totalH).data;

  // Step 2: 解码 Terrarium 高度 height = R*256 + G + B/256 - 32768
  const heightMap = new Float32Array(totalW * totalH);
  for (let i = 0; i < totalW * totalH; i++) {
    const r = rawPixels[i * 4 + 0];
    const g = rawPixels[i * 4 + 1];
    const b = rawPixels[i * 4 + 2];
    heightMap[i] = r * 256 + g + b / 256 - 32768;
  }

  // Step 3: 归一化高度到 [0,1]
  let minH = Infinity,
    maxH = -Infinity;
  for (let i = 0; i < heightMap.length; i++) {
    if (heightMap[i] < minH) minH = heightMap[i];
    if (heightMap[i] > maxH) maxH = heightMap[i];
  }
  const rangeH = maxH - minH || 1;
  for (let i = 0; i < heightMap.length; i++) {
    heightMap[i] = (heightMap[i] - minH) / rangeH;
  }

  // Step 4: Sobel 算子计算法线并编码为 RGB
  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = totalW;
  normalCanvas.height = totalH;
  const normalCtx = normalCanvas.getContext("2d")!;
  const normalData = normalCtx.createImageData(totalW, totalH);
  const nd = normalData.data;

  const strength = 4.0; // 地形凹凸强度

  for (let y = 0; y < totalH; y++) {
    for (let x = 0; x < totalW; x++) {
      const hL = getHeight(heightMap, x - 1, y, totalW, totalH);
      const hR = getHeight(heightMap, x + 1, y, totalW, totalH);
      const hT = getHeight(heightMap, x, y - 1, totalW, totalH);
      const hB = getHeight(heightMap, x, y + 1, totalW, totalH);

      const dx = (hR - hL) * strength;
      const dy = (hB - hT) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);

      const idx = (y * totalW + x) * 4;
      nd[idx + 0] = ((dx / len + 1) * 0.5 * 255) | 0; // R = X
      nd[idx + 1] = ((dy / len + 1) * 0.5 * 255) | 0; // G = Y
      nd[idx + 2] = ((1 / len + 1) * 0.5 * 255) | 0; // B = Z
      nd[idx + 3] = 255;
    }
  }

  normalCtx.putImageData(normalData, 0, 0);

  const texture = new THREE.CanvasTexture(normalCanvas);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return texture;
}

/**
 * 程序生成噪声法线贴图（Perlin Noise）
 * 适合演示和无网络环境
 */
function generateProceduralNormalMap(
  bboxOption: BboxOption,
  resolution: number,
  normalScale: number,
): THREE.Texture {
  const [x0, y0, x1, y1] = bboxOption.bboxProj;
  const aspect = (x1 - x0) / (y1 - y0);

  const canvasW = aspect >= 1 ? resolution : Math.round(resolution * aspect);
  const canvasH = aspect >= 1 ? Math.round(resolution / aspect) : resolution;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d")!;

  const imageData = ctx.createImageData(canvasW, canvasH);
  const data = imageData.data;

  // 生成 Perlin Noise 高度图
  const heightMap = generatePerlinNoise(canvasW, canvasH, 6, 0.5, 8.0); // 增加频率到 8.0

  // 计算法线向量并编码为 RGB
  for (let y = 0; y < canvasH; y++) {
    for (let x = 0; x < canvasW; x++) {
      const idx = (y * canvasW + x) * 4;

      // Sobel 算子计算梯度
      const hL = getHeight(heightMap, x - 1, y, canvasW, canvasH);
      const hR = getHeight(heightMap, x + 1, y, canvasW, canvasH);
      const hT = getHeight(heightMap, x, y - 1, canvasW, canvasH);
      const hB = getHeight(heightMap, x, y + 1, canvasW, canvasH);

      const dx = (hR - hL) * normalScale;
      const dy = (hB - hT) * normalScale;

      // 法线向量 (dx, dy, 1) 归一化
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const nx = dx / len;
      const ny = dy / len;
      const nz = 1 / len;

      // 编码为 RGB：[-1,1] → [0,255]
      data[idx + 0] = ((nx + 1) * 0.5 * 255) | 0; // R = X
      data[idx + 1] = ((ny + 1) * 0.5 * 255) | 0; // G = Y
      data[idx + 2] = ((nz + 1) * 0.5 * 255) | 0; // B = Z
      data[idx + 3] = 255; // A
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return texture;
}

/**
 * 生成 Perlin Noise 高度图
 * @param width Canvas 宽度
 * @param height Canvas 高度
 * @param octaves 噪声层数（越多越细腻）
 * @param persistence 振幅衰减系数
 * @param baseFrequency 基础频率（越大变化越快）
 */
function generatePerlinNoise(
  width: number,
  height: number,
  octaves: number,
  persistence: number,
  baseFrequency: number = 1.0,
): Float32Array {
  const heightMap = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = 0;
      let amplitude = 1;
      let frequency = baseFrequency;
      let maxValue = 0;

      for (let i = 0; i < octaves; i++) {
        const sampleX = (x / width) * frequency;
        const sampleY = (y / height) * frequency;
        const noise = simpleNoise(sampleX, sampleY);
        value += noise * amplitude;
        maxValue += amplitude;
        amplitude *= persistence;
        frequency *= 2;
      }

      heightMap[y * width + x] = value / maxValue;
    }
  }

  return heightMap;
}

/**
 * 简化的 2D Perlin Noise（基于 Hash）
 */
function simpleNoise(x: number, y: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);

  const u = fade(xf);
  const v = fade(yf);

  const a = hash(X) + Y;
  const b = hash(X + 1) + Y;

  return lerp(
    v,
    lerp(u, grad(hash(a), xf, yf), grad(hash(b), xf - 1, yf)),
    lerp(u, grad(hash(a + 1), xf, yf - 1), grad(hash(b + 1), xf - 1, yf - 1)),
  );
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(t: number, a: number, b: number): number {
  return a + t * (b - a);
}

function grad(hash: number, x: number, y: number): number {
  const h = hash & 3;
  const u = h < 2 ? x : y;
  const v = h < 2 ? y : x;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function hash(n: number): number {
  n = (n << 13) ^ n;
  return (n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff;
}

function getHeight(
  heightMap: Float32Array,
  x: number,
  y: number,
  width: number,
  height: number,
): number {
  x = Math.max(0, Math.min(width - 1, x));
  y = Math.max(0, Math.min(height - 1, y));
  return heightMap[y * width + x];
}

/**
 * 经纬度转瓦片坐标
 */
function lngLatToTile(
  lng: number,
  lat: number,
  zoom: number,
): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x, y };
}
