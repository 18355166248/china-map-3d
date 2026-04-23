import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { serializeConfig } from "../config/loader";
import type { MapSceneConfig, MapTextureConfig, NormalTextureConfig } from "../scene/types";

// 轻量表单：覆盖核心项 + data.drill + debug；支持本地持久化与导入/导出
// WHY: 先提供可用骨架，后续再细化样式与所有字段

const LS_KEY = "mapSceneConfig";

function readLocal(): MapSceneConfig | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MapSceneConfig;
  } catch {
    return null;
  }
}

export default function ConfigPage() {
  const nav = useNavigate();
  const [cfg, setCfg] = useState<MapSceneConfig>(() =>
    readLocal() ?? {
      data: { rootUrl: "/json/china-province.json", drill: { enabled: true, maxDepth: 3 } },
      textures: {},
    } as any,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  // 简化 setter
  const u = <K extends keyof MapSceneConfig>(k: K, v: MapSceneConfig[K]) =>
    setCfg((prev) => ({ ...prev, [k]: v }));

  // 导出 JSON（使用 serializeConfig 以便与运行时结构对齐）
  const onExport = () => {
    const json = JSON.stringify(serializeConfig(cfg), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "map-config.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // 导入 JSON
  const onImport = async (file: File) => {
    const text = await file.text();
    try {
      const json = JSON.parse(text);
      // 直接采用 JSON；如需严格校验可在后续接入 validate/parse
      setCfg(json as MapSceneConfig);
    } catch {
      alert("JSON 解析失败");
    }
  };

  // 保存并跳转到地图页
  const onApply = () => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(cfg));
    } catch {}
    nav("/");
  };

  return (
    <div style={{ padding: 16, color: "#e6f4ff", fontFamily: "-apple-system,Segoe UI,Roboto" }}>
      <h2 style={{ margin: "8px 0 16px" }}>地图配置</h2>

      <section style={{ marginBottom: 16 }}>
        <h3>数据源 data.drill</h3>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, alignItems: "center" }}>
          <label>rootUrl</label>
          <input
            value={cfg.data?.rootUrl ?? ""}
            onChange={(e) => u("data", { ...(cfg.data ?? {}), rootUrl: e.target.value })}
            style={{ width: "100%" }}
          />
          <label>drill.enabled</label>
          <input
            type="checkbox"
            checked={cfg.data?.drill?.enabled !== false}
            onChange={(e) =>
              u("data", { ...(cfg.data ?? {}), drill: { ...(cfg.data?.drill ?? {}), enabled: e.target.checked } })
            }
          />
          <label>drill.maxDepth</label>
          <input
            type="number"
            min={1}
            max={3}
            value={cfg.data?.drill?.maxDepth ?? 3}
            onChange={(e) =>
              u("data", { ...(cfg.data ?? {}), drill: { ...(cfg.data?.drill ?? {}), maxDepth: Number(e.target.value) } })
            }
          />
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <h3>camera</h3>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, alignItems: "center" }}>
          <label>pitch</label>
          <input
            type="number"
            value={cfg.camera?.pitch ?? 0}
            onChange={(e) => u("camera", { ...(cfg.camera ?? {}), pitch: Number(e.target.value) })}
          />
          <label>rotation</label>
          <input
            type="number"
            value={cfg.camera?.rotation ?? 0}
            onChange={(e) => u("camera", { ...(cfg.camera ?? {}), rotation: Number(e.target.value) })}
          />
          <label>heightFactor</label>
          <input
            type="number"
            step={0.1}
            value={cfg.camera?.heightFactor ?? 1}
            onChange={(e) => u("camera", { ...(cfg.camera ?? {}), heightFactor: Number(e.target.value) })}
          />
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <h3>textures.map</h3>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, alignItems: "center" }}>
          <label>mode</label>
          <select
            value={(cfg.textures?.map as any)?.mode ?? "none"}
            onChange={(e) => u("textures", { ...(cfg.textures ?? {}), map: { mode: e.target.value as any } })}
          >
            <option value="none">none</option>
            <option value="gradient">gradient</option>
            <option value="tile">tile</option>
            <option value="image">image</option>
          </select>
          <label>image/url 或 tile/layer</label>
          <input
            value={(() => {
              const m = cfg.textures?.map as any;
              if (!m) return "";
              if (m.mode === "image") return m.url ?? "";
              if (m.mode === "tile") return m.layer ?? "";
              return "";
            })()}
            onChange={(e) => {
              const m = cfg.textures?.map as any;
              const v = e.target.value;
              if (!m) return u("textures", { ...(cfg.textures ?? {}), map: { mode: "image", url: v } as any });
              if (m.mode === "image") u("textures", { ...(cfg.textures ?? {}), map: { ...m, url: v } });
              else if (m.mode === "tile") u("textures", { ...(cfg.textures ?? {}), map: { ...m, layer: v } });
            }}
          />
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <h3>boundary / streamer（开关）</h3>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, alignItems: "center" }}>
          <label>boundary.enabled</label>
          <input
            type="checkbox"
            checked={cfg.boundary?.enabled !== false}
            onChange={(e) => u("boundary", { ...(cfg.boundary ?? {}), enabled: e.target.checked })}
          />
          <label>streamer.enabled</label>
          <input
            type="checkbox"
            checked={cfg.streamer?.enabled !== false}
            onChange={(e) => u("streamer", { ...(cfg.streamer ?? {}), enabled: e.target.checked })}
          />
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <h3>背景旋转环 background.rotatingRings</h3>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, alignItems: "center" }}>
          <label>enabled</label>
          <input
            type="checkbox"
            checked={cfg.background?.rotatingRings?.enabled !== false}
            onChange={(e) =>
              u("background", {
                ...(cfg.background ?? {}),
                rotatingRings: { ...(cfg.background?.rotatingRings ?? {}), enabled: e.target.checked },
              })
            }
          />
          <label>sizeRatio</label>
          <input
            type="number"
            step={0.05}
            value={cfg.background?.rotatingRings?.sizeRatio ?? 0.8}
            onChange={(e) =>
              u("background", {
                ...(cfg.background ?? {}),
                rotatingRings: { ...(cfg.background?.rotatingRings ?? {}), sizeRatio: Number(e.target.value) },
              })
            }
          />
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <h3>labels / highlight / flylines / particles（开关）</h3>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, alignItems: "center" }}>
          <label>labels.enabled</label>
          <input
            type="checkbox"
            checked={cfg.labels?.enabled !== false}
            onChange={(e) => u("labels", { ...(cfg.labels ?? {}), enabled: e.target.checked })}
          />
          <label>highlight.enabled</label>
          <input
            type="checkbox"
            checked={cfg.highlight?.enabled !== false}
            onChange={(e) => u("highlight", { ...(cfg.highlight ?? {}), enabled: e.target.checked })}
          />
          <label>flylines.enabled</label>
          <input
            type="checkbox"
            checked={cfg.flylines?.enabled !== false}
            onChange={(e) => u("flylines", { ...(cfg.flylines ?? {}), enabled: e.target.checked } as any)}
          />
          <label>particles.enabled</label>
          <input
            type="checkbox"
            checked={cfg.particles?.enabled !== false}
            onChange={(e) => u("particles", { ...(cfg.particles ?? {}), enabled: e.target.checked })}
          />
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <h3>debug</h3>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, alignItems: "center" }}>
          <label>perf</label>
          <input
            type="checkbox"
            checked={cfg.debug?.perf === true}
            onChange={(e) => u("debug", { ...(cfg.debug ?? {}), perf: e.target.checked })}
          />
          <label>cache</label>
          <input
            type="checkbox"
            checked={cfg.debug?.cache === true}
            onChange={(e) => u("debug", { ...(cfg.debug ?? {}), cache: e.target.checked })}
          />
        </div>
      </section>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onApply}>保存并应用</button>
        <button onClick={onExport}>导出 JSON</button>
        <button onClick={() => fileRef.current?.click()}>导入 JSON</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            e.currentTarget.value = "";
          }}
        />
        <button onClick={() => nav("/")}>返回地图</button>
      </div>
    </div>
  );
}
