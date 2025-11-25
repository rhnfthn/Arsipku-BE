import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { GrupPenerimaEntity } from '../entity/grup-penerima.entity';
import { GrupPenerimaDetailEntity } from '../entity/grup-penerima-detail.entity';
import { CreateGrupPenerimaDto } from '../dto/grup-penerima/create-grup-penerima.dto';
import { UpdateGrupPenerimaDto } from '../dto/grup-penerima/update-grup-penerima.dto';
import { AddMemberGrupPenerimaDto } from '../dto/grup-penerima/add-member.dto';

@Injectable()
export class GrupPenerimaService {
  constructor(
    @InjectRepository(GrupPenerimaEntity)
    private grupPenerimaRepository: Repository<GrupPenerimaEntity>,
    @InjectRepository(GrupPenerimaDetailEntity)
    private grupPenerimaDetailRepository: Repository<GrupPenerimaDetailEntity>,
  ) {}

  async create(createGrupPenerimaDto: CreateGrupPenerimaDto): Promise<GrupPenerimaEntity> {
    const grupPenerima = this.grupPenerimaRepository.create({
      id: uuidv4(),
      ...createGrupPenerimaDto,
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
      .where('grup_penerima.aktif = :aktif', { aktif: true })
      .leftJoinAndSelect('grup_penerima.details', 'details')
      .orderBy('grup_penerima.urutan', 'ASC')
      .addOrderBy('grup_penerima.nama', 'ASC')
      .getMany();
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
    addMemberDto: AddMemberGrupPenerimaDto,
  ): Promise<GrupPenerimaDetailEntity> {
    const grupPenerima = await this.findOne(grupId);

    // Check if member already exists
    const existingMember = await this.grupPenerimaDetailRepository.findOne({
      where: {
        id_grup_penerima: grupId,
        position: addMemberDto.position,
      },
    });

    if (existingMember) {
      throw new BadRequestException('Member sudah ada dalam grup ini');
    }

    const detail = this.grupPenerimaDetailRepository.create({
      id: uuidv4(),
      id_grup_penerima: grupId,
      ...addMemberDto,
    });

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
