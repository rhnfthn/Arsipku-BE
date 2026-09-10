import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  PipeTransform,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { CorrespondenceRoutingAdminService } from '../services/correspondence-routing-admin.service';
import { CorrespondenceRoutingResolverService } from '../services/correspondence-routing-resolver.service';
import type { RoutingAdminActor } from '../services/correspondence-routing-admin.service';
import {
  CreateRoutingRoleDto,
  UpdateRoutingRoleDto,
  RoutingListDto,
  RoutingMembersDto,
  UpdateRoutingMemberDto,
  CreateRoutingRuleDto,
  UpdateRoutingRuleDto,
  RoutingToggleDto,
} from '../dto/routing-admin.dto';
import { RoutingPreviewDto } from '../dto/routing-preview.dto';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

// PartialType/IsOptional otherwise allow explicit null on required fields.
class RoutingNullPipe implements PipeTransform {
  transform(value: unknown) {
    const visit = (input: unknown) => {
      if (Array.isArray(input)) {
        input.forEach(visit);
        return;
      }
      if (!input || typeof input !== 'object') return;
      for (const [key, item] of Object.entries(input)) {
        if (item === null && !['valid_to', 'description'].includes(key))
          throw new BadRequestException(`${key} tidak boleh null`);
        visit(item);
      }
    };
    visit(value);
    return value;
  }
}

@Controller('correspondence-routing')
@UseGuards(JwtAuthGuard, PermissionGuard)
@UsePipes(
  new RoutingNullPipe(),
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class CorrespondenceRoutingController {
  constructor(
    private readonly admin: CorrespondenceRoutingAdminService,
    private readonly resolver: CorrespondenceRoutingResolverService,
  ) {}

  @Get('me/capabilities')
  getMyCapabilities(@CurrentUser() user: JwtPayload) {
    return this.resolver.getCapabilities(user.company, user.position);
  }

  @Get('roles')
  @RequirePermission('correspondence-routing', 'read')
  listRoles(@Query() query: RoutingListDto) {
    return this.admin.listRoles(query);
  }

  @Post('roles')
  @RequirePermission('correspondence-routing', 'create-role')
  createRole(
    @Body() dto: CreateRoutingRoleDto,
    @CurrentUser() user: RoutingAdminActor,
  ) {
    return this.admin.createRole(dto, user);
  }

  @Get('roles/:id')
  @RequirePermission('correspondence-routing', 'read')
  getRole(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.getRole(id);
  }

  @Patch('roles/:id')
  @RequirePermission('correspondence-routing', 'update-role')
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoutingRoleDto,
    @CurrentUser() user: RoutingAdminActor,
  ) {
    return this.admin.updateRole(id, dto, user);
  }

  @Patch('roles/:id/toggle-active')
  @RequirePermission('correspondence-routing', 'update-role')
  toggleRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RoutingToggleDto,
    @CurrentUser() user: RoutingAdminActor,
  ) {
    return this.admin.toggleRole(id, dto.is_active, user);
  }

  @Delete('roles/:id')
  @RequirePermission('correspondence-routing', 'delete-role')
  deleteRole(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RoutingAdminActor,
  ) {
    return this.admin.deleteRole(id, user);
  }

  @Get('roles/:id/members')
  @RequirePermission('correspondence-routing', 'read')
  listMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: RoutingListDto,
  ) {
    return this.admin.listMembers(id, query);
  }

  @Post('roles/:id/members')
  @RequirePermission('correspondence-routing', 'manage-members')
  addMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RoutingMembersDto,
    @CurrentUser() user: RoutingAdminActor,
  ) {
    return this.admin.addMembers(id, dto, user);
  }

  @Post('roles/:id/members/validate')
  @RequirePermission('correspondence-routing', 'manage-members')
  validateMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RoutingMembersDto,
  ) {
    return this.admin.validateMembers(id, dto);
  }

  @Patch('roles/:id/members/:memberId')
  @RequirePermission('correspondence-routing', 'manage-members')
  updateMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateRoutingMemberDto,
    @CurrentUser() user: RoutingAdminActor,
  ) {
    return this.admin.updateMember(id, memberId, dto, user);
  }

  @Delete('roles/:id/members/:memberId')
  @RequirePermission('correspondence-routing', 'manage-members')
  deleteMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser() user: RoutingAdminActor,
  ) {
    return this.admin.deleteMember(id, memberId, user);
  }

  @Get('rules')
  @RequirePermission('correspondence-routing', 'read')
  listRules(@Query() query: RoutingListDto) {
    return this.admin.listRules(query);
  }

  @Post('rules')
  @RequirePermission('correspondence-routing', 'create-rule')
  createRule(
    @Body() dto: CreateRoutingRuleDto,
    @CurrentUser() user: RoutingAdminActor,
  ) {
    return this.admin.createRule(dto, user);
  }

  @Get('rules/:id')
  @RequirePermission('correspondence-routing', 'read')
  getRule(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.getRule(id);
  }

  @Patch('rules/toggle-all')
  @RequirePermission('correspondence-routing', 'activate-rule')
  toggleAllRules(
    @Body() dto: RoutingToggleDto,
    @CurrentUser() user: RoutingAdminActor,
  ) {
    return this.admin.toggleAllRules(dto.is_active, user);
  }

  @Patch('rules/:id')
  @RequirePermission('correspondence-routing', 'update-rule')
  updateRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoutingRuleDto,
    @CurrentUser() user: RoutingAdminActor,
  ) {
    return this.admin.updateRule(id, dto, user);
  }

  @Patch('rules/:id/toggle-active')
  @RequirePermission('correspondence-routing', 'activate-rule')
  toggleRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RoutingToggleDto,
    @CurrentUser() user: RoutingAdminActor,
  ) {
    return this.admin.toggleRule(id, dto.is_active, user);
  }

  @Delete('rules/:id')
  @RequirePermission('correspondence-routing', 'delete-rule')
  deleteRule(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RoutingAdminActor,
  ) {
    return this.admin.deleteRule(id, user);
  }

  @Post('rules/:id/validate')
  @RequirePermission('correspondence-routing', 'preview')
  validateRule(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.validateRule(id);
  }

  @Get('health')
  @RequirePermission('correspondence-routing', 'read-health')
  health() {
    return this.admin.health();
  }

  @Post('preview')
  @RequirePermission('correspondence-routing', 'preview')
  preview(@Body() dto: RoutingPreviewDto) {
    return this.resolver.preview(dto);
  }
}
