# 配置说明（china-map-3d）

本文描述 MapSceneConfig 各字段、加载/钻取时的显示逻辑，以及飞线与粒子的最新行为（包含等比缩放与 loading 显隐）。

## 快速示例

```ts
import { loadConfig } from "./config";

const cfg = await loadConfig({ configUrl: "/config/default.json" });
// 关键域：data、textures、boundary/streamer、background、labels/highlight/flylines/particles
```

## 顶层字段

- data.rootUrl: 根层 GeoJSON 地址（省级）
- data.drill
  - enabled: 是否开启钻取
  - maxDepth: 最大深度（1=省 2=市 3=县）
  - getDataUrl(adcode,suffix,depth): 返回下层数据 URL
- camera: pitch/rotation/offset/heightFactor（可选）
- baseLayer
  - topColor/bottomColor
  - innerShadow: 内阴影样式
  - lod/topMaterial: 网格 LOD 与材质细节
- textures
  - map: { mode: "gradient" | "tile" | "image" | "none", … }
  - normal: { mode: "terrain" | "image" | "none", … }
- boundary/streamer: LevelStyleConfig<T>，支持 byLevel 覆盖各层样式
- background.rotatingRings
  - sizeRatio 或 size（以及 color/opacity/speed），支持 byLevel 调整
- labels
  - enabled、classNames（province/city/county）
- highlight
  - enabled、style（color/opacity/scale/cursor）
- flylines
  - enabled、data（数组或函数）与 style、byLevel
- particles
  - LevelStyleConfig<ParticleStyle>，模块会做等比缩放（见下）

## 加载与钻取时的显示逻辑

- App.tsx 中的 loading 叠层
  - 文案统一为 “loading”
  - 自适应尺寸：`--loading-size`、`--loading-font`（见 src/App.css）
- 钻取加载（双击进入 / 右键返回）
  - 重建期间地图本体 opacity=0，等待纹理/法线等资源加载完后再 setSceneOpacity(1) 淡入
  - onLoadingChange(loading) 统一控制模块显隐：
    - 隐藏/恢复：rotatingRings、labels、flylines、particles
    - 暂停/恢复 hover 高亮（HighlightController.setPaused）
    - 通过 canvas 派发 "map-loading" 事件，驱动 React UI 的 loading 状态

## 模块行为与要点

- RotatingRings（旋转环）
  - loading 时隐藏；层重建完成后恢复显示
  - 尺寸基于 bbox 最大边与 sizeRatio 自动适配
- Labels（文字标注）
  - loading 时隐藏；支持自定义 classNames
- Highlight（鼠标 hover 高亮）
  - loading 时暂停 hover、清除现有高亮与 cursor；完成后恢复
- Flylines（飞线 + 头部发光精灵）
  - loading 时隐藏
  - 若当前层数据为空：setData([]) 后保持隐藏（setVisible(false)）
  - 有数据：setData 后强制 setVisible(true)
- Particles（上升粒子）
  - loading 时隐藏（setVisible(false)）
  - 等比缩放：使用“初始层 bbox 的 max(width,height)”作为 refSize，对当前层 currMax 做比例
    - lin = clamp(currMax / refSize, 0.1, 1)
    - 尺寸：sizeScale ≈ lin（二/三级带轻微深度加成，当前：市×1.12、县×1.22）
    - 数量：countScale ≈ lin²（设下限，防止过少）
    - 速度/上升高度：motionScale = 0.7 + 0.3×lin（更克制，层级越深越低）
  - 最终样式 = 基础 style（可由 byLevel 定义）× 自动缩放；二者可叠加

## 常见问题

- 飞线不显示
  - 检查 flylines.enabled 与 data 是否有值；为空则模块会保持隐藏
- 粒子过多或过少
  - 调整 particles.style 的基础 count/sizeMin/sizeMax 或在 byLevel 覆盖
  - 等比缩放自动依据 bbox 尺寸调节，如需整体抬升可提高基础值
- loading 长时间不消失
  - 检查 textures.map/normal 的图片/瓦片地址是否可达

## 自定义 loading 叠层

- 文案与尺寸
  - App.tsx 中 label 为 “loading”
  - src/App.css 中通过 `--loading-size`、`--loading-font` 调整自适应范围
