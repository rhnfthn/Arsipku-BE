import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { PersonService } from './person.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { Person } from './entities/person.entity';
import { GetMessageDto } from './dto/get-message.dto';
import { PersonWithPositionDto } from './dto/person-with-position.dto';

@Controller('person')
export class PersonController {
  constructor(private readonly personService: PersonService) {}

  @Get()
  findAll(): Promise<Person[]> {
    return this.personService.findAll();
  }

  /**
   * Get all persons with position information
   * @example GET /person/with-position/all
   */
  @Get('with-position/all')
  findAllWithPosition(): Promise<PersonWithPositionDto[]> {
    return this.personService.findAllWithPosition();
  }

  /**
   * Get persons by company
   * @example GET /person/company/1
   */
  @Get('company/:companyId')
  findByCompany(
    @Param('companyId', ParseIntPipe) companyId: number,
  ): Promise<Person[]> {
    return this.personService.findByCompany(companyId);
  }

  /**
   * Get persons by position
   * @example GET /person/position/1000
   */
  @Get('position/:positionId')
  findByPosition(
    @Param('positionId', ParseIntPipe) positionId: number,
  ) {
    return this.personService.findByPosition(positionId);
  }

  /**
   * Get persons by organization
   * @example GET /person/company/1/organization/100
   */
  @Get('company/:companyId/organization/:organizationId')
  findByOrganization(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('organizationId', ParseIntPipe) organizationId: number,
  ) {
    return this.personService.findByOrganization(companyId, organizationId);
  }

  /**
   * Search persons by name
   * @example GET /person/search?name=ahmad
   */
  @Get('search')
  searchByName(@Query('name') name: string): Promise<Person[]> {
    return this.personService.searchByName(name);
  }

  /**
   * Get person with full details (position, organization, etc)
   * @example GET /person/:persnum/details
   */
  @Get(':persnum/details')
  findOneWithDetails(
    @Param('persnum', ParseIntPipe) persnum: number,
  ) {
    return this.personService.findOneWithDetails(persnum);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Person> {
    return this.personService.findOne(id);
  }

  @Post()
  create(@Body() data: CreatePersonDto) {
    return this.personService.create(data);
  }

  @Post('get-message')
  getMessage(@Body() data: GetMessageDto) {
    return this.personService.countNaskahBySirkuler(data.persnum, data.type);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: UpdatePersonDto) {
    return this.personService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.personService.remove(id);
  }
}
