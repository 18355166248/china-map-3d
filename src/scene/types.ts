import type { BboxOption, KVOptions } from "../geo/camera";
import type { BoundaryStyle } from "../map/boundary";
import type { FlylineItem, FlylineStyle } from "../map/flyline";
import type { GridStyle } from "../map/grid";
import type { HighlightStyle } from "../map/highlight";
import type { InnerShadowStyle } from "../map/innerShadow";
import type { ParticleStyle } from "../map/particle";
import type { StreamerStyle } from "../map/streamer";
import type { GradientTextureStyle } from "../map/gradientTexture";
import type { LODConfig } from "../map/lod";
import type { TerrainTextureStyle } from "../map/terrainTexture";
import type { TiandituLayer } from "../map/tileTexture";

export type MapLevelName = "province" | "city" | "county";

export interface LevelState {
  name: MapLevelName;
  depth: number;
  adcode?: number;
  sourceUrl: string;
  cacheKey: string;
  projected: GeoJSON.FeatureCollection;
  bboxOption: BboxOption;
  bboxProj: [number, number, number, number];
}

export type SceneModuleKey =
  | "rotatingRings"
  | "labels"
  | "highlight"
  | "flylines"
  | "particles";

export interface LevelStyleConfig<T> {
  enabled?: boolean;
  style?: T;
  byLevel?: Partial<Record<MapLevelName, Partial<T>>>;
}

export interface MapTextureGradientConfig {
  mode: "gradient";
  style?: GradientTextureStyle;
  resetColor?: boolean;
}

export interface MapTextureImageConfig {
  mode: "image";
  url: string | ((level: LevelState) => string);
  resetColor?: boolean;
}

export interface MapTextureTileConfig {
  mode: "tile";
  layer?: TiandituLayer;
  resetColor?: boolean;
}

export interface MapTextureNoneConfig {
  mode: "none";
}

export type MapTextureConfig =
  | MapTextureGradientConfig
  | MapTextureImageConfig
  | MapTextureTileConfig
  | MapTextureNoneConfig;

export interface NormalTextureTerrainConfig {
  mode: "terrain";
  style?: TerrainTextureStyle;
}

export interface NormalTextureImageConfig {
  mode: "image";
  url: string | ((level: LevelState) => string);
}

export interface NormalTextureNoneConfig {
  mode: "none";
}

export type NormalTextureConfig =
  | NormalTextureTerrainConfig
  | NormalTextureImageConfig
  | NormalTextureNoneConfig;

export interface MapSceneConfig {
  debug?: {
    perf?: boolean;
    cache?: boolean;
  };
  data: {
    rootUrl: string;
    drill?: {
      enabled?: boolean;
      maxDepth?: number;
      getDataUrl?: (
        adcode: number,
        suffix: "city" | "county",
        depth: number,
      ) => string;
    };
  };
  camera?: Pick<KVOptions, "pitch" | "rotation" | "offset" | "heightFactor">;
  baseLayer?: {
    topColor?: string;
    bottomColor?: string;
    innerShadow?: InnerShadowStyle;
    lod?: LODConfig;
    topMaterial?: {
      metalness?: number;
      roughness?: number;
      normalScale?: number | [number, number];
    };
  };
  boundary?: LevelStyleConfig<BoundaryStyle>;
  streamer?: LevelStyleConfig<StreamerStyle>;
  background?: {
    rotatingRings?: {
      enabled?: boolean;
      // Absolute world size. Prefer sizeRatio for auto-fit.
      size?: number;
      // Fraction of current bbox max(width,height). 0-2 recommended.
      sizeRatio?: number;
      outerSpeed?: number;
      innerSpeed?: number;
      color?: number;
      outerOpacity?: number;
      innerOpacity?: number;
      // Back-compat, unused by new implementation
      positionY?: number;
      // Per-level overrides
      byLevel?: Partial<
        Record<
          MapLevelName,
          {
            size?: number;
            sizeRatio?: number;
          }
        >
      >;
    };
  };
  textures?: {
    map?: MapTextureConfig;
    normal?: NormalTextureConfig;
  };
  labels?: {
    enabled?: boolean;
    classNames?: Partial<Record<MapLevelName, string>>;
  };
  highlight?: {
    enabled?: boolean;
    style?: HighlightStyle;
  };
  flylines?: {
    enabled?: boolean;
    data: FlylineItem[] | ((level: LevelState) => FlylineItem[]);
    style?: FlylineStyle;
    byLevel?: Partial<Record<MapLevelName, Partial<FlylineStyle>>>;
  };
  particles?: LevelStyleConfig<ParticleStyle>;
}

export interface MapSceneModule {
  key: SceneModuleKey;
  onLevelChange?(level: LevelState): void | Promise<void>;
  dispose(): void;
}
