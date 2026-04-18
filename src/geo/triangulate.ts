import * as THREE from 'three';
import earcut, { flatten } from 'earcut';

export interface GeomData {
  index: number[];
  position: number[];
  normal: number[];
  uv: number[];
}

interface GeomGroup extends GeomData {
  group: number[]; // [groupId, indexLen, vertexCount, ...]
}

type BboxProj = [number, number, number, number];

// ── 向量工具 ──────────────────────────────────────────────────────────────────

function vecLen(v: number[]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function vecSub(out: number[], a: number[], b: number[]): number[] {
  out[0] = a[0] - b[0]; out[1] = a[1] - b[1]; out[2] = a[2] - b[2];
  return out;
}

function vecCross(out: number[], a: number[], b: number[]): void {
  out[0] = a[1] * b[2] - a[2] * b[1];
  out[1] = a[2] * b[0] - a[0] * b[2];
  out[2] = a[0] * b[1] - a[1] * b[0];
}

function vecNormalize(v: number[]): void {
  const len = vecLen(v);
  if (len > 0) { v[0] /= len; v[1] /= len; v[2] /= len; }
}

/** 判断轮廓方向（true = 正方向/逆时针） */
function isClockwiseContour(verts: number[], start: number, end: number, dim: number): boolean {
  let sum = 0;
  for (let i = start, prev = end - dim; i < end; i += dim) {
    sum += (verts[prev] - verts[i]) * (verts[i + 1] + verts[prev + 1]);
    prev = i;
  }
  return sum > 0;
}

// ── 顶面三角剖分 ──────────────────────────────────────────────────────────────

function buildTopFace(out: GeomData, coords: number[][][], bbox: BboxProj, height: number): void {
  const { vertices, holes, dimensions } = flatten(coords);
  const indices = earcut(vertices, holes, dimensions);

  const bw = bbox[2] - bbox[0];
  const bh = bbox[3] - bbox[1];
  const vOffset = out.position.length / 3;

  for (let i = 0; i < vertices.length; i += dimensions) {
    const x = Math.round(vertices[i]);
    const y = Math.round(vertices[i + 1]);
    out.position.push(x, y, Math.round(height));
    out.uv.push((x - bbox[0]) / bw, (y - bbox[1]) / bh);
    out.normal.push(0, 0, 0);
  }

  const v1 = [0, 0, 0], v2 = [0, 0, 0], v3 = [0, 0, 0], n = [0, 0, 0];
  for (let i = 2; i < indices.length; i += 3) {
    const i1 = indices[i - 2] + vOffset;
    const i2 = indices[i - 1] + vOffset;
    const i3 = indices[i] + vOffset;
    out.index.push(i1, i2, i3);

    const p1 = i1 * 3, p2 = i2 * 3, p3 = i3 * 3;
    v1[0] = out.position[p1]; v1[1] = out.position[p1 + 1]; v1[2] = out.position[p1 + 2];
    v2[0] = out.position[p2]; v2[1] = out.position[p2 + 1]; v2[2] = out.position[p2 + 2];
    v3[0] = out.position[p3]; v3[1] = out.position[p3 + 1]; v3[2] = out.position[p3 + 2];

    const ab = [0, 0, 0], ac = [0, 0, 0];
    vecSub(ab, v2, v1); vecSub(ac, v3, v1);
    vecCross(n, ab, ac);

    out.normal[p1] += n[0]; out.normal[p1 + 1] += n[1]; out.normal[p1 + 2] += n[2];
    out.normal[p2] += n[0]; out.normal[p2 + 1] += n[1]; out.normal[p2 + 2] += n[2];
    out.normal[p3] += n[0]; out.normal[p3 + 1] += n[1]; out.normal[p3 + 2] += n[2];
  }

  for (let i = vOffset * 3; i < out.normal.length; i += 3) {
    const tmp = [out.normal[i], out.normal[i + 1], out.normal[i + 2]];
    vecNormalize(tmp);
    out.normal[i] = tmp[0]; out.normal[i + 1] = tmp[1]; out.normal[i + 2] = tmp[2];
  }
}

// ── 侧面拉伸 ─────────────────────────────────────────────────────────────────

function buildSideFace(out: GeomData, coords: number[][][], height: number): void {
  const { vertices, holes, dimensions } = flatten(coords);
  const vOffset = out.position.length / 3;

  // 每个原始顶点生成上下两个顶点
  for (let i = 0; i < vertices.length; i += dimensions) {
    const x = Math.round(vertices[i]);
    const y = Math.round(vertices[i + 1]);
    out.position.push(x, y, Math.round(height)); out.normal.push(0, 0, 0); // 上
    out.position.push(x, y, 0);                  out.normal.push(0, 0, 0); // 下
  }

  const totalVerts = vertices.length / dimensions;
  const firstEnd = holes && holes.length > 0 ? holes[0] : totalVerts;
  const contours: [number, number][] = [[0, firstEnd]];
  for (let i = 0; i < holes.length; i++) {
    contours.push([holes[i], i < holes.length - 1 ? holes[i + 1] : totalVerts]);
  }

  const tmp = [0, 0, 0];
  for (let ci = 0; ci < contours.length; ci++) {
    const [cStart, cEnd] = contours[ci];
    const isOuter = ci === 0;
    const cw = isOuter === isClockwiseContour(vertices, cStart * dimensions, cEnd * dimensions, dimensions);

    let cumLen = 0;
    if (cw) {
      for (let j = cStart + 1; j < cEnd; j++) {
        const qi = (2 * (j - 1) + vOffset) * 3;
        const qj = (2 * j + vOffset) * 3;

        // UV
        const uvi = (2 * (j - 1) + vOffset) * 2;
        const uvj = (2 * j + vOffset) * 2;
        out.uv[uvi] = cumLen; out.uv[uvi + 1] = 1;
        out.uv[uvi + 2] = cumLen; out.uv[uvi + 3] = 0;
        vecSub(tmp, [out.position[qj + 3], out.position[qj + 4], out.position[qj + 5]],
                    [out.position[qi + 3], out.position[qi + 4], out.position[qi + 5]]);
        cumLen += vecLen(tmp);
        out.uv[uvj] = cumLen; out.uv[uvj + 1] = 1;
        out.uv[uvj + 2] = cumLen; out.uv[uvj + 3] = 0;

        const base = 2 * (j - 1) + vOffset;
        out.index.push(base + 1, base + 3, base);
        out.index.push(base + 3, base + 2, base);
      }
    } else {
      for (let j = cEnd - 2; j >= cStart; j--) {
        const qi = (2 * (j + 1) + vOffset) * 3;
        const qj = (2 * j + vOffset) * 3;

        const uvi = (2 * (j + 1) + vOffset) * 2;
        const uvj = (2 * j + vOffset) * 2;
        out.uv[uvi] = cumLen; out.uv[uvi + 1] = 1;
        out.uv[uvi + 2] = cumLen; out.uv[uvi + 3] = 0;
        vecSub(tmp, [out.position[qj + 3], out.position[qj + 4], out.position[qj + 5]],
                    [out.position[qi + 3], out.position[qi + 4], out.position[qi + 5]]);
        cumLen += vecLen(tmp);
        out.uv[uvj] = cumLen; out.uv[uvj + 1] = 1;
        out.uv[uvj + 2] = cumLen; out.uv[uvj + 3] = 0;

        const base = 2 * (j + 1) + vOffset;
        out.index.push(base + 1, base - 1, base);
        out.index.push(base - 1, base - 2, base);
      }
    }
  }

  for (let i = vOffset * 3; i < out.normal.length; i += 3) {
    const tmp2 = [out.normal[i], out.normal[i + 1], out.normal[i + 2]];
    vecNormalize(tmp2);
    out.normal[i] = tmp2[0]; out.normal[i + 1] = tmp2[1]; out.normal[i + 2] = tmp2[2];
  }
}

// ── 主函数 ────────────────────────────────────────────────────────────────────

function mergeInto(dst: GeomGroup, src: GeomData, groupId: number): void {
  for (const v of src.index) dst.index.push(v);
  for (const v of src.position) dst.position.push(v);
  for (const v of src.normal) dst.normal.push(v);
  for (const v of src.uv) dst.uv.push(v);
  dst.group.push(groupId, src.index.length, src.position.length / 3);
}

/** 将 GeoJSON FeatureCollection 转为顶面+侧面几何数据（对应原始 bV） */
export function buildGeometry(
  geojson: GeoJSON.FeatureCollection,
  bboxProj: BboxProj
): GeomGroup {
  const top: GeomData = { index: [], position: [], normal: [], uv: [] };
  const side: GeomData = { index: [], position: [], normal: [], uv: [] };

  for (const feature of geojson.features) {
    const geom = feature.geometry;
    if (geom.type === 'Polygon') {
      buildTopFace(top, geom.coordinates as number[][][], bboxProj, 1);
      buildSideFace(side, geom.coordinates as number[][][], 1);
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates as number[][][][]) {
        buildTopFace(top, poly, bboxProj, 1);
        buildSideFace(side, poly, 1);
      }
    }
  }

  const result: GeomGroup = { index: [], position: [], normal: [], uv: [], group: [] };
  mergeInto(result, top, 0);
  mergeInto(result, side, 1);
  return result;
}

/** 将 GeomData 转为 Three.js BufferGeometry（对应原始 RV） */
export function toBufferGeometry(data: GeomData): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(data.index), 1));
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.position), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(data.normal), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(data.uv), 2));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}
