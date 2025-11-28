import { Controller, Get, Param } from '@nestjs/common';
import { DashboardUserService } from './dashboard-user.service';

@Controller('dashboard/user')
export class DashboardUserController {
  constructor(private readonly dashboardUserService: DashboardUserService) {}

  @Get(':persnum')
  getDashboard(@Param('persnum') persnum: string) {
    return this.dashboardUserService.getDashboardData(Number(persnum));
  }
}
