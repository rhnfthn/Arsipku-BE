import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { OmPosition } from './entities/om-position.entity';
import { Repository, DataSource } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class PositionService {
  constructor(
    @InjectRepository(OmPosition)
    private readonly positionRepo: Repository<OmPosition>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<OmPosition[]> {
    return this.positionRepo.find({
      order: { position: 'ASC', createAt: 'DESC' },
    });
  }

  /**
   * Get all positions by company
   */
  async findByCompany(companyId: number): Promise<OmPosition[]> {
    return this.positionRepo.find({
      where: { company: companyId },
      order: { position: 'ASC' },
    });
  }

  /**
   * Get all positions by company and organization
   */
  async findByCompanyAndOrganization(
    companyId: number,
    organizationId: number,
  ): Promise<OmPosition[]> {
    // Note: You might need to add organization field to position entity
    // For now, returning by company only
    return this.positionRepo.find({
      where: { company: companyId },
      order: { position: 'ASC' },
    });
  }

  /**
   * Get positions with persons count
   */
  async findByCompanyWithPersons(companyId: number) {
    const query = `
      SELECT 
        p.*,
        COUNT(DISTINCT pp.id) as personsCount
      FROM om_position p
      LEFT JOIN pa_personal pp ON pp.persnum IN (
        SELECT persnum FROM om_relation_sp WHERE position = p.position AND company = p.company
      )
      WHERE p.company = ?
      GROUP BY p.id
      ORDER BY p.position ASC
    `;

    const results = await this.dataSource.query(query, [companyId]);
    return results;
  }

  /**
   * Get chief positions only (managerial positions)
   * Note: You might need to add 'chief' field to position entity
   */
  async findChiefPositions(companyId: number): Promise<OmPosition[]> {
    // For now, returning all positions by company
    // You can add chief field to entity and filter here
    return this.positionRepo.find({
      where: { company: companyId },
      order: { position: 'ASC' },
    });
  }

  async findOne(id: string): Promise<OmPosition> {
    const position = await this.positionRepo.findOne({ where: { id } });
    if (!position) {
      throw new NotFoundException(`Position with ID ${id} not found`);
    }
    return position;
  }

  async create(companyId: number, dto: CreatePositionDto): Promise<OmPosition> {
    // Check if position code already exists for this company
    const existing = await this.positionRepo.findOne({
      where: { 
        company: companyId, 
        position: dto.position 
      },
    });

    if (existing) {
      throw new BadRequestException(
        `Position code ${dto.position} already exists for company ${companyId}`
      );
    }

    const newPosition = this.positionRepo.create({
      ...dto,
      company: companyId,
    });
    return this.positionRepo.save(newPosition);
  }

  async update(
    id: string,
    companyId: number,
    dto: UpdatePositionDto,
  ): Promise<OmPosition> {
    const position = await this.findOne(id);
    
    // Manually assign fields from DTO
    if (dto.position !== undefined) position.position = dto.position;
    if (dto.shortText !== undefined) position.shortText = dto.shortText;
    if (dto.longText !== undefined) position.longText = dto.longText;
    if (dto.abbreviation !== undefined) position.abbreviation = dto.abbreviation;
    if (dto.startDate !== undefined) position.startDate = dto.startDate;
    if (dto.endDate !== undefined) position.endDate = dto.endDate;
    if (dto.uname !== undefined) position.uname = dto.uname;
    
    // Update company from route param
    position.company = companyId;
    
    return this.positionRepo.save(position);
  }

  async remove(id: string): Promise<{ message: string }> {
    const position = await this.findOne(id);
    await this.positionRepo.remove(position);
    return { message: `Position ${id} deleted successfully` };
  }
}
