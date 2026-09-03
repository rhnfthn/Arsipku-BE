import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomInt } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { EksternalEntity } from '../entities/eksternal.entity';
import { CreateEksternalDto } from '../dto/eksternal/create_eksternal.dto';
import { UpdateEksternalDto } from '../dto/eksternal/update_eksternal.dto';
import { OrgDataService } from '../../master-data/org_data/org_data.service';

@Injectable()
export class EksternalService {
  constructor(
    @InjectRepository(EksternalEntity)
    private eksternalRepository: Repository<EksternalEntity>,
    private orgDataService: OrgDataService,
  ) {}

  /**
   * Helper method to get nama pembuat from org_data using id_position.
   * Cache di OrgDataService sudah handle JSON load.
   */
  private async getNamaPembuat(idPosition: string): Promise<string | null> {
    if (!idPosition) return null;

    try {
      const latestOrgData = await this.orgDataService.findLatestOrg();
      if (!latestOrgData?.position_json) return null;

      const positionJson = latestOrgData.position_json;

      if (!Array.isArray(positionJson)) return null;

      // Find position data by position field (id_position in DB matches position field in JSON)
      const positionData = positionJson.find(
        (pos) => Number(pos.position) === Number(idPosition),
      );

      // Return persnum_person_text as nama pembuat
      return positionData?.persnum_person_text || null;
    } catch (error) {
      console.error('Error getting nama pembuat:', error);
      return null;
    }
  }

  /**
   * Build a single position-id → nama lookup Map dari position_json sekali,
   * dipakai supaya findAll tidak N+1 saat memetakan banyak item.
   */
  private async buildNamaPembuatMap(
    idPositions: string[],
  ): Promise<Map<number, string | null>> {
    const map = new Map<number, string | null>();
    const ids = idPositions.filter(Boolean);
    if (ids.length === 0) return map;

    const latestOrgData = await this.orgDataService.findLatestOrg();
    const positionJson = latestOrgData?.position_json;
    if (!Array.isArray(positionJson)) return map;

    const idSet = new Set(ids.map((id) => Number(id)));
    for (const pos of positionJson) {
      const posNum = Number(pos.position);
      if (idSet.has(posNum)) {
        map.set(posNum, pos.persnum_person_text || null);
      }
    }
    return map;
  }

  private async generateKode(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let kode: string;
    let exists: boolean;

    do {
      kode = Array.from({ length: 5 }, () =>
        chars.charAt(randomInt(0, chars.length)),
      ).join('');
      exists = await this.eksternalRepository.exist({ where: { kode } });
    } while (exists);

    return kode;
  }

  async create(
    createEksternalDto: CreateEksternalDto,
  ): Promise<EksternalEntity> {
    // Selalu generate kode baru — abaikan `kode` apapun dari payload
    // agar FE tidak bisa menimpa / mengirim string kosong yang akan
    // disimpan null di DB.
    const { kode: _ignored, ...dtoWithoutKode } = createEksternalDto;
    const kode = await this.generateKode();
    const eksternal = this.eksternalRepository.create({
      id: uuidv4(),
      kode,
      ...dtoWithoutKode,
    });

    return await this.eksternalRepository.save(eksternal);
  }

  async findAll(company?: string, area?: string, includeInactive?: boolean): Promise<any[]> {
    const query = this.eksternalRepository.createQueryBuilder('eksternal');

    query.where('eksternal.aktif = :aktif', { aktif: true });

    if (company) {
      query.andWhere('eksternal.company = :company', { company });
    }

    if (area) {
      query.andWhere('eksternal.area = :area', { area });
    }

    if (!includeInactive) {
      query.andWhere('eksternal.aktif = :aktif', { aktif: true });
    }

    const eksternal = await query
      .orderBy('eksternal.created_at', 'DESC')
      .getMany();

    if (eksternal.length === 0) return [];

    // Bulk fetch nama_pembuat sekali (bukan per item)
    const idPositions = eksternal
      .map((item) => item.id_position_pembuat)
      .filter((id): id is string => Boolean(id));

    const namaPembuatMap = await this.buildNamaPembuatMap(idPositions);

    return eksternal.map((item) => ({
      ...item,
      nama_pembuat: item.id_position_pembuat
        ? namaPembuatMap.get(Number(item.id_position_pembuat)) || null
        : null,
      // TypeORM @CreateDateColumn / @UpdateDateColumn diserialisasi sbg
      // createdAt/updatedAt (camelCase). Map ke snake_case biar FE bisa
      // baca konsisten dengan field DB lain.
      created_at: item.createdAt ?? null,
      updated_at: item.updatedAt ?? null,
    }));
  }

  async findOne(id: string): Promise<any> {
    const eksternal = await this.eksternalRepository.findOne({
      where: { id },
    });

    if (!eksternal) {
      throw new NotFoundException('Eksternal tidak ditemukan');
    }

    // Add nama_pembuat
    const nama_pembuat = eksternal.id_position_pembuat
      ? await this.getNamaPembuat(eksternal.id_position_pembuat)
      : null;

    return {
      ...eksternal,
      nama_pembuat,
    };
  }

  async update(
    id: string,
    updateEksternalDto: UpdateEksternalDto,
  ): Promise<any> {
    const eksternalData = await this.findOne(id);

    // Remove nama_pembuat from findOne result as it's computed
    const { nama_pembuat, ...eksternal } = eksternalData;

    Object.assign(eksternal, updateEksternalDto);
    const updated = await this.eksternalRepository.save(eksternal);

    // Add nama_pembuat to response
    const nama_pembuat_updated = updated.id_position_pembuat
      ? await this.getNamaPembuat(updated.id_position_pembuat)
      : null;

    return {
      ...updated,
      nama_pembuat: nama_pembuat_updated,
    };
  }

  async remove(id: string): Promise<void> {
    const eksternal = await this.eksternalRepository.findOne({ where: { id } });
    if (!eksternal) {
      throw new NotFoundException('Eksternal tidak ditemukan');
    }

    // Tertuju eksternal dapat sudah menjadi referensi pada surat. Nonaktifkan
    // alih-alih menghapus fisik supaya riwayat surat tetap valid.
    eksternal.aktif = false;
    await this.eksternalRepository.save(eksternal);
  }

  async toggleAktif(id: string): Promise<any> {
    const eksternalData = await this.findOne(id);

    // Remove nama_pembuat from findOne result
    const { nama_pembuat, ...eksternal } = eksternalData;

    eksternal.aktif = !eksternal.aktif;
    const updated = await this.eksternalRepository.save(eksternal);

    // Add nama_pembuat to response
    const nama_pembuat_updated = updated.id_position_pembuat
      ? await this.getNamaPembuat(updated.id_position_pembuat)
      : null;

    return {
      ...updated,
      nama_pembuat: nama_pembuat_updated,
    };
  }

  async findByEmail(email: string): Promise<EksternalEntity | null> {
    return await this.eksternalRepository.findOne({
      where: { email, aktif: true },
    });
  }
}
