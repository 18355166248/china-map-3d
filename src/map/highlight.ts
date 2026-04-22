import * as THREE from "three";
import { buildGeometry, toBufferGeometry } from "../geo/triangulate";
import type { BboxOption } from "../geo/camera";
import type { MapLayer } from "./MapLayer";

export interface HighlightStyle {
  color?: THREE.ColorRepresentation;
  opacity?: number;
  scale?: number;
  cursor?: string;
}

export class HighlightController {
  private layer: MapLayer;
  private mesh?: THREE.Mesh;
  private currentAdcode?: number;
  private projected?: GeoJSON.FeatureCollection;
  private bboxOption?: BboxOption;
  private style: Required<HighlightStyle>;

  constructor(layer: MapLayer, style: HighlightStyle = {}) {
    this.layer = layer;
    this.style = {
      color: style.color ?? 0xffffff,
      opacity: style.opacity ?? 0.25,
      scale: style.scale ?? 1.02,
      cursor: style.cursor ?? "pointer",
    };
    layer.canvas.addEventListener("mousemove", this.onMouseMove);
    layer.canvas.addEventListener("mouseleave", this.onMouseLeave);
  }

  setStyle(style: HighlightStyle): void {
    this.style = {
      ...this.style,
      ...style,
    };
    if (this.mesh && this.mesh.material instanceof THREE.MeshBasicMaterial) {
      this.mesh.material.color.set(this.style.color);
      this.mesh.material.opacity = this.style.opacity;
    }
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

    this.layer.canvas.style.cursor = this.style.cursor;
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
      color: this.style.color,
      transparent: true,
      opacity: this.style.opacity,
      depthWrite: false,
      depthTest: false, // 关闭深度测试，确保高亮始终显示在顶面上方
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.scale.z = baseHeight * this.style.scale;
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
