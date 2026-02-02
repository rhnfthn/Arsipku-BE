import {
  Controller,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards';
import { CurrentUser } from '../../../common/decorators';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { FcmService } from '../services';
import { RegisterFcmTokenDto, RemoveFcmTokenDto } from '../dto';

@ApiTags('FCM')
@Controller('fcm')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FcmController {
  constructor(private readonly fcmService: FcmService) {}

  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register FCM token for push notification' })
  async registerToken(
    @Body() dto: RegisterFcmTokenDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.fcmService.registerToken(user.persnum, dto);
    return {
      success: true,
      message: 'FCM token registered successfully',
      data: {
        id: result.id,
        deviceId: result.deviceId,
        platform: result.platform,
      },
    };
  }

  @Delete('remove')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove FCM token (on logout)' })
  async removeToken(
    @Body() dto: RemoveFcmTokenDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const removed = await this.fcmService.removeToken(user.persnum, dto);
    return {
      success: removed,
      message: removed
        ? 'FCM token removed successfully'
        : 'FCM token not found',
    };
  }
}
