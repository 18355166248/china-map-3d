import * as THREE from "three";
import EventEmitter from "./EventEmitter";
import TimeManager from "./TimeManager";
import SizeManager from "./SizeManager";
import CameraManager from "./CameraManager";
import Renderer from "./Renderer";

/**
 * 场景基类，组合各管理器并建立事件驱动的渲染循环
 * 业务层（MapLayer 等）继承此类，专注于 Mesh 管理
 *
 * 渲染循环：
 *   TimeManager.tick → CameraManager.update（阻尼）→ Renderer.update（渲染）
 * 窗口变化：
 *   SizeManager.resize → CameraManager.resize → Renderer.resize
 */
class MapApplication extends EventEmitter {
  scene: THREE.Scene;
  camera: CameraManager;
  renderer: Renderer;
  sizes: SizeManager;
  time: TimeManager;
  canvas: HTMLCanvasElement; // 暴露给 DrillController 等需要绑定 DOM 事件的模块

  constructor(canvas: HTMLCanvasElement) {
    super();
    this.canvas = canvas;

    this.scene = new THREE.Scene();
    this.sizes = new SizeManager(canvas);
    this.time = new TimeManager();
    this.camera = new CameraManager({
      sizes: this.sizes,
      scene: this.scene,
      canvas,
    });
    this.renderer = new Renderer({
      canvas,
      sizes: this.sizes,
      scene: this.scene,
      camera: this.camera,
    });

    this.sizes.on("resize", () => {
      this.camera.resize();
      this.renderer.resize();
    });

    this.time.on("tick", () => {
      this.camera.update();
      this.renderer.update();
    });
  }

  destroy(): void {
    // 遍历场景销毁所有 Mesh 资源，防止 GPU 显存泄漏
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
    this.time.destroy();
    this.sizes.destroy();
    this.camera.destroy();
    this.renderer.destroy();
  }
}

export default MapApplication;
