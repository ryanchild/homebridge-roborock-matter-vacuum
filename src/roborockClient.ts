import type { CleanModeConfig, ServiceAreaConfig } from './settings';

export interface RoborockStatus {
  state?: number;
  battery?: number;
  errorCode?: number;
  fanPower?: number;
  waterBoxMode?: number;
  inCleaning?: number;
  cleanArea?: number;
  cleanTime?: number;
}

export interface RoborockVacuumClient {
  getStatus(): Promise<RoborockStatus>;
  start(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  dock(): Promise<void>;
  locate(): Promise<void>;
  setCleanMode(mode: CleanModeConfig): Promise<void>;
  cleanAreas(areas: ServiceAreaConfig[]): Promise<void>;
  destroy(): void | Promise<void>;
}
