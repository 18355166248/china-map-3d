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
      cleanup?.();
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ width: "100vw", height: "100vh", display: "block" }}
      />
      {loading && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "#fff",
            fontSize: "18px",
          }}
        >
          加载中...
        </div>
      )}
      {error && (
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
          加载失败: {error}
        </div>
      )}
    </>
  );
}
