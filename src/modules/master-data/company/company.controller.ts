import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  ParseIntPipe,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { OmCompany } from './entities/om-company.entity';
import { RequirePermission } from '../../../common/decorators';

@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get()
  findAll(): Promise<OmCompany[]> {
    return this.companyService.findAll();
  }

  /**
   * Get complete organizational tree structure for a company
   * Includes: Organizations → Positions → Persons
   * @example GET /company/1/tree
   */
  @Get(':companyId/tree')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(86_400_000)
  getCompanyTree(@Param('companyId', ParseIntPipe) companyId: number) {
    return this.companyService.getCompanyTree(companyId);
  }

  @Get(':id')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(86_400_000)
  findOne(@Param('id') id: string): Promise<OmCompany> {
    return this.companyService.findOne(id);
  }

  @Post()
  @RequirePermission('master-data', 'create')
  create(@Body() data: CreateCompanyDto) {
    return this.companyService.create(data);
  }

  @Put(':id')
  @RequirePermission('master-data', 'update')
  update(@Param('id') id: string, @Body() data: UpdateCompanyDto) {
    return this.companyService.update(id, data);
  }

  @Delete(':id')
  @RequirePermission('master-data', 'delete')
  remove(@Param('id') id: string) {
    return this.companyService.remove(id);
  }
}
