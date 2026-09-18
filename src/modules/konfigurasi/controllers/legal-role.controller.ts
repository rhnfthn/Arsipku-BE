import { Controller, Get, Patch, Param } from '@nestjs/common';
import { RequirePermission } from '../../../common/decorators';
import { LegalRoleService } from '../services/legal-role.service';

@Controller('konfigurasi/unit-legal')
export class LegalRoleController {
  constructor(private readonly legalRoleService: LegalRoleService) {}

  @Get()
  @RequirePermission('konfigurasi', 'read-unit-legal')
  async findAll() {
    const data = await this.legalRoleService.findAll();
    return { success: true, data };
  }

  @Patch(':positionId/toggle')
  @RequirePermission('konfigurasi', 'update')
  async toggle(@Param('positionId') positionId: string) {
    const result = await this.legalRoleService.toggle(positionId);
    return { success: true, data: result };
  }

  @Patch(':positionId/first-recipient')
  @RequirePermission('konfigurasi', 'update')
  async setFirstRecipient(@Param('positionId') positionId: string) {
    const result = await this.legalRoleService.setFirstRecipient(positionId);
    return { success: true, data: result };
  }
}
