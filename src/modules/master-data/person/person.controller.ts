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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { PersonService } from './person.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { AssignPositionDto } from './dto/assign-position.dto';
import { UpdateAssignPositionDto } from './dto/update-assign-position.dto';
import { Person } from './entities/person.entity';
import { GetMessageDto } from './dto/get-message.dto';
import { PersonWithPositionDto } from './dto/person-with-position.dto';

@ApiTags('Person Management')
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
   * @example GET /person/company/1?search=ahmad
   */
  @Get('company/:companyId')
  findByCompany(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('search') search?: string,
  ) {
    return this.personService.findByCompany(companyId, search);
  }

  /**
   * Get persons by position
   * @example GET /person/position/1000?search=ahmad
   */
  @Get('position/:positionId')
  findByPosition(
    @Param('positionId', ParseIntPipe) positionId: number,
    @Query('search') search?: string,
  ) {
    return this.personService.findByPosition(positionId, search);
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

  /**
   * Assign additional position to existing person
   * Creates om_relation_sp record for multi-company positions
   * @example POST /person/assign-position
   */
  @Post('assign-position')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Assign additional position to existing person',
    description: 'Creates new position assignment in om_relation_sp without modifying pa_personal. Allows one person to have multiple positions across different companies.',
  })
  @ApiResponse({
    status: 201,
    description: 'Position successfully assigned',
  })
  @ApiResponse({
    status: 404,
    description: 'Person not found',
  })
  @ApiResponse({
    status: 400,
    description: 'Position already assigned or validation error',
  })
  assignPosition(@Body() data: AssignPositionDto) {
    return this.personService.assignPosition(data);
  }

  /**
   * Get all position assignments for a person
   * @example GET /person/:persnum/positions
   */
  @Get(':persnum/positions')
  @ApiOperation({
    summary: 'Get all positions for a person',
    description: 'Returns all position assignments (across all companies) for a specific persnum',
  })
  @ApiParam({
    name: 'persnum',
    description: 'Person number (persnum)',
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'List of position assignments',
  })
  @ApiResponse({
    status: 404,
    description: 'Person not found',
  })
  getPersonPositions(@Param('persnum', ParseIntPipe) persnum: number) {
    return this.personService.getPersonPositions(persnum);
  }

  /**
   * Update an existing position assignment
   * @example PUT /person/assign-position/:id
   */
  @Put('assign-position/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update existing position assignment',
    description: 'Updates position assignment details in om_relation_sp. Can modify position_text, startDate, endDate, and uname.',
  })
  @ApiParam({
    name: 'id',
    description: 'Position assignment ID (om_relation_sp.id)',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Position assignment successfully updated',
  })
  @ApiResponse({
    status: 404,
    description: 'Position assignment not found',
  })
  updateAssignPosition(
    @Param('id') id: string,
    @Body() data: UpdateAssignPositionDto,
  ) {
    return this.personService.updateAssignPosition(id, data);
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
