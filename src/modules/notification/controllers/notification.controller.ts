import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards';
import { CurrentUser } from '../../../common/decorators';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { NotificationService } from '../services';
import { NotificationQueryDto } from '../dto';
import { NotificationType } from '../entities';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Get position ID from user's JWT payload
   */
  private getPositionId(user: JwtPayload): string {
    return user.position;
  }

  @Get()
  @ApiOperation({ summary: 'Get all notifications (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'isRead', required: false, type: Boolean })
  @ApiQuery({ name: 'type', required: false, enum: NotificationType })
  async getNotifications(
    @Query() query: NotificationQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const positionId = this.getPositionId(user);
    const result = await this.notificationService.getNotifications(positionId, query);
    
    return {
      success: true,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount(@CurrentUser() user: JwtPayload) {
    const positionId = this.getPositionId(user);
    const count = await this.notificationService.getUnreadCount(positionId);
    
    return {
      success: true,
      data: { count },
    };
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark notification as read' })
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const positionId = this.getPositionId(user);
    const notification = await this.notificationService.markAsRead(positionId, id);
    
    return {
      success: true,
      message: 'Notification marked as read',
      data: notification,
    };
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@CurrentUser() user: JwtPayload) {
    const positionId = this.getPositionId(user);
    const count = await this.notificationService.markAllAsRead(positionId);
    
    return {
      success: true,
      message: `${count} notifications marked as read`,
      data: { count },
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a notification' })
  async deleteNotification(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const positionId = this.getPositionId(user);
    const deleted = await this.notificationService.deleteNotification(positionId, id);
    
    return {
      success: deleted,
      message: deleted ? 'Notification deleted' : 'Notification not found',
    };
  }

  @Delete('clear-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete all notifications' })
  @ApiQuery({ name: 'type', required: false, enum: NotificationType })
  async clearAllNotifications(
    @Query('type') type: NotificationType,
    @CurrentUser() user: JwtPayload,
  ) {
    const positionId = this.getPositionId(user);
    const count = await this.notificationService.clearAllNotifications(positionId, type);
    
    return {
      success: true,
      message: `${count} notifications deleted`,
      data: { count },
    };
  }
}
