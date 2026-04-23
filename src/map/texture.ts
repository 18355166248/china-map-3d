import * as THREE from "three";

export type TextureType = "map" | "normalMap" | "emissiveMap";

const TEXTURE_CACHE_NAME = "china-map-3d-textures-v1"; // 版本化以便未来可失效

/**
 * 从 Cache Storage/网络获取图片并返回可用于 <img src> 的 URL。
 * - 命中缓存时返回 blob:// 对象 URL，加载完成后立即 revoke，避免泄漏
 * - 跨域且无 CORS 时返回 undefined（不可读取 body），让浏览器自行走 HTTP 缓存
 */
async function getCachedObjectURL(url: string): Promise<{ url?: string; fromCache: boolean }> {
  // SSR/旧浏览器下跳过持久缓存
  if (typeof window === "undefined" || !("caches" in window)) {
    return { url: undefined, fromCache: false };
  }

  try {
    const cache = await caches.open(TEXTURE_CACHE_NAME);

    // 1) 命中缓存
    const cached = await cache.match(url);
    if (cached) {
      if (cached.type === "opaque") return { url: undefined, fromCache: false }; // 无法读取 body
      const blob = await cached.clone().blob();
      return { url: URL.createObjectURL(blob), fromCache: true };
    }

    // 2) 未命中 → 拉取并写入缓存
    const resp = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!resp.ok) return { url: undefined, fromCache: false };

    // 仅在可读响应时写入缓存（避免 opaque）
    if (resp.type !== "opaque") {
      await cache.put(url, resp.clone());
      const blob = await resp.clone().blob();
      return { url: URL.createObjectURL(blob), fromCache: false };
    }

    // opaque：无法生成对象 URL，回退由浏览器处理 HTTP 缓存
    return { url: undefined, fromCache: false };
  } catch {
    // 任意异常都回退
    return { url: undefined, fromCache: false };
  }
}

/**
 * 加载单张图片纹理（带持久化缓存优先）。
 * WHY: 首屏/切换时避免重复网络开销；可离线命中（受 CORS 限制）。
 */
export async function loadTexture(url: string): Promise<THREE.Texture> {
  const loader = new THREE.TextureLoader();
  const { url: cachedURL, fromCache } = await getCachedObjectURL(url);

  return new Promise((resolve, reject) => {
    const src = cachedURL ?? url;

    loader.load(
      src,
      (texture) => {
        // 对象 URL 用后即焚，<img> 已持有像素数据
        if (cachedURL) URL.revokeObjectURL(cachedURL);
        resolve(texture);
      },
      undefined,
      (err) => {
        // 若对象 URL 加载失败，尝试直接网络 URL 一次
        if (cachedURL && src !== url) {
          URL.revokeObjectURL(cachedURL);
          loader.load(url, resolve, undefined, reject);
          return;
        }
        reject(err);
      },
    );
  });
}
