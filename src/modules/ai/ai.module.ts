import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { RbacModule } from '../rbac/rbac.module';
import { AiController } from './controllers/ai.controller';
import { AiService } from './services/ai.service';
import { OllamaService } from './services/ollama.service';
import { AiLogService } from './services/ai-log.service';
import { UserAiConfigService } from './services/user-ai-config.service';
import { AiRateLimitGuard } from './guards/ai-rate-limit.guard';
import { AiRequestLog } from './entities/ai-request-log.entity';
import { UserAiConfig } from './entities/user-ai-config.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiRequestLog, UserAiConfig]),
    HttpModule,
    ConfigModule,
    RbacModule,
  ],
  controllers: [AiController],
  providers: [
    AiService,
    OllamaService,
    AiLogService,
    UserAiConfigService,
    AiRateLimitGuard,
  ],
})
export class AiModule {}
