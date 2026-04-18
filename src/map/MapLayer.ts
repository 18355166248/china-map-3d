import * as THREE from 'three';
import MapApplication from '../core/MapApplication';
import type { BboxOption } from '../geo/camera';
import type { GeomData } from '../geo/triangulate';
import { toBufferGeometry } from '../geo/triangulate';
import { buildInnerShadowTexture, type InnerShadowStyle } from './innerShadow';

// 侧面顶点着色器：透传 uv，用于片元着色器做顶底渐变
const SIDE_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// 侧面片元着色器：按 vUv.y（0=底 1=顶）在 bottomColor 和 topColor 之间线性插值
const SIDE_FRAG = /* glsl */`
  uniform vec3 topColor;
  uniform vec3 bottomColor;
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(mix(bottomColor, topColor, vUv.y), 1.0);
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

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);

    // 环境光保证整体亮度，方向光从正上方照射突出顶面
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(0, 0, 1).normalize();
    this.scene.add(ambient, dir);
  }

  buildMeshes(
    geomGroup: { index: number[]; position: number[]; normal: number[]; uv: number[]; group: number[] },
    bboxOption: BboxOption,
    opts: MapLayerOptions = {}
  ): void {
    this.clearMeshes();

    const { baseHeight } = bboxOption;
    const topColor = opts.topColor ?? '#2a6496';
    const bottomColor = opts.bottomColor ?? '#0d2137';

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
    });
    this.topMesh = new THREE.Mesh(topGeo, topMat);
    this.topMesh.scale.z = baseHeight;
    this.topMesh.name = 'map-top';

    // 内阴影层：复用顶面几何，略高于顶面（1.01x）避免 z-fighting
    // opacity 初始为 0，调用 applyInnerShadow 后生效
    const shadowMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    this.innerShadowMesh = new THREE.Mesh(topGeo, shadowMat);
    this.innerShadowMesh.scale.z = 1.01 * baseHeight;
    this.innerShadowMesh.name = 'map-innerShadow';

    // 侧面：用自定义 ShaderMaterial 实现顶底颜色渐变
    const sideGeo = toBufferGeometry(sideData);
    const sideMat = new THREE.ShaderMaterial({
      vertexShader: SIDE_VERT,
      fragmentShader: SIDE_FRAG,
      uniforms: {
        topColor: { value: new THREE.Color(topColor) },
        bottomColor: { value: new THREE.Color(bottomColor) },
      },
    });
    this.sideMesh = new THREE.Mesh(sideGeo, sideMat);
    this.sideMesh.scale.z = baseHeight;
    this.sideMesh.castShadow = true;
    this.sideMesh.name = 'map-side';

    this.scene.add(this.topMesh, this.innerShadowMesh, this.sideMesh);
  }

  // 生成内阴影纹理并贴到 innerShadowMesh 上，首次调用前 mesh 不可见
  applyInnerShadow(
    geojson: GeoJSON.FeatureCollection,
    bboxOption: BboxOption,
    style?: InnerShadowStyle
  ): void {
    if (!this.innerShadowMesh) return;
    const texture = buildInnerShadowTexture(geojson, bboxOption, style);
    const mat = this.innerShadowMesh.material as THREE.MeshBasicMaterial;
    if (mat.map) mat.map.dispose(); // 替换纹理时释放旧纹理，防止 GPU 显存泄漏
    mat.map = texture;
    mat.opacity = 1;
    mat.needsUpdate = true;
  }

  // 销毁所有 Mesh 及其材质/几何资源，buildMeshes 前调用保证无重复对象
  clearMeshes(): void {
    [this.topMesh, this.innerShadowMesh, this.sideMesh].forEach(mesh => {
      if (!mesh) return;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      } else {
        mesh.material.dispose();
      }
    });
    this.topMesh = undefined;
    this.innerShadowMesh = undefined;
    this.sideMesh = undefined;
  }
}
