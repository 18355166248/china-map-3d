import { useMemo, useRef, useState } from "react";
import {
  Button,
  Collapse,
  ConfigProvider,
  Flex,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Typography,
} from "antd";
import { parseJSONConfig, validateJSONConfig } from "../config";
import { serializeConfig } from "../config/loader";
import type { MapSceneConfig, MapTextureConfig } from "../scene/types";

type MapTextureMode = MapTextureConfig["mode"];

interface MapConfigFormValues {
  background?: {
    rotatingRings?: {
      enabled?: boolean;
      sizeRatio?: number;
    };
  };
  boundary?: {
    enabled?: boolean;
  };
  camera?: {
    heightFactor?: number;
    pitch?: number;
    rotation?: number;
  };
  data?: {
    drill?: {
      enabled?: boolean;
      maxDepth?: number;
    };
    rootUrl?: string;
  };
  debug?: {
    cache?: boolean;
    perf?: boolean;
  };
  flylines?: {
    enabled?: boolean;
  };
  highlight?: {
    enabled?: boolean;
  };
  labels?: {
    enabled?: boolean;
  };
  particles?: {
    enabled?: boolean;
  };
  streamer?: {
    enabled?: boolean;
  };
  textures?: {
    mapMode?: MapTextureMode;
    mapValue?: string;
  };
}

interface MapConfigFormProps {
  initialConfig: MapSceneConfig;
  mode?: "drawer" | "page";
  onCancel?: () => void;
  onSubmit: (config: MapSceneConfig) => void | Promise<void>;
  submitText?: string;
}

function toFormValues(config: MapSceneConfig): MapConfigFormValues {
  const mapTexture = config.textures?.map;
  return {
    background: {
      rotatingRings: {
        enabled: config.background?.rotatingRings?.enabled !== false,
        sizeRatio: config.background?.rotatingRings?.sizeRatio ?? 0.8,
      },
    },
    boundary: {
      enabled: config.boundary?.enabled !== false,
    },
    camera: {
      heightFactor: config.camera?.heightFactor ?? 1,
      pitch: config.camera?.pitch ?? 0,
      rotation: config.camera?.rotation ?? 0,
    },
    data: {
      drill: {
        enabled: config.data.drill?.enabled !== false,
        maxDepth: config.data.drill?.maxDepth ?? 3,
      },
      rootUrl: config.data.rootUrl,
    },
    debug: {
      cache: config.debug?.cache === true,
      perf: config.debug?.perf === true,
    },
    flylines: {
      enabled: config.flylines?.enabled !== false,
    },
    highlight: {
      enabled: config.highlight?.enabled !== false,
    },
    labels: {
      enabled: config.labels?.enabled !== false,
    },
    particles: {
      enabled: config.particles?.enabled !== false,
    },
    streamer: {
      enabled: config.streamer?.enabled !== false,
    },
    textures: {
      mapMode: mapTexture?.mode ?? "none",
      mapValue:
        mapTexture?.mode === "image"
          ? mapTexture.url
          : mapTexture?.mode === "tile"
            ? mapTexture.layer
            : undefined,
    },
  };
}

function buildMapTexture(
  baseConfig: MapSceneConfig,
  mode: MapTextureMode,
  value?: string,
): MapTextureConfig {
  const current = baseConfig.textures?.map;

  switch (mode) {
    case "gradient":
      return current?.mode === "gradient" ? current : { mode: "gradient" };
    case "image":
      return {
        mode: "image",
        resetColor: current?.mode === "image" ? current.resetColor : true,
        url:
          value?.trim() ||
          (current?.mode === "image" && typeof current.url === "string"
            ? current.url
            : ""),
      };
    case "tile":
      return {
        mode: "tile",
        resetColor: current?.mode === "tile" ? current.resetColor : true,
        layer:
          (value as "vec" | "img" | "ter" | undefined) ||
          (current?.mode === "tile" ? current.layer : "img"),
      };
    case "none":
    default:
      return { mode: "none" };
  }
}

function toConfig(
  baseConfig: MapSceneConfig,
  values: MapConfigFormValues,
): MapSceneConfig {
  return {
    ...baseConfig,
    background: {
      ...(baseConfig.background ?? {}),
      rotatingRings: {
        ...(baseConfig.background?.rotatingRings ?? {}),
        enabled: values.background?.rotatingRings?.enabled,
        sizeRatio: values.background?.rotatingRings?.sizeRatio,
      },
    },
    boundary: {
      ...(baseConfig.boundary ?? {}),
      enabled: values.boundary?.enabled,
    },
    camera: {
      ...(baseConfig.camera ?? {}),
      heightFactor: values.camera?.heightFactor,
      pitch: values.camera?.pitch,
      rotation: values.camera?.rotation,
    },
    data: {
      ...baseConfig.data,
      rootUrl: values.data?.rootUrl ?? baseConfig.data.rootUrl,
      drill: {
        ...(baseConfig.data.drill ?? {}),
        enabled: values.data?.drill?.enabled,
        maxDepth: values.data?.drill?.maxDepth,
      },
    },
    debug: {
      ...(baseConfig.debug ?? {}),
      cache: values.debug?.cache,
      perf: values.debug?.perf,
    },
    flylines: {
      ...(baseConfig.flylines ?? { data: [] }),
      enabled: values.flylines?.enabled,
    },
    highlight: {
      ...(baseConfig.highlight ?? {}),
      enabled: values.highlight?.enabled,
    },
    labels: {
      ...(baseConfig.labels ?? {}),
      enabled: values.labels?.enabled,
    },
    particles: {
      ...(baseConfig.particles ?? {}),
      enabled: values.particles?.enabled,
    },
    streamer: {
      ...(baseConfig.streamer ?? {}),
      enabled: values.streamer?.enabled,
    },
    textures: {
      ...(baseConfig.textures ?? {}),
      map: buildMapTexture(
        baseConfig,
        values.textures?.mapMode ?? "none",
        values.textures?.mapValue,
      ),
    },
  };
}

export default function MapConfigForm({
  initialConfig,
  mode = "drawer",
  onCancel,
  onSubmit,
  submitText = "保存并应用",
}: MapConfigFormProps) {
  const [form] = Form.useForm<MapConfigFormValues>();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const initialValues = useMemo(() => toFormValues(initialConfig), [initialConfig]);
  const mapMode = Form.useWatch(["textures", "mapMode"], form) as
    | MapTextureMode
    | undefined;

  const handleExport = () => {
    const json = JSON.stringify(
      serializeConfig(toConfig(initialConfig, form.getFieldsValue(true))),
      null,
      2,
    );
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "map-config.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!validateJSONConfig(json)) {
        throw new Error("配置格式不合法");
      }
      const config = await parseJSONConfig(json);
      form.setFieldsValue(toFormValues(config));
    } catch (error) {
      const message = error instanceof Error ? error.message : "JSON 解析失败";
      window.alert(message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className={`config-panel config-panel--${mode}`}>
      <ConfigProvider
        theme={{
          token: {
            colorBgBase: "#071226",
            colorBgContainer: "rgba(255, 255, 255, 0.05)",
            colorBgElevated: "#0b1628",
            colorBorder: "rgba(91, 220, 255, 0.16)",
            colorPrimary: "#28b6ff",
            colorText: "#eaf7ff",
            colorTextPlaceholder: "rgba(220, 239, 255, 0.42)",
            colorTextSecondary: "rgba(220, 239, 255, 0.72)",
          },
          components: {
            Button: {
              defaultColor: "#eaf7ff",
              defaultBorderColor: "rgba(91, 220, 255, 0.18)",
              defaultBg: "rgba(255, 255, 255, 0.04)",
            },
            Card: {
              colorBgContainer: "rgba(7, 18, 38, 0.58)",
              headerBg: "rgba(7, 18, 38, 0.72)",
            },
            Collapse: {
              contentBg: "rgba(7, 18, 38, 0.58)",
              headerBg: "rgba(7, 18, 38, 0.72)",
            },
            Input: {
              activeBg: "rgba(255, 255, 255, 0.06)",
            },
            InputNumber: {
              activeBg: "rgba(255, 255, 255, 0.06)",
            },
            Select: {
              optionSelectedBg: "rgba(40, 182, 255, 0.18)",
            },
          },
        }}
      >
        <Form<MapConfigFormValues>
          key={JSON.stringify(initialValues)}
          form={form}
          layout="vertical"
          initialValues={initialValues}
          onFinish={(values) => void onSubmit(toConfig(initialConfig, values))}
          requiredMark={false}
          size="middle"
          variant="filled"
        >
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Collapse
              className="config-form-collapse"
              defaultActiveKey={["data", "camera", "texture", "display"]}
              ghost
              size="small"
              items={[
                {
                  key: "data",
                  label: "数据与下钻",
                  children: (
                    <>
                      <Form.Item label="rootUrl" name={["data", "rootUrl"]}>
                        <Input placeholder="/json/china-province.json" />
                      </Form.Item>
                      <Form.Item
                        label="drill.enabled"
                        name={["data", "drill", "enabled"]}
                        valuePropName="checked"
                        extra="关闭后双击下钻会被彻底禁用。"
                      >
                        <Switch checkedChildren="开" unCheckedChildren="关" />
                      </Form.Item>
                      <Form.Item
                        label="drill.maxDepth"
                        name={["data", "drill", "maxDepth"]}
                        extra="1=省，2=市，3=县"
                      >
                        <InputNumber min={1} max={3} style={{ width: "100%" }} />
                      </Form.Item>
                    </>
                  ),
                },
                {
                  key: "camera",
                  label: "镜头",
                  children: (
                    <>
                      <Form.Item label="pitch" name={["camera", "pitch"]}>
                        <InputNumber step={1} style={{ width: "100%" }} />
                      </Form.Item>
                      <Form.Item label="rotation" name={["camera", "rotation"]}>
                        <InputNumber step={1} style={{ width: "100%" }} />
                      </Form.Item>
                      <Form.Item label="heightFactor" name={["camera", "heightFactor"]}>
                        <InputNumber step={0.1} style={{ width: "100%" }} />
                      </Form.Item>
                    </>
                  ),
                },
                {
                  key: "texture",
                  label: "地图纹理",
                  children: (
                    <>
                      <Form.Item label="textures.map.mode" name={["textures", "mapMode"]}>
                        <Select
                          options={[
                            { label: "none", value: "none" },
                            { label: "gradient", value: "gradient" },
                            { label: "tile", value: "tile" },
                            { label: "image", value: "image" },
                          ]}
                        />
                      </Form.Item>
                      {mapMode === "tile" ? (
                        <Form.Item
                          label="tile layer"
                          name={["textures", "mapValue"]}
                          extra="固定图层选项，避免误填导致纹理加载失败。"
                        >
                          <Select
                            options={[
                              { label: "img", value: "img" },
                              { label: "vec", value: "vec" },
                              { label: "ter", value: "ter" },
                            ]}
                          />
                        </Form.Item>
                      ) : null}
                      {mapMode === "image" ? (
                        <Form.Item
                          label="image url"
                          name={["textures", "mapValue"]}
                          extra="image 模式填写图片地址。"
                        >
                          <Input placeholder="https://..." />
                        </Form.Item>
                      ) : null}
                      {mapMode === "none" || mapMode === "gradient" || !mapMode ? (
                        <Typography.Text type="secondary">
                          当前模式不需要附加参数。
                        </Typography.Text>
                      ) : null}
                    </>
                  ),
                },
                {
                  key: "display",
                  label: "显示开关",
                  children: (
                    <Flex vertical gap={12}>
                      <Form.Item
                        label="boundary.enabled"
                        name={["boundary", "enabled"]}
                        valuePropName="checked"
                      >
                        <Switch checkedChildren="开" unCheckedChildren="关" />
                      </Form.Item>
                      <Form.Item
                        label="streamer.enabled"
                        name={["streamer", "enabled"]}
                        valuePropName="checked"
                      >
                        <Switch checkedChildren="开" unCheckedChildren="关" />
                      </Form.Item>
                      <Form.Item
                        label="rotatingRings.enabled"
                        name={["background", "rotatingRings", "enabled"]}
                        valuePropName="checked"
                      >
                        <Switch checkedChildren="开" unCheckedChildren="关" />
                      </Form.Item>
                      <Form.Item
                        label="rotatingRings.sizeRatio"
                        name={["background", "rotatingRings", "sizeRatio"]}
                      >
                        <InputNumber step={0.05} style={{ width: "100%" }} />
                      </Form.Item>
                      <Form.Item
                        label="labels.enabled"
                        name={["labels", "enabled"]}
                        valuePropName="checked"
                      >
                        <Switch checkedChildren="开" unCheckedChildren="关" />
                      </Form.Item>
                      <Form.Item
                        label="highlight.enabled"
                        name={["highlight", "enabled"]}
                        valuePropName="checked"
                      >
                        <Switch checkedChildren="开" unCheckedChildren="关" />
                      </Form.Item>
                      <Form.Item
                        label="flylines.enabled"
                        name={["flylines", "enabled"]}
                        valuePropName="checked"
                      >
                        <Switch checkedChildren="开" unCheckedChildren="关" />
                      </Form.Item>
                      <Form.Item
                        label="particles.enabled"
                        name={["particles", "enabled"]}
                        valuePropName="checked"
                      >
                        <Switch checkedChildren="开" unCheckedChildren="关" />
                      </Form.Item>
                    </Flex>
                  ),
                },
                {
                  key: "debug",
                  label: "调试",
                  children: (
                    <>
                      <Form.Item
                        label="debug.perf"
                        name={["debug", "perf"]}
                        valuePropName="checked"
                      >
                        <Switch checkedChildren="开" unCheckedChildren="关" />
                      </Form.Item>
                      <Form.Item
                        label="debug.cache"
                        name={["debug", "cache"]}
                        valuePropName="checked"
                      >
                        <Switch checkedChildren="开" unCheckedChildren="关" />
                      </Form.Item>
                    </>
                  ),
                },
              ]}
            />

            <div className="config-form-toolbar">
              <Flex justify="space-between" align="center" gap={12} wrap>
                <Typography.Text type="secondary">
                  抽屉和独立路由复用同一套 antd Form。
                </Typography.Text>
                <Space wrap>
                  <Button onClick={handleExport}>导出 JSON</Button>
                  <Button loading={importing} onClick={() => fileRef.current?.click()}>
                    导入 JSON
                  </Button>
                  {onCancel ? <Button onClick={onCancel}>取消</Button> : null}
                  <Button type="primary" htmlType="submit">
                    {submitText}
                  </Button>
                </Space>
              </Flex>
            </div>
          </Space>
        </Form>
      </ConfigProvider>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleImport(file);
          }
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
