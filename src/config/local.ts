import type { MapSceneConfig } from "../scene/types";

export const LOCAL_CONFIG_KEY = "mapSceneConfig";

export function readLocalConfig(): Partial<MapSceneConfig> | null {
  try {
    const raw = localStorage.getItem(LOCAL_CONFIG_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<MapSceneConfig>;
  } catch {
    return null;
  }
}

export function writeLocalConfig(config: Partial<MapSceneConfig>): void {
  try {
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // ignore storage failures
  }
}
