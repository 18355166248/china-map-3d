import * as THREE from 'three';
import EventEmitter from './EventEmitter';
import TimeManager from './TimeManager';
import SizeManager from './SizeManager';
import CameraManager from './CameraManager';
import Renderer from './Renderer';

class MapApplication extends EventEmitter {
  scene: THREE.Scene;
  camera: CameraManager;
  renderer: Renderer;
  sizes: SizeManager;
  time: TimeManager;

  constructor(canvas: HTMLCanvasElement) {
    super();

    this.scene = new THREE.Scene();
    this.sizes = new SizeManager(canvas);
    this.time = new TimeManager();
    this.camera = new CameraManager({ sizes: this.sizes, scene: this.scene, canvas });
    this.renderer = new Renderer({ canvas, sizes: this.sizes, scene: this.scene, camera: this.camera });

    this.sizes.on('resize', () => {
      this.camera.resize();
      this.renderer.resize();
    });

    this.time.on('tick', () => {
      this.camera.update();
      this.renderer.update();
    });
  }

  destroy(): void {
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
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
