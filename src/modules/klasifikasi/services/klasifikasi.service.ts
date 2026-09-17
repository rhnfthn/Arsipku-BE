import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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

  async create(
    createKlasifikasiDto: CreateKlasifikasiDto,
  ): Promise<KlasifikasiEntity> {
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
      penyusutan: createKlasifikasiDto.penyusutan || 'Permanen',
    });

    return await this.klasifikasiRepository.save(klasifikasi);
  }

  async findAll(company?: string): Promise<KlasifikasiEntity[]> {
    const query = this.klasifikasiRepository.createQueryBuilder('klasifikasi');

    query.where('klasifikasi.active = :active', { active: 1 });

    if (company) {
      query.andWhere('klasifikasi.company = :company', { company });
    }

    return await query.orderBy('klasifikasi.klasifikasi', 'ASC').getMany();
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

  async update(
    id: string,
    updateKlasifikasiDto: UpdateKlasifikasiDto,
  ): Promise<KlasifikasiEntity> {
    const klasifikasi = await this.findOne(id);

    // Validate parent exists if id_parent is being updated
    if (updateKlasifikasiDto.id_parent !== undefined) {
      if (updateKlasifikasiDto.id_parent === id) {
        throw new BadRequestException(
          'Klasifikasi tidak bisa menjadi parent dari dirinya sendiri',
        );
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
    if (updateKlasifikasiDto.company !== undefined)
      klasifikasi.company = updateKlasifikasiDto.company;
    if (updateKlasifikasiDto.klasifikasi !== undefined)
      klasifikasi.klasifikasi = updateKlasifikasiDto.klasifikasi;
    if (updateKlasifikasiDto.klasifikasi_text !== undefined)
      klasifikasi.klasifikasi_text = updateKlasifikasiDto.klasifikasi_text;
    if (updateKlasifikasiDto.deskripsi !== undefined)
      klasifikasi.deskripsi = updateKlasifikasiDto.deskripsi;
    if (updateKlasifikasiDto.id_parent !== undefined)
      klasifikasi.id_parent = updateKlasifikasiDto.id_parent;
    if (updateKlasifikasiDto.active !== undefined)
      klasifikasi.active = updateKlasifikasiDto.active;
    if (updateKlasifikasiDto.retensi_aktif_tahun !== undefined)
      klasifikasi.retensi_aktif_tahun = updateKlasifikasiDto.retensi_aktif_tahun;
    if (updateKlasifikasiDto.retensi_inaktif_tahun !== undefined)
      klasifikasi.retensi_inaktif_tahun = updateKlasifikasiDto.retensi_inaktif_tahun;
    if (updateKlasifikasiDto.penyusutan !== undefined)
      klasifikasi.penyusutan = updateKlasifikasiDto.penyusutan;
    if (updateKlasifikasiDto.keamanan !== undefined)
      klasifikasi.keamanan = updateKlasifikasiDto.keamanan;
    if (updateKlasifikasiDto.hak_akses !== undefined)
      klasifikasi.hak_akses = updateKlasifikasiDto.hak_akses;

    return await this.klasifikasiRepository.save(klasifikasi);
  }

  /**
   * Mengambil semua id dan kode klasifikasi turunan (recursive)
   */
  private async getAllDescendantKlasifikasi(id: string): Promise<{ ids: string[]; codes: string[] }> {
    const ids: string[] = [id];
    const target = await this.klasifikasiRepository.findOne({ where: { id } });
    const codes: string[] = target ? [target.klasifikasi] : [];

    const getChildren = async (parentId: string) => {
      const children = await this.klasifikasiRepository.find({
        where: { id_parent: parentId },
      });
      for (const child of children) {
        ids.push(child.id);
        if (child.klasifikasi) codes.push(child.klasifikasi);
        await getChildren(child.id);
      }
    };

    await getChildren(id);
    return { ids, codes };
  }

  /**
   * Cek apakah klasifikasi (atau salah satu child di bawahnya) sudah digunakan di naskah/berkas
   */
  async checkUsage(id: string): Promise<{
    canDelete: boolean;
    reason?: string;
    details?: {
      hasChildren: boolean;
      childrenCount: number;
      usedInNaskahCount: number;
      usedInBerkasCount: number;
    };
  }> {
    const klasifikasi = await this.findOne(id);
    const { ids, codes } = await this.getAllDescendantKlasifikasi(id);
    const childrenCount = ids.length - 1;

    let usedInNaskahCount = 0;
    let usedInBerkasCount = 0;

    if (codes.length > 0) {
      try {
        const naskahRes = await this.klasifikasiRepository.query(
          `SELECT COUNT(id) as cnt FROM naskah WHERE klasifikasi IN (?)`,
          [codes],
        );
        usedInNaskahCount = Number(naskahRes[0]?.cnt || 0);
      } catch (err) {
        console.warn('Gagal cek naskah usage:', err.message);
      }

      try {
        const berkasRes = await this.klasifikasiRepository.query(
          `SELECT COUNT(id) as cnt FROM berkas WHERE klasifikasi IN (?)`,
          [codes],
        );
        usedInBerkasCount = Number(berkasRes[0]?.cnt || 0);
      } catch (err) {
        console.warn('Gagal cek berkas usage:', err.message);
      }
    }

    if (usedInNaskahCount > 0 || usedInBerkasCount > 0) {
      const usageList: string[] = [];
      if (usedInNaskahCount > 0) usageList.push(`${usedInNaskahCount} Naskah Surat`);
      if (usedInBerkasCount > 0) usageList.push(`${usedInBerkasCount} Berkas Arsip`);

      return {
        canDelete: false,
        reason: `Klasifikasi ${klasifikasi.klasifikasi} (atau sub-klasifikasi di bawahnya) sudah digunakan pada ${usageList.join(' dan ')}. Data tidak dapat dihapus untuk menjaga keutuhan riwayat arsip.`,
        details: {
          hasChildren: childrenCount > 0,
          childrenCount,
          usedInNaskahCount,
          usedInBerkasCount,
        },
      };
    }

    if (childrenCount > 0) {
      return {
        canDelete: false,
        reason: `Klasifikasi ${klasifikasi.klasifikasi} memiliki ${childrenCount} sub-klasifikasi di bawahnya. Hapus atau pindahkan sub-klasifikasi terlebih dahulu.`,
        details: {
          hasChildren: true,
          childrenCount,
          usedInNaskahCount: 0,
          usedInBerkasCount: 0,
        },
      };
    }

    return {
      canDelete: true,
      details: {
        hasChildren: false,
        childrenCount: 0,
        usedInNaskahCount: 0,
        usedInBerkasCount: 0,
      },
    };
  }

  async remove(id: string): Promise<{ message: string }> {
    const klasifikasi = await this.findOne(id);
    const { ids } = await this.getAllDescendantKlasifikasi(id);

    // Soft delete: set active = 0 untuk parent dan semua child di bawahnya
    await this.klasifikasiRepository
      .createQueryBuilder()
      .update(KlasifikasiEntity)
      .set({ active: 0 })
      .whereInIds(ids)
      .execute();

    return {
      message: `Klasifikasi ${klasifikasi.klasifikasi} beserta sub-klasifikasinya berhasil dihapus`,
    };
  }

  async toggleActive(id: string): Promise<KlasifikasiEntity> {
    const klasifikasi = await this.findOne(id);
    klasifikasi.active = klasifikasi.active === 1 ? 0 : 1;
    return await this.klasifikasiRepository.save(klasifikasi);
  }
}
