# 中国3D地图技术实现文档

> 逆向分析 `bi/datawind-open/embed/20072143/vScreen/10004170/index.html` 入口的地图渲染引擎，
> 整理坐标系统、内阴影、边缘线流光等核心技术点，供从0到1自行实现参考。

---

## 一、整体架构

```
IW (GIS引擎主类)
  ├── 相机系统 wG          — 透视相机，pitch/rotation/zoom
  ├── 场景系统 IU          — Three.js Scene
  ├── 渲染系统 MU          — WebGL2 Renderer
  ├── 光照系统 xU          — ambient + directional（含阴影）
  ├── 事件系统 gU          — 鼠标交互
  └── 基础地图图层 eW (extends oV)
        ├── districtStrokeGroup       — 区域边界线（Line2）
        ├── districtBottomStrokeGroup — 底部边界线
        ├── districtFillGroup         — 区域填充
        │     ├── topMesh             — 顶面（MeshStandardMaterial）
        │     ├── innerShadowMesh     — 内阴影（贴 Canvas 纹理）
        │     └── sideMesh            — 侧面（ShaderMaterial 渐变）
        ├── extrudeBackgroundFillGroup — 背景拉伸（世界边界差集）
        ├── subDistrictFillGroup      — 子区域填充
        └── subDistrictStrokeGroup    — 子区域边界线
```

默认视口参数（`uk`）：
- zoom: 3.75，center: [104.299, 33.518]（中国地理中心）
- pitch: 40°，rotation: 4°

---

## 二、坐标系统

### 2.1 三层坐标

| 层级 | 说明 | 处理函数 |
|------|------|---------|
| 地理坐标 | 经纬度 [lon, lat] | 原始 GeoJSON |
| 投影坐标 | Mercator 平面坐标 | `window.sm()` |
| 世界坐标 | Three.js 场景坐标 | `window.wV(lon, lat, zoom)` |

### 2.2 投影流程

```
GeoJSON (经纬度)
  → sm.js: window.sm(geojson, projFn)   // 深拷贝 + 坐标变换，保留6位小数
  → __geojson_process_proj__             // 投影后的 GeoJSON
  → window.wV(x, y, zoom)               // 转为画布/世界坐标
```

`sm.js` 支持的几何类型：Point / LineString / MultiPoint / Polygon / MultiLineString / MultiPolygon

### 2.3 相机与 BBox 计算（KV.js）

`window.KV(options)` 输入：geojson、pitch、rotation、offset、viewClip
输出：
- `bboxOption`：投影中心、宽高、bboxSize、bboxScale、baseHeight
- `cameraStatus`：near/far/target/position/up
- `layerFitValue`：xy缩放、z缩放、飞线宽度、直线宽度

中国地图基准尺寸：`bboxSize: 68016, width: 68565, height: 50503`

支持 5 个方向的视图裁剪（`calculateClippedBbox`）：
bottom-right / bottom / top / left / right

---

## 三、数据流水线

### 3.1 数据格式

项目使用 **GeoBuf/PBF** 格式（比 GeoJSON 体积小 6-8 倍），主要数据文件：
- `countryborder_208_gc.pbf` — 国界
- `district_100000_1_gc.pbf` — 省/市/县区划
- `districtaggregate_province/city/county_kld_gc.pbf` — 三级聚合数据
- `chinasouthseaaggregate_aggregatecssea_kld_gc.pbf` — 南海诸岛
- `worldborderworldborder_gc.pbf` — 世界边界（背景拉伸用）

### 3.2 处理流程（upperZV.js → ZV）

```
原始数据 (GEOJSON / GEOJSON_URL / GEOBUF_URL)
  → fetch + pbf 解码
  → lV() 处理 → __geojson_process__
  → window.sm() 坐标投影 → __geojson_process_proj__
  → .features 取出 feature 数组
```

### 3.3 三角剖分（bv.js → bV）

`window.bV(geoJsonData, bboxProj)` 将 GeoJSON 转为 Three.js 可用的几何数据：
- `window._l.flatten` 扁平化坐标
- `window._l.default` 三角剖分（earcut 算法）
- 计算 UV（基于 bbox 归一化到 [0,1]）
- 计算每个三角形法线并累加到顶点，最后归一化
- 输出 `{index, position, normal, uv}` 数组，步长3分组（group[0]=顶面, group[1]=侧面）

---

## 四、3D 拉伸效果（eW.js initExtrude）

### 4.1 几何体创建

```js
// 顶面 (case 0)
const geo = window.RV({ index, position, normal, uv }); // 创建 BufferGeometry
const topMesh = new THREE.Mesh(geo, extrudeTopMaterial); // MeshStandardMaterial
topMesh.scale.z = baseHeight;
topMesh.name = "map-top";

// 内阴影层（叠在顶面上方）
const shadowMesh = new THREE.Mesh(geo, extrudeInnerShadowMaterial);
shadowMesh.scale.z = 1.01 * baseHeight;  // 略高于顶面，避免 z-fighting
shadowMesh.name = "map-innerShadow";

// 侧面 (case 1)
const sideMesh = new THREE.Mesh(sideGeo, extrudeSideMaterial); // ShaderMaterial 渐变
sideMesh.castShadow = true;
sideMesh.userData.invertedRelection = true;
```

### 4.2 材质类型

| 部位 | 材质类型 | 特点 |
|------|---------|------|
| 顶面 | MeshStandardMaterial | 支持法线贴图、自发光贴图 |
| 侧面 | ShaderMaterial | 顶底渐变色（uniform 传入顶色/底色） |
| 内阴影 | MeshBasicMaterial | 贴 Canvas 生成的阴影纹理，transparent: true |

### 4.3 背景拉伸

加载 `worldborderworldborder_gc.pbf` → 与 bbox 求交集（turf.intersect）→ 差集（turf.difference）得到背景区域 → 同样走 bV 三角剖分流程

---

## 五、内阴影效果（zV.js）

### 5.1 实现原理

使用 **Canvas 2D API** 生成内阴影纹理，贴到 innerShadowMesh 上。
核心技巧：`globalCompositeOperation = 'source-out'`，先绘制区域形状，再用 source-out 在形状外部绘制阴影，阴影只渗入形状内边缘。

### 5.2 核心步骤

```js
// 1. 创建 Canvas，尺寸对应 bbox 范围
const canvas = document.createElement('canvas');
canvas.width = bboxPixelWidth;
canvas.height = bboxPixelHeight;
const ctx = canvas.getContext('2d');

// 2. 绘制区域路径（地理坐标 → 画布坐标）
ctx.beginPath();
coordinates.forEach((ring) => {
  ring.forEach(([lon, lat], i) => {
    const [px, py] = wV(lon, lat, zoom);
    const x = px - canvasOffset[0];
    const y = py - canvasOffset[1];
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.closePath();
});

// 3. 先填充区域（作为 source）
ctx.fillStyle = 'white';
ctx.fill();

// 4. source-out 模式：在 source 区域之外绘制阴影
ctx.globalCompositeOperation = 'source-out';
ctx.shadowBlur = styleConfig.shadowBlur;
ctx.shadowColor = styleConfig.shadowColor;
ctx.fillStyle = styleConfig.fillColor;
ctx.fill();

// 5. 生成 Three.js Texture 并更新材质
const texture = new THREE.Texture(canvas);
texture.needsUpdate = true;
mapInstance.extrudeInnerShadowMaterial.map = texture;
mapInstance.extrudeInnerShadowMaterial.needsUpdate = true;
```

### 5.3 配置项

```js
districtStyle.innerShadow = {
  enabled: true,
  shadowColor: 'rgba(0,0,0,0.8)',
  shadowBlur: 20,
  fillColor: 'rgba(0,0,0,0)'
}
```

---

## 六、边缘线流光动画（BoundaryStreamer）

### 6.1 实现原理

自定义 ShaderMaterial，每帧更新 `dashOffset` uniform，在 shader 中用 `mod()` 实现循环滚动。

### 6.2 材质 Shader 关键片段

```glsl
// vertex shader
uniform float dashOffset;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

// fragment shader
uniform float dashOffset;
uniform float dashSize;
uniform float gapSize;
varying vec2 vUv;

void main() {
  float totalSize = dashSize + gapSize;
  float x = mod(vUv.x - dashOffset, totalSize);  // mod 实现循环
  if (x > dashSize) discard;                       // gap 部分丢弃
  gl_FragColor = vec4(color, opacity);
}
```

uniforms：
```js
uniforms: {
  dashOffset: { value: 0 },
  dashSize:   { value: 0.05 },
  gapSize:    { value: 0.05 },
  color:      { value: new THREE.Color('#00ffff') },
  opacity:    { value: 1.0 }
}
```

### 6.3 动画驱动

```js
class BoundaryStreamerLayer {
  constructor() {
    this.material = new StreamerShaderMaterial();
  }

  // 每帧调用
  handleAnimation() {
    if (this.material) {
      this.material.uniforms.dashOffset.value -= 5e-4 * this.config.speed;
    }
  }
}

// 在渲染循环中驱动
function animate() {
  requestAnimationFrame(animate);
  boundaryStreamerLayer.handleAnimation();
  renderer.render(scene, camera);
}
```

### 6.4 几何体

流光层使用 `Line2`（LineSegmentsGeometry + LineMaterial 的自定义版本），沿省界坐标创建线段几何体。

---

## 七、边界线渲染（Line2 系列）

原生 WebGL 的 `gl.lineWidth` 在大多数平台上最大只支持 1px，Three.js 的 `Line2` 扩展通过将线段转为四边形（billboard quad）实现任意宽度。

```js
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';

// 构建坐标数组（每两点一段）
const positions = [];
coordinates.forEach(([x, y]) => positions.push(x, y, 0));

const geometry = new LineSegmentsGeometry();
geometry.setPositions(positions);

const material = new LineMaterial({
  color: 0x00ffff,
  opacity: 0.8,
  linewidth: 2,        // 单位：像素
  transparent: true,
  dashed: false,
});
// 必须设置分辨率，否则线宽计算错误
material.resolution.set(window.innerWidth, window.innerHeight);

const line = new Line2(geometry, material);
scene.add(line);
```

---

## 八、纹理加载（OV_map.js）

### 8.1 单图片

```js
const loader = new THREE.TextureLoader();
const texture = loader.load(imageUrl);
material.map = texture;
```

### 8.2 瓦片拼接

```js
async function loadTileTexture(urlTemplate, bbox, zoom) {
  // 1. 计算 bbox 范围内的瓦片坐标列表
  const tiles = getTilesInBbox(bbox, zoom);

  // 2. 并行 fetch 所有瓦片
  const images = await Promise.all(
    tiles.map(({ x, y, z }) => loadImage(urlTemplate.replace('{x}', x).replace('{y}', y).replace('{z}', z)))
  );

  // 3. 拼接到 Canvas
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  tiles.forEach(({ x, y }, i) => {
    ctx.drawImage(images[i], (x - minX) * 256, (y - minY) * 256);
  });

  // 4. 生成纹理
  const texture = new THREE.Texture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}
```

支持三种纹理类型：
- `map` — 颜色贴图
- `normalMap` — 法线贴图（山峰凹凸效果）
- `emissiveMap` — 自发光贴图（夜间发光效果）

---

## 九、钻取交互

### 9.1 状态管理

```js
class MapLayer {
  constructor() {
    this.drillStack = [];       // 钻取历史栈
    this.currentCode = '100000'; // 当前行政区划代码
    this.currentLevel = 'province'; // province / city / county
  }

  async drillDown(code) {
    this.drillStack.push({ code: this.currentCode, level: this.currentLevel });
    this.currentCode = code;
    this.currentLevel = nextLevel(this.currentLevel);
    await this.loadAndRender(code);
  }

  async drillUp() {
    if (this.drillStack.length === 0) return;
    const { code, level } = this.drillStack.pop();
    this.currentCode = code;
    this.currentLevel = level;
    await this.loadAndRender(code);
  }
}
```

### 9.2 数据加载

```js
const PBF_URLS = {
  province: 'districtaggregate_province_kld_gc.pbf',
  city:     'districtaggregate_city_kld_gc.pbf',
  county:   'districtaggregate_county_kld_gc.pbf',
};

async function loadAndRender(code) {
  const url = PBF_URLS[this.currentLevel];
  const buffer = await fetch(url).then(r => r.arrayBuffer());
  const geojson = geobuf.decode(new Pbf(buffer));
  // 过滤出当前 code 下的子区域
  const features = geojson.features.filter(f => f.properties.parentCode === code);
  // 重新走投影 → 三角剖分 → 渲染流程
  this.render(features);
}
```

---

## 十、从0到1实现路径

### 推荐技术栈

```json
{
  "three": "^0.160.0",
  "earcut": "^2.2.4",
  "@turf/turf": "^6.5.0",
  "pbf": "^3.2.1",
  "geobuf": "^3.0.2"
}
```

### 实现顺序

1. **坐标投影** — 实现 Mercator 投影函数，将经纬度转为平面坐标
2. **相机设置** — 透视相机，设置 pitch/rotation，用 KV.js 逻辑计算 near/far/position
3. **数据加载** — 加载 GeoJSON（或 PBF 解码），earcut 三角剖分生成 BufferGeometry
4. **基础渲染** — 顶面 + 侧面 Mesh，MeshStandardMaterial
5. **内阴影** — Canvas 2D source-out 合成，生成纹理贴图
6. **边界线** — Line2 渲染省市边界
7. **流光动画** — 自定义 ShaderMaterial + dashOffset uniform 动画
8. **纹理贴图** — 瓦片拼接或单图片纹理（法线贴图实现山峰效果）
9. **钻取交互** — Raycaster 鼠标点击 + 数据切换 + 相机动画

---

## 关键文件索引

| 文件 | 功能 |
|------|------|
| `chunk/IW.js` | GIS 引擎主类，初始化顺序 |
| `chunk/eW.js` | 地图图层主类，initExtrude、handleAnimation |
| `chunk/oV.js` | 图层基类，数据流水线 |
| `chunk/KV.js` | 相机/BBox 计算 |
| `chunk/zV.js` | 内阴影 Canvas 生成 |
| `chunk/sm.js` | GeoJSON 坐标变换 |
| `chunk/bv.js` | 三角剖分工具函数 |
| `chunk/HV.js` | 子区域边界线渲染 |
| `chunk/upperZV.js` | 数据加载与投影处理 |
| `chunk/OV_map.js` | 纹理加载（单图/瓦片） |
| `chunk/index.6dcce8bc.js:64802` | 流光 ShaderMaterial（LV 类） |
| `chunk/index.6dcce8bc.js:65293` | 流光图层管理（NV 类） |
