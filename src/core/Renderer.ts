import * as THREE from "three";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type SizeManager from "./SizeManager";
import type CameraManager from "./CameraManager";

interface RendererOptions {
  canvas: HTMLCanvasElement;
  sizes: SizeManager;
  scene: THREE.Scene;
  camera: CameraManager;
}

class Renderer {
  instance: THREE.WebGLRenderer;
  css2d: CSS2DRenderer; // 用于渲染 CSS2DObject 标注

  private sizes: SizeManager;
  private scene: THREE.Scene;
  private camera: CameraManager;

  constructor({ canvas, sizes, scene, camera }: RendererOptions) {
    this.sizes = sizes;
    this.scene = scene;
    this.camera = camera;

    this.instance = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    // updateStyle=false：不让 Three.js 覆盖 canvas 的 CSS 尺寸（100vw/100vh），
    // 否则宽屏下 canvas style 被固定为初始像素值，导致地图偏移和线条渲染异常
    this.instance.setSize(sizes.width, sizes.height, false);
    this.instance.setPixelRatio(sizes.pixelRatio);
    this.instance.shadowMap.enabled = true;

    // CSS2DRenderer 叠加在 canvas 上方，pointer-events:none 不阻断鼠标事件
    this.css2d = new CSS2DRenderer();
    this.css2d.setSize(sizes.width, sizes.height);
    this.css2d.domElement.style.position = "absolute";
    this.css2d.domElement.style.top = "0";
    this.css2d.domElement.style.left = "0";
    this.css2d.domElement.style.pointerEvents = "none";
    canvas.parentElement?.appendChild(this.css2d.domElement);
  }

  resize(): void {
    this.instance.setSize(this.sizes.width, this.sizes.height, false);
    this.instance.setPixelRatio(this.sizes.pixelRatio);
    this.css2d.setSize(this.sizes.width, this.sizes.height);
  }

  // 每帧由 TimeManager tick 事件驱动调用
  update(): void {
    this.instance.render(this.scene, this.camera.instance);
    this.css2d.render(this.scene, this.camera.instance);
  }

  destroy(): void {
    this.instance.dispose();
    this.css2d.domElement.remove();
  }
}

export default Renderer;
