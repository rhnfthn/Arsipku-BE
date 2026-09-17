import { Controller, Get, Patch, Param } from '@nestjs/common';
import { LegalRoleService } from '../services/legal-role.service';

@Controller('konfigurasi/unit-legal')
export class LegalRoleController {
  constructor(private readonly legalRoleService: LegalRoleService) {}

  @Get()
  async findAll() {
    const data = await this.legalRoleService.findAll();
    return { success: true, data };
  }

  @Patch(':positionId/toggle')
  async toggle(@Param('positionId') positionId: string) {
    const result = await this.legalRoleService.toggle(positionId);
    return { success: true, data: result };
  }

  @Patch(':positionId/first-recipient')
  async setFirstRecipient(@Param('positionId') positionId: string) {
    const result = await this.legalRoleService.setFirstRecipient(positionId);
    return { success: true, data: result };
  }
}
