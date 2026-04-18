# China Map 3D — 任务清单

> 实现顺序参考 `china-map-tech-analysis.md` 第十节。
> 状态：`[ ]` 待开始 / `[~]` 进行中 / `[x]` 完成

---

## Step 1 — 坐标投影

- [ ] 实现 Mercator 投影函数 `project(lon, lat) → [x, y]`
- [ ] 实现 `wV(lon, lat, zoom)` 将投影坐标转为世界坐标
- [ ] 实现 `sm(geojson, projFn)` 批量变换 GeoJSON 坐标（保留6位小数）
- [ ] 支持类型：Point / LineString / MultiPoint / Polygon / MultiLineString / MultiPolygon

## Step 2 — 相机设置

- [ ] 创建透视相机，支持 pitch / rotation / zoom 参数
- [ ] 实现 `KV(options)` 计算 bboxOption 和 cameraStatus
- [ ] 默认视口：zoom=3.75，center=[104.299, 33.518]，pitch=40°，rotation=4°

## Step 3 — 数据加载

- [ ] 加载 GeoJSON 文件（从 `public/data/` 目录）
- [ ] 集成 pbf + geobuf，支持 `.pbf` 格式解码
- [ ] 实现 `lV()` 数据预处理流程

## Step 4 — 三角剖分 & 基础渲染

- [ ] 实现 `bV(geoJsonData, bboxProj)` — earcut 三角剖分，输出 `{index, position, normal, uv}`
- [ ] 计算 UV（基于 bbox 归一化到 [0,1]）
- [ ] 计算顶点法线（累加后归一化）
- [ ] 创建顶面 Mesh（MeshStandardMaterial）
- [ ] 创建侧面 Mesh（ShaderMaterial 顶底渐变）
- [ ] `topMesh.scale.z = baseHeight` 控制拉伸高度

## Step 5 — 内阴影

- [ ] 实现 `zV(features, bboxProj)` — Canvas 2D 生成内阴影纹理
- [ ] 使用 `globalCompositeOperation = 'source-out'` 合成阴影
- [ ] 将 Canvas 转为 Three.js Texture 贴到 innerShadowMesh
- [ ] innerShadowMesh.scale.z = 1.01 * baseHeight（避免 z-fighting）
- [ ] 支持配置：shadowColor / shadowBlur / fillColor

## Step 6 — 边界线

- [ ] 集成 Line2 / LineMaterial / LineSegmentsGeometry
- [ ] 渲染省级边界线（districtStrokeGroup）
- [ ] 渲染底部边界线（districtBottomStrokeGroup）
- [ ] `material.resolution.set(width, height)` 保证线宽正确

## Step 7 — 流光动画

- [ ] 实现流光 ShaderMaterial（dashOffset uniform + mod 循环）
- [ ] 每帧更新 `dashOffset -= 5e-4 * speed`
- [ ] 在 requestAnimationFrame 循环中驱动动画

## Step 8 — 纹理贴图

- [ ] 单图片纹理加载（TextureLoader）
- [ ] 瓦片拼接纹理（getTilesInBbox → 并行 fetch → Canvas 拼接）
- [ ] 支持 map / normalMap / emissiveMap 三种类型

## Step 9 — 钻取交互

- [ ] Raycaster 鼠标点击检测
- [ ] 实现 drillStack 历史栈（drillDown / drillUp）
- [ ] 按 parentCode 过滤子区域数据
- [ ] 相机动画过渡（province → city → county）

---

## 数据文件（放 public/data/）

| 文件 | 用途 |
|------|------|
| `countryborder_208_gc.pbf` | 国界 |
| `district_100000_1_gc.pbf` | 省/市/县区划 |
| `districtaggregate_province_kld_gc.pbf` | 省级聚合 |
| `districtaggregate_city_kld_gc.pbf` | 市级聚合 |
| `districtaggregate_county_kld_gc.pbf` | 县级聚合 |
| `worldborderworldborder_gc.pbf` | 世界边界（背景拉伸用） |
