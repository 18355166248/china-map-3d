import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { project } from "../geo/projection";
import type { BboxOption } from "../geo/camera";

export interface LabelControllerOptions {
  classNames?: Partial<Record<number, string>>;
}

// 层级对应的 CSS class，控制字体大小。
const DEFAULT_DEPTH_CLASS: Record<number, string> = {
  1: "map-label--province",
  2: "map-label--city",
  3: "map-label--county",
};

export class LabelController {
  private objects: CSS2DObject[] = [];
  private scene: THREE.Scene;
  private classNames: Record<number, string>;

  constructor(scene: THREE.Scene, options: LabelControllerOptions = {}) {
    this.scene = scene;
    this.classNames = { ...DEFAULT_DEPTH_CLASS };
    this.setClassNames(options.classNames ?? {});
  }

  setClassNames(classNames: Partial<Record<number, string>>): void {
    for (const [key, value] of Object.entries(classNames)) {
      if (value) {
        this.classNames[Number(key)] = value;
      }
    }
  }

  /**
   * 根据当前层级数据更新标注
   * depth: 1=省级 2=市级 3=县级，用于控制字体大小
   */
  update(
    projected: GeoJSON.FeatureCollection,
    bboxOption: BboxOption,
    depth: number,
  ): void {
    this.clear();
    const { baseHeight } = bboxOption;
    const depthClass = this.classNames[depth] ?? this.classNames[2];

    for (const feature of projected.features) {
      const centroid: [number, number] | undefined =
        feature.properties?.centroid;
      const name: string | undefined = feature.properties?.name;
      if (!centroid || !name) continue;

      // centroid 是原始经纬度，需要手动投影到 Mercator 坐标
      const [x, y] = project(centroid[0], centroid[1]);

      const div = document.createElement("div");
      div.className = `map-label ${depthClass}`;
      div.textContent = name;

      const obj = new CSS2DObject(div);
      // 标注放在顶面上方，避免被地图遮挡
      obj.position.set(x, y, baseHeight * 1.05);
      this.scene.add(obj);
      this.objects.push(obj);
    }
  }

  clear(): void {
    for (const obj of this.objects) {
      this.scene.remove(obj);
      obj.element.remove();
    }
    this.objects = [];
  }

  dispose(): void {
    this.clear();
  }
}
