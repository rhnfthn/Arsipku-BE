import { Controller, Get, Post, Put, Delete, Param, Body, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { AdminService } from '../services/admin.service';
import { SearchUsersDto, SearchUsersResponseDto } from '../dto/search-users.dto';
import { AssignRoleDto, AssignRoleResponseDto, UpdateRoleResponseDto } from '../dto/assign-role.dto';
import { RemoveRoleResponseDto } from '../dto/remove-role.dto';
import { Roles } from '../../../common/decorators';
import { RolesGuard, JwtAuthGuard } from '../../../common/guards';
import { CurrentUser } from '../../../common/decorators';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@Controller('superadmin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * GET /superadmin/users
   * Get list of users with their roles
   * 
   * Query params:
   * - search: string (name, username, persnum)
   * - role: 'admin' | 'superadmin'
   * 
   * Access: Superadmin only
   */
  @Roles('superadmin')
  @Get('users')
  async searchUsers(
    @Query() query: SearchUsersDto,
  ): Promise<SearchUsersResponseDto> {
    return this.adminService.searchUsers(query);
  }

  /**
   * GET /superadmin/users/:persnum
   * Get user detail by persnum
   * 
   * Access: Superadmin only
   */
  @Roles('superadmin')
  @Get('users/:persnum')
  async getUserByPersnum(
    @Param('persnum', ParseIntPipe) persnum: number,
  ) {
    return this.adminService.getUserByPersnum(persnum);
  }

  /**
   * POST /superadmin/users/:persnum/role
   * Assign role (admin/superadmin) to user
   * 
   * Body: { role: 'admin' | 'superadmin' }
   * 
   * Access: Superadmin only
   */
  @Roles('superadmin')
  @Post('users/:persnum/role')
  async assignRole(
    @Param('persnum', ParseIntPipe) persnum: number,
    @Body() dto: AssignRoleDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<AssignRoleResponseDto> {
    return this.adminService.assignRole(persnum, dto, user.persnum);
  }

  /**
   * PUT /superadmin/users/:persnum/role
   * Update role for user (change existing role)
   * 
   * Body: { role: 'admin' | 'superadmin' }
   * 
   * Access: Superadmin only
   */
  @Roles('superadmin')
  @Put('users/:persnum/role')
  async updateRole(
    @Param('persnum', ParseIntPipe) persnum: number,
    @Body() dto: AssignRoleDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<UpdateRoleResponseDto> {
    return this.adminService.updateRole(persnum, dto, user.persnum);
  }

  /**
   * DELETE /superadmin/users/:persnum/role
   * Remove role from user (revert to regular user)
   * 
   * Access: Superadmin only
   */
  @Roles('superadmin')
  @Delete('users/:persnum/role')
  async removeRole(
    @Param('persnum', ParseIntPipe) persnum: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<RemoveRoleResponseDto> {
    return this.adminService.removeRole(persnum, user.persnum);
  }
}
