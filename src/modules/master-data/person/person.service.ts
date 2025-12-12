import { Injectable, NotFoundException } from '@nestjs/common';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { Person } from './entities/person.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NaskahSirkulasi } from 'src/modules/naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { OrgDataService } from '../org_data/org_data.service';
import { PersonWithPositionDto } from './dto/person-with-position.dto';

@Injectable()
export class PersonService {
  constructor(
    @InjectRepository(Person)
    private readonly cRepo: Repository<Person>,
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepo: Repository<NaskahSirkulasi>,
    private readonly orgDataService: OrgDataService,
  ) {}

  async findAll(): Promise<Person[]> {
    return this.cRepo.find({
      order: { createAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Person> {
    const company = await this.cRepo.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Area with ID ${id} not found`);
    }
    return company;
  }

  async create(dto: CreatePersonDto): Promise<Person> {
    // Jika tidak ada id, generate UUID otomatis (karena di DB defaultnya UUID())
    const newCompany = this.cRepo.create(dto);
    return this.cRepo.save(newCompany);
  }

  async update(id: string, dto: UpdatePersonDto): Promise<Person> {
    const company = await this.findOne(id);
    const updated = Object.assign(company, dto);
    return this.cRepo.save(updated);
  }

  async remove(id: string): Promise<{ message: string }> {
    const company = await this.findOne(id);
    await this.cRepo.remove(company);
    return { message: `Area ${id} deleted successfully` };
  }

  async countNaskahBySirkuler(
    persnum: number,
    type: 'pengirim' | 'penerima',
  ): Promise<{
    message: string;
    data: {
      persnum: number;
      type: 'pengirim' | 'penerima';
      count: number;
    };
  }> {
    const count = await this.naskahSirkulasiRepo.count({
      where: {
        idSirkuler: persnum.toString(),
        sirkuler: type,
      },
    });

    return {
      message: 'Data retrieved successfully',
      data: {
        persnum,
        type,
        count,
      },
    };
  }

  async findAllWithPosition(): Promise<PersonWithPositionDto[]> {
    const persons = await this.cRepo.find({
      order: { createAt: 'DESC' },
    });

    // Get org data to enrich person data with position information
    const orgData = await this.orgDataService.findAll();
    const latestOrgData = orgData.length > 0 ? orgData[0] : null;

    if (!latestOrgData || !latestOrgData.organization_json) {
      // Return empty array if org data is not available
      return [];
    }

    // Create a map of persnum -> position data for fast lookup
    const positionMap = new Map<number, any>();

    const processOrgStructure = (orgs: any[]) => {
      for (const org of orgs) {
        if (org.positions && Array.isArray(org.positions)) {
          for (const position of org.positions) {
            if (position.person && position.person.persnum) {
              const persnum = parseInt(String(position.person.persnum));
              positionMap.set(persnum, {
                persnum: position.person.persnum,
                nama: position.person.persnum_text,
                position: position.position,
                position_text: position.position_text,
              });
            }
          }
        }

        // Recursively process children
        if (org.children && Array.isArray(org.children)) {
          processOrgStructure(org.children);
        }
      }
    };

    if (Array.isArray(latestOrgData.organization_json)) {
      processOrgStructure(latestOrgData.organization_json);
    }

    // Map persons to DTOs with position data
    return persons
      .filter((person) => person.persnum && positionMap.has(person.persnum))
      .map((person) => {
        const posData = positionMap.get(person.persnum!);
        return {
          persnum: posData.persnum,
          nama: posData.nama,
          position: posData.position,
          position_text: posData.position_text,
        };
      });
  }
}