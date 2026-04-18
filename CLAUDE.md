# china-map-3d 项目规范

## 注释规范

- **所有新增代码必须添加注释**
- 函数/方法：说明用途、关键参数含义、非显而易见的行为
- 重要逻辑块：说明 WHY（为什么这样做），而非 WHAT（代码本身已表达）
- 常量：说明数值来源或含义
- 算法步骤：每个关键步骤标注目的
- 接口/类型字段：内联注释说明用途

## 技术栈

- Three.js 3D 渲染
- Canvas 2D 纹理生成（内阴影等）
- earcut 三角剖分
- Web Mercator 投影坐标系

## 数据流

```
GeoJSON (经纬度)
  → projectGeoJSON     Mercator 投影
  → computeKV          计算相机状态 + bbox 参数
  → buildGeometry      earcut 三角剖分 → 顶面 + 侧面缓冲区
  → MapLayer.buildMeshes   构建 Three.js Mesh
  → MapLayer.applyInnerShadow  Canvas 2D 内阴影纹理
```
