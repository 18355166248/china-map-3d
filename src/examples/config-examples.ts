/**
 * 配置加载示例
 */

import { loadConfig } from "./config";
import { createMapScene } from "./scene/createMapScene";
import type { MapSceneJSONConfig } from "./config";

// ============================================
// 示例 1: 从 JSON 文件加载配置
// ============================================
export async function example1_LoadFromFile(canvas: HTMLCanvasElement) {
  const config = await loadConfig({
    configUrl: "/config/default.json",
  });

  const runtime = await createMapScene(canvas, config);
  return runtime;
}

// ============================================
// 示例 2: 从 API 接口加载配置
// ============================================
export async function example2_LoadFromAPI(canvas: HTMLCanvasElement) {
  const config = await loadConfig({
    apiConfig: {
      baseUrl: "https://api.example.com",
      configEndpoint: "/map/config",
      headers: {
        Authorization: "Bearer YOUR_TOKEN",
      },
    },
  });

  const runtime = await createMapScene(canvas, config);
  return runtime;
}

// ============================================
// 示例 3: 直接传入配置对象
// ============================================
export async function example3_DirectConfig(canvas: HTMLCanvasElement) {
  const jsonConfig: MapSceneJSONConfig = {
    data: {
      rootUrl: "/json/china-province.json",
      drill: {
        enabled: true,
        maxDepth: 3,
        urlTemplate: "/json/{adcode}-{suffix}.json",
      },
    },
    camera: {
      pitch: 10,
      rotation: 4,
    },
    baseLayer: {
      topColor: "#4a8dc7",
      bottomColor: "#0a1929",
    },
    boundary: {
      enabled: true,
      style: {
        color: "#4fc3f7",
        linewidth: 1,
        opacity: 0.9,
      },
    },
    textures: {
      map: {
        mode: "gradient",
        resetColor: true,
        gradientStyle: {
          type: "radial",
          colors: ["#3a7db0", "#2a6496", "#1a4d7a"],
          resolution: 2000,
        },
      },
    },
    labels: {
      enabled: true,
    },
    highlight: {
      enabled: true,
    },
  };

  const config = await loadConfig({
    config: jsonConfig,
  });

  const runtime = await createMapScene(canvas, config);
  return runtime;
}

// ============================================
// 示例 4: 加载配置并覆盖部分选项
// ============================================
export async function example4_ConfigWithOverrides(canvas: HTMLCanvasElement) {
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
      streamer: {
        enabled: true,
        style: {
          color: "#ff00ff",
          speed: 0.5,
        },
      },
    },
  });

  const runtime = await createMapScene(canvas, config);
  return runtime;
}

// ============================================
// 示例 5: 使用 API 接口配置钻取数据源
// ============================================
export async function example5_DrillWithAPI(canvas: HTMLCanvasElement) {
  const jsonConfig: MapSceneJSONConfig = {
    data: {
      rootUrl: "/json/china-province.json",
      apiConfig: {
        baseUrl: "https://geo-api.example.com",
        cityEndpoint: "/api/city",
        countyEndpoint: "/api/county",
        headers: {
          "X-API-Key": "your-api-key",
        },
      },
      drill: {
        enabled: true,
        maxDepth: 3,
      },
    },
    camera: {
      pitch: 10,
      rotation: 4,
    },
    labels: {
      enabled: true,
    },
  };

  const config = await loadConfig({
    config: jsonConfig,
  });

  const runtime = await createMapScene(canvas, config);
  return runtime;
}

// ============================================
// 示例 6: 从接口加载飞线数据
// ============================================
export async function example6_FlylinesFromAPI(canvas: HTMLCanvasElement) {
  const jsonConfig: MapSceneJSONConfig = {
    data: {
      rootUrl: "/json/china-province.json",
    },
    flylines: {
      enabled: true,
      dataUrl: "https://api.example.com/flylines",
      style: {
        color: "#00d4ff",
        speed: 0.6,
      },
    },
    labels: {
      enabled: true,
    },
  };

  const config = await loadConfig({
    config: jsonConfig,
  });

  const runtime = await createMapScene(canvas, config);
  return runtime;
}

// ============================================
// 示例 7: 分级配置 - 不同层级使用不同样式
// ============================================
export async function example7_LevelBasedConfig(canvas: HTMLCanvasElement) {
  const jsonConfig: MapSceneJSONConfig = {
    data: {
      rootUrl: "/json/china-province.json",
      drill: {
        enabled: true,
        maxDepth: 3,
      },
    },
    boundary: {
      enabled: true,
      style: {
        color: "#4fc3f7",
        linewidth: 1,
      },
      byLevel: {
        province: {
          linewidth: 2,
          color: "#ff0000",
        },
        city: {
          linewidth: 1.5,
          color: "#00ff00",
        },
        county: {
          linewidth: 1,
          color: "#0000ff",
        },
      },
    },
    streamer: {
      enabled: true,
      style: {
        color: "#00ffff",
        speed: 0.3,
        minLength: 2000,
      },
      byLevel: {
        city: {
          minLength: 500,
        },
        county: {
          minLength: 100,
        },
      },
    },
    labels: {
      enabled: true,
    },
  };

  const config = await loadConfig({
    config: jsonConfig,
  });

  const runtime = await createMapScene(canvas, config);
  return runtime;
}

// ============================================
// 示例 8: 动态切换配置
// ============================================
export async function example8_DynamicConfigSwitch(canvas: HTMLCanvasElement) {
  // 初始配置
  const config = await loadConfig({
    configUrl: "/config/default.json",
  });

  const runtime = await createMapScene(canvas, config);

  // 5 秒后切换到夜间模式
  setTimeout(async () => {
    await runtime.updateConfig({
      baseLayer: {
        topColor: "#1a1a2e",
        bottomColor: "#000000",
      },
      boundary: {
        style: {
          color: "#00ffff",
        },
      },
      streamer: {
        style: {
          color: "#ff00ff",
        },
      },
    });
  }, 5000);

  return runtime;
}

// ============================================
// 示例 9: 错误处理
// ============================================
export async function example9_ErrorHandling(canvas: HTMLCanvasElement) {
  try {
    const config = await loadConfig({
      configUrl: "/config/non-existent.json",
    });
    return await createMapScene(canvas, config);
  } catch (error) {
    console.error("配置加载失败:", error);

    // 使用默认配置作为降级方案
    const fallbackConfig = await loadConfig({
      config: {
        data: {
          rootUrl: "/json/china-province.json",
        },
        labels: {
          enabled: true,
        },
      },
    });

    return await createMapScene(canvas, fallbackConfig);
  }
}

// ============================================
// 示例 10: 根据环境变量选择配置
// ============================================
export async function example10_EnvironmentBasedConfig(
  canvas: HTMLCanvasElement,
) {
  const env = import.meta.env.MODE; // 'development' | 'production'

  const configUrl =
    env === "production" ? "/config/production.json" : "/config/default.json";

  const config = await loadConfig({
    configUrl,
    overrides: {
      debug: {
        perf: env === "development",
        cache: env === "development",
      },
    },
  });

  const runtime = await createMapScene(canvas, config);
  return runtime;
}

// ============================================
// 示例 11: 分级飞线 - 不同层级显示不同飞线
// ============================================
export async function example11_LevelBasedFlylines(canvas: HTMLCanvasElement) {
  const jsonConfig: MapSceneJSONConfig = {
    data: {
      rootUrl: "/json/china-province.json",
      drill: {
        enabled: true,
        maxDepth: 3,
      },
    },
    flylines: {
      enabled: true,
      style: {
        color: "#00d4ff",
        speed: 0.6,
      },
      byLevel: {
        province: {
          // 省级显示主要城市间的飞线
          data: [
            { from: [116.4, 39.9], to: [121.47, 31.23] }, // 北京 -> 上海
            { from: [121.47, 31.23], to: [113.26, 23.13] }, // 上海 -> 广州
            { from: [113.26, 23.13], to: [104.07, 30.67] }, // 广州 -> 成都
            { from: [104.07, 30.67], to: [116.4, 39.9] }, // 成都 -> 北京
          ],
        },
        city: {
          // 市级不显示飞线
          data: [],
        },
        county: {
          // 县级也不显示飞线
          data: [],
        },
      },
    },
    labels: {
      enabled: true,
    },
  };

  const config = await loadConfig({
    config: jsonConfig,
  });

  const runtime = await createMapScene(canvas, config);
  return runtime;
}

