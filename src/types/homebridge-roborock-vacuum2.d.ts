declare module 'homebridge-roborock-vacuum2/roborockLib/roborockAPI.js' {
  type RoborockLog = {
    debug(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };

  export type RoborockCloudDevice = {
    duid: string;
    name?: string;
    sn?: string;
    productId?: number | string;
    localKey?: string;
    online?: boolean;
    model?: string;
    productModel?: string;
    productCode?: string;
    modelId?: string;
  };

  export class Roborock {
    public authState?: {
      twoFactorRequired?: boolean;
      statusMessage?: string;
    };
    public messageQueueHandler: {
      sendRequest(
        duid: string,
        method: string,
        params: unknown[],
        secure?: boolean,
        photo?: boolean,
      ): Promise<unknown>;
    };

    constructor(options: {
      username?: string;
      password?: string;
      baseURL?: string;
      language?: string;
      updateInterval?: number;
      storagePath?: string;
      skipDevices?: string[];
      ignoredDevices?: string[];
      log?: RoborockLog;
      userData?: unknown;
    });

    startService(callback?: () => void): Promise<void>;
    stopService(): Promise<void>;
    isInited(): boolean;
    getVacuumList(): RoborockCloudDevice[];
    getProductAttribute(duid: string, attribute: string): string | number | null;
    getVacuumDeviceStatus(duid: string, property: string): unknown;
    isSupportedVacuumModel(model: unknown): boolean;
    setDeviceNotify(callback: (id: string, state: unknown) => void): void;
    sendTwoFactorEmail(): Promise<{ ok: boolean }>;
    verifyTwoFactorCode(code: string): Promise<unknown>;
  }
}
