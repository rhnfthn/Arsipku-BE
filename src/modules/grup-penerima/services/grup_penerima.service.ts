import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { GrupPenerimaEntity } from '../entities/grup_penerima.entity';
import { GrupPenerimaDetailEntity } from '../../grup-penerima-detail/entities/grup_penerima_detail.entity';
import { CreateGrupPenerimaDto } from '../dto/grup_penerima/create_grup_penerima.dto';
import { UpdateGrupPenerimaDto } from '../dto/grup_penerima/update_grup_penerima.dto';
import { CreateGrupPenerimaDetailDto } from '../../grup-penerima-detail/dto/grup_penerima_detail/create_grup_penerima_detail.dto';
import { UpdateGrupPenerimaDetailDto } from '../../grup-penerima-detail/dto/grup_penerima_detail/update_grup_penerima_detail.dto';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import {
  OrgDataPositionDto,
  GrupPenerimaResponseDto,
  GrupPenerimaDetailResponseDto,
} from '../dto/grup_penerima/grup-penerima-response.dto';

@Injectable()
export class GrupPenerimaService {
  constructor(
    @InjectRepository(GrupPenerimaEntity)
    private grupPenerimaRepository: Repository<GrupPenerimaEntity>,
    @InjectRepository(GrupPenerimaDetailEntity)
    private grupPenerimaDetailRepository: Repository<GrupPenerimaDetailEntity>,
    private orgDataService: OrgDataService,
  ) {}

  async create(
    createGrupPenerimaDto: CreateGrupPenerimaDto,
  ): Promise<GrupPenerimaEntity> {
    const grupPenerima = this.grupPenerimaRepository.create({
      id: uuidv4(),
      ...createGrupPenerimaDto,
    });

    return await this.grupPenerimaRepository.save(grupPenerima);
  }

  async findAll(company?: string): Promise<GrupPenerimaEntity[]> {
    const query =
      this.grupPenerimaRepository.createQueryBuilder('grup_penerima');

    query.where('grup_penerima.aktif = :aktif', { aktif: true });

    if (company) {
      query.andWhere('grup_penerima.company = :company', { company });
    }

    return await query
      .leftJoinAndSelect('grup_penerima.details', 'details')
      .orderBy('grup_penerima.nama', 'ASC')
      .getMany();
  }

  /**
   * Get all grup penerima with enriched position detail from org_data
   * @param company - Filter by company
   * @param tgl - Optional date for org_data lookup (default: today)
   * @param jenis - Optional naskah type (kept for API compatibility, no longer filters by name)
   */
  async findAllWithPositionDetail(
    company?: string,
    tgl?: string,
    jenis?: string,
  ): Promise<GrupPenerimaResponseDto[]> {
    // Get grup penerima list (all groups, no filtering)
    const grupList = await this.findAll(company);

    if (grupList.length === 0) {
      return [];
    }

    // Get position_json from org_data
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];
    const positionJsonMap: Map<number, OrgDataPositionDto> = new Map();

    try {
      const orgData = await this.orgDataService.findOrg(tanggal);
      if (orgData && orgData.position_json) {
        const positionJson: OrgDataPositionDto[] = orgData.position_json;
        positionJson.forEach((pos) => {
          positionJsonMap.set(Number(pos.position), pos);
        });
      }
    } catch (error) {
      // If org_data not found, continue without enrichment
      console.warn(
        `[GrupPenerimaService] org_data untuk tanggal ${tanggal} tidak ditemukan. Returning without position detail.`,
      );
    }

    // Enrich grup penerima with position detail
    return grupList.map((grup) => ({
      id: grup.id,
      company: grup.company,
      nama: grup.nama,
      deskripsi: grup.deskripsi,
      aktif: grup.aktif,
      details: (grup.details || []).map((detail) => {
        const positionId = Number(detail.position);
        const positionDetail = positionJsonMap.get(positionId) || null;

        return {
          id: detail.id,
          id_grup_penerima: detail.id_grup_penerima,
          position: detail.position,
          position_detail: positionDetail,
        };
      }),
    }));
  }

  /**
   * Get single grup penerima with enriched position detail
   * @param id - Grup penerima ID
   * @param tgl - Optional date for org_data lookup
   */
  async findOneWithPositionDetail(
    id: string,
    tgl?: string,
  ): Promise<GrupPenerimaResponseDto> {
    const grup = await this.findOne(id);

    // Get position_json from org_data
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];
    const positionJsonMap: Map<number, OrgDataPositionDto> = new Map();

    try {
      const orgData = await this.orgDataService.findOrg(tanggal);
      if (orgData && orgData.position_json) {
        const positionJson: OrgDataPositionDto[] = orgData.position_json;
        positionJson.forEach((pos) => {
          positionJsonMap.set(Number(pos.position), pos);
        });
      }
    } catch (error) {
      console.warn(
        `[GrupPenerimaService] org_data untuk tanggal ${tanggal} tidak ditemukan.`,
      );
    }

    return {
      id: grup.id,
      company: grup.company,
      nama: grup.nama,
      deskripsi: grup.deskripsi,
      aktif: grup.aktif,
      details: (grup.details || []).map((detail) => {
        const positionId = Number(detail.position);
        const positionDetail = positionJsonMap.get(positionId) || null;

        return {
          id: detail.id,
          id_grup_penerima: detail.id_grup_penerima,
          position: detail.position,
          position_detail: positionDetail,
        };
      }),
    };
  }

  /**
   * Get members with enriched position detail
   * @param grupId - Grup penerima ID
   * @param tgl - Optional date for org_data lookup
   */
  async getMembersWithPositionDetail(
    grupId: string,
    tgl?: string,
  ): Promise<GrupPenerimaDetailResponseDto[]> {
    const members = await this.getMembers(grupId);

    // Get position_json from org_data
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];
    const positionJsonMap: Map<number, OrgDataPositionDto> = new Map();

    try {
      const orgData = await this.orgDataService.findOrg(tanggal);
      if (orgData && orgData.position_json) {
        const positionJson: OrgDataPositionDto[] = orgData.position_json;
        positionJson.forEach((pos) => {
          positionJsonMap.set(Number(pos.position), pos);
        });
      }
    } catch (error) {
      console.warn(
        `[GrupPenerimaService] org_data untuk tanggal ${tanggal} tidak ditemukan.`,
      );
    }

    return members.map((detail) => {
      const positionId = Number(detail.position);
      const positionDetail = positionJsonMap.get(positionId) || null;

      return {
        id: detail.id,
        id_grup_penerima: detail.id_grup_penerima,
        position: detail.position,
        position_detail: positionDetail,
      };
    });
  }

  /**
   * Expand grup penerima to individual position recipients
   * Used when sending naskah to a grup - expands to all positions in the grup
   * @param grupId - Grup penerima ID
   * @param tgl - Optional date for org_data lookup
   * @returns Array of OrgDataPositionDto for all positions in the grup
   */
  async expandGrupToPositions(
    grupId: string,
    tgl?: string,
  ): Promise<OrgDataPositionDto[]> {
    const members = await this.getMembers(grupId);

    if (members.length === 0) {
      return [];
    }

    // Get position_json from org_data
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];
    const orgData = await this.orgDataService.findOrg(tanggal);

    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(
        `Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate data org terlebih dahulu.`,
      );
    }

    const positionJson: OrgDataPositionDto[] = orgData.position_json;
    const positionJsonMap = new Map<number, OrgDataPositionDto>();
    positionJson.forEach((pos) => {
      positionJsonMap.set(Number(pos.position), pos);
    });

    // Get position detail for each member
    const positions: OrgDataPositionDto[] = [];
    for (const member of members) {
      const positionId = Number(member.position);
      const positionDetail = positionJsonMap.get(positionId);
      if (positionDetail) {
        positions.push(positionDetail);
      }
    }

    return positions;
  }

  /**
   * Map grup penerima database name to PDF display name
   * Rules:
   * - "Directors" → "Para Direktur"
   * - "(EVP) Executive Vice President" → "Para EVP"
   * - "(GM) General Manager" → "Para GM"
   * If no mapping found, return the original nama
   */
  static mapGrupNameToDisplayName(nama: string): string {
    const mapping: Record<string, string> = {
      Directors: 'Para Direktur',
      '(EVP) Executive Vice President': 'Para EVP',
      '(GM) General Manager': 'Para GM',
    };
    return mapping[nama] || nama;
  }

  /**
   * Get display name for a grup penerima (for PDF rendering)
   * Instead of expanding to individual positions, returns a single display name
   * e.g., "Directors" → "Para Direktur"
   * @param grupId - UUID of grup penerima
   * @returns Display name string
   */
  async getGrupDisplayName(grupId: string): Promise<string> {
    const grup = await this.grupPenerimaRepository.findOne({
      where: { id: grupId },
    });

    if (!grup) {
      throw new NotFoundException(`Grup penerima ${grupId} tidak ditemukan`);
    }

    return GrupPenerimaService.mapGrupNameToDisplayName(grup.nama);
  }

  /**
   * Get display names for multiple grup penerima IDs
   * @param grupIds - Array of grup penerima UUIDs
   * @returns Array of display name strings
   */
  async getGrupDisplayNames(grupIds: string[]): Promise<string[]> {
    const displayNameItems: { name: string; inputIndex: number }[] = [];

    const getDisplayPriority = (name: string): number => {
      const normalized = String(name || '')
        .toLowerCase()
        .trim();

      // Wajib: Direksi selalu di atas, lalu EVP.
      if (normalized === 'para direksi' || normalized === 'para direktur')
        return 1;
      if (normalized === 'para evp') return 2;

      // Kelompok lain tetap setelah prioritas utama.
      if (normalized === 'para gm') return 3;
      return 99;
    };

    for (let i = 0; i < grupIds.length; i++) {
      const grupId = grupIds[i];
      try {
        const name = await this.getGrupDisplayName(grupId);
        displayNameItems.push({ name, inputIndex: i });
      } catch (error) {
        console.warn(
          `[GrupPenerimaService] Failed to get display name for grup ${grupId}:`,
          error.message,
        );
      }
    }

    displayNameItems.sort((a, b) => {
      const priorityDiff =
        getDisplayPriority(a.name) - getDisplayPriority(b.name);
      if (priorityDiff !== 0) return priorityDiff;

      // Stabil untuk prioritas yang sama: ikuti urutan input (urutan klik/user).
      return a.inputIndex - b.inputIndex;
    });

    return displayNameItems.map((item) => item.name);
  }

  /**
   * Get enriched grup info for response: id, nama (display name), and member position_ids
   * Used in detail endpoints to enrich penerima_grup / tembusan_grup arrays
   * @param grupIds - Array of grup penerima UUIDs
   * @returns Array of { id, nama, position_ids }
   */
  async getGrupInfoForResponse(
    grupIds: string[],
  ): Promise<{ id: string; nama: string; position_ids: number[] }[]> {
    const result: { id: string; nama: string; position_ids: number[] }[] = [];
    for (const grupId of grupIds) {
      try {
        const grup = await this.grupPenerimaRepository.findOne({
          where: { id: grupId },
          relations: ['details'],
        });
        if (grup) {
          result.push({
            id: grup.id,
            nama: GrupPenerimaService.mapGrupNameToDisplayName(grup.nama),
            position_ids: (grup.details || []).map((d) => Number(d.position)),
          });
        }
      } catch (error) {
        console.warn(
          `[GrupPenerimaService] Failed to get info for grup ${grupId}:`,
          error.message,
        );
      }
    }
    return result;
  }

  /**
   * Build a map from position ID to grup penerima UUID.
   * Used when creating sirkulasi records to tag which position came from which grup.
   * @param grupIds - Array of grup penerima UUIDs
   * @returns Map where key = position ID (number), value = grup UUID (string)
   */
  async buildPositionToGrupMap(
    grupIds: string[],
  ): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    for (const grupId of grupIds) {
      try {
        const members = await this.getMembers(grupId);
        for (const member of members) {
          map.set(Number(member.position), grupId);
        }
      } catch (error) {
        console.warn(
          `[GrupPenerimaService] Failed to get members for grup ${grupId}:`,
          error.message,
        );
      }
    }
    return map;
  }

  async findOne(id: string): Promise<GrupPenerimaEntity> {
    const grupPenerima = await this.grupPenerimaRepository.findOne({
      where: { id },
      relations: ['details'],
    });

    if (!grupPenerima) {
      throw new NotFoundException('Grup penerima tidak ditemukan');
    }

    return grupPenerima;
  }

  async update(
    id: string,
    updateGrupPenerimaDto: UpdateGrupPenerimaDto,
  ): Promise<GrupPenerimaEntity> {
    const grupPenerima = await this.findOne(id);

    Object.assign(grupPenerima, updateGrupPenerimaDto);
    return await this.grupPenerimaRepository.save(grupPenerima);
  }

  async checkUsage(id: string): Promise<{
    canDelete: boolean;
    reason?: string;
    details?: {
      memberCount: number;
    };
  }> {
    const grup = await this.findOne(id);
    const memberCount = await this.grupPenerimaDetailRepository.count({
      where: { id_grup_penerima: id },
    });

    if (memberCount > 0) {
      return {
        canDelete: false,
        reason: `Grup penerima '${grup.nama}' masih memiliki ${memberCount} anggota/posisi di dalamnya. Hapus seluruh anggota grup terlebih dahulu sebelum menghapus grup.`,
        details: { memberCount },
      };
    }

    return {
      canDelete: true,
      details: { memberCount: 0 },
    };
  }

  async remove(id: string): Promise<void> {
    const grupPenerima = await this.findOne(id);
    grupPenerima.aktif = false;
    await this.grupPenerimaRepository.save(grupPenerima);
  }

  async toggleAktif(id: string): Promise<GrupPenerimaEntity> {
    // Load entity TANPA relasi details untuk menghindari cascade side-effect
    const grupPenerima = await this.grupPenerimaRepository.findOne({
      where: { id },
    });

    if (!grupPenerima) {
      throw new NotFoundException('Grup penerima tidak ditemukan');
    }

    grupPenerima.aktif = !grupPenerima.aktif;
    return await this.grupPenerimaRepository.save(grupPenerima);
  }

  // ===== Member Management =====

  async addMember(
    grupId: string,
    createDetailDto: CreateGrupPenerimaDetailDto,
  ): Promise<GrupPenerimaDetailEntity> {
    const grupPenerima = await this.findOne(grupId);

    const detail = this.grupPenerimaDetailRepository.create({
      id: uuidv4(),
      id_grup_penerima: grupId,
      position: createDetailDto.position,
    });

    return await this.grupPenerimaDetailRepository.save(detail);
  }

  async updateMember(
    detailId: string,
    updateDetailDto: UpdateGrupPenerimaDetailDto,
  ): Promise<GrupPenerimaDetailEntity> {
    const detail = await this.grupPenerimaDetailRepository.findOne({
      where: { id: detailId },
    });

    if (!detail) {
      throw new NotFoundException('Member tidak ditemukan');
    }

    Object.assign(detail, updateDetailDto);
    return await this.grupPenerimaDetailRepository.save(detail);
  }

  async removeMember(detailId: string): Promise<void> {
    const detail = await this.grupPenerimaDetailRepository.findOne({
      where: { id: detailId },
    });

    if (!detail) {
      throw new NotFoundException('Member tidak ditemukan');
    }

    await this.grupPenerimaDetailRepository.remove(detail);
  }

  async getMembers(grupId: string): Promise<GrupPenerimaDetailEntity[]> {
    const grup = await this.findOne(grupId);

    return await this.grupPenerimaDetailRepository.find({
      where: { id_grup_penerima: grupId },
    });
  }
}
