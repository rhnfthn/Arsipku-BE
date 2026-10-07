import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { DiEntity } from '../../disposisi/entities/di.entity';
import { NASKAH_LAINNYA_JENIS } from '../../naskah-lainnya/dto/index.dto';
import { NaskahLainnyaApprovalEntity } from '../../naskah-lainnya/entities/naskah-lainnya-approval.entity';
import { NaskahSirkulasi } from '../../naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { TugasReferenceType } from '../enums';
import { TugasActor } from '../tugas.types';

export interface ResolvedTugasReference {
  referenceType: TugasReferenceType;
  referenceId: string;
  labelSnapshot: string;
  route: string;
}

/**
 * Adapter allowlist referensi ArsipKu. Resolver ini sekaligus menjadi access
 * boundary: metadata baru dibaca setelah posisi/company actor terbukti dapat
 * mengakses objek sumber. Semua kegagalan disamarkan sebagai 404.
 */
@Injectable()
export class TugasReferenceResolver {
  private readonly naskahLainnyaJenis = new Set<string>(NASKAH_LAINNYA_JENIS);

  constructor(
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
    @InjectRepository(DiEntity)
    private readonly diRepository: Repository<DiEntity>,
    @InjectRepository(NaskahSirkulasi)
    private readonly sirkulasiRepository: Repository<NaskahSirkulasi>,
    @InjectRepository(NaskahLainnyaApprovalEntity)
    private readonly approvalRepository: Repository<NaskahLainnyaApprovalEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async resolve(
    referenceType: TugasReferenceType,
    referenceId: string,
    actor: TugasActor,
  ): Promise<ResolvedTugasReference> {
    if (referenceType === TugasReferenceType.NASKAH_TERKIRIM) {
      return this.resolveNaskahTerkirim(referenceId, actor);
    }
    if (referenceType === TugasReferenceType.NASKAH_MASUK) {
      return this.resolveNaskahMasuk(referenceId, actor);
    }
    if (referenceType === TugasReferenceType.DISPOSISI) {
      return this.resolveDisposisi(referenceId, actor);
    }
    if (referenceType === TugasReferenceType.NASKAH_LAINNYA) {
      return this.resolveNaskahLainnya(referenceId, actor);
    }
    throw this.notAccessible();
  }

  /**
   * Resolve input manual berdasarkan nomor naskah secara exact. Hasil akhirnya
   * tetap melewati resolve() agar pemeriksaan jenis dan akses identik dengan
   * alur berbasis UUID. Semua kegagalan tetap disamarkan sebagai 404.
   */
  async resolveByNumber(
    referenceType: TugasReferenceType,
    referenceNumber: string,
    actor: TugasActor,
  ): Promise<ResolvedTugasReference> {
    const nomor = referenceNumber.trim();
    if (!nomor) throw this.notAccessible();

    if (
      [TugasReferenceType.DISPOSISI, TugasReferenceType.NASKAH_MASUK].includes(
        referenceType,
      )
    ) {
      const disposisi = await this.diRepository.findOne({
        where: { nomor },
        select: ['idNaskah'],
        order: { tanggal: 'DESC' },
      });
      if (disposisi?.idNaskah) {
        try {
          return await this.resolve(
            TugasReferenceType.DISPOSISI,
            disposisi.idNaskah,
            actor,
          );
        } catch (error) {
          if (!(error instanceof NotFoundException)) throw error;
        }
      }
      if (referenceType === TugasReferenceType.DISPOSISI)
        throw this.notAccessible();
    }

    const candidates = await this.naskahRepository.find({
      where: { nomor },
      select: ['id', 'jenis'],
      order: { tanggal: 'DESC' },
      take: 20,
    });
    const matchingCandidates = candidates.filter((candidate) =>
      referenceType === TugasReferenceType.NASKAH_LAINNYA
        ? this.naskahLainnyaJenis.has(String(candidate.jenis))
        : !this.naskahLainnyaJenis.has(String(candidate.jenis)),
    );

    for (const candidate of matchingCandidates) {
      try {
        return await this.resolve(
          referenceType === TugasReferenceType.NASKAH_MASUK &&
            candidate.jenis === 'DI'
            ? TugasReferenceType.DISPOSISI
            : referenceType,
          candidate.id,
          actor,
        );
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
      }
    }
    throw this.notAccessible();
  }

  async canOpen(
    referenceType: TugasReferenceType,
    referenceId: string,
    actor: TugasActor,
  ): Promise<boolean> {
    try {
      await this.resolve(referenceType, referenceId, actor);
      return true;
    } catch (error) {
      if (error instanceof NotFoundException) return false;
      throw error;
    }
  }

  async candidates(source: 'inbox' | 'sent', q: string, actor: TugasActor) {
    const query = this.naskahRepository
      .createQueryBuilder('n')
      .innerJoin(NaskahSirkulasi, 's', 's.id_naskah = n.id')
      .where('s.position = :position', { position: String(actor.position) })
      .andWhere('s.company = :company', { company: String(actor.company) })
      .andWhere('s.is_draft = 0')
      .andWhere(
        source === 'sent'
          ? "s.sirkuler = 'pengirim'"
          : "s.sirkuler IN ('penerima', 'tembusan')",
      )
      .andWhere('n.jenis IN (:...jenis)', {
        jenis: ['ND', 'SDI', 'SDE', 'DI', 'KA', 'K', 'UND'],
      })
      .andWhere("n.status IN ('final', 'final_tte')")
      .select(['n.id', 'n.jenis', 'n.nomor', 'n.perihal', 'n.tanggal'])
      .distinct(true)
      .orderBy('n.tanggal', 'DESC')
      .take(30);
    if (q.trim())
      query.andWhere('(n.nomor LIKE :q OR n.perihal LIKE :q)', {
        q: `%${q.trim()}%`,
      });
    const rows = await query.getMany();
    return rows.map((n) => ({
      referenceId: n.id,
      referenceType:
        source === 'sent'
          ? TugasReferenceType.NASKAH_TERKIRIM
          : n.jenis === 'DI'
            ? TugasReferenceType.DISPOSISI
            : TugasReferenceType.NASKAH_MASUK,
      label: this.buildLabel(n.nomor, n.perihal),
    }));
  }

  private async resolveNaskahTerkirim(
    referenceId: string,
    actor: TugasActor,
  ): Promise<ResolvedTugasReference> {
    const circulation = await this.sirkulasiRepository.findOne({
      where: {
        idNaskah: referenceId,
        position: String(actor.position),
        company: String(actor.company),
        sirkuler: 'pengirim',
        isDraft: false,
      },
      select: { id: true },
    });
    if (!circulation) throw this.notAccessible();
    const naskah = await this.findNaskah(referenceId);
    if (
      this.naskahLainnyaJenis.has(String(naskah.jenis)) ||
      !['final', 'final_tte'].includes(naskah.status)
    )
      throw this.notAccessible();
    return {
      referenceType: TugasReferenceType.NASKAH_TERKIRIM,
      referenceId,
      labelSnapshot: this.buildLabel(naskah.nomor, naskah.perihal),
      route: `/korespondensi/terkirim/${referenceId}?jenis=${naskah.jenis}`,
    };
  }

  private async resolveNaskahMasuk(
    referenceId: string,
    actor: TugasActor,
  ): Promise<ResolvedTugasReference> {
    await this.assertCirculationAccess(referenceId, actor);
    const naskah = await this.findNaskah(referenceId);
    if (
      naskah.jenis === 'DI' ||
      this.naskahLainnyaJenis.has(String(naskah.jenis))
    ) {
      throw this.notAccessible();
    }
    return {
      referenceType: TugasReferenceType.NASKAH_MASUK,
      referenceId,
      labelSnapshot: this.buildLabel(naskah.nomor, naskah.perihal),
      route: `/korespondensi/kotak-masuk/${referenceId}`,
    };
  }

  /** referenceId disposisi memakai naskah.id (route/API source of truth). */
  private async resolveDisposisi(
    referenceId: string,
    actor: TugasActor,
  ): Promise<ResolvedTugasReference> {
    await this.assertCirculationAccess(referenceId, actor);
    const naskah = await this.findNaskah(referenceId);
    if (naskah.jenis !== 'DI') throw this.notAccessible();
    const disposisi = await this.diRepository.findOne({
      where: { idNaskah: referenceId },
      select: ['id', 'idNaskah', 'nomor', 'perihal'],
    });
    if (!disposisi) throw this.notAccessible();
    return {
      referenceType: TugasReferenceType.DISPOSISI,
      referenceId,
      labelSnapshot: this.buildLabel(
        disposisi.nomor ?? naskah.nomor,
        disposisi.perihal ?? naskah.perihal,
      ),
      route: `/korespondensi/kotak-masuk/${referenceId}?jenis=DI`,
    };
  }

  private async resolveNaskahLainnya(
    referenceId: string,
    actor: TugasActor,
  ): Promise<ResolvedTugasReference> {
    const naskah = await this.findNaskah(referenceId);
    if (!this.naskahLainnyaJenis.has(String(naskah.jenis))) {
      throw this.notAccessible();
    }
    const snapshotCompany = naskah.dikirimOleh?.company;
    if (snapshotCompany && String(snapshotCompany) !== String(actor.company)) {
      throw this.notAccessible();
    }

    if (!this.isSuperadmin(actor)) {
      const positionId = String(actor.position);
      const isInitiator =
        String(naskah.dikirimOleh?.position_id ?? '') === positionId ||
        Number(naskah.dikirimOleh?.persnum) === Number(actor.persnum);
      const isSigner = (naskah.penandatanganChain ?? []).some(
        (signer) =>
          String(signer.positionId ?? '') === positionId ||
          Number(signer.persnum) === Number(actor.persnum),
      );
      const approval = await this.approvalRepository
        .createQueryBuilder('approval')
        .where('approval.naskah_id = :referenceId', { referenceId })
        .andWhere(
          '(approval.position_id = :positionId OR approval.delegate_persnum = :persnum)',
          { positionId, persnum: actor.persnum },
        )
        .getOne();
      if (!isInitiator && !isSigner && !approval) throw this.notAccessible();
    }

    return {
      referenceType: TugasReferenceType.NASKAH_LAINNYA,
      referenceId,
      labelSnapshot: this.buildLabel(naskah.nomor, naskah.perihal),
      route: `/naskah-lainnya/${referenceId}`,
    };
  }

  private async assertCirculationAccess(
    naskahId: string,
    actor: TugasActor,
  ): Promise<void> {
    if (this.isSuperadmin(actor)) return;
    const circulation = await this.sirkulasiRepository.findOne({
      where: {
        idNaskah: naskahId,
        position: String(actor.position),
        company: String(actor.company),
        sirkuler: In(['penerima', 'tembusan']),
        isDraft: false,
      },
      select: { id: true },
    });
    if (circulation) return;

    const rows: unknown = await this.dataSource.query(
      `SELECT 1 FROM naskah_share_recipient nsr
       JOIN naskah_share ns ON ns.id = nsr.share_id
       WHERE ns.naskah_id = ? AND nsr.recipient_id = ? AND ns.status = 'AKTIF'
       LIMIT 1`,
      [naskahId, String(actor.position)],
    );
    if (!Array.isArray(rows) || !rows.length) throw this.notAccessible();
  }

  private async findNaskah(referenceId: string): Promise<NaskahEntity> {
    const naskah = await this.naskahRepository.findOne({
      where: { id: referenceId },
      select: [
        'id',
        'jenis',
        'nomor',
        'perihal',
        'dikirimOleh',
        'penandatanganChain',
      ],
    });
    if (!naskah) throw this.notAccessible();
    return naskah;
  }

  private isSuperadmin(actor: TugasActor): boolean {
    return String(actor.role).toLowerCase() === 'superadmin';
  }

  private notAccessible(): NotFoundException {
    return new NotFoundException(
      'Referensi tidak ditemukan atau tidak dapat diakses',
    );
  }

  private buildLabel(nomor: string | null, perihal: string | null): string {
    const parts = [nomor, perihal].filter(Boolean);
    const label = parts.length ? parts.join(' — ') : 'Referensi ArsipKu';
    return label.length > 255 ? `${label.slice(0, 252)}...` : label;
  }
}
