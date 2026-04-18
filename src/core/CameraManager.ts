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

  // 切换相机类型时重建 OrbitControls，并将旧 controls dispose 防止内存泄漏
  private setCamera(useOrthographic = this.isOrthographic): void {
    const { width, height } = this.sizes;
    const aspect = width / height;

    if (useOrthographic) {
      // halfViewSize 控制正交相机可视范围，与透视相机视野尽量对齐
      const halfViewSize = 120;
      this.instance = new THREE.OrthographicCamera(
        -halfViewSize * aspect, halfViewSize * aspect,
        halfViewSize, -halfViewSize,
        1, 100000
      );
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

  /**
   * 接收 computeKV 输出的相机状态并应用
   * near/far 必须在 updateProjectionMatrix 前设置，否则不生效
   */
  applyStatus(status: CameraStatus): void {
    this.instance.near = status.near;
    this.instance.far = status.far;
    this.instance.position.set(...status.position);
    this.instance.up.set(...status.up);
    this.instance.updateProjectionMatrix();
    this.controls.target.set(...status.target);
    this.controls.update();
  }

  // O 键切正交，P 键切透视，切换后保持 position 不变（仅改投影方式）
  private bindKeyboard(): void {
    document.addEventListener('keydown', (e) => {
      const currentPosition = this.instance.position.clone();
      if (e.key === 'o' || e.key === 'O') {
        this.setCamera(true);
        this.instance.position.copy(currentPosition);
        this.instance.updateProjectionMatrix();
      } else if (e.key === 'p' || e.key === 'P') {
        this.setCamera(false);
        this.instance.position.copy(currentPosition);
        this.instance.updateProjectionMatrix();
      }
    });
  }

  resize(): void {
    const { width, height } = this.sizes;
    const aspect = width / height;
    if (this.instance instanceof THREE.OrthographicCamera) {
      const halfViewSize = 120;
      this.instance.left = -halfViewSize * aspect;
      this.instance.right = halfViewSize * aspect;
      this.instance.top = halfViewSize;
      this.instance.bottom = -halfViewSize;
    } else {
      this.instance.aspect = aspect;
    }
    this.instance.updateProjectionMatrix();
  }

  update(): void {
    // enableDamping 开启时必须每帧调用，否则阻尼效果不生效
    this.controls.update();
  }

  destroy(): void {
    this.controls.dispose();
  }
}

export default CameraManager;
