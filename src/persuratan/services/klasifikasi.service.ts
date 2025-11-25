import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { KlasifikasiEntity } from '../entity/klasifikasi.entity';
import { CreateKlasifikasiDto } from '../dto/klasifikasi/create_klasifikasi.dto';
import { UpdateKlasifikasiDto } from '../dto/klasifikasi/update_klasifikasi.dto';

@Injectable()
export class KlasifikasiService {
  constructor(
    @InjectRepository(KlasifikasiEntity)
    private klasifikasiRepository: Repository<KlasifikasiEntity>,
  ) {}

  async create(createKlasifikasiDto: CreateKlasifikasiDto): Promise<KlasifikasiEntity> {
    // Check if klasifikasi already exists
    const existing = await this.klasifikasiRepository.findOne({
      where: {
        company: createKlasifikasiDto.company,
        klasifikasi: createKlasifikasiDto.klasifikasi,
      },
    });

    if (existing) {
      throw new BadRequestException('Klasifikasi sudah ada');
    }

    const klasifikasi = this.klasifikasiRepository.create({
      id: uuidv4(),
      ...createKlasifikasiDto,
    });

    return await this.klasifikasiRepository.save(klasifikasi);
  }

  async findAll(company?: string): Promise<KlasifikasiEntity[]> {
    const query = this.klasifikasiRepository.createQueryBuilder('klasifikasi');

    if (company) {
      query.where('klasifikasi.company = :company', { company });
    }

    return await query
      .where('klasifikasi.aktif = :aktif', { aktif: true })
      .orderBy('klasifikasi.klasifikasi', 'ASC')
      .getMany();
  }

  async findOne(id: string): Promise<KlasifikasiEntity> {
    const klasifikasi = await this.klasifikasiRepository.findOne({
      where: { id },
    });

    if (!klasifikasi) {
      throw new NotFoundException('Klasifikasi tidak ditemukan');
    }

    return klasifikasi;
  }

  async findByCode(company: string, kode: string): Promise<KlasifikasiEntity> {
    const klasifikasi = await this.klasifikasiRepository.findOne({
      where: {
        company,
        klasifikasi: kode,
        aktif: true,
      },
    });

    if (!klasifikasi) {
      throw new NotFoundException('Klasifikasi tidak ditemukan');
    }

    return klasifikasi;
  }

  async update(id: string, updateKlasifikasiDto: UpdateKlasifikasiDto): Promise<KlasifikasiEntity> {
    const klasifikasi = await this.findOne(id);

    Object.assign(klasifikasi, updateKlasifikasiDto);
    return await this.klasifikasiRepository.save(klasifikasi);
  }

  async remove(id: string): Promise<void> {
    const klasifikasi = await this.findOne(id);
    await this.klasifikasiRepository.remove(klasifikasi);
  }

  async toggleAktif(id: string): Promise<KlasifikasiEntity> {
    const klasifikasi = await this.findOne(id);
    klasifikasi.aktif = !klasifikasi.aktif;
    return await this.klasifikasiRepository.save(klasifikasi);
  }
}
