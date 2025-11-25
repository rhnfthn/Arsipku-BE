import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { OmCompany } from './entities/om-company.entity';

@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get()
  findAll(): Promise<OmCompany[]> {
    return this.companyService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<OmCompany> {
    return this.companyService.findOne(id);
  }

  @Post()
  create(@Body() data: CreateCompanyDto) {
    return this.companyService.create(data);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: UpdateCompanyDto) {
    return this.companyService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.companyService.remove(id);
  }
}
