# China Map 3D

基于 Three.js 的中国地图 3D 可视化库，支持省市县三级钻取、流光边界、飞线、粒子等效果。

## 特性

- 🗺️ 支持省市县三级地图钻取
- 🎨 丰富的视觉效果（流光边界、飞线、粒子、高亮等）
- ⚙️ **JSON 配置驱动** - 无需修改代码即可调整所有参数
- 🔌 支持从 JSON 文件或 API 接口加载配置
- 📊 支持多种纹理模式（渐变、图片、瓦片）
- 🎯 分级配置 - 不同层级使用不同样式
- 🚀 性能优化 - 三层缓存系统
- 📱 响应式设计

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
```

## 使用方式

### 方式 1: 从 JSON 文件加载配置

```typescript
import { loadConfig } from "./config";
import { createMapScene } from "./scene/createMapScene";

const config = await loadConfig({
  configUrl: "/config/default.json",
});

const runtime = await createMapScene(canvas, config);
```

### 方式 2: 从 API 接口加载配置

```typescript
const config = await loadConfig({
  apiConfig: {
    baseUrl: "https://api.example.com",
    configEndpoint: "/map/config",
    headers: {
      Authorization: "Bearer YOUR_TOKEN",
    },
  },
});
```

### 方式 3: 直接传入配置对象

```typescript
import type { MapSceneJSONConfig } from "./config";

const jsonConfig: MapSceneJSONConfig = {
  data: {
    rootUrl: "/json/china-province.json",
    drill: {
      enabled: true,
      maxDepth: 3,
    },
  },
  // ... 其他配置
};

const config = await loadConfig({ config: jsonConfig });
```

### 方式 4: 配置覆盖

```typescript
const config = await loadConfig({
  configUrl: "/config/default.json",
  overrides: {
    camera: { pitch: 15 },
    boundary: { enabled: false },
  },
});
```

## 配置说明

详细的配置文档请查看 [docs/CONFIG.md](docs/CONFIG.md)

### 主要配置项

- **data** - 数据源配置（支持本地文件和 API 接口）
- **drill** - 钻取配置（URL 模板或 API 配置）
- **camera** - 相机视角配置
- **baseLayer** - 基础图层样式
- **boundary** - 边界线样式
- **streamer** - 流光效果配置
- **textures** - 纹理配置（渐变/图片/瓦片）
- **labels** - 标签配置
- **highlight** - 高亮效果
- **flylines** - 飞线配置（支持从接口加载）
- **particles** - 粒子效果

### 示例配置文件

项目提供了两个示例配置：

- `public/config/default.json` - 完整的本地配置示例
- `public/config/api-example.json` - API 接口配置示例

### 更多示例

查看 `src/examples/config-examples.ts` 了解 10 种不同的配置使用场景。

## 钻取功能

### URL 模板方式

```json
{
  "data": {
    "rootUrl": "/json/china-province.json",
    "drill": {
      "enabled": true,
      "maxDepth": 3,
      "urlTemplate": "/json/{adcode}-{suffix}.json"
    }
  }
}
```

### API 接口方式

```json
{
  "data": {
    "rootUrl": "/json/china-province.json",
    "apiConfig": {
      "baseUrl": "https://api.example.com",
      "cityEndpoint": "/geo/city",
      "countyEndpoint": "/geo/county",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    },
    "drill": {
      "enabled": true,
      "maxDepth": 3
    }
  }
}
```

## 分级配置

支持为不同地图层级设置不同的样式：

```json
{
  "streamer": {
    "enabled": true,
    "style": {
      "color": "#00ffff",
      "minLength": 2000
    },
    "byLevel": {
      "province": { "minLength": 2000 },
      "city": { "minLength": 500 },
      "county": { "minLength": 100 }
    }
  }
}
```

## 技术栈

- React + TypeScript + Vite
- Three.js - 3D 渲染
- Turf.js - 地理计算
- earcut - 多边形三角剖分

## 项目结构

```
src/
├── config/          # 配置系统
│   ├── schema.ts    # JSON 配置类型定义和验证
│   ├── loader.ts    # 配置加载器
│   └── index.ts     # 导出
├── scene/           # 场景管理
│   ├── createMapScene.ts  # 场景运行时
│   ├── types.ts     # 类型定义
│   ├── defaults.ts  # 默认配置
│   └── modules.ts   # 功能模块
├── map/             # 地图组件
├── geo/             # 地理数据处理
├── core/            # 核心渲染引擎
└── examples/        # 使用示例
```

## 开发指南

### 添加注释

所有新增代码必须添加注释，说明用途、关键参数和非显而易见的行为。

### 代码格式化

每次修改代码后运行格式化：

```bash
npm run format
```

## React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from "eslint-plugin-react-x";
import reactDom from "eslint-plugin-react-dom";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs["recommended-typescript"],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

## datawind

https://www.volcengine.com/product/datawind-showcase
