import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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

  async create(createGrupPenerimaDto: CreateGrupPenerimaDto): Promise<GrupPenerimaEntity> {
    // Jika urutan tidak dikirim, ambil urutan terakhir + 1
    let urutan = createGrupPenerimaDto.urutan;
    if (urutan === undefined || urutan === null) {
      const lastGrup = await this.grupPenerimaRepository
        .createQueryBuilder('grup_penerima')
        .where('grup_penerima.company = :company', { company: createGrupPenerimaDto.company })
        .andWhere('grup_penerima.area = :area', { area: createGrupPenerimaDto.area })
        .orderBy('grup_penerima.urutan', 'DESC')
        .getOne();

      urutan = lastGrup?.urutan ? lastGrup.urutan + 1 : 1;
    }

    const grupPenerima = this.grupPenerimaRepository.create({
      id: uuidv4(),
      ...createGrupPenerimaDto,
      urutan,
    });

    return await this.grupPenerimaRepository.save(grupPenerima);
  }

  async findAll(company?: string, area?: string): Promise<GrupPenerimaEntity[]> {
    const query = this.grupPenerimaRepository.createQueryBuilder('grup_penerima');

    if (company) {
      query.where('grup_penerima.company = :company', { company });
    }

    if (area) {
      query.andWhere('grup_penerima.area = :area', { area });
    }

    return await query
      .andWhere('grup_penerima.aktif = :aktif', { aktif: true })
      .leftJoinAndSelect('grup_penerima.details', 'details')
      .orderBy('grup_penerima.urutan', 'ASC')
      .addOrderBy('grup_penerima.nama', 'ASC')
      .getMany();
  }

  /**
   * Get all grup penerima with enriched position detail from org_data
   * @param company - Filter by company
   * @param area - Filter by area
   * @param tgl - Optional date for org_data lookup (default: today)
   */
  async findAllWithPositionDetail(
    company?: string,
    area?: string,
    tgl?: string,
  ): Promise<GrupPenerimaResponseDto[]> {
    // Get grup penerima list
    const grupList = await this.findAll(company, area);

    if (grupList.length === 0) {
      return [];
    }

    // Get position_json from org_data
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];
    let positionJsonMap: Map<number, OrgDataPositionDto> = new Map();

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
      console.warn(`[GrupPenerimaService] org_data untuk tanggal ${tanggal} tidak ditemukan. Returning without position detail.`);
    }

    // Enrich grup penerima with position detail
    return grupList.map((grup) => ({
      id: grup.id,
      company: grup.company,
      area: grup.area,
      nama: grup.nama,
      deskripsi: grup.deskripsi,
      deskripsi_english: grup.deskripsi_english,
      urutan: grup.urutan,
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
    let positionJsonMap: Map<number, OrgDataPositionDto> = new Map();

    try {
      const orgData = await this.orgDataService.findOrg(tanggal);
      if (orgData && orgData.position_json) {
        const positionJson: OrgDataPositionDto[] = orgData.position_json;
        positionJson.forEach((pos) => {
          positionJsonMap.set(Number(pos.position), pos);
        });
      }
    } catch (error) {
      console.warn(`[GrupPenerimaService] org_data untuk tanggal ${tanggal} tidak ditemukan.`);
    }

    return {
      id: grup.id,
      company: grup.company,
      area: grup.area,
      nama: grup.nama,
      deskripsi: grup.deskripsi,
      deskripsi_english: grup.deskripsi_english,
      urutan: grup.urutan,
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
    let positionJsonMap: Map<number, OrgDataPositionDto> = new Map();

    try {
      const orgData = await this.orgDataService.findOrg(tanggal);
      if (orgData && orgData.position_json) {
        const positionJson: OrgDataPositionDto[] = orgData.position_json;
        positionJson.forEach((pos) => {
          positionJsonMap.set(Number(pos.position), pos);
        });
      }
    } catch (error) {
      console.warn(`[GrupPenerimaService] org_data untuk tanggal ${tanggal} tidak ditemukan.`);
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

  async remove(id: string): Promise<void> {
    const grupPenerima = await this.findOne(id);
    await this.grupPenerimaRepository.remove(grupPenerima);
  }

  async toggleAktif(id: string): Promise<GrupPenerimaEntity> {
    const grupPenerima = await this.findOne(id);
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
