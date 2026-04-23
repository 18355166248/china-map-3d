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

// 提示文本行，占满两列，统一样式
function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: "1 / span 2", fontSize: 12, opacity: 0.8 }}>{children}</div>
  );
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
    <div className="config-shell">
      <h2 className="config-title">地图配置</h2>

      <section className="config-section">
        <h3>数据源 data.drill</h3>
        <div className="config-grid">
          <label>rootUrl</label>
          <input
            className="config-input"
            value={cfg.data?.rootUrl ?? ""}
            onChange={(e) => u("data", { ...(cfg.data ?? {}), rootUrl: e.target.value })}
          />
          <div className="config-hint">根层 GeoJSON 路径（省级视图数据来源）。</div>

          <label>drill.enabled</label>
          <input
            className="config-checkbox"
            type="checkbox"
            checked={cfg.data?.drill?.enabled !== false}
            onChange={(e) =>
              u("data", { ...(cfg.data ?? {}), drill: { ...(cfg.data?.drill ?? {}), enabled: e.target.checked } })
            }
          />
          <div className="config-hint">开启后支持双击下钻（进入市/县），右键返回上一级。</div>

          <label>drill.maxDepth</label>
          <input
            className="config-input"
            type="number"
            min={1}
            max={3}
            value={cfg.data?.drill?.maxDepth ?? 3}
            onChange={(e) =>
              u("data", { ...(cfg.data ?? {}), drill: { ...(cfg.data?.drill ?? {}), maxDepth: Number(e.target.value) } })
            }
          />
          <div className="config-hint">最大钻取深度：1=省，2=市，3=县。</div>
        </div>
      </section>

      <section className="config-section">
        <h3>camera</h3>
        <div className="config-grid">
          <label>pitch</label>
          <input
            className="config-input"
            type="number"
            value={cfg.camera?.pitch ?? 0}
            onChange={(e) => u("camera", { ...(cfg.camera ?? {}), pitch: Number(e.target.value) })}
          />
          <div className="config-hint">俯仰角（°），越大越倾斜；建议 0~30。</div>

          <label>rotation</label>
          <input
            className="config-input"
            type="number"
            value={cfg.camera?.rotation ?? 0}
            onChange={(e) => u("camera", { ...(cfg.camera ?? {}), rotation: Number(e.target.value) })}
          />
          <div className="config-hint">水平旋转角（°），顺时针为正。</div>

          <label>heightFactor</label>
          <input
            className="config-input"
            type="number"
            step={0.1}
            value={cfg.camera?.heightFactor ?? 1}
            onChange={(e) => u("camera", { ...(cfg.camera ?? {}), heightFactor: Number(e.target.value) })}
          />
          <div className="config-hint">地图高度缩放，影响立体感（1 为默认高度）。</div>
        </div>
      </section>

      <section className="config-section">
        <h3>textures.map</h3>
        <div className="config-grid">
          <label>mode</label>
          <select
            className="config-select"
            value={(cfg.textures?.map as any)?.mode ?? "none"}
            onChange={(e) => u("textures", { ...(cfg.textures ?? {}), map: { mode: e.target.value as any } })}
          >
            <option value="none">none</option>
            <option value="gradient">gradient</option>
            <option value="tile">tile</option>
            <option value="image">image</option>
          </select>
          <div className="config-hint">选择地图顶面纹理来源：gradient 渐变、tile 瓦片、image 图片、none 关闭。</div>

          <label>image/url 或 tile/layer</label>
          <input
            className="config-input"
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
          <div className="config-hint">当 mode=image 时填图片 URL；mode=tile 时填图层名（如 img、cva 等）。</div>
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
          <Hint>是否显示边界线（省/市/县轮廓）。</Hint>

          <label>streamer.enabled</label>
          <input
            type="checkbox"
            checked={cfg.streamer?.enabled !== false}
            onChange={(e) => u("streamer", { ...(cfg.streamer ?? {}), enabled: e.target.checked })}
          />
          <Hint>是否显示流光线（沿边界流动的高亮线）。</Hint>
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
          <Hint>是否显示背景旋转环装饰。</Hint>

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
          <Hint>大小比例：相对于当前地图 bbox 最大边的比例（0~2 推荐）。</Hint>
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
          <Hint>是否显示行政名称标注。</Hint>

          <label>highlight.enabled</label>
          <input
            type="checkbox"
            checked={cfg.highlight?.enabled !== false}
            onChange={(e) => u("highlight", { ...(cfg.highlight ?? {}), enabled: e.target.checked })}
          />
          <Hint>是否启用鼠标悬停高亮（loading 期间自动暂停）。</Hint>

          <label>flylines.enabled</label>
          <input
            type="checkbox"
            checked={cfg.flylines?.enabled !== false}
            onChange={(e) => u("flylines", { ...(cfg.flylines ?? {}), enabled: e.target.checked } as any)}
          />
          <Hint>是否显示飞线（加载中隐藏；无数据时保持隐藏，有数据后自动显示）。</Hint>

          <label>particles.enabled</label>
          <input
            type="checkbox"
            checked={cfg.particles?.enabled !== false}
            onChange={(e) => u("particles", { ...(cfg.particles ?? {}), enabled: e.target.checked })}
          />
          <Hint>是否显示上升粒子（根据当前地图尺寸等比缩放，加载中隐藏）。</Hint>
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
          <Hint>输出性能日志（构建/贴图/重建耗时等）。</Hint>

          <label>cache</label>
          <input
            type="checkbox"
            checked={cfg.debug?.cache === true}
            onChange={(e) => u("debug", { ...(cfg.debug ?? {}), cache: e.target.checked })}
          />
          <Hint>输出缓存日志（几何/纹理缓存命中情况）。</Hint>
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
