import type {
  API,
  DynamicPlatformPlugin,
  Logger,
  MatterAccessory,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge';
import { APIEvent } from 'homebridge';
import path from 'node:path';
import { RoborockMatterVacuum } from './matterVacuum';
import type { RoborockVacuumClient } from './roborockClient';
import { RoborockCloudConnection } from './roborockCloudClient';
import { PLATFORM_NAME, PLUGIN_NAME, type RoborockMatterConfig, type RoborockVacuumConfig } from './settings';

type LegacyLocalVacuumConfig = RoborockVacuumConfig & {
  address?: string;
  connection?: string;
  miioId?: string;
  token?: string;
};

export class RoborockMatterPlatform implements DynamicPlatformPlugin {
  private readonly config: RoborockMatterConfig;
  private readonly cachedMatterAccessories = new Map<string, MatterAccessory>();
  private readonly vacuums = new Map<string, RoborockMatterVacuum>();
  private cloudConnection?: RoborockCloudConnection;

  constructor(
    private readonly log: Logger,
    config: PlatformConfig,
    private readonly api: API,
  ) {
    this.config = config as RoborockMatterConfig;

    this.api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      void this.registerMatterVacuums().catch((error) => {
        this.log.error(`Failed to register Matter Roborock vacuums: ${String(error)}`);
      });
    });

    this.api.on(APIEvent.SHUTDOWN, () => {
      for (const vacuum of this.vacuums.values()) {
        vacuum.destroy();
      }
      void this.cloudConnection?.destroy();
    });
  }

  public configureAccessory(_accessory: PlatformAccessory): void {
    // This plugin intentionally exposes Matter accessories only.
  }

  public configureMatterAccessory(accessory: MatterAccessory): void {
    this.cachedMatterAccessories.set(accessory.UUID, accessory);
  }

  private async registerMatterVacuums(): Promise<void> {
    if (!this.api.isMatterAvailable()) {
      this.log.warn('Homebridge Matter support is not available. Use Homebridge 2.0 or newer.');
      return;
    }

    if (!this.api.isMatterEnabled()) {
      this.log.warn('Matter is not enabled for this bridge. Enable Matter on this bridge or child bridge to publish vacuums.');
      return;
    }

    if (!this.api.matter) {
      this.log.warn('Matter API is unavailable even though Matter is enabled.');
      return;
    }

    const vacuumRegistrations = await this.getVacuumRegistrations();

    if (vacuumRegistrations.length === 0) {
      this.log.warn('No Roborock vacuums found. Configure a Roborock account with at least one supported vacuum.');
      return;
    }

    const expectedUuids = new Set<string>();

    for (const { config: vacuumConfig, client } of vacuumRegistrations) {
      const vacuum = new RoborockMatterVacuum(this.api, this.log, this.config, vacuumConfig, client);
      expectedUuids.add(vacuum.UUID);

      let accessory = vacuum.buildAccessory();

      try {
        accessory = vacuum.buildAccessory(await client.getStatus());
      } catch (error) {
        this.log.warn(`Could not read initial state for ${vacuumConfig.name}; publishing with default stopped state. ${String(error)}`);
      }

      if (this.cachedMatterAccessories.has(vacuum.UUID)) {
        await this.api.matter.updatePlatformAccessories([accessory]);
        this.log.info(`Updated Matter Roborock vacuum: ${vacuumConfig.name}`);
      } else {
        await this.api.matter.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.log.info(`Registered Matter Roborock vacuum: ${vacuumConfig.name}`);
      }

      vacuum.startPolling();
      this.vacuums.set(vacuum.UUID, vacuum);
    }

    const staleAccessories = [...this.cachedMatterAccessories.values()].filter((accessory) => {
      return !expectedUuids.has(accessory.UUID);
    });

    if (staleAccessories.length > 0) {
      await this.api.matter.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, staleAccessories);
      for (const accessory of staleAccessories) {
        this.cachedMatterAccessories.delete(accessory.UUID);
      }
      this.log.info(`Removed ${staleAccessories.length} stale Matter Roborock vacuum accessory record(s).`);
    }
  }

  private async getVacuumRegistrations(): Promise<Array<{
    config: RoborockVacuumConfig;
    client: RoborockVacuumClient;
  }>> {
    const registrations: Array<{
      config: RoborockVacuumConfig;
      client: RoborockVacuumClient;
    }> = [];

    this.warnAboutUnsupportedLocalConfig();

    if (this.config.username) {
      this.cloudConnection = new RoborockCloudConnection(
        this.config,
        this.log,
        path.join(this.api.user.storagePath(), PLUGIN_NAME),
      );

      await this.cloudConnection.start();
      registrations.push(...await this.cloudConnection.getVacuumRegistrations());
    }

    return registrations;
  }

  private warnAboutUnsupportedLocalConfig(): void {
    const localEntries = ((this.config.vacuums ?? []) as LegacyLocalVacuumConfig[]).filter((vacuumConfig) => {
      return vacuumConfig.connection === 'local'
        || Boolean(vacuumConfig.token)
        || Boolean(vacuumConfig.address)
        || Boolean(vacuumConfig.miioId);
    });

    if (localEntries.length === 0) {
      return;
    }

    this.log.warn(
      `Ignoring ${localEntries.length} local miIO vacuum config entr${localEntries.length === 1 ? 'y' : 'ies'} because this beta build is cloud-only. `
      + 'Remove local IP/token settings and configure Roborock username/password instead.',
    );
  }
}
