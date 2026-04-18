import * as THREE from 'three';
import MapApplication from '../core/MapApplication';
import type { BboxOption } from '../geo/camera';
import type { GeomData } from '../geo/triangulate';
import { toBufferGeometry } from '../geo/triangulate';

const SIDE_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

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

    const topIndexLen = geomGroup.group[1];
    const topVertLen = geomGroup.group[2];
    const sideIndexLen = geomGroup.group[4];

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

    // 顶面
    const topGeo = toBufferGeometry(topData);
    const topMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(topColor),
      metalness: 0.2,
      roughness: 0.6,
    });
    this.topMesh = new THREE.Mesh(topGeo, topMat);
    this.topMesh.scale.z = baseHeight;
    this.topMesh.name = 'map-top';

    // 内阴影占位（Step 5 填充）
    const shadowMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    this.innerShadowMesh = new THREE.Mesh(topGeo, shadowMat);
    this.innerShadowMesh.scale.z = 1.01 * baseHeight;
    this.innerShadowMesh.name = 'map-innerShadow';

    // 侧面
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
    this.sideMesh.castShadow = true;
    this.sideMesh.name = 'map-side';

    this.scene.add(this.topMesh, this.innerShadowMesh, this.sideMesh);
  }

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
