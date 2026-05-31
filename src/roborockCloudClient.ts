import type { Logger } from 'homebridge';
import { Roborock, type RoborockCloudDevice } from 'homebridge-roborock-vacuum2/roborockLib/roborockAPI.js';
import type { RoborockStatus, RoborockVacuumClient } from './roborockClient';
import type {
  CleanModeConfig,
  RoborockCloudRegion,
  RoborockMatterConfig,
  RoborockVacuumConfig,
  ServiceAreaConfig,
} from './settings';

type RawRoborockStatus = {
  state?: number;
  battery?: number;
  error_code?: number;
  fan_power?: number;
  water_box_mode?: number;
  in_cleaning?: number;
  clean_area?: number;
  clean_time?: number;
};

const ROBOROCK_BASE_URLS: Record<RoborockCloudRegion, string> = {
  us: 'usiot.roborock.com',
  eu: 'euiot.roborock.com',
  cn: 'cniot.roborock.com',
  sg: 'api.roborock.com',
};

const ALLOWED_ROBOROCK_BASE_URLS = new Set(Object.values(ROBOROCK_BASE_URLS));

type LegacyCloudOverride = RoborockVacuumConfig & {
  connection?: string;
};

type RoborockStateAdapter = Roborock & {
  roomIDs: Record<string, string>;
  rr_mqtt_connector: {
    isConnected(): boolean;
  };
  messageQueueHandler: {
    sendRequest(duid: string, method: string, params: unknown[]): Promise<unknown>;
  };
  getObjectAsync(id: string): Promise<unknown>;
  initializeDeviceUpdates(): Promise<void>;
  isRemoteDevice(duid: string): Promise<boolean>;
  manageDeviceIntervals(duid: string): Promise<boolean>;
  startMainUpdateInterval(duid: string, online: boolean): void;
  startMapUpdater(duid: string): void;
  stopMapUpdater(duid: string): void;
  localConnector: {
    getLocalDevices(): Promise<Record<string, string>>;
    createClient(duid: string, ip: string): Promise<void>;
    isConnected(duid: string): boolean;
  };
};

export type CloudVacuumRegistration = {
  config: RoborockVacuumConfig;
  client: RoborockCloudVacuumClient;
};

export class RoborockCloudConnection {
  private roborock?: Roborock;

  constructor(
    private readonly config: RoborockMatterConfig,
    private readonly log: Logger,
    private readonly storagePath: string,
  ) {}

  public async start(): Promise<void> {
    if (this.roborock?.isInited()) {
      return;
    }

    if (!this.config.username) {
      throw new Error('Roborock username is required for cloud connection.');
    }

    this.roborock = new Roborock({
      username: this.config.username,
      password: this.config.password,
      baseURL: this.resolveBaseUrl(),
      language: this.config.language ?? 'en',
      updateInterval: Math.max(this.config.pollingIntervalSeconds ?? 60, 60),
      storagePath: this.storagePath,
      skipDevices: this.config.skipDevices,
      log: this.log,
    });
    this.roborock.setDeviceNotify(() => undefined);
    this.configureCloudOnlyAdapter();

    await this.startRoborockService();
    await this.waitForMqttConnection();

    if (!this.roborock.isInited() && this.roborock.authState?.twoFactorRequired && this.config.verificationCode) {
      this.log.info('Completing Roborock email verification with the configured one-time code.');
      await this.roborock.verifyTwoFactorCode(this.config.verificationCode);
      await this.startRoborockService();
      await this.waitForMqttConnection();
    }

    if (!this.roborock.isInited()) {
      if (this.roborock.authState?.twoFactorRequired && !this.config.verificationCode) {
        await this.requestVerificationEmail();
      }

      const authMessage = this.roborock.authState?.twoFactorRequired
        ? ' Roborock requires email verification; add the one-time verificationCode temporarily and restart Homebridge.'
        : '';
      const passwordMessage = this.config.password
        ? ''
        : ' No cached Roborock session was available; add the password temporarily, restart Homebridge, then remove it after login succeeds.';
      throw new Error(`Roborock cloud connection did not finish initializing.${authMessage}${passwordMessage}`);
    }

    if (this.config.verificationCode) {
      this.log.warn('Roborock verification succeeded or a cached session was available. Remove verificationCode from the plugin config; it is a one-time secret.');
    }
  }

  public async getVacuumRegistrations(): Promise<CloudVacuumRegistration[]> {
    if (!this.roborock?.isInited()) {
      return [];
    }

    const registrations: CloudVacuumRegistration[] = [];

    for (const device of this.roborock.getVacuumList().filter((candidate) => this.isSupportedVacuum(candidate))) {
      const override = this.findOverride(device);
      const vacuumConfig = await this.toVacuumConfig(device, override);

      registrations.push({
        config: vacuumConfig,
        client: new RoborockCloudVacuumClient(this.roborock!, vacuumConfig, this.log),
      });
    }

    return registrations;
  }

  public async destroy(): Promise<void> {
    if (this.roborock) {
      await this.roborock.stopService();
      this.roborock = undefined;
    }
  }

  private async startRoborockService(): Promise<void> {
    if (!this.roborock) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const settle = (callback: () => void) => {
        if (settled) {
          return;
        }

        settled = true;
        clearInterval(authPoll);
        clearTimeout(timeout);
        callback();
      };

      const authPoll = setInterval(() => {
        if (this.roborock?.isInited() || this.roborock?.authState?.twoFactorRequired) {
          settle(resolve);
        }
      }, 500);

      const timeout = setTimeout(() => {
        settle(() => reject(new Error('Roborock cloud initialization timed out.')));
      }, 60_000);

      this.roborock!.startService(() => settle(resolve)).catch((error) => {
        settle(() => reject(error));
      });
    });
  }

  private async requestVerificationEmail(): Promise<void> {
    if (!this.roborock) {
      return;
    }

    try {
      await this.roborock.sendTwoFactorEmail();
      this.log.warn('Roborock requested email verification. A verification email was requested; add the one-time code as verificationCode and restart Homebridge.');
    } catch (error) {
      this.log.warn(`Roborock requested email verification, but the verification email could not be requested automatically. ${String(error)}`);
    }
  }

  private configureCloudOnlyAdapter(): void {
    if (!this.roborock) {
      return;
    }

    const adapter = this.roborock as RoborockStateAdapter;
    adapter.getObjectAsync = async () => ({});
    adapter.initializeDeviceUpdates = async () => undefined;
    adapter.isRemoteDevice = async () => true;
    adapter.manageDeviceIntervals = async () => true;
    adapter.startMainUpdateInterval = () => undefined;
    adapter.startMapUpdater = () => undefined;
    adapter.stopMapUpdater = () => undefined;
    adapter.localConnector.getLocalDevices = async () => ({});
    adapter.localConnector.createClient = async () => undefined;
    adapter.localConnector.isConnected = () => false;
  }

  private isSupportedVacuum(device: RoborockCloudDevice): boolean {
    const model = this.resolveModel(device);
    return Boolean(device.duid) && Boolean(this.roborock?.isSupportedVacuumModel(model));
  }

  private findOverride(device: RoborockCloudDevice): RoborockVacuumConfig | undefined {
    const vacuums = (this.config.vacuums ?? []) as LegacyCloudOverride[];
    const candidates = new Set([
      device.duid,
      device.sn,
      device.name,
    ].filter((value): value is string => typeof value === 'string' && value.length > 0));

    return vacuums.find((vacuum) => {
      if (vacuum.connection === 'local') {
        return false;
      }

      return [vacuum.duid, vacuum.id, vacuum.serialNumber, vacuum.name]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .some((value) => candidates.has(value));
    });
  }

  private async toVacuumConfig(device: RoborockCloudDevice, override?: RoborockVacuumConfig): Promise<RoborockVacuumConfig> {
    const model = this.resolveModel(device);
    const discoveredServiceAreas = Array.isArray(override?.serviceAreas)
      ? override.serviceAreas
      : await this.discoverServiceAreas(device);

    return {
      ...override,
      name: override?.name ?? device.name ?? `Roborock ${device.duid.slice(-4)}`,
      duid: device.duid,
      id: override?.id ?? device.duid,
      manufacturer: override?.manufacturer ?? 'Roborock',
      model: override?.model ?? model ?? 'Roborock Vacuum',
      serialNumber: override?.serialNumber ?? device.sn ?? device.duid,
      serviceAreas: discoveredServiceAreas.length > 0 ? discoveredServiceAreas : undefined,
    };
  }

  private async discoverServiceAreas(device: RoborockCloudDevice): Promise<ServiceAreaConfig[]> {
    if (!this.roborock?.isInited() || !device.duid) {
      return [];
    }

    try {
      const adapter = this.roborock as RoborockStateAdapter;
      if (!adapter.rr_mqtt_connector.isConnected()) {
        this.log.warn(`Roborock cloud MQTT is not connected; skipping automatic room discovery for ${this.deviceLabel(device)}. Matter room selection will not be exposed on this startup.`);
        return [];
      }

      const roomMapping = await this.sendRequestWithRetry(device.duid, 'get_room_mapping', [], 'discover Roborock rooms');

      if (!Array.isArray(roomMapping) || roomMapping.length === 0) {
        this.log.info(`No Roborock room mapping returned for ${this.deviceLabel(device)}; Matter room selection will not be exposed.`);
        return [];
      }

      const seenSegmentIds = new Set<number>();
      const serviceAreas: ServiceAreaConfig[] = [];

      for (const entry of roomMapping) {
        if (!Array.isArray(entry)) {
          continue;
        }

        const segmentId = this.toNumber(entry[0]);
        const roomId = this.toNumber(entry[1]);

        if (segmentId === undefined || seenSegmentIds.has(segmentId)) {
          continue;
        }

        seenSegmentIds.add(segmentId);
        serviceAreas.push({
          areaId: segmentId,
          label: roomId === undefined ? `Room ${segmentId}` : adapter.roomIDs[String(roomId)] ?? `Room ${segmentId}`,
          kind: 'room',
          segmentId,
        });
      }

      if (serviceAreas.length > 0) {
        this.log.info(`Discovered ${serviceAreas.length} Roborock room(s) for ${this.deviceLabel(device)}.`);
        this.log.debug(`Roborock rooms for ${this.deviceLabel(device)}: ${serviceAreas.map((area) => area.label).join(', ')}`);
      }

      return serviceAreas;
    } catch (error) {
      this.log.warn(`Could not discover Roborock rooms for ${this.deviceLabel(device)}; Matter room selection will not be exposed. ${this.formatError(error)}`);
      return [];
    }
  }

  private async sendRequestWithRetry(
    duid: string,
    method: string,
    params: unknown[],
    action: string,
    attempts = 4,
  ): Promise<unknown> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await (this.roborock as RoborockStateAdapter).messageQueueHandler.sendRequest(duid, method, params);
      } catch (error) {
        lastError = error;

        if (attempt < attempts) {
          this.log.debug(`Could not ${action} on attempt ${attempt}/${attempts}; retrying. ${this.formatError(error)}`);
          await this.delay(3_000);
        }
      }
    }

    throw lastError;
  }

  private async waitForMqttConnection(timeoutMs = 12_000): Promise<void> {
    if (!this.roborock?.isInited()) {
      return;
    }

    const adapter = this.roborock as RoborockStateAdapter;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (adapter.rr_mqtt_connector.isConnected()) {
        return;
      }

      await this.delay(1_000);
    }

    this.log.warn('Roborock cloud MQTT connection is not ready yet. The plugin will publish the vacuum now and retry normal status updates during polling; room discovery may be unavailable until a later restart.');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (error === undefined) {
      return 'The Roborock request was rejected without details, usually because MQTT/local transport is unavailable at that moment.';
    }

    if (typeof error === 'string') {
      return error;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.length > 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
  }

  private resolveModel(device: RoborockCloudDevice): string | null {
    const model = this.roborock?.getProductAttribute(device.duid, 'model');
    if (typeof model === 'string' && model.length > 0) {
      return model;
    }

    return device.model
      ?? device.productModel
      ?? device.productCode
      ?? device.modelId
      ?? null;
  }

  private resolveBaseUrl(): string {
    if (this.config.baseUrl) {
      const baseUrl = this.normalizeBaseUrl(this.config.baseUrl);
      if (!ALLOWED_ROBOROCK_BASE_URLS.has(baseUrl)) {
        throw new Error(`Unsupported Roborock API host "${this.config.baseUrl}". Use the region setting instead of a custom host.`);
      }

      return baseUrl;
    }

    const region: RoborockCloudRegion = this.config.region ?? 'us';
    return ROBOROCK_BASE_URLS[region];
  }

  private normalizeBaseUrl(value: string): string {
    const trimmed = value.trim().toLowerCase();
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`);

    if (url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
      throw new Error(`Unsupported Roborock API host "${value}". Configure only the Roborock host name.`);
    }

    return url.hostname;
  }

  private deviceLabel(device: RoborockCloudDevice): string {
    return device.name ?? `Roborock ${this.maskIdentifier(device.duid)}`;
  }

  private maskIdentifier(value?: string): string {
    if (!value) {
      return 'unknown';
    }

    return value.length <= 4 ? '****' : `...${value.slice(-4)}`;
  }
}

export class RoborockCloudVacuumClient implements RoborockVacuumClient {
  constructor(
    private readonly roborock: Roborock,
    private readonly config: RoborockVacuumConfig,
    private readonly log: Logger,
  ) {}

  public async getStatus(): Promise<RoborockStatus> {
    const payload = await this.callWithFallback('get_prop', ['get_status'], 'get_status');
    return this.normalizeStatus(payload);
  }

  public async start(): Promise<void> {
    await this.command('app_start', []);
  }

  public async pause(): Promise<void> {
    await this.command('app_pause', []);
  }

  public async stop(): Promise<void> {
    await this.command('app_stop', []);
  }

  public async dock(): Promise<void> {
    await this.command('app_charge', []);
  }

  public async locate(): Promise<void> {
    await this.command('find_me', []);
  }

  public async setCleanMode(mode: CleanModeConfig): Promise<void> {
    const commands: Array<Promise<void>> = [];

    if (typeof mode.fanPower === 'number') {
      commands.push(this.command('set_custom_mode', [mode.fanPower]));
    }

    if (typeof mode.waterBoxMode === 'number') {
      commands.push(this.command('set_water_box_custom_mode', [mode.waterBoxMode]));
    }

    await Promise.all(commands);
  }

  public async cleanAreas(areas: ServiceAreaConfig[]): Promise<void> {
    if (areas.length === 0) {
      await this.start();
      return;
    }

    const roomAreas = areas.filter((area) => area.kind !== 'zone');
    const zoneAreas = areas.filter((area) => area.kind === 'zone');

    if (roomAreas.length > 0 && zoneAreas.length > 0) {
      throw new Error('Roborock room and zone cleaning cannot be mixed in one command.');
    }

    if (roomAreas.length > 0) {
      const segmentIds = roomAreas.map((area) => area.segmentId ?? area.areaId);
      const repeat = Math.max(...roomAreas.map((area) => area.repeat ?? 1));
      const payload = this.config.segmentCleanPayload ?? 'segmentsObject';

      if (payload === 'segmentIds') {
        await this.command('app_segment_clean', segmentIds);
        return;
      }

      await this.command('app_segment_clean', [{ segments: segmentIds, repeat }]);
      return;
    }

    const zones = zoneAreas.map((area) => {
      if (!area.coordinates) {
        throw new Error(`Service area "${area.label}" is missing zone coordinates.`);
      }

      return [...area.coordinates, area.repeat ?? 1];
    });

    await this.command('app_zoned_clean', zones);
  }

  public destroy(): void {
    // The shared cloud connection owns the Roborock service lifecycle.
  }

  private async call(method: string, params: unknown[]): Promise<unknown> {
    if (!this.config.duid) {
      throw new Error(`Missing Roborock cloud device ID for ${this.config.name}.`);
    }

    return this.roborock.messageQueueHandler.sendRequest(this.config.duid, method, params);
  }

  private async command(method: string, params: unknown[]): Promise<void> {
    const response = this.call(method, params);
    let timeout: NodeJS.Timeout | undefined;
    let returnedEarly = false;

    try {
      await Promise.race([
        response.then(() => undefined),
        new Promise<void>((resolve) => {
          timeout = setTimeout(() => {
            returnedEarly = true;
            resolve();
          }, 2_000);
        }),
      ]);
    } catch (error) {
      if (this.isCloudAckTimeout(error, method)) {
        this.log.warn(`Roborock command "${method}" for ${this.config.name} timed out waiting for a cloud acknowledgement; treating it as sent.`);
        return;
      }

      throw error;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }

    if (returnedEarly) {
      response.catch((error) => {
        if (!this.isCloudAckTimeout(error, method)) {
          this.log.warn(`Roborock command "${method}" for ${this.config.name} eventually failed after Matter already returned. ${this.formatError(error)}`);
        }
      });
      this.log.debug(`Roborock command "${method}" for ${this.config.name} was sent but not acknowledged within 2 seconds; returning early so Apple Home stays responsive.`);
    }
  }

  private async callWithFallback(primaryMethod: string, primaryParams: unknown[], fallbackMethod: string): Promise<unknown> {
    try {
      return await this.call(primaryMethod, primaryParams);
    } catch (error) {
      this.log.debug(`Roborock cloud call "${primaryMethod}" failed for ${this.config.name}; trying "${fallbackMethod}". ${String(error)}`);
      return this.call(fallbackMethod, []);
    }
  }

  private isCloudAckTimeout(error: unknown, method: string): boolean {
    const text = error instanceof Error ? error.message : String(error);
    return text.includes('Cloud request')
      && text.includes(`method ${method}`)
      && text.includes('timed out after 10 seconds');
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (error === undefined) {
      return 'The Roborock request was rejected without details.';
    }

    if (typeof error === 'string') {
      return error;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  private normalizeStatus(payload: unknown): RoborockStatus {
    const raw = this.firstStatusObject(payload);

    return {
      state: raw?.state,
      battery: raw?.battery,
      errorCode: raw?.error_code,
      fanPower: raw?.fan_power,
      waterBoxMode: raw?.water_box_mode,
      inCleaning: raw?.in_cleaning,
      cleanArea: raw?.clean_area,
      cleanTime: raw?.clean_time,
    };
  }

  private firstStatusObject(payload: unknown): RawRoborockStatus | undefined {
    if (Array.isArray(payload)) {
      return this.firstStatusObject(payload[0]);
    }

    if (this.isRawStatus(payload)) {
      return payload;
    }

    return undefined;
  }

  private isRawStatus(value: unknown): value is RawRoborockStatus {
    return typeof value === 'object' && value !== null;
  }
}
