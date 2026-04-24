import { useEffect, useRef, useState } from "react";
import { Alert, Button, Spin } from "antd";
import { useNavigate } from "react-router-dom";
import MapConfigForm from "../components/MapConfigForm";
import { writeLocalConfig } from "../config/local";
import { loadActiveMapConfig } from "../config/runtime";
import type { MapSceneConfig } from "../scene/types";

export default function ConfigPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<MapSceneConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    void loadActiveMapConfig()
      .then((nextConfig) => {
        if (cancelledRef.current) return;
        setConfig(nextConfig);
      })
      .catch((err) => {
        if (cancelledRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const handleApply = async (nextConfig: MapSceneConfig) => {
    writeLocalConfig(nextConfig);
    navigate("/");
  };

  return (
    <div className="config-shell">
      <div className="config-route-header">
        <div>
          <h2 className="config-title">地图配置</h2>
          <p className="config-route-subtitle">
            独立路由页和地图内抽屉复用同一套 antd Form。
          </p>
        </div>
        <Button onClick={() => navigate("/")}>返回地图</Button>
      </div>

      {error ? (
        <Alert
          message="配置加载失败"
          description={error}
          type="error"
          showIcon
        />
      ) : null}

      {!config && !error ? (
        <div className="config-route-loading">
          <Spin size="large" />
        </div>
      ) : null}

      {config ? (
        <MapConfigForm
          key={JSON.stringify(config)}
          initialConfig={config}
          mode="page"
          onSubmit={handleApply}
          onCancel={() => navigate("/")}
          submitText="保存并返回地图"
        />
      ) : null}
    </div>
  );
}
