import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { AiService } from '../services/ai.service';
import type { DraftResult } from '../services/ai.service';
import { UserAiConfigService } from '../services/user-ai-config.service';
import { GenerateDraftDto } from '../dto/generate-draft.dto';
import { UserAiConfigDto } from '../dto/user-ai-config.dto';
import { AiRateLimitGuard } from '../guards/ai-rate-limit.guard';

@ApiTags('AI')
@Controller('AI')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly userAiConfigService: UserAiConfigService,
  ) {}

  @Post('draft')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AiRateLimitGuard)
  async generateDraft(
    @CurrentUser() user: JwtPayload,
    @Body() dto: GenerateDraftDto,
  ): Promise<DraftResult> {
    return this.aiService.generateDraft(dto, user.persnum);
  }

  @Get('config')
  async getConfig(@CurrentUser() user: JwtPayload) {
    return this.userAiConfigService.getMasked(user.persnum);
  }

  @Put('config')
  @HttpCode(HttpStatus.OK)
  async updateConfig(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UserAiConfigDto,
  ) {
    await this.userAiConfigService.upsert(user.persnum, dto.apiKey);
    return this.userAiConfigService.getMasked(user.persnum);
  }
}
