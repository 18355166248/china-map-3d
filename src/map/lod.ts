import * as THREE from "three";

/**
 * LOD 层级配置
 */
export interface LODLevel {
  distance: number; // 相机距离阈值
  visible: boolean; // 是否显示该层级的对象
}

/**
 * LOD 管理器配置
 */
export interface LODConfig {
  // 边界线 LOD：远距离隐藏底部边界线
  boundary?: {
    hideBottom: number; // 距离超过此值时隐藏底部边界线
  };
  // 流光线 LOD：远距离降低动画频率或隐藏
  streamer?: {
    hide: number; // 距离超过此值时隐藏流光
    slowDown: number; // 距离超过此值时减慢动画速度
  };
  // 内阴影 LOD：远距离隐藏内阴影
  innerShadow?: {
    hide: number; // 距离超过此值时隐藏内阴影
  };
}

/**
 * 默认 LOD 配置
 * 距离单位与场景坐标系一致（Mercator 投影后的单位）
 */
export const DEFAULT_LOD_CONFIG: Required<LODConfig> = {
  boundary: {
    hideBottom: 15, // 相机距离 > 15 时隐藏底部边界线
  },
  streamer: {
    hide: 20, // 相机距离 > 20 时隐藏流光
    slowDown: 10, // 相机距离 > 10 时减慢流光速度
  },
  innerShadow: {
    hide: 18, // 相机距离 > 18 时隐藏内阴影
  },
};

/**
 * LOD 管理器：根据相机距离动态调整场景对象的可见性和细节
 */
export class LODManager {
  private config: Required<LODConfig>;

  // 管理的对象引用
  private boundaryBottom?: THREE.Object3D;
  private streamerGroup?: THREE.Object3D;
  private innerShadowMesh?: THREE.Mesh;

  // 当前状态缓存，避免重复设置
  private lastDistance = -1;
  private boundaryBottomVisible = true;
  private streamerVisible = true;
  private innerShadowVisible = true;

  constructor(config?: LODConfig) {
    this.config = { ...DEFAULT_LOD_CONFIG, ...config };
  }

  /**
   * 注册需要 LOD 管理的对象
   */
  register(objects: {
    boundaryBottom?: THREE.Object3D;
    streamerGroup?: THREE.Object3D;
    innerShadowMesh?: THREE.Mesh;
  }): void {
    this.boundaryBottom = objects.boundaryBottom;
    this.streamerGroup = objects.streamerGroup;
    this.innerShadowMesh = objects.innerShadowMesh;
  }

  /**
   * 每帧更新：计算相机距离并应用 LOD 规则
   */
  update(camera: THREE.Camera, center: THREE.Vector3): void {
    const distance = camera.position.distanceTo(center);

    // 距离变化不大时跳过更新（优化性能）
    if (Math.abs(distance - this.lastDistance) < 0.1) return;
    this.lastDistance = distance;

    // 底部边界线 LOD
    if (this.boundaryBottom) {
      const visible = distance <= this.config.boundary.hideBottom;
      if (visible !== this.boundaryBottomVisible) {
        this.boundaryBottom.visible = visible;
        this.boundaryBottomVisible = visible;
      }
    }

    // 流光线 LOD
    if (this.streamerGroup) {
      const visible = distance <= this.config.streamer.hide;
      if (visible !== this.streamerVisible) {
        this.streamerGroup.visible = visible;
        this.streamerVisible = visible;
      }
    }

    // 内阴影 LOD
    if (this.innerShadowMesh) {
      const visible = distance <= this.config.innerShadow.hide;
      if (visible !== this.innerShadowVisible) {
        this.innerShadowMesh.visible = visible;
        this.innerShadowVisible = visible;
      }
    }
  }

  /**
   * 获取当前流光速度因子（用于外部调整动画速度）
   * 返回值：1.0 = 正常速度，0.5 = 减慢一半
   */
  getStreamerSpeedFactor(camera: THREE.Camera, center: THREE.Vector3): number {
    const distance = camera.position.distanceTo(center);
    if (distance > this.config.streamer.slowDown) {
      return 0.5; // 远距离减慢
    }
    return 1.0; // 正常速度
  }

  /**
   * 更新配置
   */
  setConfig(config: LODConfig): void {
    this.config = { ...this.config, ...config };
    this.lastDistance = -1; // 强制下次 update 重新计算
  }
}
