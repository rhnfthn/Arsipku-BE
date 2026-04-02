import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { KlasifikasiEntity } from '../entities/klasifikasi.entity';
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

    // Validate parent exists if id_parent is provided
    if (createKlasifikasiDto.id_parent) {
      const parent = await this.klasifikasiRepository.findOne({
        where: { id: createKlasifikasiDto.id_parent },
      });
      if (!parent) {
        throw new BadRequestException('Parent klasifikasi tidak ditemukan');
      }
    }

    const klasifikasi = this.klasifikasiRepository.create({
      ...createKlasifikasiDto,
      id: createKlasifikasiDto.id || uuidv4(),
      active: createKlasifikasiDto.active ?? 1,
    });

    return await this.klasifikasiRepository.save(klasifikasi);
  }

  async findAll(company?: string): Promise<KlasifikasiEntity[]> {
    const query = this.klasifikasiRepository.createQueryBuilder('klasifikasi');

    if (company) {
      query.where('klasifikasi.company = :company', { company });
    }

    return await query
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
        active: 1,
      },
    });

    if (!klasifikasi) {
      throw new NotFoundException('Klasifikasi tidak ditemukan');
    }

    return klasifikasi;
  }

  async update(id: string, updateKlasifikasiDto: UpdateKlasifikasiDto): Promise<KlasifikasiEntity> {
    const klasifikasi = await this.findOne(id);

    // Validate parent exists if id_parent is being updated
    if (updateKlasifikasiDto.id_parent !== undefined) {
      if (updateKlasifikasiDto.id_parent === id) {
        throw new BadRequestException('Klasifikasi tidak bisa menjadi parent dari dirinya sendiri');
      }
      if (updateKlasifikasiDto.id_parent) {
        const parent = await this.klasifikasiRepository.findOne({
          where: { id: updateKlasifikasiDto.id_parent },
        });
        if (!parent) {
          throw new BadRequestException('Parent klasifikasi tidak ditemukan');
        }
      }
    }

    // Manually assign fields
    if (updateKlasifikasiDto.company !== undefined) klasifikasi.company = updateKlasifikasiDto.company;
    if (updateKlasifikasiDto.klasifikasi !== undefined) klasifikasi.klasifikasi = updateKlasifikasiDto.klasifikasi;
    if (updateKlasifikasiDto.klasifikasi_text !== undefined) klasifikasi.klasifikasi_text = updateKlasifikasiDto.klasifikasi_text;
    if (updateKlasifikasiDto.deskripsi !== undefined) klasifikasi.deskripsi = updateKlasifikasiDto.deskripsi;
    if (updateKlasifikasiDto.id_parent !== undefined) klasifikasi.id_parent = updateKlasifikasiDto.id_parent;
    if (updateKlasifikasiDto.active !== undefined) klasifikasi.active = updateKlasifikasiDto.active;

    return await this.klasifikasiRepository.save(klasifikasi);
  }

  async remove(id: string): Promise<{ message: string }> {
    const klasifikasi = await this.findOne(id);
    
    // Check if has children
    const childrenCount = await this.klasifikasiRepository.count({
      where: { id_parent: id },
    });

    if (childrenCount > 0) {
      throw new BadRequestException('Tidak dapat menghapus klasifikasi yang memiliki sub-klasifikasi');
    }

    await this.klasifikasiRepository.remove(klasifikasi);
    return { message: `Klasifikasi ${klasifikasi.klasifikasi} berhasil dihapus` };
  }

  async toggleActive(id: string): Promise<KlasifikasiEntity> {
    const klasifikasi = await this.findOne(id);
    klasifikasi.active = klasifikasi.active === 1 ? 0 : 1;
    return await this.klasifikasiRepository.save(klasifikasi);
  }
}
