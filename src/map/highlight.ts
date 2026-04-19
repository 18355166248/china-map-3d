import * as THREE from "three";
import { buildGeometry, toBufferGeometry } from "../geo/triangulate";
import type { BboxOption } from "../geo/camera";
import type { MapLayer } from "./MapLayer";

export class HighlightController {
  private layer: MapLayer;
  private mesh?: THREE.Mesh;
  private currentAdcode?: number;
  private projected?: GeoJSON.FeatureCollection;
  private bboxOption?: BboxOption;

  constructor(layer: MapLayer) {
    this.layer = layer;
    layer.canvas.addEventListener("mousemove", this.onMouseMove);
    layer.canvas.addEventListener("mouseleave", this.onMouseLeave);
  }

  /** 切换层级时更新数据源，同时清除旧高亮 */
  update(projected: GeoJSON.FeatureCollection, bboxOption: BboxOption): void {
    this.projected = projected;
    this.bboxOption = bboxOption;
    this.clearMesh();
    this.currentAdcode = undefined;
  }

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.projected || !this.bboxOption) return;
    const rect = this.layer.canvas.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const feature = this.layer.hitTest(ndcX, ndcY, this.projected);
    const adcode: number | undefined = feature?.properties?.adcode;

    if (adcode === this.currentAdcode) return;
    this.currentAdcode = adcode;
    this.clearMesh();

    if (!feature) {
      this.layer.canvas.style.cursor = "default";
      return;
    }

    this.layer.canvas.style.cursor = "pointer";
    this.buildHighlight(feature);
  };

  private onMouseLeave = (): void => {
    this.clearMesh();
    this.currentAdcode = undefined;
    this.layer.canvas.style.cursor = "default";
  };

  private buildHighlight(feature: GeoJSON.Feature): void {
    if (!this.bboxOption) return;
    const { baseHeight, bboxProj } = this.bboxOption;

    const geomGroup = buildGeometry(
      { type: "FeatureCollection", features: [feature] },
      bboxProj,
    );
    const topIndexLen = geomGroup.group[1];
    const topVertLen = geomGroup.group[2];
    const geo = toBufferGeometry({
      index: geomGroup.index.slice(0, topIndexLen),
      position: geomGroup.position.slice(0, topVertLen * 3),
      normal: geomGroup.normal.slice(0, topVertLen * 3),
      uv: geomGroup.uv.slice(0, topVertLen * 2),
    });

    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      depthTest: false, // 关闭深度测试，确保高亮始终显示在顶面上方
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.scale.z = baseHeight * 1.02;
    this.mesh.name = "highlight";
    // renderOrder 高于其他 mesh，确保最后渲染，不被透明排序影响
    this.mesh.renderOrder = 10;
    this.layer.scene.add(this.mesh);
  }

  private clearMesh(): void {
    if (!this.mesh) return;
    this.layer.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh = undefined;
  }

  dispose(): void {
    this.clearMesh();
    this.layer.canvas.removeEventListener("mousemove", this.onMouseMove);
    this.layer.canvas.removeEventListener("mouseleave", this.onMouseLeave);
    this.layer.canvas.style.cursor = "default";
  }
}
