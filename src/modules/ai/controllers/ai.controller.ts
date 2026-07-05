import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { AiService } from '../services/ai.service';
import type { DraftResult } from '../services/ai.service';
import { GenerateDraftDto } from '../dto/generate-draft.dto';
import { AiRateLimitGuard } from '../guards/ai-rate-limit.guard';

@ApiTags('AI')
@Controller('AI')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('draft')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AiRateLimitGuard)
  async generateDraft(
    @CurrentUser() user: JwtPayload,
    @Body() dto: GenerateDraftDto,
  ): Promise<DraftResult> {
    return this.aiService.generateDraft(dto, user.persnum);
  }
}
