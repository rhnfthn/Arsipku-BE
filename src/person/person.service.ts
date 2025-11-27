import { Injectable, NotFoundException } from '@nestjs/common';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { Person } from './entities/person.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NaskahSirkulasi } from 'src/persuratan/entity/naskah_sirkulasi.entity';

@Injectable()
export class PersonService {
  constructor(
    @InjectRepository(Person)
    private readonly cRepo: Repository<Person>,
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepo: Repository<NaskahSirkulasi>,
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
}
