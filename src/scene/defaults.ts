import type { MapSceneConfig } from "./types";

export const DEFAULT_MAP_SCENE_CONFIG: MapSceneConfig = {
  data: {
    rootUrl: "/json/china-province.json",
    drill: {
      enabled: true,
      maxDepth: 3,
    },
  },
  camera: {
    pitch: 10,
    rotation: 4,
  },
  baseLayer: {
    topColor: "#4a8dc7",
    bottomColor: "#0a1929",
    innerShadow: {
      debug: false,
    },
    topMaterial: {
      metalness: 0.1,
      roughness: 0.7,
      normalScale: 1.5,
    },
  },
  boundary: {
    enabled: true,
    style: {
      color: "#4fc3f7",
      linewidth: 1,
      opacity: 0.9,
    },
  },
  streamer: {
    enabled: true,
    style: {
      color: "#00ffff",
      linewidth: 2,
      speed: 0.3,
      minLength: 2000,
      optimized: true,
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
  background: {
    grid: {
      enabled: true,
      rotation: 4,
      style: {},
    },
  },
  textures: {
    map: {
      mode: "gradient",
      resetColor: true,
      style: {
        type: "radial",
        colors: ["#3a7db0", "#2a6496", "#1a4d7a"],
        resolution: 2000,
      },
    },
    normal: {
      mode: "terrain",
      style: {
        type: "tile",
        tileUrl:
          "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
        normalScale: 1,
        resolution: 2048,
      },
    },
  },
  labels: {
    enabled: true,
  },
  highlight: {
    enabled: true,
    style: {},
  },
  flylines: {
    enabled: true,
    data: [
      { from: [116.4, 39.9], to: [121.47, 31.23] },
      { from: [121.47, 31.23], to: [113.26, 23.13] },
      { from: [113.26, 23.13], to: [104.07, 30.67] },
      { from: [104.07, 30.67], to: [116.4, 39.9] },
    ],
    style: {
      color: "#00d4ff",
      speed: 0.6,
    },
  },
  particles: {
    enabled: true,
    style: {
      color: "#00d4ff",
      count: 150,
      sizeMin: 300,
      sizeMax: 500,
    },
  },
};

