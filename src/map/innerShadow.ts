import * as THREE from "three";
import type { BboxOption } from "../geo/camera";

export interface InnerShadowStyle {
  shadowColor?: string; // 阴影颜色
  shadowBlurRatio?: number; // 阴影模糊半径占 canvas 短边的比例（0~1，默认 0.025 即 2.5%）
  resolution?: number; // canvas 长边分辨率，越大越清晰但越慢
  minShadowBlurPx?: number; // 单个 feature 的最小模糊半径
  maxShadowBlurPx?: number; // 单个 feature 的最大模糊半径
  debug?: boolean; // 开启后自动下载调试图片
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
    shadowColor = "rgba(0,212,255,0.8)", // 青色半透明，与科技蓝主题协调
    shadowBlurRatio = 0.05, // 默认 5% 短边，增强阴影宽度（参考项目用 10%）
    resolution = 2000,
    minShadowBlurPx = 1.5,
    maxShadowBlurPx,
    debug = false,
  } = style;

  const [x0, y0, x1, y1] = bboxOption.bboxProj;
  const bw = x1 - x0;
  const bh = y1 - y0;
  const aspect = bw / bh;

  // 长边为 resolution，短边按宽高比缩放，保持投影坐标比例
  const canvasW = aspect >= 1 ? resolution : Math.round(resolution * aspect);
  const canvasH = aspect >= 1 ? Math.round(resolution / aspect) : resolution;

  // 全图 blur 作为上限；单个 feature 会按自身 bbox 再缩放一次
  const globalShadowBlur = Math.min(canvasW, canvasH) * shadowBlurRatio;
  const resolvedMaxShadowBlurPx = maxShadowBlurPx ?? globalShadowBlur;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d")!;

  // 投影坐标 → canvas 像素坐标（Y 轴翻转：投影 Y 向上，canvas Y 向下）
  const toX = (px: number) => ((px - x0) / bw) * canvasW;
  const toY = (py: number) => (1 - (py - y0) / bh) * canvasH;

  function getFeaturePolygons(feature: GeoJSON.Feature): number[][][][] {
    const geom = feature.geometry;
    return geom.type === "Polygon"
      ? [(geom as GeoJSON.Polygon).coordinates]
      : geom.type === "MultiPolygon"
        ? (geom as GeoJSON.MultiPolygon).coordinates
        : [];
  }

  // 将单个 Feature 的 Polygon/MultiPolygon 轮廓添加到当前路径
  function addFeaturePaths(feature: GeoJSON.Feature) {
    const polys = getFeaturePolygons(feature);
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

  function getFeatureShadowBlur(feature: GeoJSON.Feature) {
    let minFx = Infinity;
    let minFy = Infinity;
    let maxFx = -Infinity;
    let maxFy = -Infinity;

    const polys = getFeaturePolygons(feature);
    for (const poly of polys) {
      for (const ring of poly) {
        for (const [x, y] of ring) {
          const cx = toX(x);
          const cy = toY(y);
          if (cx < minFx) minFx = cx;
          if (cx > maxFx) maxFx = cx;
          if (cy < minFy) minFy = cy;
          if (cy > maxFy) maxFy = cy;
        }
      }
    }

    const featureShortEdge = Math.max(
      1,
      Math.min(maxFx - minFx, maxFy - minFy),
    );

    return Math.min(
      resolvedMaxShadowBlurPx,
      Math.max(minShadowBlurPx, featureShortEdge * shadowBlurRatio),
    );
  }

  // 按 feature 单独绘制并裁剪，避免全国视图下的小区域沿用大图 blur
  for (const feature of geojson.features) {
    const shadowBlur = getFeatureShadowBlur(feature);
    const pad = shadowBlur * 10;

    ctx.save();

    // 先裁剪到当前 feature 内部，只保留自身的阴影，避免相邻 feature 相互污染
    ctx.beginPath();
    addFeaturePaths(feature);
    ctx.clip("evenodd");

    // 再绘制外部区域，让阴影从边界向内渗透
    ctx.beginPath();
    ctx.rect(-pad, -pad, canvasW + pad * 2, canvasH + pad * 2);
    addFeaturePaths(feature);
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = shadowBlur;
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.fill("evenodd");

    ctx.restore();
  }

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
