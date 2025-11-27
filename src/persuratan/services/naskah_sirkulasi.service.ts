import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateNaskahSirkulasiDto } from '../dto/naskah_sirkulasi/create_naskah_sirkulasi.dto';
import { UpdateNaskahSirkulasiDto } from '../dto/naskah_sirkulasi/update_naskah_sirkulasi.dto';
import { NaskahSirkulasi } from '../entity/naskah_sirkulasi.entity';

@Injectable()
export class NaskahSirkulasiService {
  constructor(
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepo: Repository<NaskahSirkulasi>,
  ) {}

  async findAll(): Promise<NaskahSirkulasi[]> {
    return this.naskahSirkulasiRepo.find();
  }

  async findOne(id: string): Promise<NaskahSirkulasi> {
    const naskahSirkulasi = await this.naskahSirkulasiRepo.findOne({
      where: { id },
    });
    if (!naskahSirkulasi) {
      throw new NotFoundException(`Naskah Sirkulasi with ID ${id} not found`);
    }
    return naskahSirkulasi;
  }

  async create(dto: CreateNaskahSirkulasiDto): Promise<NaskahSirkulasi> {
    const newNaskahSirkulasi = this.naskahSirkulasiRepo.create(dto);
    return this.naskahSirkulasiRepo.save(newNaskahSirkulasi);
  }

  async update(
    id: string,
    dto: UpdateNaskahSirkulasiDto,
  ): Promise<NaskahSirkulasi> {
    const naskahSirkulasi = await this.findOne(id);
    const updated = Object.assign(naskahSirkulasi, dto);
    return this.naskahSirkulasiRepo.save(updated);
  }

  async remove(id: string): Promise<{ message: string }> {
    const naskahSirkulasi = await this.findOne(id);
    await this.naskahSirkulasiRepo.remove(naskahSirkulasi);
    return { message: `Naskah Sirkulasi ${id} deleted successfully` };
  }
}
