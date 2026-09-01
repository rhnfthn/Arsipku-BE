import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ConfigDigsig,
  ConfigMessage,
  ConfigNaskahLainnya,
  ConfigSearch,
} from './entities';
import {
  ConfigDigsigService,
  ConfigMessageService,
  ConfigNaskahLainnyaService,
  ConfigSearchService,
} from './services';
import {
  AdminConfigDigsigController,
  AdminConfigMessageController,
  AdminConfigNaskahLainnyaController,
  AdminConfigSearchController,
  ConfigController,
} from './controllers';
import { OrgDataModule } from '../master-data/org_data/org_data.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConfigDigsig,
      ConfigMessage,
      ConfigNaskahLainnya,
      ConfigSearch,
    ]),
    OrgDataModule,
  ],
  controllers: [
    AdminConfigDigsigController,
    AdminConfigMessageController,
    AdminConfigNaskahLainnyaController,
    AdminConfigSearchController,
    ConfigController,
  ],
  providers: [
    ConfigDigsigService,
    ConfigMessageService,
    ConfigNaskahLainnyaService,
    ConfigSearchService,
  ],
  exports: [
    ConfigDigsigService,
    ConfigMessageService,
    ConfigNaskahLainnyaService,
    ConfigSearchService,
  ],
})
export class ConfigAdminModule implements OnModuleInit {
  constructor(
    private readonly configDigsigService: ConfigDigsigService,
    private readonly configSearchService: ConfigSearchService,
  ) {}

  /**
   * Initialize default config values on module startup
   */
  async onModuleInit() {
    try {
      await this.configDigsigService.initDefaults();
      console.log(
        '✅ ConfigAdminModule initialized with default digsig config',
      );
    } catch (error) {
      console.warn(
        '⚠️ Could not initialize default digsig config:',
        error.message,
      );
    }

    try {
      await this.configSearchService.initDefaults();
      console.log(
        '✅ ConfigAdminModule initialized with default search config',
      );
    } catch (error) {
      console.warn(
        '⚠️ Could not initialize default search config:',
        error.message,
      );
    }
  }
}
