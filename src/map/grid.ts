import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type TimeManager from "../core/TimeManager";
import type { BboxOption } from "../geo/camera";

export interface GridStyle {
  /** 网格分区数，默认 20 */
  division?: number;
  /** 网格线颜色，默认 #2a5f8a */
  gridColor?: number;
  /** 加号形状颜色，默认 #2a5f8a */
  shapeColor?: number;
  /** 点阵颜色，默认 #154d7d */
  pointColor?: number;
  /** 点大小（相对 gridSize），默认 0.002 */
  pointSizeRatio?: number;
  /** 点阵行列数，默认 60 */
  pointCount?: number;
  /** 扩散光环颜色，默认 #2e8bd9 */
  diffuseColor?: number;
  /** 扩散速度（gridSize/s），默认 0.4 */
  diffuseSpeed?: number;
  /** 扩散光环宽度（相对 gridSize），默认 0.08 */
  diffuseWidthRatio?: number;
}

/**
 * 地图背景网格：GridHelper 线框 + 交叉点加号 + 点阵扩散光环
 * 坐标系与地图一致（Mercator 平面坐标），铺在地图底面（z=0）以下
 */
export class GridBackground {
  private group: THREE.Group;
  private scene: THREE.Scene;
  private time: TimeManager;
  private tickFn?: (...args: unknown[]) => void;

  constructor(
    scene: THREE.Scene,
    time: TimeManager,
    bboxOption: BboxOption,
    style: GridStyle = {},
    /** 与相机 rotation 一致的方位角（度），使网格与视角对齐，默认 0 */
    rotation = 0,
  ) {
    this.scene = scene;
    this.time = time;
    this.group = new THREE.Group();
    this.group.name = "grid-background";
    this.build(bboxOption, style, rotation);
    scene.add(this.group);
  }

  private build(bboxOption: BboxOption, style: GridStyle, rotation: number): void {
    const {
      division = 20,
      gridColor = 0x2a5f8a,
      shapeColor = 0x2a5f8a,
      pointColor = 0x154d7d,
      pointSizeRatio = 0.002,
      pointCount = 60,
      diffuseColor = 0x2e8bd9,
      diffuseSpeed = 0.4,
      diffuseWidthRatio = 0.08,
    } = style;

    const { bboxProj, size } = bboxOption;
    const [x0, y0, x1, y1] = bboxProj;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;

    // 网格尺寸取 bbox 长边的 1.4 倍，确保覆盖整个地图视野
    const gridSize = size.maxSize * 1.8;
    const pointSize = gridSize * pointSizeRatio;
    const diffuseWidth = gridSize * diffuseWidthRatio;

    // 网格组整体平移到地图中心，z=-1 置于地图底面之下
    // 绕 Z 轴旋转与相机 rotation 一致，消除视角偏斜
    this.group.position.set(cx, cy, -1);
    this.group.rotation.z = rotation * (Math.PI / 180);

    // ── 层1：GridHelper 线框 ──────────────────────────────────────────
    const gridHelper = new THREE.GridHelper(
      gridSize,
      division,
      gridColor,
      gridColor,
    );
    // GridHelper 默认在 XZ 平面，绕 X 轴旋转 -90° 转到 XY 平面（地图所在平面）
    gridHelper.rotation.x = -Math.PI / 2;
    gridHelper.renderOrder = -2;
    this.group.add(gridHelper);

    // ── 层2：交叉点加号形状（已移除，减少视觉噪音）──────────────────
    // const shapeMesh = this.buildShapes(gridSize, division, shapeColor);
    // shapeMesh.renderOrder = -1;
    // this.group.add(shapeMesh);

    // ── 层3：点阵 + 扩散光环 ─────────────────────────────────────────
    const points = this.buildPoints(
      gridSize,
      pointCount,
      pointSize,
      pointColor,
      diffuseColor,
      diffuseSpeed,
      diffuseWidth,
    );
    points.renderOrder = -1;
    this.group.add(points);
  }

  /** 在每个网格交叉点放置加号，合并为单个 Mesh 提升性能 */
  private buildShapes(
    gridSize: number,
    division: number,
    color: number,
  ): THREE.Mesh {
    const cellSize = gridSize / division;
    const half = gridSize / 2;
    const shapeSize = cellSize * 0.25; // 加号大小为格子的 1/4

    const geometries: THREE.BufferGeometry[] = [];
    for (let row = 0; row <= division; row++) {
      for (let col = 0; col <= division; col++) {
        const geo = this.buildPlusGeometry(shapeSize);
        geo.translate(-half + row * cellSize, -half + col * cellSize, 0);
        geometries.push(geo);
      }
    }

    const merged = mergeGeometries(geometries);
    const mat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    return new THREE.Mesh(merged, mat);
  }

  /** 构建单个加号的 ShapeGeometry */
  private buildPlusGeometry(size: number): THREE.BufferGeometry {
    const lw = size / 18; // 线宽
    const arm = size / 3; // 臂长
    const verts = [
      new THREE.Vector2(-arm, -lw),
      new THREE.Vector2(-lw, -lw),
      new THREE.Vector2(-lw, -arm),
      new THREE.Vector2(lw, -arm),
      new THREE.Vector2(lw, -lw),
      new THREE.Vector2(arm, -lw),
      new THREE.Vector2(arm, lw),
      new THREE.Vector2(lw, lw),
      new THREE.Vector2(lw, arm),
      new THREE.Vector2(-lw, arm),
      new THREE.Vector2(-lw, lw),
      new THREE.Vector2(-arm, lw),
    ];
    return new THREE.ShapeGeometry(new THREE.Shape(verts));
  }

  /** 构建均匀点阵，并注入扩散光环着色器 */
  private buildPoints(
    gridSize: number,
    count: number,
    pointSize: number,
    pointColor: number,
    diffuseColor: number,
    diffuseSpeed: number,
    diffuseWidth: number,
  ): THREE.Points {
    const total = count * count;
    const positions = new Float32Array(total * 3);
    const half = gridSize / 2;

    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        const i = (r * count + c) * 3;
        positions[i] = (r / (count - 1)) * gridSize - half;
        positions[i + 1] = (c / (count - 1)) * gridSize - half;
        positions[i + 2] = 0;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: pointColor,
      size: pointSize,
      depthWrite: false,
    });

    // 注入扩散光环着色器
    this.injectDiffuseShader(mat, gridSize, diffuseSpeed, diffuseWidth, diffuseColor);

    return new THREE.Points(geo, mat);
  }

  /**
   * 通过 onBeforeCompile 向 PointsMaterial 注入扩散光环效果
   * 光环从中心向外扩散，到达边缘后重置，形成循环动画
   */
  private injectDiffuseShader(
    mat: THREE.PointsMaterial,
    gridSize: number,
    speed: number,
    width: number,
    color: number,
  ): void {
    let shader: THREE.WebGLProgramParametersWithUniforms | null = null;

    mat.onBeforeCompile = (s) => {
      shader = s;
      s.uniforms.uTime = { value: 0 };
      s.uniforms.uSpeed = { value: speed };
      s.uniforms.uWidth = { value: width };
      s.uniforms.uColor = { value: new THREE.Color(color) };

      // 顶点着色器：透传世界坐标（相对网格中心）
      s.vertexShader = s.vertexShader.replace(
        "void main() {",
        `varying vec3 vPosition;
        void main() {
          vPosition = position;`,
      );

      // 片元着色器：声明 uniform 和 varying
      s.fragmentShader = s.fragmentShader.replace(
        "void main() {",
        `uniform float uTime;
        uniform float uSpeed;
        uniform float uWidth;
        uniform vec3 uColor;
        varying vec3 vPosition;
        void main() {`,
      );

      // 扩散光环混色逻辑，替换最终输出
      s.fragmentShader = s.fragmentShader.replace(
        "#include <opaque_fragment>",
        `#ifdef OPAQUE
        diffuseColor.a = 1.0;
        #endif
        #ifdef USE_TRANSMISSION
        diffuseColor.a *= material.transmissionAlpha;
        #endif

        float radius = uTime * uSpeed;
        float w = min(uWidth, uTime * 5.0);
        float dist = distance(vPosition.xy, vec2(0.0, 0.0));

        if (dist > radius && dist < radius + 2.0 * w) {
          float t = dist < radius + w
            ? (dist - radius) / w
            : (radius + 2.0 * w - dist) / w;
          outgoingLight = mix(outgoingLight, uColor, t);
        }
        gl_FragColor = vec4(outgoingLight, diffuseColor.a);`,
      );
    };

    // 每帧推进时间，超过重置周期后循环
    const resetTime = gridSize / speed;
    this.tickFn = (dt: unknown) => {
      if (!shader) return;
      shader.uniforms.uTime.value += dt as number;
      if (shader.uniforms.uTime.value > resetTime) {
        shader.uniforms.uTime.value = 0;
      }
    };
    this.time.on("tick", this.tickFn);
  }

  dispose(): void {
    if (this.tickFn) this.time.off("tick", this.tickFn);
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          (obj.material as THREE.Material).dispose();
        }
      }
    });
  }
}
