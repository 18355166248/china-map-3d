import { useEffect, useRef, useState } from "react";
import "./App.css";
import { createMapScene } from "./scene/createMapScene";
import { loadConfig } from "./config";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    // 监听钻取时的内部加载态
    const handleLoading = (e: Event) => {
      const detail = (e as CustomEvent).detail as { loading?: boolean };
      if (typeof detail?.loading === "boolean") setLoading(detail.loading);
    };
    canvas.addEventListener("map-loading", handleLoading as EventListener);

    // 从 JSON 文件加载配置
    loadConfig({
      configUrl: "/config/default.json",
    })
      .then((config) => {
        if (cancelled) return;
        return createMapScene(canvas, config);
      })
      .then((runtime) => {
        if (cancelled || !runtime) {
          runtime?.destroy();
          return;
        }
        setLoading(false);
        cleanup = () => runtime.destroy();
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
      cleanup?.();
    };
  }, []);

  return (
    // 使用带有相对定位的容器，承载画布与炫酷 loading 叠层
    <div className="map-shell">
      <canvas
        ref={canvasRef}
        style={{ width: "100vw", height: "100vh", display: "block" }}
      />
      {loading && (
        // 炫酷圆环 + 呼吸光晕，统一文案为 "loading"
        <div className="map-loading">
          <div className="map-loading__halo" />
          <div className="map-loading__label">loading</div>
        </div>
      )}
      {error && (
        // 保留错误提示的覆盖层
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
      )}
    </div>
  );
}
