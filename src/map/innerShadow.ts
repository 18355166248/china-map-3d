import * as THREE from "three";
import type { BboxOption } from "../geo/camera";

export interface InnerShadowStyle {
  shadowColor?: string;     // 阴影颜色
  shadowBlurRatio?: number; // 阴影模糊半径占 canvas 短边的比例（0~1，默认 0.025 即 2.5%）
  resolution?: number;      // canvas 长边分辨率，越大越清晰但越慢
  debug?: boolean;          // 开启后自动下载调试图片
}

/**
 * 用 Canvas 2D 生成内阴影纹理，贴到顶面 Mesh 上产生边缘暗角效果
 *
 * 实现原理（两步合成）：
 *  Step 1 — 绘制"反转形状"（大矩形 + 多边形孔洞，evenodd 填充）
 *           填充区域在多边形外部，其 shadowBlur 阴影向内渗入多边形边缘
 *  Step 2 — destination-in 与多边形形状合成，清除多边形外部的填充
 *           只保留内部的阴影像素；多边形中心无任何绘制，保持完全透明
 *
 * UV 映射：投影坐标线性映射到 canvas 像素
 *   canvasX = (projX - x0) / bw * canvasW
 *   canvasY = (1 - (projY - y0) / bh) * canvasH  ← Y 轴翻转对齐 Three.js UV
 */
export function buildInnerShadowTexture(
  geojson: GeoJSON.FeatureCollection,
  bboxOption: BboxOption,
  style: InnerShadowStyle = {},
): THREE.Texture {
  const {
    shadowColor = "rgba(255,255,255,1)",
    shadowBlurRatio = 0.025, // 默认 2.5% 短边
    resolution = 2000,
    debug = false,
  } = style;

  const [x0, y0, x1, y1] = bboxOption.bboxProj;
  const bw = x1 - x0;
  const bh = y1 - y0;
  const aspect = bw / bh;

  // 长边为 resolution，短边按宽高比缩放，保持投影坐标比例
  const canvasW = aspect >= 1 ? resolution : Math.round(resolution * aspect);
  const canvasH = aspect >= 1 ? Math.round(resolution / aspect) : resolution;

  // 根据 canvas 短边动态计算 shadowBlur，确保小图和大图的阴影宽度等比
  const shadowBlur = Math.min(canvasW, canvasH) * shadowBlurRatio;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d")!;

  // 投影坐标 → canvas 像素坐标（Y 轴翻转：投影 Y 向上，canvas Y 向下）
  const toX = (px: number) => ((px - x0) / bw) * canvasW;
  const toY = (py: number) => (1 - (py - y0) / bh) * canvasH;

  // 将所有 Feature 的 Polygon/MultiPolygon 轮廓添加到当前路径
  function addAllPaths() {
    for (const feature of geojson.features) {
      const geom = feature.geometry;
      const polys: number[][][][] =
        geom.type === "Polygon"
          ? [(geom as GeoJSON.Polygon).coordinates]
          : geom.type === "MultiPolygon"
            ? (geom as GeoJSON.MultiPolygon).coordinates
            : [];
      for (const poly of polys) {
        for (const ring of poly) {
          ring.forEach(([x, y], i) => {
            if (i === 0) ctx.moveTo(toX(x), toY(y));
            else ctx.lineTo(toX(x), toY(y));
          });
          ctx.closePath();
        }
      }
    }
  }

  // Step 1: 绘制反转形状，让阴影从多边形边界向内渗
  ctx.save();
  // pad 足够大，确保大矩形外边缘的阴影无法到达多边形区域，避免全局底色污染
  const pad = shadowBlur * 10;
  ctx.beginPath();
  ctx.rect(-pad, -pad, canvasW + pad * 2, canvasH + pad * 2); // 外部大矩形
  addAllPaths();                   // 多边形路径作为 evenodd 孔洞
  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = shadowBlur;
  ctx.fillStyle = "rgba(0,0,0,1)"; // 必须不透明，否则阴影强度不足
  ctx.fill("evenodd");             // 多边形外部被填充，阴影向内渗
  ctx.restore();                   // restore 同时重置 shadowBlur/shadowColor

  // Step 2: destination-in 裁剪，只保留多边形内部的阴影像素
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  addAllPaths();
  ctx.fillStyle = "rgba(255,255,255,1)"; // alpha=1 表示"保留此处"
  ctx.fill("evenodd");
  ctx.restore();

  if (debug) {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "inner-shadow-debug.png";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  const texture = new THREE.Texture(canvas);
  texture.needsUpdate = true;
  return texture;
}
