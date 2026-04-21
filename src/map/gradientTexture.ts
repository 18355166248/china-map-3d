import * as THREE from "three";
import type { BboxOption } from "../geo/camera";

export interface GradientTextureStyle {
  type?: "radial" | "linear" | "solid"; // 渐变类型
  colors?: string[]; // 渐变色数组，至少 2 个
  resolution?: number; // Canvas 长边分辨率，默认 2000
  angle?: number; // linear 模式的渐变角度（度），默认 0（垂直）
}

/**
 * 用 Canvas 2D 生成渐变纹理，替代天地图卫星瓦片
 *
 * 支持三种渐变模式：
 *  - radial：径向渐变（中心亮 → 边缘暗），适合突出地图中心区域
 *  - linear：线性渐变（支持角度旋转），适合方向性光照效果
 *  - solid：纯色填充，适合极简风格
 *
 * 默认科技蓝配色：#3a7db0（亮蓝）→ #2a6496（中蓝）→ #1a4d7a（深蓝）
 *
 * UV 映射：Canvas 像素直接映射到 Three.js UV 坐标 [0,1]
 */
export function buildGradientTexture(
  bboxOption: BboxOption,
  style: GradientTextureStyle = {},
): THREE.CanvasTexture {
  const {
    type = "radial",
    colors = ["#3a7db0", "#2a6496", "#1a4d7a"], // 默认科技蓝三色渐变
    resolution = 2000,
    angle = 0,
  } = style;

  // 计算 Canvas 尺寸，保持投影坐标宽高比
  const [x0, y0, x1, y1] = bboxOption.bboxProj;
  const bw = x1 - x0;
  const bh = y1 - y0;
  const aspect = bw / bh;

  const canvasW = aspect >= 1 ? resolution : Math.round(resolution * aspect);
  const canvasH = aspect >= 1 ? Math.round(resolution / aspect) : resolution;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d")!;

  let gradient: CanvasGradient;

  switch (type) {
    case "radial": {
      // 径向渐变：中心点 (canvasW/2, canvasH/2)，半径覆盖整个画布
      const centerX = canvasW / 2;
      const centerY = canvasH / 2;
      const radius = Math.max(canvasW, canvasH) / 2;
      gradient = ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        radius,
      );
      break;
    }

    case "linear": {
      // 线性渐变：支持角度旋转
      // angle=0 表示从上到下，angle=90 表示从左到右
      const angleRad = (angle * Math.PI) / 180;
      const centerX = canvasW / 2;
      const centerY = canvasH / 2;
      const length = Math.max(canvasW, canvasH);

      // 计算渐变起点和终点
      const x0 = centerX - (Math.sin(angleRad) * length) / 2;
      const y0 = centerY - (Math.cos(angleRad) * length) / 2;
      const x1 = centerX + (Math.sin(angleRad) * length) / 2;
      const y1 = centerY + (Math.cos(angleRad) * length) / 2;

      gradient = ctx.createLinearGradient(x0, y0, x1, y1);
      break;
    }

    case "solid": {
      // 纯色填充：使用第一个颜色
      ctx.fillStyle = colors[0];
      ctx.fillRect(0, 0, canvasW, canvasH);

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      return texture;
    }
  }

  // 添加渐变色标（均匀分布）
  const colorCount = colors.length;
  for (let i = 0; i < colorCount; i++) {
    const stop = i / (colorCount - 1); // 0, 0.5, 1 for 3 colors
    gradient.addColorStop(stop, colors[i]);
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // 创建 Three.js 纹理
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; // 边缘夹紧，避免重复
  texture.minFilter = THREE.LinearFilter; // 线性过滤，平滑渐变
  texture.needsUpdate = true;

  return texture;
}
