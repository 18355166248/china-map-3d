import * as THREE from "three";
import * as turf from "@turf/turf";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import MapApplication from "../core/MapApplication";
import type { BboxOption } from "../geo/camera";
import type { GeomData } from "../geo/triangulate";
import { toBufferGeometry } from "../geo/triangulate";
import { buildInnerShadowTexture, type InnerShadowStyle } from "./innerShadow";
import {
  buildBoundaryLines,
  updateBoundaryResolution,
  type BoundaryStyle,
  type BoundaryLines,
} from "./boundary";
import {
  buildStreamerLines,
  updateStreamerResolution,
  type StreamerStyle,
  type StreamerLines,
} from "./streamer";
import { loadTexture, type TextureType } from "./texture";

// 侧面顶点着色器：透传 uv，用于片元着色器做顶底渐变
const SIDE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// 侧面片元着色器：按 vUv.y（0=底 1=顶）在 bottomColor 和 topColor 之间线性插值
const SIDE_FRAG = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 bottomColor;
  uniform float opacity;
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(mix(bottomColor, topColor, vUv.y), opacity);
  }
`;

export interface MapLayerOptions {
  topColor?: string;
  bottomColor?: string;
}

export class MapLayer extends MapApplication {
  private topMesh?: THREE.Mesh;
  private sideMesh?: THREE.Mesh;
  innerShadowMesh?: THREE.Mesh;

  // 边界线对象，resize 时需要更新 LineMaterial.resolution
  private boundaryLines?: BoundaryLines;

  // 流光线对象，tick 事件驱动 dashOffset 动画
  private streamerLines?: StreamerLines;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);

    // 环境光保证整体亮度，方向光从正上方照射突出顶面
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(0, 0, 1).normalize();
    this.scene.add(ambient, dir);

    // resize 时更新边界线和流光线分辨率，LineMaterial 依赖此值计算像素线宽
    this.sizes.on("resize", () => {
      if (this.boundaryLines) {
        updateBoundaryResolution(
          this.boundaryLines,
          this.sizes.width,
          this.sizes.height,
        );
      }
      if (this.streamerLines) {
        updateStreamerResolution(
          this.streamerLines,
          this.sizes.width,
          this.sizes.height,
        );
      }
    });
  }

  buildMeshes(
    geomGroup: {
      index: number[];
      position: number[];
      normal: number[];
      uv: number[];
      group: number[];
    },
    bboxOption: BboxOption,
    opts: MapLayerOptions = {},
  ): void {
    this.clearMeshes();

    const { baseHeight } = bboxOption;
    const topColor = opts.topColor ?? "#2a6496";
    const bottomColor = opts.bottomColor ?? "#0d2137";

    // group 格式：[groupId, indexLen, vertexCount, groupId, indexLen, ...]
    // group[1]/group[2] 对应顶面，group[4] 对应侧面索引数量
    const topIndexLen = geomGroup.group[1];
    const topVertLen = geomGroup.group[2];
    const sideIndexLen = geomGroup.group[4];

    // 按顶面/侧面顶点数拆分缓冲区（position/normal/uv 都是同一顺序拼接的）
    const topData: GeomData = {
      index: geomGroup.index.slice(0, topIndexLen),
      position: geomGroup.position.slice(0, topVertLen * 3),
      normal: geomGroup.normal.slice(0, topVertLen * 3),
      uv: geomGroup.uv.slice(0, topVertLen * 2),
    };
    const sideData: GeomData = {
      index: geomGroup.index.slice(topIndexLen, topIndexLen + sideIndexLen),
      position: geomGroup.position.slice(topVertLen * 3),
      normal: geomGroup.normal.slice(topVertLen * 3),
      uv: geomGroup.uv.slice(topVertLen * 2),
    };

    // 顶面：几何体 z 坐标在 [0,1]，通过 scale.z = baseHeight 拉伸到实际高度
    const topGeo = toBufferGeometry(topData);
    const topMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(topColor),
      metalness: 0.2,
      roughness: 0.6,
      transparent: true, // 支持淡入淡出动画
    });
    this.topMesh = new THREE.Mesh(topGeo, topMat);
    this.topMesh.scale.z = baseHeight;
    this.topMesh.name = "map-top";

    // 内阴影层：复用顶面几何，略高于顶面（1.01x）避免 z-fighting
    // opacity 初始为 0，调用 applyInnerShadow 后生效
    const shadowMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.innerShadowMesh = new THREE.Mesh(topGeo, shadowMat);
    this.innerShadowMesh.scale.z = 1.01 * baseHeight;
    this.innerShadowMesh.name = "map-innerShadow";

    // 侧面：用自定义 ShaderMaterial 实现顶底颜色渐变
    const sideGeo = toBufferGeometry(sideData);
    const sideMat = new THREE.ShaderMaterial({
      vertexShader: SIDE_VERT,
      fragmentShader: SIDE_FRAG,
      uniforms: {
        topColor: { value: new THREE.Color(topColor) },
        bottomColor: { value: new THREE.Color(bottomColor) },
        opacity: { value: 1.0 }, // 支持淡入淡出动画
      },
      transparent: true,
    });
    this.sideMesh = new THREE.Mesh(sideGeo, sideMat);
    this.sideMesh.scale.z = baseHeight;
    this.sideMesh.castShadow = true;
    this.sideMesh.name = "map-side";

    this.scene.add(this.topMesh, this.innerShadowMesh, this.sideMesh);
  }

  // 生成内阴影纹理并贴到 innerShadowMesh 上，首次调用前 mesh 不可见
  applyInnerShadow(
    geojson: GeoJSON.FeatureCollection,
    bboxOption: BboxOption,
    style?: InnerShadowStyle,
  ): void {
    if (!this.innerShadowMesh) return;
    const texture = buildInnerShadowTexture(geojson, bboxOption, style);
    const mat = this.innerShadowMesh.material as THREE.MeshBasicMaterial;
    if (mat.map) mat.map.dispose(); // 替换纹理时释放旧纹理，防止 GPU 显存泄漏
    mat.map = texture;
    mat.opacity = 1;
    mat.needsUpdate = true;
  }

  /**
   * 添加省级边界线（顶面 + 底面各一套）
   * 重复调用会先清除上一次的边界线
   */
  addBoundary(
    geojson: GeoJSON.FeatureCollection,
    bboxOption: BboxOption,
    style?: BoundaryStyle,
  ): void {
    this.clearBoundary();
    this.boundaryLines = buildBoundaryLines(
      geojson,
      bboxOption,
      this.sizes,
      style,
    );
    this.scene.add(this.boundaryLines.top, this.boundaryLines.bottom);
  }

  /**
   * 添加流光动画线（叠加在边界线上方）
   * 通过 TimeManager tick 事件每帧驱动 dashOffset，无需外部手动调用
   * 默认启用优化版本（optimized: true），将所有 ring 合并为单个 draw call
   */
  addStreamer(
    geojson: GeoJSON.FeatureCollection,
    bboxOption: BboxOption,
    style?: StreamerStyle,
  ): void {
    this.clearStreamer();
    this.streamerLines = buildStreamerLines(
      geojson,
      bboxOption,
      this.sizes,
      { optimized: true, ...style }, // 默认启用优化版本
    );
    this.scene.add(this.streamerLines.group);

    // 注册 tick 监听，每帧推进 dashOffset 产生流动效果
    this.time.on("tick", this.streamerLines.tick);
  }

  // 销毁流光线并解除 tick 监听
  clearStreamer(): void {
    if (!this.streamerLines) return;
    this.time.off("tick", this.streamerLines.tick);
    this.scene.remove(this.streamerLines.group);
    this.streamerLines.dispose();
    this.streamerLines = undefined;
  }

  // 销毁边界线几何和材质资源
  clearBoundary(): void {
    if (!this.boundaryLines) return;
    [this.boundaryLines.top, this.boundaryLines.bottom].forEach(
      (line: LineSegments2) => {
        this.scene.remove(line);
        line.geometry.dispose();
        (line.material as LineMaterial).dispose();
      },
    );
    this.boundaryLines = undefined;
  }

  // 销毁所有 Mesh 及其材质/几何资源，buildMeshes 前调用保证无重复对象
  clearMeshes(): void {
    [this.topMesh, this.innerShadowMesh, this.sideMesh].forEach((mesh) => {
      if (!mesh) return;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material.dispose();
      }
    });
    this.topMesh = undefined;
    this.innerShadowMesh = undefined;
    this.sideMesh = undefined;
  }

  destroy(): void {
    this.clearStreamer();
    this.clearBoundary();
    super.destroy();
  }

  /**
   * 加载图片纹理并贴到顶面，支持 map / normalMap / emissiveMap
   * 重复调用会自动释放旧纹理，防止 GPU 显存泄漏
   */
  async setTexture(type: TextureType, url: string): Promise<void> {
    if (!this.topMesh) return;
    const mat = this.topMesh.material as THREE.MeshStandardMaterial;
    const old = mat[type] as THREE.Texture | null;
    if (old) old.dispose();
    mat[type] = await loadTexture(url);
    mat.needsUpdate = true;
  }

  /**
   * 直接应用已构建的纹理对象到顶面
   * resetColor=true 时将顶面颜色重置为白色，避免纯色叠加污染纹理（如卫星图）
   */
  applyTextureObject(
    type: TextureType,
    texture: THREE.Texture,
    resetColor = false,
  ): void {
    if (!this.topMesh) return;
    const mat = this.topMesh.material as THREE.MeshStandardMaterial;
    const old = mat[type] as THREE.Texture | null;
    if (old) old.dispose();
    mat[type] = texture;
    if (resetColor) mat.color.set(0xffffff);
    mat.needsUpdate = true;
  }

  /**
   * 统一设置顶面/侧面/内阴影的透明度，用于钻取动画淡入淡出
   * opacity=1 时关闭 depthWrite 以外的透明排序问题
   */
  setSceneOpacity(opacity: number): void {
    if (this.topMesh) {
      const mat = this.topMesh.material as THREE.MeshStandardMaterial;
      mat.opacity = opacity;
      mat.depthWrite = opacity >= 1;
    }
    if (this.sideMesh) {
      const mat = this.sideMesh.material as THREE.ShaderMaterial;
      mat.uniforms.opacity.value = opacity;
    }
    if (this.innerShadowMesh) {
      const mat = this.innerShadowMesh.material as THREE.MeshBasicMaterial;
      mat.opacity = opacity;
    }
    // 边界线：LineMaterial 支持 opacity + transparent
    if (this.boundaryLines) {
      for (const line of [this.boundaryLines.top, this.boundaryLines.bottom]) {
        const mat = line.material as LineMaterial;
        mat.opacity = opacity;
        mat.transparent = true;
      }
    }
    // 流光线：同样通过 LineMaterial.opacity 控制
    if (this.streamerLines) {
      this.streamerLines.group.traverse((obj) => {
        const line = obj as Line2;
        if (line.material instanceof LineMaterial) {
          line.material.opacity = opacity;
          line.material.transparent = true;
        }
      });
    }
  }

  /**
   * 射线检测：NDC 坐标 → 与 topMesh 求交 → 点面检测找到对应 feature
   * ndcX/ndcY 范围 [-1, 1]，由鼠标像素坐标转换而来
   */
  hitTest(
    ndcX: number,
    ndcY: number,
    projected: GeoJSON.FeatureCollection,
  ): GeoJSON.Feature | null {
    if (!this.topMesh) return null;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(
      new THREE.Vector2(ndcX, ndcY),
      this.camera.instance,
    );
    const hits = raycaster.intersectObject(this.topMesh);
    if (!hits.length) return null;
    // topMesh.scale.z = baseHeight，x/y 仍是 Mercator 投影坐标
    const { x, y } = hits[0].point;
    const pt = turf.point([x, y]);
    for (const f of projected.features) {
      if (
        turf.booleanPointInPolygon(
          pt,
          f as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
        )
      ) {
        return f;
      }
    }
    return null;
  }
}
