/**
 * 配置加载器 - 支持从 JSON 文件或接口加载配置
 */

import type { MapSceneConfig } from "../scene/types";
import {
  parseJSONConfig,
  validateJSONConfig,
  type MapSceneJSONConfig,
} from "./schema";

export interface ConfigLoaderOptions {
  // JSON 文件路径
  configUrl?: string;
  // 直接传入 JSON 配置对象
  config?: MapSceneJSONConfig;
  // API 配置
  apiConfig?: {
    baseUrl: string;
    configEndpoint?: string;
    headers?: Record<string, string>;
  };
  // 合并到配置的额外选项
  overrides?: Partial<MapSceneConfig>;
}

/**
 * 从多种来源加载配置
 */
export async function loadConfig(
  options: ConfigLoaderOptions,
): Promise<MapSceneConfig> {
  let jsonConfig: MapSceneJSONConfig;

  // 优先级: config > configUrl > apiConfig
  if (options.config) {
    jsonConfig = options.config;
  } else if (options.configUrl) {
    jsonConfig = await loadConfigFromFile(options.configUrl);
  } else if (options.apiConfig) {
    jsonConfig = await loadConfigFromAPI(options.apiConfig);
  } else {
    throw new Error(
      "ConfigLoader requires one of: config, configUrl, or apiConfig",
    );
  }

  // 验证配置
  if (!validateJSONConfig(jsonConfig)) {
    throw new Error("Invalid configuration format");
  }

  // 解析为运行时配置
  const config = await parseJSONConfig(jsonConfig);

  // 应用覆盖
  if (options.overrides) {
    return mergeConfig(config, options.overrides);
  }

  return config;
}

/**
 * 从 JSON 文件加载配置
 */
async function loadConfigFromFile(url: string): Promise<MapSceneJSONConfig> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    throw new Error(`Failed to load config from ${url}: ${error}`);
  }
}

/**
 * 从 API 加载配置
 */
async function loadConfigFromAPI(apiConfig: {
  baseUrl: string;
  configEndpoint?: string;
  headers?: Record<string, string>;
}): Promise<MapSceneJSONConfig> {
  const { baseUrl, configEndpoint = "/config", headers = {} } = apiConfig;
  const url = `${baseUrl}${configEndpoint}`;

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    throw new Error(`Failed to load config from API ${url}: ${error}`);
  }
}

/**
 * 深度合并配置对象
 */
function mergeConfig(
  base: MapSceneConfig,
  override: Partial<MapSceneConfig>,
): MapSceneConfig {
  const result = { ...base };

  for (const key in override) {
    const k = key as keyof MapSceneConfig;
    const baseValue = base[k];
    const overrideValue = override[k];

    if (overrideValue === undefined) continue;

    if (isObject(baseValue) && isObject(overrideValue)) {
      result[k] = mergeConfig(
        baseValue as MapSceneConfig,
        overrideValue as Partial<MapSceneConfig>,
      ) as never;
    } else {
      result[k] = overrideValue as never;
    }
  }

  return result;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * 保存配置为 JSON（移除函数和不可序列化的内容）
 */
export function serializeConfig(config: MapSceneConfig): MapSceneJSONConfig {
  const json: MapSceneJSONConfig = {
    debug: config.debug,
    data: {
      rootUrl: config.data.rootUrl,
      drill: config.data.drill
        ? {
            enabled: config.data.drill.enabled,
            maxDepth: config.data.drill.maxDepth,
          }
        : undefined,
    },
    camera: config.camera,
    baseLayer: config.baseLayer,
    boundary: config.boundary,
    streamer: config.streamer,
    background: config.background,
    textures: config.textures
      ? {
          map: serializeMapTexture(config.textures.map),
          normal: serializeNormalTexture(config.textures.normal),
        }
      : undefined,
    labels: config.labels,
    highlight: config.highlight,
    flylines: config.flylines
      ? {
          enabled: config.flylines.enabled,
          data: Array.isArray(config.flylines.data)
            ? config.flylines.data
            : undefined,
          style: config.flylines.style,
          byLevel: config.flylines.byLevel,
        }
      : undefined,
    particles: config.particles,
  };

  return json;
}

function serializeMapTexture(
  texture: MapSceneConfig["textures"]["map"],
): MapSceneJSONConfig["textures"]["map"] {
  if (!texture) return undefined;

  switch (texture.mode) {
    case "gradient":
      return {
        mode: "gradient",
        resetColor: texture.resetColor,
        gradientStyle: texture.style,
      };
    case "image":
      return {
        mode: "image",
        resetColor: texture.resetColor,
        imageUrl: typeof texture.url === "string" ? texture.url : undefined,
      };
    case "tile":
      return {
        mode: "tile",
        resetColor: texture.resetColor,
        tileLayer: texture.layer,
      };
    case "none":
      return { mode: "none" };
  }
}

function serializeNormalTexture(
  texture: MapSceneConfig["textures"]["normal"],
): MapSceneJSONConfig["textures"]["normal"] {
  if (!texture) return undefined;

  switch (texture.mode) {
    case "terrain":
      return {
        mode: "terrain",
        terrainStyle: texture.style,
      };
    case "image":
      return {
        mode: "image",
        imageUrl: typeof texture.url === "string" ? texture.url : undefined,
      };
    case "none":
      return { mode: "none" };
  }
}
