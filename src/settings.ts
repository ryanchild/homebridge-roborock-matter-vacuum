import type { PlatformConfig } from 'homebridge';

export const PLATFORM_NAME = 'RoborockMatter';
export const PLUGIN_NAME = 'homebridge-roborock-matter-vacuum';

export type CleanModeTag = 'vacuum' | 'mop' | 'vacuumAndMop';
export type CleanModeIntensity =
  | 'auto'
  | 'quick'
  | 'quiet'
  | 'lowNoise'
  | 'lowEnergy'
  | 'min'
  | 'max'
  | 'night'
  | 'day'
  | 'deepClean'
  | 'vacation';
export type AreaKind = 'room' | 'zone';

export interface RoborockMatterConfig extends PlatformConfig {
  platform: typeof PLATFORM_NAME;
  name?: string;
  username?: string;
  password?: string;
  region?: RoborockCloudRegion;
  baseUrl?: string;
  verificationCode?: string;
  language?: string;
  skipDevices?: string[];
  pollingIntervalSeconds?: number;
  vacuums?: RoborockVacuumConfig[];
}

export interface RoborockVacuumConfig {
  name: string;
  duid?: string;
  id?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  pollingIntervalSeconds?: number;
  cleanModes?: CleanModeConfig[];
  enableMoppingModes?: boolean;
  defaultCleanMode?: number;
  segmentCleanPayload?: SegmentCleanPayload;
  serviceAreas?: ServiceAreaConfig[];
}

export type SegmentCleanPayload = 'segmentsObject' | 'segmentIds';
export type RoborockCloudRegion = 'us' | 'eu' | 'cn' | 'sg';

export interface CleanModeConfig {
  mode: number;
  label: string;
  tag: CleanModeTag;
  intensity?: CleanModeIntensity;
  fanPower?: number;
  waterBoxMode?: number;
}

export interface ServiceAreaConfig {
  areaId: number;
  label: string;
  kind?: AreaKind;
  segmentId?: number;
  coordinates?: [number, number, number, number];
  repeat?: number;
}

export const DEFAULT_POLLING_INTERVAL_SECONDS = 20;

export const DEFAULT_CLEAN_MODES: CleanModeConfig[] = [
  {
    mode: 0,
    label: 'Balanced',
    tag: 'vacuum',
    intensity: 'auto',
    fanPower: 102,
  },
  {
    mode: 1,
    label: 'Quiet',
    tag: 'vacuum',
    intensity: 'quiet',
    fanPower: 101,
  },
  {
    mode: 2,
    label: 'Turbo',
    tag: 'vacuum',
    intensity: 'quick',
    fanPower: 103,
  },
  {
    mode: 3,
    label: 'Max',
    tag: 'vacuum',
    intensity: 'max',
    fanPower: 104,
  },
];

export const DEFAULT_MOPPING_CLEAN_MODES: CleanModeConfig[] = [
  {
    mode: 4,
    label: 'Light Mop',
    tag: 'vacuumAndMop',
    intensity: 'lowEnergy',
    fanPower: 102,
    waterBoxMode: 201,
  },
  {
    mode: 5,
    label: 'Medium Mop',
    tag: 'vacuumAndMop',
    intensity: 'auto',
    fanPower: 102,
    waterBoxMode: 202,
  },
  {
    mode: 6,
    label: 'High Mop',
    tag: 'vacuumAndMop',
    intensity: 'max',
    fanPower: 102,
    waterBoxMode: 203,
  },
];
