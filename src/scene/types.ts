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
  projected: GeoJSON.FeatureCollection;
  bboxOption: BboxOption;
  bboxProj: [number, number, number, number];
}

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
    grid?: LevelStyleConfig<GridStyle> & {
      rotation?: number;
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
  key: string;
  onLevelChange?(level: LevelState): void | Promise<void>;
  dispose(): void;
}

