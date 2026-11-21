import {
  CENTRAL_SPAWN_POINT,
  STATIC_OBSTACLES,
  WORLD_BOUNDS,
  type Booth,
  type ObstacleBox,
} from '../types/expo';

export type ExpoWorldVersion = 'v26' | 'v27_0' | 'v27';

export const DEFAULT_EXPO_WORLD_VERSION: ExpoWorldVersion = 'v26';

export function isGrandHallWorld(worldVersion: ExpoWorldVersion): boolean {
  return worldVersion === 'v27' || worldVersion === 'v27_0';
}

export interface WorldBoundsRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WorldNavigationOptions {
  staticObstacles: ObstacleBox[];
  worldBounds: WorldBoundsRect;
}

export interface V27BoothLayoutSlot {
  boothId: string;
  v4ArchetypeName: string;
  wing: 'north-left' | 'north-right' | 'west-far' | 'west-near' | 'east-far' | 'east-near';
  positionX: number;
  positionZ: number;
  rotationY: number;
}

// ============================================================================
// V27.0 PRESERVED LAYOUT (42m x 38m — Rollback Reference via ?world=v27_0)
// ============================================================================
export const V27_0_HALL_DIMENSIONS = {
  width: 42,
  depth: 38,
  centralAvenueWidth: 8.4,
} as const;

export const V27_0_WORLD_BOUNDS: WorldBoundsRect = {
  minX: -18.4,
  maxX: 18.4,
  minZ: -17.0,
  maxZ: 17.0,
};

export const V27_0_SPAWN_POINT = {
  x: 0,
  z: 12.2,
  rotationY: Math.PI,
} as const;

export const V27_0_BOOTH_LAYOUT_SPECS: readonly V27BoothLayoutSlot[] = [
  { boothId: 'booth-nordic-living', v4ArchetypeName: 'Signature Ring', wing: 'north-left', positionX: -5.4, positionZ: -13.6, rotationY: 0 },
  { boothId: 'booth-lumina-design', v4ArchetypeName: 'Organic Flow', wing: 'north-right', positionX: 5.4, positionZ: -13.6, rotationY: 0 },
  { boothId: 'booth-aether-tech', v4ArchetypeName: 'Grand Portal', wing: 'west-far', positionX: -12.6, positionZ: -5.2, rotationY: Number((Math.PI / 2).toFixed(4)) },
  { boothId: 'booth-ecovita-craft', v4ArchetypeName: 'Gallery Arch', wing: 'west-near', positionX: -12.6, positionZ: 4.8, rotationY: Number((Math.PI / 2).toFixed(4)) },
  { boothId: 'booth-solaris-energy', v4ArchetypeName: 'Wave Pavilion', wing: 'east-far', positionX: 12.6, positionZ: -5.2, rotationY: Number((-Math.PI / 2).toFixed(4)) },
  { boothId: 'booth-kinetix-robotics', v4ArchetypeName: 'Dynamic Frame', wing: 'east-near', positionX: 12.6, positionZ: 4.8, rotationY: Number((-Math.PI / 2).toFixed(4)) },
] as const;

export const V27_0_STATIC_OBSTACLES: ObstacleBox[] = [
  { id: 'v27-wayfinding-left', minX: -7.1, maxX: -6.1, minZ: 13.4, maxZ: 14.3, label: 'Biển chỉ dẫn Trái' },
  { id: 'v27-wayfinding-right', minX: 6.1, maxX: 7.1, minZ: 13.4, maxZ: 14.3, label: 'Biển chỉ dẫn Phải' },
  { id: 'v27-entrance-pylon-left', minX: -9.6, maxX: -8.0, minZ: 16.4, maxZ: 18.2, label: 'Cột cổng Trái' },
  { id: 'v27-entrance-pylon-right', minX: 8.0, maxX: 9.6, minZ: 16.4, maxZ: 18.2, label: 'Cột cổng Phải' },
];

// ============================================================================
// V27.1 EXPANDED GRAND EXPO WORLD (+22% Linear Scale: 51.2m x 46.0m, 1:1 Booths)
// ============================================================================
export const V27_HALL_DIMENSIONS = {
  width: 51.2,
  depth: 46.0,
  centralAvenueWidth: 10.2,
} as const;

export const V27_WORLD_BOUNDS: WorldBoundsRect = {
  minX: -22.8,
  maxX: 22.8,
  minZ: -20.8,
  maxZ: 20.8,
};

/**
 * Avatar spawns at the head of the expanded Central Avenue facing North (-Z, yaw = PI)
 * with all 6 booths immediately recognizable on Desktop without scaling booths/avatar.
 */
export const V27_SPAWN_POINT = {
  x: 0,
  z: 15.2,
  rotationY: Math.PI,
} as const;

/**
 * Single source of truth for V27.1 Expanded U-Shaped Grand Expo Hall booth layout (+22% linear).
 * Booth scale remains 1:1 (7.20m x 5.40m) — ZERO scaling of booths, avatar, NPCs, or products.
 *
 * Clearances:
 * - North Wing (z = -16.8, rotY = 0): x = -6.6 & +6.6 -> 6.00m clear gap between booths (vs 3.60m in V27.0)
 * - West Wing (x = -15.6, rotY = +PI/2): z = -6.4 & +6.0 -> 5.20m clear gap between booths (vs 2.80m in V27.0)
 * - East Wing (x = +15.6, rotY = -PI/2): z = -6.4 & +6.0 -> 5.20m clear gap between booths
 * - Opposite wing front-to-front grand concourse: 24.96m unobstructed (vs 18.96m in V27.0)
 */
export const V27_BOOTH_LAYOUT_SPECS: readonly V27BoothLayoutSlot[] = [
  {
    boothId: 'booth-nordic-living',
    v4ArchetypeName: 'Signature Ring',
    wing: 'north-left',
    positionX: -6.6,
    positionZ: -16.8,
    rotationY: 0,
  },
  {
    boothId: 'booth-lumina-design',
    v4ArchetypeName: 'Organic Flow',
    wing: 'north-right',
    positionX: 6.6,
    positionZ: -16.8,
    rotationY: 0,
  },
  {
    boothId: 'booth-aether-tech',
    v4ArchetypeName: 'Grand Portal',
    wing: 'west-far',
    positionX: -15.6,
    positionZ: -6.4,
    rotationY: Number((Math.PI / 2).toFixed(4)),
  },
  {
    boothId: 'booth-ecovita-craft',
    v4ArchetypeName: 'Gallery Arch',
    wing: 'west-near',
    positionX: -15.6,
    positionZ: 6.0,
    rotationY: Number((Math.PI / 2).toFixed(4)),
  },
  {
    boothId: 'booth-solaris-energy',
    v4ArchetypeName: 'Wave Pavilion',
    wing: 'east-far',
    positionX: 15.6,
    positionZ: -6.4,
    rotationY: Number((-Math.PI / 2).toFixed(4)),
  },
  {
    boothId: 'booth-kinetix-robotics',
    v4ArchetypeName: 'Dynamic Frame',
    wing: 'east-near',
    positionX: 15.6,
    positionZ: 6.0,
    rotationY: Number((-Math.PI / 2).toFixed(4)),
  },
] as const;

const V27_LAYOUT_BY_BOOTH_ID = new Map<string, V27BoothLayoutSlot>(
  V27_BOOTH_LAYOUT_SPECS.map((spec) => [spec.boothId, spec])
);
const V27_0_LAYOUT_BY_BOOTH_ID = new Map<string, V27BoothLayoutSlot>(
  V27_0_BOOTH_LAYOUT_SPECS.map((spec) => [spec.boothId, spec])
);

export const V27_STATIC_OBSTACLES: ObstacleBox[] = [
  { id: 'v27-welcome-desk', minX: -11.4, maxX: -7.8, minZ: 15.1, maxZ: 17.5, label: 'Quầy Welcome / Information' },
  { id: 'v27-directory-kiosk', minX: 7.8, maxX: 11.4, minZ: 15.6, maxZ: 17.2, label: 'Bảng Sơ đồ Triển lãm' },
  { id: 'v27-mini-cafe', minX: -22.2, maxX: -16.2, minZ: 13.0, maxZ: 17.6, label: 'Góc Café Triển lãm' },
  { id: 'v27-rest-lounge', minX: 16.2, maxX: 21.8, minZ: 13.0, maxZ: 17.4, label: 'Khu Nghỉ Chân' },
  { id: 'v27-checkin-stage', minX: -3.2, maxX: 3.2, minZ: -21.4, maxZ: -19.2, label: 'Khu Check-in Grand Expo' },
  { id: 'v27-digital-totem-left', minX: -7.9, maxX: -6.5, minZ: -0.8, maxZ: 0.2, label: 'Màn hình Digital Signage Trái' },
  { id: 'v27-digital-totem-right', minX: 6.5, maxX: 7.9, minZ: -0.8, maxZ: 0.2, label: 'Màn hình Digital Signage Phải' },
  { id: 'v27-landscape-lounge', minX: -19.6, maxX: -14.0, minZ: -17.0, maxZ: -12.6, label: 'Khu Landscape Lounge Tây Bắc' },
  { id: 'v27-interactive-corner', minX: 14.0, maxX: 19.6, minZ: -17.0, maxZ: -12.6, label: 'Khu Interactive Expo Corner Đông Bắc' },
  { id: 'v27-west-mid-oasis', minX: -15.2, maxX: -11.6, minZ: -1.5, maxZ: 1.1, label: 'Cụm Cảnh Quan Giữa Cánh Tây' },
  { id: 'v27-east-mid-oasis', minX: 11.6, maxX: 15.2, minZ: -1.5, maxZ: 1.1, label: 'Cụm Cảnh Quan Giữa Cánh Đông' },
  { id: 'v27-south-west-island', minX: -10.9, maxX: -7.9, minZ: 10.8, maxZ: 12.4, label: 'Đảo Cây Cảnh Quan Tây Nam' },
  { id: 'v27-south-east-island', minX: 7.9, maxX: 10.9, minZ: 10.8, maxZ: 12.4, label: 'Đảo Cây Cảnh Quan Đông Nam' },
  { id: 'v27-entrance-pylon-left', minX: -11.6, maxX: -10.0, minZ: 20.9, maxZ: 22.7, label: 'Cột cổng Trái' },
  { id: 'v27-entrance-pylon-right', minX: 10.0, maxX: 11.6, minZ: 20.9, maxZ: 22.7, label: 'Cột cổng Phải' },
];

export function resolveExpoWorldVersion(options?: {
  search?: string;
  pathname?: string;
  hash?: string;
  envValue?: string;
}): ExpoWorldVersion {
  const rawSearch =
    options?.search ?? (typeof window !== 'undefined' ? window.location.search : '');
  if (rawSearch) {
    const param = new URLSearchParams(rawSearch).get('world')?.trim().toLowerCase();
    if (param === 'v27_0' || param === 'v27.0') {
      return 'v27_0';
    }
    if (param === 'v27' || param === 'v27_1' || param === 'v27.1' || param === 'v27_5' || param === 'grand' || param === 'grand-expo') {
      return 'v27';
    }
    if (param === 'v26' || param === 'legacy' || param === 'park') {
      return 'v26';
    }
  }

  const rawPath =
    options?.pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  const rawHash =
    options?.hash ?? (typeof window !== 'undefined' ? window.location.hash : '');
  if (/^\/v27(?:\/|$)/i.test(rawPath) || /^#\/?v27(?:\/|$)/i.test(rawHash)) {
    return 'v27';
  }

  const rawEnv = (
    options?.envValue ??
    ((import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_EXPO_WORLD_VERSION || '')
  )
    .trim()
    .toLowerCase();
  if (rawEnv === 'v27_0' || rawEnv === 'v27.0') {
    return 'v27_0';
  }
  if (rawEnv === 'v27' || rawEnv === 'v27_1' || rawEnv === 'v27.1' || rawEnv === 'grand' || rawEnv === 'grand-expo') {
    return 'v27';
  }
  if (rawEnv === 'v26' || rawEnv === 'legacy' || rawEnv === 'park') {
    return 'v26';
  }
  return DEFAULT_EXPO_WORLD_VERSION;
}

export function applyWorldLayoutToBooths(
  booths: Booth[],
  worldVersion: ExpoWorldVersion
): Booth[] {
  if (worldVersion === 'v26') {
    return booths;
  }

  const mapById = worldVersion === 'v27_0' ? V27_0_LAYOUT_BY_BOOTH_ID : V27_LAYOUT_BY_BOOTH_ID;
  const specs = worldVersion === 'v27_0' ? V27_0_BOOTH_LAYOUT_SPECS : V27_BOOTH_LAYOUT_SPECS;

  return booths.map((booth, index) => {
    const mapped = mapById.get(booth.id) ?? specs[index];
    if (!mapped) return booth;
    return {
      ...booth,
      positionX: mapped.positionX,
      positionZ: mapped.positionZ,
      rotationY: mapped.rotationY,
    };
  });
}

export function getWorldRuntimeConfig(worldVersion: ExpoWorldVersion): {
  worldVersion: ExpoWorldVersion;
  spawnPoint: { x: number; z: number; rotationY: number };
  storageKey: string;
  navOptions: WorldNavigationOptions;
  overviewTarget: [number, number, number];
  overviewDefaultZoom: number;
  hallDimensions: { width: number; depth: number; centralAvenueWidth: number };
} {
  if (worldVersion === 'v27_0') {
    return {
      worldVersion: 'v27_0',
      spawnPoint: { ...V27_0_SPAWN_POINT },
      storageKey: 'expo_visitor_pos_v27_0',
      navOptions: {
        staticObstacles: V27_0_STATIC_OBSTACLES,
        worldBounds: V27_0_WORLD_BOUNDS,
      },
      overviewTarget: [0, 0.2, -1.2],
      overviewDefaultZoom: 21.5,
      hallDimensions: { ...V27_0_HALL_DIMENSIONS },
    };
  }

  if (worldVersion === 'v27') {
    return {
      worldVersion: 'v27',
      spawnPoint: { ...V27_SPAWN_POINT },
      storageKey: 'expo_visitor_pos_v27_1',
      navOptions: {
        staticObstacles: V27_STATIC_OBSTACLES,
        worldBounds: V27_WORLD_BOUNDS,
      },
      overviewTarget: [0, 0.2, -1.2],
      overviewDefaultZoom: 18.0,
      hallDimensions: { ...V27_HALL_DIMENSIONS },
    };
  }

  return {
    worldVersion: 'v26',
    spawnPoint: { ...CENTRAL_SPAWN_POINT },
    storageKey: 'expo_visitor_pos',
    navOptions: {
      staticObstacles: STATIC_OBSTACLES,
      worldBounds: WORLD_BOUNDS,
    },
    overviewTarget: [0, 0, 0],
    overviewDefaultZoom: 24,
    hallDimensions: { width: 48, depth: 48, centralAvenueWidth: 8 },
  };
}
