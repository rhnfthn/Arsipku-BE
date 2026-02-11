import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigDigsig, ConfigMessage } from './entities';
import { ConfigDigsigService, ConfigMessageService } from './services';
import {
  AdminConfigDigsigController,
  AdminConfigMessageController,
  ConfigController,
} from './controllers';

@Module({
  imports: [TypeOrmModule.forFeature([ConfigDigsig, ConfigMessage])],
  controllers: [
    AdminConfigDigsigController,
    AdminConfigMessageController,
    ConfigController,
  ],
  providers: [ConfigDigsigService, ConfigMessageService],
  exports: [ConfigDigsigService, ConfigMessageService],
})
export class ConfigAdminModule implements OnModuleInit {
  constructor(private readonly configDigsigService: ConfigDigsigService) {}

  /**
   * Initialize default config values on module startup
   */
  async onModuleInit() {
    try {
      await this.configDigsigService.initDefaults();
      console.log('✅ ConfigAdminModule initialized with default digsig config');
    } catch (error) {
      console.warn('⚠️ Could not initialize default digsig config:', error.message);
    }
  }
}
