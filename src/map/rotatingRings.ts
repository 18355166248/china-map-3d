import * as THREE from "three";
import type { TimeManager } from "../core/TimeManager";

/**
 * Rotating rings background (XY plane; Z is up in this project).
 * - Positioned at projected center (center[0], center[1]).
 * - Z set slightly below the map surface (positionZ < 0).
 * - Two rings rotate in opposite directions with additive blending.
 */
export interface RotatingRingsOptions {
  size?: number; // ring diameter in world units (XY plane)
  center?: [number, number]; // projected center (x, y)
  positionZ?: number; // height along Z (negative to sit below the map)
  outerSpeed?: number; // rotation speed around Z
  innerSpeed?: number; // rotation speed around Z
  color?: number;
  outerOpacity?: number;
  innerOpacity?: number;
}

export class RotatingRings {
  private scene: THREE.Scene;
  private time: TimeManager;
  private outerRing?: THREE.Mesh;
  private innerRing?: THREE.Mesh;
  private options: Required<RotatingRingsOptions>;

  constructor(
    scene: THREE.Scene,
    time: TimeManager,
    options: RotatingRingsOptions = {},
  ) {
    this.scene = scene;
    this.time = time;
    this.options = {
      size: 1000,
      center: [0, 0],
      positionZ: -1,
      outerSpeed: 0.001,
      innerSpeed: -0.004,
      color: 0x48afff,
      outerOpacity: 0.2,
      innerOpacity: 0.4,
      ...options,
    };
    this.init();
  }

  private init(): void {
    // create rings
    this.outerRing = this.createRing({
      size: this.options.size * 1.178,
      opacity: this.options.outerOpacity,
      textureUrl: "/textures/rotationBorder1.png",
    });
    this.innerRing = this.createRing({
      size: this.options.size * 1.116,
      opacity: this.options.innerOpacity,
      textureUrl: "/textures/rotationBorder2.png",
    });

    // place at center on XY plane; Z slightly below the map
    const [cx, cy] = this.options.center;
    this.outerRing.position.set(cx, cy, this.options.positionZ);
    this.innerRing.position.set(cx, cy, this.options.positionZ);

    // add to scene
    this.scene.add(this.outerRing);
    this.scene.add(this.innerRing);

    // animation
    this.time.on("tick", () => {
      if (this.outerRing) this.outerRing.rotation.z += this.options.outerSpeed;
      if (this.innerRing) this.innerRing.rotation.z += this.options.innerSpeed;
    });
  }

  private createRing(config: {
    size: number;
    opacity: number;
    textureUrl: string;
  }): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(config.size, config.size);
    const texture = new THREE.TextureLoader().load(config.textureUrl);
    const material = new THREE.MeshBasicMaterial({
      alphaMap: texture,
      color: this.options.color,
      transparent: true,
      opacity: config.opacity,
      side: THREE.DoubleSide,
      depthWrite: false, // don't write depth to avoid z-fighting with map
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geometry, material);
    // keep default orientation (normal +Z) so the plane lies in XY
    mesh.renderOrder = -1; // render early as a background effect
    return mesh;
    }

  /** Update ring properties (color/opacity/position/size). */
  update(options: Partial<RotatingRingsOptions>): void {
    Object.assign(this.options, options);
    if (!this.outerRing || !this.innerRing) return;

    // color
    if (options.color !== undefined) {
      (this.outerRing.material as THREE.MeshBasicMaterial).color.setHex(
        options.color,
      );
      (this.innerRing.material as THREE.MeshBasicMaterial).color.setHex(
        options.color,
      );
    }
    // opacity
    if (options.outerOpacity !== undefined) {
      (this.outerRing.material as THREE.MeshBasicMaterial).opacity =
        options.outerOpacity;
    }
    if (options.innerOpacity !== undefined) {
      (this.innerRing.material as THREE.MeshBasicMaterial).opacity =
        options.innerOpacity;
    }
    // position
    if (options.center !== undefined) {
      const [cx, cy] = options.center;
      this.outerRing.position.x = cx;
      this.outerRing.position.y = cy;
      this.innerRing.position.x = cx;
      this.innerRing.position.y = cy;
    }
    if (options.positionZ !== undefined) {
      this.outerRing.position.z = options.positionZ;
      this.innerRing.position.z = options.positionZ;
    }
    // size: scale geometry to match requested size
    if (options.size !== undefined) {
      const ow = (this.outerRing.geometry as THREE.PlaneGeometry).parameters
        .width;
      const oh = (this.outerRing.geometry as THREE.PlaneGeometry).parameters
        .height;
      const iw = (this.innerRing.geometry as THREE.PlaneGeometry).parameters
        .width;
      const ih = (this.innerRing.geometry as THREE.PlaneGeometry).parameters
        .height;
      this.outerRing.scale.set(
        (options.size * 1.178) / ow,
        (options.size * 1.178) / oh,
        1,
      );
      this.innerRing.scale.set(
        (options.size * 1.116) / iw,
        (options.size * 1.116) / ih,
        1,
      );
    }
  }

  setVisible(visible: boolean): void {
    if (this.outerRing) this.outerRing.visible = visible;
    if (this.innerRing) this.innerRing.visible = visible;
  }

  dispose(): void {
    if (this.outerRing) {
      this.outerRing.geometry.dispose();
      (this.outerRing.material as THREE.Material).dispose();
      this.scene.remove(this.outerRing);
    }
    if (this.innerRing) {
      this.innerRing.geometry.dispose();
      (this.innerRing.material as THREE.Material).dispose();
      this.scene.remove(this.innerRing);
    }
  }
}

