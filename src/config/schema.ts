/**
 * JSON 配置的类型定义和验证
 */

import type { MapSceneConfig } from "../scene/types";

/**
 * JSON 序列化的配置格式（不包含函数）
 */
export interface MapSceneJSONConfig {
  debug?: {
    perf?: boolean;
    cache?: boolean;
  };
  data: {
    rootUrl: string;
    // 支持接口配置
    apiConfig?: {
      baseUrl: string;
      provinceEndpoint?: string;
      cityEndpoint?: string;
      countyEndpoint?: string;
      headers?: Record<string, string>;
    };
    drill?: {
      enabled?: boolean;
      maxDepth?: number;
      // 支持 URL 模板
      urlTemplate?: string;
    };
  };
  camera?: {
    pitch?: number;
    rotation?: number;
    offset?: [number, number];
    heightFactor?: number;
  };
  baseLayer?: {
    topColor?: string;
    bottomColor?: string;
    innerShadow?: {
      debug?: boolean;
      blur?: number;
      offset?: number;
      opacity?: number;
    };
    lod?: {
      enabled?: boolean;
      levels?: Array<{
        distance: number;
        segments: number;
      }>;
    };
    topMaterial?: {
      metalness?: number;
      roughness?: number;
      normalScale?: number | [number, number];
    };
  };
  boundary?: {
    enabled?: boolean;
    style?: {
      color?: string;
      linewidth?: number;
      opacity?: number;
      dashed?: boolean;
      dashSize?: number;
      gapSize?: number;
    };
    byLevel?: {
      province?: {
        color?: string;
        linewidth?: number;
        opacity?: number;
        dashed?: boolean;
        dashSize?: number;
        gapSize?: number;
      };
      city?: {
        color?: string;
        linewidth?: number;
        opacity?: number;
        dashed?: boolean;
        dashSize?: number;
        gapSize?: number;
      };
      county?: {
        color?: string;
        linewidth?: number;
        opacity?: number;
        dashed?: boolean;
        dashSize?: number;
        gapSize?: number;
      };
    };
  };
  streamer?: {
    enabled?: boolean;
    style?: {
      color?: string;
      linewidth?: number;
      speed?: number;
      minLength?: number;
      optimized?: boolean;
    };
    byLevel?: {
      province?: {
        color?: string;
        linewidth?: number;
        speed?: number;
        minLength?: number;
        optimized?: boolean;
      };
      city?: {
        color?: string;
        linewidth?: number;
        speed?: number;
        minLength?: number;
        optimized?: boolean;
      };
      county?: {
        color?: string;
        linewidth?: number;
        speed?: number;
        minLength?: number;
        optimized?: boolean;
      };
    };
  };
  background?: {
    rotatingRings?: {
      enabled?: boolean;
      // absolute size
      size?: number;
      // ratio of current bbox max(width,height)
      sizeRatio?: number;
      outerSpeed?: number;
      innerSpeed?: number;
      color?: number;
      outerOpacity?: number;
      innerOpacity?: number;
      positionY?: number; // back-compat
      byLevel?: {
        province?: { size?: number; sizeRatio?: number };
        city?: { size?: number; sizeRatio?: number };
        county?: { size?: number; sizeRatio?: number };
      };
    };
  };
  textures?: {
    map?: {
      mode: "gradient" | "image" | "tile" | "none";
      resetColor?: boolean;
      // gradient 模式
      gradientStyle?: {
        type?: "radial" | "linear";
        colors?: string[];
        resolution?: number;
      };
      // image 模式
      imageUrl?: string;
      // tile 模式
      tileLayer?: "vec" | "img" | "ter";
    };
    normal?: {
      mode: "terrain" | "image" | "none";
      // terrain 模式
      terrainStyle?: {
        type?: "tile" | "noise";
        tileUrl?: string;
        normalScale?: number;
        resolution?: number;
      };
      // image 模式
      imageUrl?: string;
    };
  };
  labels?: {
    enabled?: boolean;
    classNames?: {
      province?: string;
      city?: string;
      county?: string;
    };
  };
  highlight?: {
    enabled?: boolean;
    style?: {
      color?: string;
      opacity?: number;
      scale?: number;
    };
  };
  flylines?: {
    enabled?: boolean;
    // 支持静态数据或接口 URL
    data?: Array<{ from: [number, number]; to: [number, number] }>;
    dataUrl?: string;
    style?: {
      color?: string;
      speed?: number;
      height?: number;
      width?: number;
    };
    byLevel?: {
      province?: {
        data?: Array<{ from: [number, number]; to: [number, number] }>;
        dataUrl?: string;
        style?: {
          color?: string;
          speed?: number;
          height?: number;
          width?: number;
        };
      };
      city?: {
        data?: Array<{ from: [number, number]; to: [number, number] }>;
        dataUrl?: string;
        style?: {
          color?: string;
          speed?: number;
          height?: number;
          width?: number;
        };
      };
      county?: {
        data?: Array<{ from: [number, number]; to: [number, number] }>;
        dataUrl?: string;
        style?: {
          color?: string;
          speed?: number;
          height?: number;
          width?: number;
        };
      };
    };
  };
  particles?: {
    enabled?: boolean;
    style?: {
      color?: string;
      count?: number;
      sizeMin?: number;
      sizeMax?: number;
      speed?: number;
    };
    byLevel?: {
      province?: {
        color?: string;
        count?: number;
        sizeMin?: number;
        sizeMax?: number;
        speed?: number;
      };
      city?: {
        color?: string;
        count?: number;
        sizeMin?: number;
        sizeMax?: number;
        speed?: number;
      };
      county?: {
        color?: string;
        count?: number;
        sizeMin?: number;
        sizeMax?: number;
        speed?: number;
      };
    };
  };
}

/**
 * 验证 JSON 配置的基本结构
 */
export function validateJSONConfig(
  config: unknown,
): config is MapSceneJSONConfig {
  if (!config || typeof config !== "object") return false;
  const cfg = config as Partial<MapSceneJSONConfig>;

  // 必须有 data.rootUrl 或 data.apiConfig
  if (!cfg.data?.rootUrl && !cfg.data?.apiConfig) return false;

  return true;
}

/**
 * 从 JSON 配置转换为运行时配置
 */
export async function parseJSONConfig(
  json: MapSceneJSONConfig,
): Promise<MapSceneConfig> {
  const config: MapSceneConfig = {
    debug: json.debug,
    data: {
      rootUrl: json.data.rootUrl,
      drill: json.data.drill
        ? {
            enabled: json.data.drill.enabled,
            maxDepth: json.data.drill.maxDepth,
            getDataUrl: json.data.drill.urlTemplate
              ? createUrlTemplateFunction(json.data.drill.urlTemplate)
              : json.data.apiConfig
                ? createApiFunction(json.data.apiConfig)
                : undefined,
          }
        : undefined,
    },
    camera: json.camera,
    baseLayer: json.baseLayer,
    boundary: json.boundary,
    streamer: json.streamer,
    background: json.background,
    textures: json.textures
      ? {
          map: json.textures.map
            ? convertMapTextureConfig(json.textures.map)
            : undefined,
          normal: json.textures.normal
            ? convertNormalTextureConfig(json.textures.normal)
            : undefined,
        }
      : undefined,
    labels: json.labels,
    highlight: json.highlight,
    flylines: json.flylines
      ? {
          enabled: json.flylines.enabled,
          data: await convertFlylineData(json.flylines),
          style: json.flylines.style,
          byLevel: json.flylines.byLevel
            ? {
                province: json.flylines.byLevel.province?.style,
                city: json.flylines.byLevel.city?.style,
                county: json.flylines.byLevel.county?.style,
              }
            : undefined,
        }
      : undefined,
    particles: json.particles,
  };

  return config;
}

/**
 * 创建 URL 模板函数
 * 模板格式: "/json/{adcode}-{suffix}.json"
 */
function createUrlTemplateFunction(
  template: string,
): (adcode: number, suffix: "city" | "county", depth: number) => string {
  return (adcode, suffix) => {
    return template.replace("{adcode}", String(adcode)).replace("{suffix}", suffix);
  };
}

/**
 * 创建 API 请求函数
 */
function createApiFunction(apiConfig: NonNullable<MapSceneJSONConfig["data"]["apiConfig"]>): (
  adcode: number,
  suffix: "city" | "county",
  depth: number,
) => string {
  return (adcode, suffix) => {
    const { baseUrl, cityEndpoint = "/city", countyEndpoint = "/county" } = apiConfig;
    const endpoint = suffix === "city" ? cityEndpoint : countyEndpoint;
    return `${baseUrl}${endpoint}?adcode=${adcode}`;
  };
}

/**
 * 转换 map 纹理配置
 */
function convertMapTextureConfig(
  json: NonNullable<MapSceneJSONConfig["textures"]>["map"],
): MapSceneConfig["textures"]["map"] {
  if (!json) return undefined;

  switch (json.mode) {
    case "gradient":
      return {
        mode: "gradient",
        resetColor: json.resetColor,
        style: json.gradientStyle,
      };
    case "image":
      return {
        mode: "image",
        resetColor: json.resetColor,
        url: json.imageUrl ?? "",
      };
    case "tile":
      return {
        mode: "tile",
        resetColor: json.resetColor,
        layer: json.tileLayer,
      };
    case "none":
      return { mode: "none" };
  }
}

/**
 * 转换 normal 纹理配置
 */
function convertNormalTextureConfig(
  json: NonNullable<MapSceneJSONConfig["textures"]>["normal"],
): MapSceneConfig["textures"]["normal"] {
  if (!json) return undefined;

  switch (json.mode) {
    case "terrain":
      return {
        mode: "terrain",
        style: json.terrainStyle,
      };
    case "image":
      return {
        mode: "image",
        url: json.imageUrl ?? "",
      };
    case "none":
      return { mode: "none" };
  }
}

/**
 * 转换飞线数据，支持分级配置
 */
async function convertFlylineData(
  flylineConfig: NonNullable<MapSceneJSONConfig["flylines"]>,
): Promise<
  | Array<{ from: [number, number]; to: [number, number] }>
  | ((level: import("../scene/types").LevelState) => Array<{
      from: [number, number];
      to: [number, number];
    }>)
> {
  // 如果有分级配置，返回函数
  if (flylineConfig.byLevel) {
    const levelData: Record<
      string,
      Array<{ from: [number, number]; to: [number, number] }>
    > = {};

    // 加载各层级的数据
    if (flylineConfig.byLevel.province) {
      const provinceConfig = flylineConfig.byLevel.province;
      levelData.province = provinceConfig.dataUrl
        ? await loadFlylinesFromUrl(provinceConfig.dataUrl)
        : provinceConfig.data ?? flylineConfig.data ?? [];
    } else {
      levelData.province = flylineConfig.data ?? [];
    }

    if (flylineConfig.byLevel.city) {
      const cityConfig = flylineConfig.byLevel.city;
      levelData.city = cityConfig.dataUrl
        ? await loadFlylinesFromUrl(cityConfig.dataUrl)
        : cityConfig.data ?? [];
    } else {
      levelData.city = [];
    }

    if (flylineConfig.byLevel.county) {
      const countyConfig = flylineConfig.byLevel.county;
      levelData.county = countyConfig.dataUrl
        ? await loadFlylinesFromUrl(countyConfig.dataUrl)
        : countyConfig.data ?? [];
    } else {
      levelData.county = [];
    }

    // 返回根据层级返回数据的函数
    return (level) => {
      return levelData[level.name] ?? [];
    };
  }

  // 没有分级配置，返回静态数据
  if (flylineConfig.dataUrl) {
    return await loadFlylinesFromUrl(flylineConfig.dataUrl);
  }

  return flylineConfig.data ?? [];
}

/**
 * 从 URL 加载飞线数据
 */
async function loadFlylinesFromUrl(
  url: string,
): Promise<Array<{ from: [number, number]; to: [number, number] }>> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Failed to load flylines from ${url}`);
      return [];
    }
    return await response.json();
  } catch (error) {
    console.error(`Error loading flylines from ${url}:`, error);
    return [];
  }
}
