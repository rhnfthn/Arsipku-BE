import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  UsulanTertujuEksternalEntity,
  UsulanTertujuStatus,
} from '../entities/usulan-tertuju-eksternal.entity';
import { EksternalEntity } from '../entities/eksternal.entity';
import { EksternalService } from './eksternal.service';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { OrganizationTuService } from '../../organization-tu/organization-tu.service';

export interface CreateUsulanTertujuDto {
  nama: string;
  alamat?: string;
  telepon?: string;
  email?: string;
}

export interface VerifyUsulanDto {
  catatan?: string;
}

@Injectable()
export class UsulanTertujuService {
  constructor(
    @InjectRepository(UsulanTertujuEksternalEntity)
    private usulanRepository: Repository<UsulanTertujuEksternalEntity>,
    @InjectRepository(EksternalEntity)
    private eksternalRepository: Repository<EksternalEntity>,
    private eksternalService: EksternalService,
    private orgDataService: OrgDataService,
    private organizationTuService: OrganizationTuService,
  ) {}

  /**
   * Generate kode unik 5 huruf yang tidak bentrok dengan eksternal manapun
   * (lintas area) maupun usulan lain yang sudah punya kode.
   */
  private async generateUniqueKode(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let kode: string;
    let exists: boolean;
    do {
      kode = Array.from({ length: 5 }, () =>
        chars.charAt(Math.floor(Math.random() * chars.length)),
      ).join('');
      const eksternalExists = await this.eksternalRepository.exist({
        where: { kode },
      });
      const usulanExists = await this.usulanRepository.exist({
        where: { kode },
      });
      exists = eksternalExists || usulanExists;
    } while (exists);
    return kode;
  }

  /** Preview kode unik (cek eksternal + usulan) untuk ditampilkan di FE. */
  async generateKodePreview(): Promise<string> {
    return this.generateUniqueKode();
  }

  /**
   * Buat usulan tertuju eksternal oleh user biasa.
   * Area/lokasi diambil otomatis dari org_data user pengusul —
   * TU yang memverifikasi adalah TU di area tersebut.
   */
  async createUsulan(
    dto: CreateUsulanTertujuDto,
    user: { persnum: number; nama?: string; position?: string },
  ): Promise<UsulanTertujuEksternalEntity> {
    if (!dto?.nama?.trim()) {
      throw new BadRequestException('Nama instansi wajib diisi');
    }

    const org = await this.orgDataService.findByPersnum(user.persnum);
    const area = org?.area || 'A000';
    const company = org?.company || 'MN';

    const kode = await this.generateUniqueKode();

    const usulan = this.usulanRepository.create({
      id: uuidv4(),
      nama: dto.nama.trim().toUpperCase(),
      kode,
      alamat: dto.alamat?.trim() || null,
      telepon: dto.telepon?.trim() || null,
      email: dto.email?.trim() || null,
      area,
      company,
      status: 'pending',
      usulanPersnum: user.persnum,
      usulanNama: user.nama || '',
      usulanPosition: user.position || null,
    });

    return this.usulanRepository.save(usulan);
  }

  /**
   * List usulan milik user (semua status) — untuk tab "Usulan Saya".
   */
  async findMine(persnum: number): Promise<UsulanTertujuEksternalEntity[]> {
    return this.usulanRepository.find({
      where: { usulanPersnum: persnum },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * List usulan untuk verifikasi TU.
   * - TU biasa: hanya usulan di area-nya (sesuai organization_tu.area_id).
   * - SUPERADMIN/ADMIN: semua area.
   * Filter status opsional (default: pending).
   */
  async findForVerification(
    user: {
      role?: string;
      tuRoles?: string[];
      persnum: number;
      area?: string;
    },
    status?: UsulanTertujuStatus,
  ): Promise<UsulanTertujuEksternalEntity[]> {
    const qb = this.usulanRepository.createQueryBuilder('u');

    if (status) {
      qb.andWhere('u.status = :status', { status });
    }

    const role = (user.role || '').toUpperCase();
    // Hanya SUPERADMIN yang melihat semua area. TU (ADMIN) dan user lain
    // hanya melihat usulan di area/lokasi penugasannya (organization_tu.area_id).
    const isSuperadmin = role === 'SUPERADMIN';
    if (!isSuperadmin) {
      const area = await this.getVerifierArea(user);
      if (!area) {
        throw new ForbiddenException('Area penugasan TU tidak ditemukan');
      }
      qb.andWhere('u.area = :area', { area });
    }

    return qb.orderBy('u.created_at', 'DESC').getMany();
  }

  /**
   * Setujui usulan: pindahkan data ke tabel eksternal utama
   * (langsung aktif, kode digenerate otomatis) lalu tandai usulan disetujui.
   */
  async approve(
    id: string,
    verifier: { persnum: number; nama?: string; role?: string; area?: string },
    dto?: VerifyUsulanDto,
  ): Promise<UsulanTertujuEksternalEntity> {
    const usulan = await this.usulanRepository.findOne({ where: { id } });
    if (!usulan) throw new NotFoundException('Usulan tidak ditemukan');
    await this.assertVerifierCanProcess(usulan, verifier);
    if (usulan.status !== 'pending') {
      throw new BadRequestException(
        `Usulan sudah diproses (status: ${usulan.status})`,
      );
    }

    // Masukkan ke tabel eksternal utama — aktif langsung.
    const eksternal = await this.eksternalService.create(
      {
        id_position_pembuat: usulan.usulanPosition || '',
        company: usulan.company,
        area: usulan.area,
        nama: usulan.nama,
        alamat: usulan.alamat || '',
        telepon: usulan.telepon || '',
        email: usulan.email || '',
        aktif: true,
      },
      usulan.kode || undefined,
    );

    usulan.status = 'disetujui';
    usulan.verifiedPersnum = verifier.persnum;
    usulan.verifiedNama = verifier.nama || '';
    usulan.verifiedAt = new Date();
    usulan.eksternalId = eksternal.id;
    // Catatan verifikasi opsional saat menyetujui.
    if (dto?.catatan?.trim()) {
      usulan.catatan = dto.catatan.trim();
    }

    return this.usulanRepository.save(usulan);
  }

  /**
   * Tolak usulan dengan catatan wajib.
   */
  async reject(
    id: string,
    verifier: { persnum: number; nama?: string; role?: string; area?: string },
    dto: VerifyUsulanDto,
  ): Promise<UsulanTertujuEksternalEntity> {
    if (!dto?.catatan?.trim()) {
      throw new BadRequestException('Catatan penolakan wajib diisi');
    }

    const usulan = await this.usulanRepository.findOne({ where: { id } });
    if (!usulan) throw new NotFoundException('Usulan tidak ditemukan');
    await this.assertVerifierCanProcess(usulan, verifier);
    if (usulan.status !== 'pending') {
      throw new BadRequestException(
        `Usulan sudah diproses (status: ${usulan.status})`,
      );
    }

    usulan.status = 'ditolak';
    usulan.verifiedPersnum = verifier.persnum;
    usulan.verifiedNama = verifier.nama || '';
    usulan.verifiedAt = new Date();
    usulan.catatan = dto.catatan.trim();

    return this.usulanRepository.save(usulan);
  }

  private async getVerifierArea(user: {
    persnum: number;
    area?: string;
  }): Promise<string | null> {
    const tuArea = await this.organizationTuService.getActiveAreaForPersnum(
      user.persnum,
    );
    return tuArea ?? user.area ?? null;
  }

  private async assertVerifierCanProcess(
    usulan: UsulanTertujuEksternalEntity,
    verifier: { persnum: number; role?: string; area?: string },
  ): Promise<void> {
    if (verifier.role?.toUpperCase() === 'SUPERADMIN') return;
    const area = await this.getVerifierArea(verifier);
    if (!area || area !== usulan.area) {
      throw new ForbiddenException('Usulan di luar area penugasan TU');
    }
  }

  /**
   * Jumlah usulan pending per area — untuk badge sidebar TU.
   */
  async countPending(area?: string): Promise<number> {
    const qb = this.usulanRepository
      .createQueryBuilder('u')
      .where('u.status = :status', { status: 'pending' });
    if (area) {
      qb.andWhere('u.area = :area', { area });
    }
    return qb.getCount();
  }

  /**
   * Jumlah usulan pending untuk user (badge sidebar).
   * SUPERADMIN: semua area; TU: area penugasannya (organization_tu.area_id).
   */
  async countPendingForUser(user: {
    role?: string;
    persnum: number;
    area?: string;
  }): Promise<number> {
    const role = (user.role || '').toUpperCase();
    if (role === 'SUPERADMIN') {
      return this.countPending();
    }
    const area = await this.getVerifierArea(user);
    return area ? this.countPending(area) : 0;
  }
}
