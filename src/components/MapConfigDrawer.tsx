import { Drawer } from "antd";
import type { MapSceneConfig } from "../scene/types";
import MapConfigForm from "./MapConfigForm";

interface MapConfigDrawerProps {
  config: MapSceneConfig;
  onApply: (config: MapSceneConfig) => void | Promise<void>;
  onClose: () => void;
  open: boolean;
}

export default function MapConfigDrawer({
  config,
  onApply,
  onClose,
  open,
}: MapConfigDrawerProps) {
  return (
    <Drawer
      title="地图配置"
      placement="right"
      width={560}
      open={open}
      onClose={onClose}
      getContainer={false}
      destroyOnHidden
      mask={{ enabled: true, blur: false, closable: true }}
      rootStyle={{ position: "absolute" }}
      styles={{
        header: {
          background: "rgba(7, 18, 38, 0.92)",
          color: "#e6f4ff",
          borderBottom: "1px solid rgba(91, 220, 255, 0.14)",
        },
        body: {
          padding: 16,
          background:
            "linear-gradient(180deg, rgba(8, 17, 31, 0.98), rgba(4, 9, 18, 0.98))",
        },
        mask: {
          background: "rgba(2, 8, 18, 0.24)",
        },
      }}
    >
      <MapConfigForm
        key={JSON.stringify(config)}
        initialConfig={config}
        mode="drawer"
        onSubmit={onApply}
        onCancel={onClose}
      />
    </Drawer>
  );
}
