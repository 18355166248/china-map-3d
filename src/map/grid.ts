import * as THREE from "three";
import type TimeManager from "../core/TimeManager";
import type { BboxOption } from "../geo/camera";

export interface GridStyle {
  /** 主网格分区数，默认 18 */
  division?: number;
  /** 背景尺寸相对当前 bbox 的缩放系数 */
  gridScaleFactor?: number;
  /** 常驻线框颜色 */
  lineColor?: string;
  /** 子格底色 */
  baseColor?: string;
  /** 子格激活色 */
  activeColor?: string;
  /** 呼吸闪烁速度 */
  pulseSpeed?: number;
  /** 斜向扫描速度 */
  scanSpeed?: number;
  /** 整体亮度强度 */
  intensity?: number;
}

const GRID_VERT = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GRID_FRAG = /* glsl */ `
  varying vec2 vUv;

  uniform float uTime;
  uniform float uDivision;
  uniform float uPulseSpeed;
  uniform float uScanSpeed;
  uniform float uIntensity;
  uniform vec3 uLineColor;
  uniform vec3 uBaseColor;
  uniform vec3 uActiveColor;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  void main() {
    vec2 majorUv = vUv * uDivision;
    vec2 majorCell = floor(majorUv);
    vec2 localUv = fract(majorUv);

    vec2 subUv = localUv * 2.0;
    vec2 subCell = floor(subUv);
    vec2 subLocal = fract(subUv);

    vec2 majorDist = abs(localUv - 0.5);
    float majorLine = 1.0 - smoothstep(0.47, 0.5, max(majorDist.x, majorDist.y));

    vec2 subDist = abs(subLocal - 0.5);
    float subLine = 1.0 - smoothstep(0.44, 0.5, max(subDist.x, subDist.y));

    vec2 subId = majorCell * 2.0 + subCell;
    float phase = hash21(subId);
    float speedJitter = mix(0.65, 1.45, hash21(subId + 3.17));
    float strength = mix(0.25, 1.0, hash21(subId + 7.31));

    float pulse = 0.5 + 0.5 * sin(uTime * uPulseSpeed * speedJitter + phase * 6.2831853);
    pulse = smoothstep(0.18, 0.95, pulse) * strength;

    float tileMask = smoothstep(0.48, 0.18, max(subDist.x, subDist.y));

    float scanBand = fract(vUv.x + vUv.y - uTime * uScanSpeed);
    float scan = smoothstep(0.0, 0.08, scanBand) * (1.0 - smoothstep(0.08, 0.18, scanBand));
    scan *= 0.5 + 0.5 * hash21(majorCell + 1.23);

    vec3 color = vec3(0.0);
    color += uBaseColor * (0.16 + pulse * 0.32) * tileMask;
    color += uActiveColor * pulse * tileMask * 0.9;
    color += uActiveColor * scan * (0.2 + 0.4 * tileMask);
    color += uLineColor * (majorLine * 0.95 + subLine * 0.45);

    float vignette = smoothstep(0.95, 0.32, distance(vUv, vec2(0.5)));
    float alpha = max(majorLine * 0.45 + subLine * 0.2, tileMask * (0.2 + pulse * 0.28) + scan * 0.18);
    alpha *= vignette * uIntensity;

    gl_FragColor = vec4(color, alpha);
  }
`;

/**
 * 地图背景网格：单平面 shader 网格，主格内拆分为 2x2 子格，
 * 通过伪随机相位产生非同步渐隐渐现效果，并叠加轻微斜向扫描高光。
 */
export class GridBackground {
  private group: THREE.Group;
  private scene: THREE.Scene;
  private time: TimeManager;
  private tickFn?: (dt: number) => void;
  private mesh?: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private style: GridStyle;
  private rotation: number;

  constructor(
    scene: THREE.Scene,
    time: TimeManager,
    bboxOption: BboxOption,
    style: GridStyle = {},
    rotation = 0,
  ) {
    this.scene = scene;
    this.time = time;
    this.style = style;
    this.rotation = rotation;
    this.group = new THREE.Group();
    this.group.name = "grid-background";
    this.rebuild(bboxOption);
    scene.add(this.group);
  }

  update(
    bboxOption: BboxOption,
    style: GridStyle = this.style,
    rotation = this.rotation,
  ): void {
    this.style = style;
    this.rotation = rotation;
    this.rebuild(bboxOption);
  }

  private rebuild(bboxOption: BboxOption): void {
    this.disposeMesh();

    const {
      division = 18,
      gridScaleFactor = 1.18,
      lineColor = "#3d8ccb",
      baseColor = "#103456",
      activeColor = "#55d6ff",
      pulseSpeed = 1.35,
      scanSpeed = 0.07,
      intensity = 0.95,
    } = this.style;

    const { bboxProj, size } = bboxOption;
    const [x0, y0, x1, y1] = bboxProj;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const planeSize = size.maxSize * gridScaleFactor;

    this.group.position.set(cx, cy, -1.2);
    this.group.rotation.z = this.rotation * (Math.PI / 180);

    const geometry = new THREE.PlaneGeometry(planeSize, planeSize, 1, 1);
    const material = new THREE.ShaderMaterial({
      vertexShader: GRID_VERT,
      fragmentShader: GRID_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uDivision: { value: division },
        uPulseSpeed: { value: pulseSpeed },
        uScanSpeed: { value: scanSpeed },
        uIntensity: { value: intensity },
        uLineColor: { value: new THREE.Color(lineColor) },
        uBaseColor: { value: new THREE.Color(baseColor) },
        uActiveColor: { value: new THREE.Color(activeColor) },
      },
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.renderOrder = -2;
    this.group.add(this.mesh);

    this.tickFn = (dt: number) => {
      if (!this.mesh) return;
      this.mesh.material.uniforms.uTime.value += dt;
    };
    this.time.on("tick", this.tickFn);
  }

  private disposeMesh(): void {
    if (this.tickFn) {
      this.time.off("tick", this.tickFn);
      this.tickFn = undefined;
    }

    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = undefined;
    }
  }

  dispose(): void {
    this.disposeMesh();
    this.scene.remove(this.group);
  }
}
