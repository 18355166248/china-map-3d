import { loadConfig } from ".";
import type { MapSceneConfig } from "../scene/types";
import { readLocalConfig } from "./local";

export async function loadActiveMapConfig(): Promise<MapSceneConfig> {
  return await loadConfig({
    configUrl: "/config/default.json",
    overrides: readLocalConfig() ?? undefined,
  });
}
