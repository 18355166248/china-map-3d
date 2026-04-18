import * as THREE from 'three';
import type SizeManager from './SizeManager';
import type CameraManager from './CameraManager';

interface RendererOptions {
  canvas: HTMLCanvasElement;
  sizes: SizeManager;
  scene: THREE.Scene;
  camera: CameraManager;
}

class Renderer {
  instance: THREE.WebGLRenderer;

  private sizes: SizeManager;
  private scene: THREE.Scene;
  private camera: CameraManager;

  constructor({ canvas, sizes, scene, camera }: RendererOptions) {
    this.sizes = sizes;
    this.scene = scene;
    this.camera = camera;

    this.instance = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.instance.setSize(sizes.width, sizes.height);
    this.instance.setPixelRatio(sizes.pixelRatio);
    this.instance.shadowMap.enabled = true;
  }

  resize(): void {
    this.instance.setSize(this.sizes.width, this.sizes.height);
    this.instance.setPixelRatio(this.sizes.pixelRatio);
  }

  update(): void {
    this.instance.render(this.scene, this.camera.instance);
  }

  destroy(): void {
    this.instance.dispose();
  }
}

export default Renderer;
