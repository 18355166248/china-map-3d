import { useEffect, useRef, useState } from "react";
import { Button } from "antd";
import "./App.css";
import MapConfigDrawer from "./components/MapConfigDrawer";
import { writeLocalConfig } from "./config/local";
import { loadActiveMapConfig } from "./config/runtime";
import { createMapScene } from "./scene/createMapScene";
import type { MapSceneRuntime } from "./scene/createMapScene";
import type { MapSceneConfig } from "./scene/types";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<MapSceneRuntime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [config, setConfig] = useState<MapSceneConfig | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    const handleLoading = (event: Event) => {
      const detail = (event as CustomEvent).detail as { loading?: boolean };
      if (typeof detail?.loading === "boolean") {
        setLoading(detail.loading);
      }
    };

    canvas.addEventListener("map-loading", handleLoading as EventListener);

    void loadActiveMapConfig()
      .then((nextConfig) => {
        if (cancelled) return;
        setConfig(nextConfig);
        return createMapScene(canvas, nextConfig);
      })
      .then((runtime) => {
        if (cancelled || !runtime) {
          runtime?.destroy();
          return;
        }
        runtimeRef.current = runtime;
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to initialize map scene:", err);
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      cancelled = true;
      canvas.removeEventListener("map-loading", handleLoading as EventListener);
      runtimeRef.current?.destroy();
      runtimeRef.current = null;
    };
  }, []);

  const handleApplyConfig = async (nextConfig: MapSceneConfig) => {
    writeLocalConfig(nextConfig);
    setConfig(nextConfig);
    await runtimeRef.current?.updateConfig(nextConfig);
    setConfigOpen(false);
  };

  return (
    <div className="map-shell">
      <canvas
        ref={canvasRef}
        style={{ width: "100vw", height: "100vh", display: "block" }}
      />
      <Button
        type="primary"
        className="map-config-trigger"
        onClick={() => setConfigOpen(true)}
      >
        配置
      </Button>
      {config ? (
        <MapConfigDrawer
          config={config}
          open={configOpen}
          onApply={handleApplyConfig}
          onClose={() => setConfigOpen(false)}
        />
      ) : null}
      {loading ? (
        <div className="map-loading">
          <div className="map-loading__halo" />
          <div className="map-loading__label">loading</div>
        </div>
      ) : null}
      {error ? (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "#ff4444",
            fontSize: "16px",
            padding: "20px",
            background: "rgba(0,0,0,0.8)",
            borderRadius: "8px",
          }}
        >
          loading error: {error}
        </div>
      ) : null}
    </div>
  );
}
