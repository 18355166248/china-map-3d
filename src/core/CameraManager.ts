import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type SizeManager from './SizeManager';
import type { CameraStatus } from '../geo/camera';

export type CameraInstance = THREE.PerspectiveCamera | THREE.OrthographicCamera;

interface CameraManagerOptions {
  sizes: SizeManager;
  scene: THREE.Scene;
  canvas: HTMLCanvasElement;
  isOrthographic?: boolean;
}

class CameraManager {
  instance!: CameraInstance;
  controls!: OrbitControls;

  private sizes: SizeManager;
  private scene: THREE.Scene;
  private canvas: HTMLCanvasElement;
  private isOrthographic: boolean;

  constructor({ sizes, scene, canvas, isOrthographic = false }: CameraManagerOptions) {
    this.sizes = sizes;
    this.scene = scene;
    this.canvas = canvas;
    this.isOrthographic = isOrthographic;
    this.setCamera();
    this.bindKeyboard();
  }

  private setCamera(useOrthographic = this.isOrthographic): void {
    const { width, height } = this.sizes;
    const aspect = width / height;

    if (useOrthographic) {
      const s = 120;
      this.instance = new THREE.OrthographicCamera(-s * aspect, s * aspect, s, -s, 1, 100000);
    } else {
      this.instance = new THREE.PerspectiveCamera(45, aspect, 1, 100000);
    }

    this.isOrthographic = useOrthographic;
    this.instance.position.set(0, 0, 100);
    this.scene.add(this.instance);

    if (this.controls) this.controls.dispose();
    this.controls = new OrbitControls(this.instance, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
  }

  applyStatus(status: CameraStatus): void {
    this.instance.near = status.near;
    this.instance.far = status.far;
    this.instance.position.set(...status.position);
    this.instance.up.set(...status.up);
    this.instance.updateProjectionMatrix();
    this.controls.target.set(...status.target);
    this.controls.update();
  }

  private bindKeyboard(): void {
    document.addEventListener('keydown', (e) => {
      const pos = this.instance.position.clone();
      if (e.key === 'o' || e.key === 'O') {
        this.setCamera(true);
        this.instance.position.copy(pos);
        this.instance.updateProjectionMatrix();
      } else if (e.key === 'p' || e.key === 'P') {
        this.setCamera(false);
        this.instance.position.copy(pos);
        this.instance.updateProjectionMatrix();
      }
    });
  }

  resize(): void {
    const { width, height } = this.sizes;
    const aspect = width / height;
    if (this.instance instanceof THREE.OrthographicCamera) {
      const s = 120;
      this.instance.left = -s * aspect;
      this.instance.right = s * aspect;
      this.instance.top = s;
      this.instance.bottom = -s;
    } else {
      this.instance.aspect = aspect;
    }
    this.instance.updateProjectionMatrix();
  }

  update(): void {
    this.controls.update();
  }

  destroy(): void {
    this.controls.dispose();
  }
}

export default CameraManager;
