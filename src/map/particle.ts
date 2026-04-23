import * as THREE from "three";
import type { BboxOption } from "../geo/camera";
import type { MapLayer } from "./MapLayer";

export interface ParticleStyle {
  color?: string;
  count?: number; // 粒子数量
  maxRiseFactor?: number; // 最大上升高度 = baseHeight × factor
  speedMin?: number; // 上升速度范围（周期/秒）
  speedMax?: number;
  sizeMin?: number; // 粒子大小范围（像素）
  sizeMax?: number;
}

const VERT = /* glsl */ `
  attribute vec3 aData; // x=phase(0~1), y=speed, z=pointSize

  uniform float uTime;
  uniform float uBaseZ;
  uniform float uMaxRise;

  varying float vAlpha;

  void main() {
    // t: 当前粒子在生命周期中的进度 [0,1]，循环
    float t = mod(uTime * aData.y + aData.x, 1.0);
    vec3 pos = position;
    pos.z = uBaseZ + t * uMaxRise;

    // 淡入淡出：前 20% 淡入，后 40% 淡出
    float fadeIn  = smoothstep(0.0, 0.2, t);
    float fadeOut = 1.0 - smoothstep(0.6, 1.0, t);
    vAlpha = fadeIn * fadeOut;

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPos;
    // 透视缩放：距离越远粒子越小
    gl_PointSize = aData.z * (400.0 / -mvPos.z);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    // 软圆形粒子
    vec2 uv = gl_PointCoord - 0.5;
    float r = length(uv);
    if (r > 0.5) discard;
    float soft = 1.0 - smoothstep(0.2, 0.5, r);
    gl_FragColor = vec4(uColor, soft * vAlpha);
  }
`;

export class ParticleController {
  private layer: MapLayer;
  private points?: THREE.Points;
  private material?: THREE.ShaderMaterial;
  private elapsed = 0;
  private tickFn?: (dt: number) => void;

  constructor(layer: MapLayer) {
    this.layer = layer;
  }

  /**
   * 在地图 bbox 范围内随机生成漂浮粒子
   * 粒子从顶面高度缓慢上升并淡出，循环播放
   */
  setData(bboxOption: BboxOption, style: ParticleStyle = {}): void {
    this.clear();

    const {
      color = "#00d4ff",
      count = 2500,
      maxRiseFactor = 1.5,
      speedMin = 0.08,
      speedMax = 0.25,
      sizeMin = 2,
      sizeMax = 5,
    } = style;

    const { bboxProj, baseHeight } = bboxOption;
    const [minX, minY, maxX, maxY] = bboxProj;
    const maxRise = baseHeight * maxRiseFactor;

    // 每个粒子：position(x,y,z_base) + aData(phase, speed, size)
    const positions = new Float32Array(count * 3);
    const aData = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = minX + Math.random() * (maxX - minX);
      positions[i * 3 + 1] = minY + Math.random() * (maxY - minY);
      positions[i * 3 + 2] = baseHeight; // z_base，shader 里会动态偏移

      aData[i * 3] = Math.random(); // phase：错开各粒子的起始时间
      aData[i * 3 + 1] = speedMin + Math.random() * (speedMax - speedMin);
      aData[i * 3 + 2] = sizeMin + Math.random() * (sizeMax - sizeMin);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aData", new THREE.BufferAttribute(aData, 3));

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uBaseZ: { value: baseHeight },
        uMaxRise: { value: maxRise },
        uColor: { value: new THREE.Color(color) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // 叠加混合，粒子重叠更亮
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.name = "particles";
    this.layer.scene.add(this.points);

    this.elapsed = 0;
    this.tickFn = (dt: number) => {
      this.elapsed += dt;
      this.material!.uniforms.uTime.value = this.elapsed;
    };
    this.layer.time.on("tick", this.tickFn);
  }

  clear(): void {
    if (this.tickFn) {
      this.layer.time.off("tick", this.tickFn);
      this.tickFn = undefined;
    }
    if (this.points) {
      this.layer.scene.remove(this.points);
      this.points.geometry.dispose();
      this.points = undefined;
    }
    if (this.material) {
      this.material.dispose();
      this.material = undefined;
    }
    this.elapsed = 0;
  }

  /** 切换显隐，用于 loading 期间临时隐藏粒子 */
  setVisible(visible: boolean): void {
    if (this.points) this.points.visible = visible;
  }

  dispose(): void {
    this.clear();
  }
}
