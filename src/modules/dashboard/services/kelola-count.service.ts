import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { TransferActiveToInactiveEntity } from '../../transfer-active-to-inactive/entities/transfer-active-to-inactive.entity';
import { TransferApprovalLevelEntity } from '../../transfer-active-to-inactive/entities/approval-level.entity';
import { TransferActiveToInactiveStatus } from '../../transfer-active-to-inactive/enums/transfer-status.enum';
import { PenyusutanEntity } from '../../penyusutan/entities/penyusutan.entity';
import { PenyusutanVerifikatorEntity } from '../../penyusutan/entities/penyusutan-verifikator.entity';
import { PenyusutanStatus } from '../../penyusutan/enums/penyusutan-status.enum';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/**
 * Service untuk badge notifikasi menu Kelola di sidebar.
 *
 * Menghitung jumlah item "menunggu aksi user login" untuk setiap menu
 * di bawah Kelola:
 *  - Penerimaan Usulan (TU): usulan pindah arsip yang menunggu verifikasi
 *    berkas fisik oleh TU (status DIKIRIM / MENUNGGU_VERIFIKASI_BERKAS_FISIK).
 *  - Penataan Arsip Inaktif (TU): arsip inaktif diterima yang belum ditata
 *    (status ARSIP_INAKTIF_DITERIMA / PENATAAN_ARSIP_INAKTIF).
 *  - Verifikasi Persetujuan (Atasan TU): usulan yang giliran persetujuannya
 *    tiba pada user login (multi-level tuApprovalLevels).
 *  - Verifikasi Usulan (Atasan Managerial): usulan pemindahan yang giliran
 *    verifikasinya tiba pada user login (transfer_approval_levels).
 *  - Pengajuan Penyusutan (TU): arsip SELESAI penataan yang belum diajukan
 *    penyusutan (draft tersedia).
 *  - Verifikasi Penyusutan (Atasan TU): pengajuan penyusutan status DIAJUKAN
 *    yang giliran verifikasinya tiba pada user login.
 *  - Penataan & Pemusnahan (TU): penyusutan DITERIMA yang belum ditata/dimusnahkan.
 */
@Injectable()
export class KelolaCountService {
  private readonly logger = new Logger(KelolaCountService.name);

  constructor(
    @InjectRepository(TransferActiveToInactiveEntity)
    private readonly transferRepo: Repository<TransferActiveToInactiveEntity>,
    @InjectRepository(TransferApprovalLevelEntity)
    private readonly transferLevelRepo: Repository<TransferApprovalLevelEntity>,
    @InjectRepository(PenyusutanEntity)
    private readonly penyusutanRepo: Repository<PenyusutanEntity>,
    @InjectRepository(PenyusutanVerifikatorEntity)
    private readonly penyusutanLevelRepo: Repository<PenyusutanVerifikatorEntity>,
  ) {}

  async getCounts(user: JwtPayload): Promise<{
    penerimaanUsulan: number;
    penataanArsipInaktif: number;
    verifikasiPersetujuanTu: number;
    verifikasiUsulan: number;
    pengajuanPenyusutan: number;
    verifikasiPenyusutan: number;
    penataanPemusnahan: number;
  }> {
    const persnum = Number(user?.persnum);
    const empty = {
      penerimaanUsulan: 0,
      penataanArsipInaktif: 0,
      verifikasiPersetujuanTu: 0,
      verifikasiUsulan: 0,
      pengajuanPenyusutan: 0,
      verifikasiPenyusutan: 0,
      penataanPemusnahan: 0,
    };
    if (!persnum || Number.isNaN(persnum)) return empty;

    const tuRoles: string[] = Array.isArray(user?.tuRoles) ? user.tuRoles : [];
    const isTu = tuRoles.includes('tu');
    const isSekretaris = tuRoles.includes('sekretaris');

    const [
      penerimaanUsulan,
      penataanArsipInaktif,
      verifikasiPersetujuanTu,
      verifikasiUsulan,
      pengajuanPenyusutan,
      verifikasiPenyusutan,
      penataanPemusnahan,
    ] = await Promise.all([
      isTu ? this.countPenerimaanUsulan() : Promise.resolve(0),
      isTu ? this.countPenataanArsipInaktif() : Promise.resolve(0),
      this.countVerifikasiPersetujuanTu(persnum),
      this.countVerifikasiUsulan(persnum),
      isTu ? this.countPengajuanPenyusutanDraft() : Promise.resolve(0),
      this.countVerifikasiPenyusutan(persnum),
      isTu ? this.countPenataanPemusnahan(persnum) : Promise.resolve(0),
    ]);

    return {
      penerimaanUsulan,
      penataanArsipInaktif,
      verifikasiPersetujuanTu,
      verifikasiUsulan,
      pengajuanPenyusutan,
      verifikasiPenyusutan,
      penataanPemusnahan,
    };
  }

  /** Penerimaan Usulan: usulan yang menunggu verifikasi berkas fisik oleh TU. */
  private async countPenerimaanUsulan(): Promise<number> {
    return this.transferRepo
      .createQueryBuilder('t')
      .where('t.status IN (:...statuses)', {
        statuses: [
          TransferActiveToInactiveStatus.DIKIRIM,
          TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_BERKAS_FISIK,
        ],
      })
      .getCount();
  }

  /** Penataan Arsip Inaktif: arsip diterima yang belum selesai ditata. */
  private async countPenataanArsipInaktif(): Promise<number> {
    return this.transferRepo
      .createQueryBuilder('t')
      .where('t.status IN (:...statuses)', {
        statuses: [
          TransferActiveToInactiveStatus.ARSIP_INAKTIF_DITERIMA,
          TransferActiveToInactiveStatus.PENATAAN_ARSIP_INAKTIF,
        ],
      })
      .getCount();
  }

  /**
   * Verifikasi Persetujuan (Atasan TU): usulan yang tuApprovedAt terisi,
   * status masih menunggu persetujuan TU, dan giliran user login
   * (currentTuApprovalLevel = urutan user di tuApprovalLevels).
   */
  private async countVerifikasiPersetujuanTu(persnum: number): Promise<number> {
    try {
      const rows = await this.transferRepo
        .createQueryBuilder('t')
        .select([
          't.id',
          't.tuApprovalLevels',
          't.currentTuApprovalLevel',
          't.status',
        ])
        .where('t.tu_approved_at IS NOT NULL')
        .andWhere('t.status IN (:...statuses)', {
          statuses: [
            TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_PERSETUJUAN_TU,
            TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TU,
            TransferActiveToInactiveStatus.MENUNGGU_PERSETUJUAN_TERAKHIR_TU,
          ],
        })
        .getMany();

      let count = 0;
      for (const t of rows) {
        const levels = this.parseLevels(t.tuApprovalLevels);
        if (!levels || levels.length === 0) continue;
        const myLevel = levels.find((l) => Number(l.persnum) === persnum);
        if (!myLevel) continue;
        if (
          t.status === TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TU
        ) {
          // Persetujuan terakhir → giliran verifikator terakhir
          const finalLevel = levels.reduce((latest, level) =>
            level.urutan > latest.urutan ? level : latest,
          );
          if (myLevel.urutan === finalLevel.urutan) count += 1;
        } else if (
          Number(t.currentTuApprovalLevel) === Number(myLevel.urutan)
        ) {
          count += 1;
        }
      }
      return count;
    } catch (e) {
      this.logger.warn(`countVerifikasiPersetujuanTu failed: ${e?.message}`);
      return 0;
    }
  }

  /**
   * Verifikasi Usulan (Atasan Managerial Unit Kerja): usulan pemindahan yang
   * giliran verifikasinya tiba pada user login (urutan = currentApprovalLevel).
   */
  private async countVerifikasiUsulan(persnum: number): Promise<number> {
    try {
      const count = await this.transferLevelRepo
        .createQueryBuilder('l')
        .innerJoin(
          TransferActiveToInactiveEntity,
          't',
          't.id = l.transferId AND t.tanggal = l.tanggal',
        )
        .where('l.atasanPersnum = :persnum', { persnum })
        .andWhere('l.urutan = t.currentApprovalLevel')
        .andWhere('t.status = :status', {
          status: TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_ATASAN,
        })
        .getCount();
      return count;
    } catch (e) {
      this.logger.warn(`countVerifikasiUsulan failed: ${e?.message}`);
      return 0;
    }
  }

  /**
   * Pengajuan Penyusutan (draft tersedia): usulan pemindahan SELESAI yang
   * belum punya pengajuan penyusutan aktif untuk berkas yang sama.
   */
  private async countPengajuanPenyusutanDraft(): Promise<number> {
    try {
      const selesaiList = await this.transferRepo
        .createQueryBuilder('t')
        .select(['t.id', 't.arsipIds', 't.arsipId'])
        .where('t.status = :status', {
          status: TransferActiveToInactiveStatus.SELESAI,
        })
        .getMany();

      if (selesaiList.length === 0) return 0;

      // Kumpulkan berkasId kandidat (arsip pertama dari tiap usulan selesai)
      const berkasIds = selesaiList
        .map((t) =>
          Array.isArray(t.arsipIds) && t.arsipIds.length > 0
            ? t.arsipIds[0]?.id
            : t.arsipId,
        )
        .filter(Boolean) as string[];

      if (berkasIds.length === 0) return 0;

      // Berkas yang sudah punya pengajuan penyusutan (semua status) di-exclude
      const existing = await this.penyusutanRepo
        .createQueryBuilder('p')
        .select('p.berkasId')
        .where('p.berkasId IN (:...ids)', { ids: berkasIds })
        .getMany();
      const sudahDiajukan = new Set(existing.map((p) => p.berkasId));

      return berkasIds.filter((id) => !sudahDiajukan.has(id)).length;
    } catch (e) {
      this.logger.warn(`countPengajuanPenyusutanDraft failed: ${e?.message}`);
      return 0;
    }
  }

  /**
   * Verifikasi Penyusutan: pengajuan status DIAJUKAN yang giliran verifikator
   * (urutan = currentVerifikatorUrutan) adalah user login.
   */
  private async countVerifikasiPenyusutan(persnum: number): Promise<number> {
    try {
      return await this.penyusutanLevelRepo
        .createQueryBuilder('l')
        .innerJoin(PenyusutanEntity, 'p', 'p.id = l.penyusutanId')
        .where('l.atasanPersnum = :persnum', { persnum })
        .andWhere('l.urutan = p.current_verifikator_urutan')
        .andWhere('p.status = :status', { status: PenyusutanStatus.DIAJUKAN })
        .getCount();
    } catch (e) {
      this.logger.warn(`countVerifikasiPenyusutan failed: ${e?.message}`);
      return 0;
    }
  }

  /** Penataan & Pemusnahan: penyusutan DITERIMA milik TU yang belum ditata. */
  private async countPenataanPemusnahan(persnum: number): Promise<number> {
    try {
      return await this.penyusutanRepo
        .createQueryBuilder('p')
        .where('p.tu_persnum = :persnum', { persnum })
        .andWhere('p.status = :status', { status: PenyusutanStatus.DITERIMA })
        .getCount();
    } catch (e) {
      this.logger.warn(`countPenataanPemusnahan failed: ${e?.message}`);
      return 0;
    }
  }

  /** Parse tuApprovalLevels yang bisa berupa object/string/array. */
  private parseLevels(
    raw: any,
  ): Array<{ persnum: number; urutan: number }> | null {
    if (!raw) return null;
    let levels = raw;
    if (typeof levels === 'string') {
      try {
        levels = JSON.parse(levels);
      } catch {
        return null;
      }
    }
    if (!Array.isArray(levels)) return null;
    return levels;
  }
}
