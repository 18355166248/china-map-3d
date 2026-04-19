import * as THREE from 'three';

export type TextureType = 'map' | 'normalMap' | 'emissiveMap';

/**
 * 加载单张图片纹理
 * flipY 默认 true（Three.js 约定），如贴图上下颠倒可改为 false
 */
export function loadTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, resolve, undefined, reject);
  });
}
