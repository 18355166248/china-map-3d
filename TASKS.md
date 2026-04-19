# China Map 3D — 任务清单

> 实现顺序参考 `china-map-tech-analysis.md` 第十节。
> 状态：`[ ]` 待开始 / `[~]` 进行中 / `[x]` 完成

---

## Step 1 — 坐标投影 `[x]`

- [x] Mercator 投影 `project(lon, lat)` → `src/geo/projection.ts`
- [x] `lonLatToPixel(lon, lat, zoom)` 世界像素坐标（对应原始 wV）
- [x] `transformGeoJSON / projectGeoJSON` 批量变换 GeoJSON → `src/geo/transform.ts`
- [x] 支持 Point / LineString / MultiPoint / Polygon / MultiLineString / MultiPolygon

## Step 2 — 相机设置 `[x]`

- [x] `computeKV(opts)` 计算 bboxOption / cameraStatus → `src/geo/camera.ts`
- [x] pitch/rotation → cameraDirection / cameraUp 向量
- [x] 默认视口：zoom=3.75，center=[104.299, 33.518]，pitch=40°，rotation=4°
- [x] **修复**：near 改为 `bboxSize * 0.001`（原 `bboxSize` 导致近裁剪面在地图表面）

## Step 3 — 数据加载 `[x]`

- [x] `loadPbf(url)` PBF 解码 → `src/geo/loader.ts`
- [x] `buildGeometry(geojson, bboxProj)` earcut 三角剖分 → `src/geo/triangulate.ts`
- [x] `toBufferGeometry(data)` → Three.js BufferGeometry（对应原始 RV）
- [x] 顶面（yV）+ 侧面（vV）分组输出 group[0]/group[1]
- [x] **修复**：earcut v3 具名导出 `import { flatten } from 'earcut'`

## Step 4 — 基础渲染 `[x]`

- [x] `MapLayer` 场景/相机/渲染器 → `src/map/MapLayer.ts`
- [x] 顶面 MeshStandardMaterial，`scale.z = baseHeight`
- [x] 侧面 ShaderMaterial 顶底渐变
- [x] innerShadowMesh 占位（Step 5 填充）
- [x] **修复**：侧面 index 不再减 topVertLen（已是 0-based）
- [x] **新增**：OrbitControls 拖拽/旋转/缩放，enableDamping

## Step 4.5 — Three.js 基础能力封装重构 `[x]`

> 参考 `3DMap-zhejiang/MapControl` 架构，将 MapLayer 单体类拆分为管理器组合

- [x] `EventEmitter` 基类（`src/core/EventEmitter.ts`）— Map+Set 发布订阅
- [x] `TimeManager`：rAF tick 系统（`src/core/TimeManager.ts`）— emit('tick', dt, elapsed)
- [x] `SizeManager`：canvas-based resize（`src/core/SizeManager.ts`）— 非 window，支持嵌入
- [x] `CameraManager`：透视/正交 + `applyStatus()`（`src/core/CameraManager.ts`）— 键盘 O/P 切换
- [x] `Renderer`：WebGLRenderer + EffectComposer 预留（`src/core/Renderer.ts`）
- [x] `MapApplication` 基类：组合管理器，事件驱动渲染循环（`src/core/MapApplication.ts`）
- [x] `MapLayer` 重构：继承 `MapApplication`，新增 `clearMeshes()`（`src/map/MapLayer.ts`）
- [x] `App.tsx` 简化：移除手动 resize/startRender，构造时自动启动

---

## Step 5 — 内阴影 `[x]`

> 参考 `zV.js`，Canvas 2D source-out 合成

- [x] `buildInnerShadowTexture(geojson, bboxOption, style)` → Canvas → THREE.Texture
- [x] 每个 feature 单独绘制，按 feature bbox 缩放 shadowBlur
- [x] 贴到 innerShadowMesh，`scale.z = 1.01 * baseHeight`
- [x] 配置项：shadowColor / shadowBlurScale / fillColor

**方案**：在 `src/map/innerShadow.ts` 实现，`MapLayer.applyInnerShadow(geojson, bboxOption, style)` 调用。

## Step 6 — 边界线 `[x]`

> 参考 `HV.js`，Line2 系列

- [x] 安装/引入 `Line2 / LineMaterial / LineSegmentsGeometry`（three/examples/jsm/lines）
- [x] `buildBoundaryLines(geojson, bboxOption)` → Line2 对象
- [x] 省级边界线（districtStrokeGroup）
- [x] 底部边界线（districtBottomStrokeGroup，z=0 处）
- [x] `material.resolution.set(width, height)` 随 resize 更新

**方案**：`src/map/boundary.ts`，MapLayer 暴露 `addBoundary(geojson, style)` 方法。

## Step 7 — 流光动画 `[x]`

> 参考 `index.6dcce8bc.js:64802` LV 类

- [ ] 流光 ShaderMaterial（dashOffset uniform + mod 循环）
- [ ] `time.on('tick')` 每帧 `dashOffset -= 5e-4 * speed`（通过 TimeManager 驱动）

**方案**：`src/map/streamer.ts` 实现 StreamerMaterial，在 MapLayer 构造时注册 tick 监听。

## Step 8 — 纹理贴图 `[x]`

> 参考 `OV_map.js`

- [x] 单图片纹理（TextureLoader）→ topMesh material.map
- [ ] 瓦片拼接纹理（getTilesInBbox → 并行 fetch → Canvas 拼接）
- [x] 支持 map / normalMap / emissiveMap

**方案**：`src/map/texture.ts`，MapLayer 暴露 `setTexture(type, url|tileTemplate)` 方法。

## Step 9 — 钻取交互 `[x]`

> 参考 `eW.js` drillDown/drillUp

- [x] Raycaster 鼠标点击检测（topMesh）
- [x] drillStack 历史栈
- [x] 按 adcode 动态加载子区域数据（`/json/{adcode}-city.json`）
- [x] 相机动画过渡（弧线飞行 + 淡入淡出）

**方案**：`src/map/drill.ts` 实现 DrillController，注入 MapLayer。

---

## Step 10 — 已知问题修复 `[x]`

- [x] OrbitControls minDistance / maxDistance 根据 bboxSize 动态设置，防止缩放过近/过远
- [x] 侧面 UV 末尾闭合段已验证：循环覆盖最后一段，shader 只用 vUv.y，无视觉问题
- [x] MultiPolygon 特征侧面法线方向已验证：isClockwiseContour 判断绕向，法线朝外

**方案**：`CameraStatus` 新增 `minDistance`/`maxDistance`，`computeKV` 按 `bboxSize * 0.05/5` 计算，`applyStatus` 和动画结束时应用。

## Step 11 — 县级钻取 `[ ]`

> 在城市级基础上再往下一层，支持点击城市进入县级视图

- [ ] 下载所有城市的县级 GeoJSON（`{cityAdcode}_full.json`）
- [ ] DrillController 支持三级栈（省 → 市 → 县）
- [ ] 县级 minLength 阈值调整

**方案**：扩展 `scripts/download-provinces.mjs` 下载县级数据；DrillController 逻辑复用，无需大改。

## Step 12 — 省份 Hover 高亮 `[ ]`

> 鼠标悬停时高亮对应省份，提升交互反馈

- [ ] mousemove 事件 + Raycaster hitTest 找到当前 hover feature
- [ ] 高亮 Mesh：复用 topMesh 几何，叠加一层半透明高亮色
- [ ] 鼠标移出时恢复

**方案**：`src/map/highlight.ts` 实现 HighlightController，MapLayer 暴露 `setHighlight(feature)` 方法。

## Step 13 — 标注、飞线、粒子 `[ ]`

> 在地图上叠加文字标注、城市间飞线、粒子特效

- [ ] 省/市名称标注（CSS2DRenderer 或 Sprite）
- [ ] 飞线（QuadraticBezierCurve3 + 动画 dashOffset）
- [ ] 粒子特效（Points + ShaderMaterial）

**方案**：各自独立模块，MapLayer 暴露对应 add/clear 方法。

---

## 数据文件（public/data/）`[x]`

| 文件 | 用途 |
|------|------|
| `countryborder_208_gc.pbf` | 国界 |
| `districtaggregate_province_kld_gc.pbf` | 省级聚合 |
| `districtaggregate_city_kld_gc.pbf` | 市级聚合 |
| `districtaggregate_county_kld_gc.pbf` | 县级聚合 |
| `chinasouthseaaggregate_aggregatecssea_kld_gc.pbf` | 南海诸岛 |

> 缺失：`district_100000_1_gc.pbf`、`worldborderworldborder_gc.pbf`（原始服务端未缓存）

---

## 已知问题 / 待验证

- [ ] 侧面 UV 末尾闭合段未处理（最后一段回到起点的 UV 可能缺失）
- [ ] MultiPolygon 特征的侧面法线方向待验证
- [ ] OrbitControls 的 minDistance / maxDistance 需根据 bboxSize 动态设置（在 CameraManager.applyStatus 中设置）
