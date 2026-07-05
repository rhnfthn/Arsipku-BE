import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AiController } from './controllers/ai.controller';
import { AiService } from './services/ai.service';
import { OllamaService } from './services/ollama.service';
import { AiLogService } from './services/ai-log.service';
import { AiRateLimitGuard } from './guards/ai-rate-limit.guard';
import { AiRequestLog } from './entities/ai-request-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AiRequestLog]), HttpModule, ConfigModule],
  controllers: [AiController],
  providers: [AiService, OllamaService, AiLogService, AiRateLimitGuard],
})
export class AiModule {}
