# JSON 配置使用指南

## 概述

本项目支持通过 JSON 配置文件或 API 接口来配置地图场景，无需修改代码即可调整地图的各种参数。

## 配置方式

### 1. 从 JSON 文件加载

```typescript
import { loadConfig } from "./config";
import { createMapScene } from "./scene/createMapScene";

// 从 JSON 文件加载配置
const config = await loadConfig({
  configUrl: "/config/default.json",
});

const runtime = await createMapScene(canvas, config);
```

### 2. 从 API 接口加载

```typescript
import { loadConfig } from "./config";

// 从 API 加载配置
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

### 3. 直接传入配置对象

```typescript
import { loadConfig } from "./config";
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

const config = await loadConfig({
  config: jsonConfig,
});
```

### 4. 配置覆盖

```typescript
// 加载基础配置并覆盖部分选项
const config = await loadConfig({
  configUrl: "/config/default.json",
  overrides: {
    camera: {
      pitch: 15,
      rotation: 5,
    },
    boundary: {
      enabled: false,
    },
  },
});
```

## 配置项说明

### 数据源配置 (data)

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

- `rootUrl`: 根地图数据 URL
- `drill.enabled`: 是否启用钻取功能
- `drill.maxDepth`: 最大钻取深度（1=省级，2=市级，3=县级）
- `drill.urlTemplate`: URL 模板，支持 `{adcode}` 和 `{suffix}` 占位符

### API 接口配置

```json
{
  "data": {
    "rootUrl": "/json/china-province.json",
    "apiConfig": {
      "baseUrl": "https://api.example.com",
      "provinceEndpoint": "/geo/province",
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

API 接口会自动拼接为：`{baseUrl}{endpoint}?adcode={adcode}`

### 相机配置 (camera)

```json
{
  "camera": {
    "pitch": 10,
    "rotation": 4,
    "offset": [0, 0],
    "heightFactor": 1.0
  }
}
```

### 基础图层 (baseLayer)

```json
{
  "baseLayer": {
    "topColor": "#4a8dc7",
    "bottomColor": "#0a1929",
    "innerShadow": {
      "debug": false,
      "blur": 20,
      "offset": 5,
      "opacity": 0.8
    },
    "topMaterial": {
      "metalness": 0.1,
      "roughness": 0.7,
      "normalScale": 1.5
    }
  }
}
```

### 边界线 (boundary)

```json
{
  "boundary": {
    "enabled": true,
    "style": {
      "color": "#4fc3f7",
      "linewidth": 1,
      "opacity": 0.9,
      "dashed": false
    },
    "byLevel": {
      "province": { "linewidth": 2 },
      "city": { "linewidth": 1.5 },
      "county": { "linewidth": 1 }
    }
  }
}
```

### 流光效果 (streamer)

```json
{
  "streamer": {
    "enabled": true,
    "style": {
      "color": "#00ffff",
      "linewidth": 2,
      "speed": 0.3,
      "minLength": 2000,
      "optimized": true
    },
    "byLevel": {
      "city": { "minLength": 500 },
      "county": { "minLength": 100 }
    }
  }
}
```

### 纹理配置 (textures)

#### 渐变纹理

```json
{
  "textures": {
    "map": {
      "mode": "gradient",
      "resetColor": true,
      "gradientStyle": {
        "type": "radial",
        "colors": ["#3a7db0", "#2a6496", "#1a4d7a"],
        "resolution": 2000
      }
    }
  }
}
```

#### 图片纹理

```json
{
  "textures": {
    "map": {
      "mode": "image",
      "resetColor": true,
      "imageUrl": "/textures/map.png"
    }
  }
}
```

#### 瓦片纹理

```json
{
  "textures": {
    "map": {
      "mode": "tile",
      "resetColor": true,
      "tileLayer": "img"
    }
  }
}
```

### 标签 (labels)

```json
{
  "labels": {
    "enabled": true,
    "classNames": {
      "province": "province-label",
      "city": "city-label",
      "county": "county-label"
    }
  }
}
```

### 高亮 (highlight)

```json
{
  "highlight": {
    "enabled": true,
    "style": {
      "color": "#ffffff",
      "opacity": 0.25,
      "scale": 1.02
    }
  }
}
```

### 飞线 (flylines)

#### 静态数据

```json
{
  "flylines": {
    "enabled": true,
    "data": [
      { "from": [116.4, 39.9], "to": [121.47, 31.23] },
      { "from": [121.47, 31.23], "to": [113.26, 23.13] }
    ],
    "style": {
      "color": "#00d4ff",
      "speed": 0.6
    }
  }
}
```

#### 从接口加载

```json
{
  "flylines": {
    "enabled": true,
    "dataUrl": "https://api.example.com/flylines",
    "style": {
      "color": "#00d4ff",
      "speed": 0.6
    }
  }
}
```

#### 分级飞线数据（推荐）

不同层级显示不同的飞线数据：

```json
{
  "flylines": {
    "enabled": true,
    "style": {
      "color": "#00d4ff",
      "speed": 0.6
    },
    "byLevel": {
      "province": {
        "data": [
          { "from": [116.4, 39.9], "to": [121.47, 31.23] },
          { "from": [121.47, 31.23], "to": [113.26, 23.13] }
        ]
      },
      "city": {
        "data": []
      },
      "county": {
        "dataUrl": "https://api.example.com/county-flylines"
      }
    }
  }
}
```

说明：
- `byLevel.province.data`: 省级地图显示的飞线
- `byLevel.city.data`: 市级地图显示的飞线（空数组表示不显示）
- `byLevel.county.dataUrl`: 县级地图从接口加载飞线数据

### 粒子效果 (particles)

```json
{
  "particles": {
    "enabled": true,
    "style": {
      "color": "#00d4ff",
      "count": 150,
      "sizeMin": 300,
      "sizeMax": 500,
      "speed": 1.0
    }
  }
}
```

## 分级配置 (byLevel)

部分配置项支持按地图层级设置不同的样式，使用 `byLevel` 字段：

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

支持 `byLevel` 的配置项：
- `boundary`
- `streamer`
- `flylines`
- `particles`

## 调试配置

```json
{
  "debug": {
    "perf": true,
    "cache": true
  }
}
```

- `perf`: 启用性能日志
- `cache`: 启用缓存日志

## 配置导出

可以将运行时配置导出为 JSON：

```typescript
import { serializeConfig } from "./config";

const jsonConfig = serializeConfig(runtime.getConfig());
console.log(JSON.stringify(jsonConfig, null, 2));
```

## 示例文件

项目提供了两个示例配置文件：

1. `public/config/default.json` - 使用本地 JSON 文件的完整配置
2. `public/config/api-example.json` - 使用 API 接口的配置示例

## 注意事项

1. **函数配置**: JSON 配置不支持函数，如需动态逻辑请使用 `urlTemplate` 或 `apiConfig`
2. **类型安全**: 使用 TypeScript 时会自动进行类型检查
3. **配置验证**: 加载配置时会自动验证必需字段
4. **错误处理**: 配置加载失败会抛出详细的错误信息
5. **性能优化**: 建议启用 `cache` 调试选项来监控缓存效率
