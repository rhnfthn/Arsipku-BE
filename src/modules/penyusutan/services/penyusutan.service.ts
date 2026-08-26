import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PenyusutanEntity } from '../entities/penyusutan.entity';
import { PenyusutanVerifikatorEntity } from '../entities/penyusutan-verifikator.entity';
import { PenyusutanStatus } from '../enums/penyusutan-status.enum';
import {
  AjukanPenyusutanDto,
  VerifyPenyusutanDto,
  SimpanPenataanDto,
  PemusnahanDto,
  BackupDataDto,
} from '../dto/penyusutan.dto';
import { AuditTrailService } from '../../audit/services/audit-trail.service';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { AuditModule } from '../../audit/enums/audit-module.enum';
import { AuditStatus } from '../../audit/enums/audit-status.enum';
import { NotificationService } from '../../notification/services';
import { NotificationType } from '../../notification/entities/notification.entity';
import { StorageService } from '../../storage/services/storage.service';
import { ArsipService } from '../../arsip/services/arsip.service';

const LEVEL_MENUNGGU = 'MENUNGGU';
const LEVEL_DISETUJUI = 'DISETUJUI';
const LEVEL_DITOLAK = 'DITOLAK';

/**
 * Service untuk fitur Penyusutan arsip.
 * Unit Dokumen (TU) mengajukan → Atasan Managerial TU verifikasi berjenjang
 *   → DITERIMA → Penataan (permanen) / Pemusnahan (musnah) → SELESAI.
 */
@Injectable()
export class PenyusutanService {
  private readonly logger = new Logger(PenyusutanService.name);

  constructor(
    @InjectRepository(PenyusutanEntity)
    private readonly repo: Repository<PenyusutanEntity>,
    @InjectRepository(PenyusutanVerifikatorEntity)
    private readonly levelRepo: Repository<PenyusutanVerifikatorEntity>,
    private readonly auditTrailService: AuditTrailService,
    private readonly notificationService: NotificationService,
    private readonly storageService: StorageService,
    private readonly arsipService: ArsipService,
  ) {}

  // ─── AJUKAN (CREATE) ──────────────────────────────────────────────

  async ajukan(dto: AjukanPenyusutanDto, user: any): Promise<PenyusutanEntity> {
    if (!dto.atasanList || dto.atasanList.length === 0) {
      throw new BadRequestException('Minimal pilih 1 atasan');
    }
    const atasanPersnums = dto.atasanList.map((a) => Number(a.persnum));
    if (new Set(atasanPersnums).size !== atasanPersnums.length) {
      throw new BadRequestException('Tidak boleh ada atasan duplikat');
    }
    if (atasanPersnums[0] === Number(user.persnum)) {
      throw new BadRequestException(
        'Atasan pertama tidak boleh sama dengan pengusul',
      );
    }

    // Cek apakah berkas sudah punya pengajuan penyusutan aktif (bukan SELESAI/DITOLAK)
    const existing = await this.repo.findOne({
      where: { berkasId: dto.berkasId },
      order: { createdAt: 'DESC' },
    });
    if (
      existing &&
      existing.status !== PenyusutanStatus.SELESAI &&
      existing.status !== PenyusutanStatus.DITOLAK
    ) {
      throw new BadRequestException(
        'Berkas ini sudah memiliki pengajuan penyusutan yang masih aktif',
      );
    }

    const nomorUsulan = await this.generateNomorUsulan();
    const firstAtasan = dto.atasanList[0];

    const entity = this.repo.create({
      nomorUsulan,
      tanggalUsulan: new Date(),
      tuPersnum: Number(user.persnum),
      tuName: user.nama ?? String(user.persnum),
      berkasId: dto.berkasId,
      kodeBerkas: dto.kodeBerkas ?? null,
      namaBerkas: dto.namaBerkas ?? '-',
      klasifikasi: dto.klasifikasi ?? null,
      klasifikasiText: dto.klasifikasiText ?? null,
      tanggalRetensiHabis: dto.tanggalRetensiHabis
        ? new Date(dto.tanggalRetensiHabis)
        : null,
      jenisPenyusutan: dto.jenisPenyusutan,
      catatan: dto.catatan ?? null,
      daftarArsip: dto.daftarArsip ?? null,
      currentVerifikatorUrutan: 1,
      totalVerifikator: dto.atasanList.length,
      status: PenyusutanStatus.DIAJUKAN,
    });

    const saved = await this.repo.save(entity);

    // Simpan daftar atasan ke penyusutan_verifikator
    const levels: PenyusutanVerifikatorEntity[] = dto.atasanList.map(
      (a, idx: number) =>
        this.levelRepo.create({
          penyusutanId: saved.id,
          atasanPersnum: Number(a.persnum),
          atasanName: a.name ?? String(a.persnum),
          atasanPositionId: a.positionId ?? null,
          atasanPositionText: a.positionText ?? null,
          urutan: idx + 1,
          status: LEVEL_MENUNGGU,
        }),
    );
    await this.levelRepo.save(levels);

    this.logAudit(
      user,
      saved,
      null,
      saved.status,
      `Pengajuan penyusutan dibuat oleh ${saved.tuName}`,
    );

    // Notifikasi atasan pertama
    await this.notify(
      saved,
      firstAtasan.positionId != null ? String(firstAtasan.positionId) : null,
      Number(firstAtasan.persnum),
      `Verifikasi Pengajuan Penyusutan (Tahap 1 dari ${saved.totalVerifikator})`,
    );

    return saved;
  }

  // ─── VERIFIKASI (APPROVE / REJECT) ────────────────────────────────

  async verify(
    id: string,
    dto: VerifyPenyusutanDto,
    user: any,
    disetujui: boolean,
  ): Promise<PenyusutanEntity> {
    const item = await this.getItem(id);
    if (item.status !== PenyusutanStatus.DIAJUKAN) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa diverifikasi`,
      );
    }

    const currentLevel = await this.getLevel(
      item.id,
      item.currentVerifikatorUrutan,
    );
    if (!currentLevel) {
      throw new BadRequestException('Level verifikasi tidak ditemukan');
    }
    if (currentLevel.atasanPersnum !== Number(user.persnum)) {
      throw new BadRequestException(
        `Bukan giliran Anda. Saat ini giliran atasan urutan ${item.currentVerifikatorUrutan} (${currentLevel.atasanName}).`,
      );
    }

    const old = item.status;

    if (!disetujui) {
      // Tolak
      await this.levelRepo
        .createQueryBuilder()
        .update(PenyusutanVerifikatorEntity)
        .set({
          status: LEVEL_DITOLAK,
          verifiedAt: new Date(),
          catatan: dto.catatan ?? null,
        })
        .where('penyusutan_id = :pid AND urutan = :urutan', {
          pid: item.id,
          urutan: item.currentVerifikatorUrutan,
        })
        .execute();

      item.status = PenyusutanStatus.DITOLAK;
      item.rejectedNote = dto.catatan ?? null;
      const saved = await this.repo.save(item);
      this.logAudit(
        user,
        saved,
        old,
        saved.status,
        `Penyusutan ditolak oleh ${currentLevel.atasanName} (urutan ${currentLevel.urutan})`,
      );
      // Notifikasi TU
      await this.notify(
        saved,
        null,
        saved.tuPersnum,
        `Pengajuan Penyusutan ${saved.nomorUsulan} ditolak`,
      );
      return saved;
    }

    // Setujui
    await this.levelRepo
      .createQueryBuilder()
      .update(PenyusutanVerifikatorEntity)
      .set({
        status: LEVEL_DISETUJUI,
        verifiedAt: new Date(),
        catatan: dto.catatan ?? null,
      })
      .where('penyusutan_id = :pid AND urutan = :urutan', {
        pid: item.id,
        urutan: item.currentVerifikatorUrutan,
      })
      .execute();

    const nextLevel = await this.getLevel(
      item.id,
      item.currentVerifikatorUrutan + 1,
    );

    if (nextLevel) {
      // Masih ada atasan berikutnya
      item.status = PenyusutanStatus.DIAJUKAN;
      item.currentVerifikatorUrutan = item.currentVerifikatorUrutan + 1;
      const saved = await this.repo.save(item);
      this.logAudit(
        user,
        saved,
        old,
        saved.status,
        `Disetujui level ${currentLevel.urutan} oleh ${currentLevel.atasanName} — lanjut level ${nextLevel.urutan}`,
      );
      // Notifikasi atasan berikutnya
      await this.notify(
        saved,
        nextLevel.atasanPositionId != null
          ? String(nextLevel.atasanPositionId)
          : null,
        nextLevel.atasanPersnum,
        `Verifikasi Penyusutan (Tahap ${nextLevel.urutan} dari ${item.totalVerifikator})`,
      );
      // Notifikasi TU
      await this.notify(
        saved,
        null,
        saved.tuPersnum,
        `Pengajuan disetujui tahap ${currentLevel.urutan}, menunggu tahap ${nextLevel.urutan}`,
      );
      return saved;
    }

    // Atasan terakhir → DITERIMA
    item.status = PenyusutanStatus.DITERIMA;
    const saved = await this.repo.save(item);
    this.logAudit(
      user,
      saved,
      old,
      saved.status,
      `Disetujui level terakhir oleh ${currentLevel.atasanName} — penyusutan diterima`,
    );
    // Notifikasi TU
    await this.notify(
      saved,
      null,
      saved.tuPersnum,
      `Pengajuan Penyusutan ${saved.nomorUsulan} diterima, siap untuk penataan/pemusnahan`,
    );
    return saved;
  }

  // ─── PENATAAN & PEMUSNAHAN ─────────────────────────────────────────

  async simpanPenataan(
    id: string,
    dto: SimpanPenataanDto,
    user: any,
  ): Promise<PenyusutanEntity> {
    const item = await this.getItem(id);
    if (item.tuPersnum !== Number(user.persnum)) {
      throw new BadRequestException(
        'Anda tidak memiliki akses untuk melakukan penataan arsip ini',
      );
    }
    if (item.status !== PenyusutanStatus.DITERIMA) {
      throw new BadRequestException(
        'Penataan hanya bisa dilakukan untuk penyusutan yang sudah diterima',
      );
    }
    if (item.jenisPenyusutan !== 'permanen') {
      throw new BadRequestException(
        'Penataan hanya untuk jenis penyusutan Permanen',
      );
    }
    const old = item.status;
    item.lokasiSimpan = dto.lokasiSimpan;
    item.beritaAcara = dto.beritaAcara;
    item.fotoDokumentasi = dto.fotoDokumentasi || null;

    // Arsipkan ke database arsipku_arsip_local (Permanen) SEBELUM set SELESAI.
    // Jika berkas sudah diarsipkan (mis. oleh penyusutan musnah lain untuk
    // berkas yang sama), lewati insert — tidak perlu duplikat snapshot.
    const alreadyArchived = await this.arsipService.isBerkasArchived(
      item.berkasId,
    );
    if (!alreadyArchived) {
      try {
        await this.arsipService.arsipkanBerkas(item.berkasId, {
          user: {
            persnum: Number(user.persnum),
            nama: user.nama ?? String(user.persnum),
          },
          penyusutanId: item.id,
          jenisPenyusutan: 'permanen',
          statusSebelumnya: old,
          statusBaru: PenyusutanStatus.SELESAI,
          beritaAcaraUrl: dto.beritaAcara,
          fotoDokumentasiUrl: dto.fotoDokumentasi,
          catatan: dto.lokasiSimpan,
        });
      } catch (e: any) {
        this.logger.error(
          `Gagal arsipkan berkas ${item.berkasId}: ${e?.message}`,
          e?.stack,
        );
        throw new BadRequestException(
          `Gagal mengarsipkan berkas: ${e?.message}`,
        );
      }
    } else {
      // Berkas sudah diarsipkan oleh penyusutan lain — catat log saja.
      await this.arsipService.logPenyusutanArchived({
        user: {
          persnum: Number(user.persnum),
          nama: user.nama ?? String(user.persnum),
        },
        penyusutanId: item.id,
        sourceBerkasId: item.berkasId,
        jenisPenyusutan: 'permanen',
        statusSebelumnya: old,
        statusBaru: PenyusutanStatus.SELESAI,
        beritaAcaraUrl: dto.beritaAcara,
        fotoDokumentasiUrl: dto.fotoDokumentasi,
        catatan: dto.lokasiSimpan,
      });
    }

    item.status = PenyusutanStatus.SELESAI;
    const saved = await this.repo.save(item);

    // NOTE: Untuk penataan PERMANEN, berkas inti TIDAK di-soft-delete.
    // Arsip permanen tetap bisa dilihat dari DB inti (preview-berkas).
    // Hanya pemusnahan (musnah) yang soft-delete berkas inti.

    this.logAudit(
      user,
      saved,
      old,
      saved.status,
      `Penataan arsip permanen — lokasi: ${dto.lokasiSimpan}`,
    );
    return saved;
  }

  async pemusnahan(
    id: string,
    dto: PemusnahanDto,
    user: any,
  ): Promise<PenyusutanEntity> {
    const item = await this.getItem(id);
    if (item.tuPersnum !== Number(user.persnum)) {
      throw new BadRequestException(
        'Anda tidak memiliki akses untuk melakukan pemusnahan arsip ini',
      );
    }
    if (item.status !== PenyusutanStatus.DITERIMA) {
      throw new BadRequestException(
        'Pemusnahan hanya bisa dilakukan untuk penyusutan yang sudah diterima',
      );
    }
    if (item.jenisPenyusutan !== 'musnah') {
      throw new BadRequestException(
        'Pemusnahan hanya untuk jenis penyusutan Musnah',
      );
    }
    const old = item.status;
    item.beritaAcara = dto.beritaAcara;

    // Arsipkan ke database arsipku_arsip_local (Musnah) SEBELUM set SELESAI.
    // Jika berkas sudah diarsipkan (mis. oleh penyusutan lain untuk berkas
    // yang sama), lewati insert — tidak perlu duplikat snapshot.
    const alreadyArchived = await this.arsipService.isBerkasArchived(
      item.berkasId,
    );
    if (!alreadyArchived) {
      await this.arsipService.arsipkanBerkas(item.berkasId, {
        user: {
          persnum: Number(user.persnum),
          nama: user.nama ?? String(user.persnum),
        },
        penyusutanId: item.id,
        jenisPenyusutan: 'musnah',
        statusSebelumnya: old,
        statusBaru: PenyusutanStatus.SELESAI,
        beritaAcaraUrl: dto.beritaAcara,
        catatan: dto.catatan,
      });
    } else {
      // Berkas sudah diarsipkan oleh penyusutan lain — catat log saja.
      await this.arsipService.logPenyusutanArchived({
        user: {
          persnum: Number(user.persnum),
          nama: user.nama ?? String(user.persnum),
        },
        penyusutanId: item.id,
        sourceBerkasId: item.berkasId,
        jenisPenyusutan: 'musnah',
        statusSebelumnya: old,
        statusBaru: PenyusutanStatus.SELESAI,
        beritaAcaraUrl: dto.beritaAcara,
        catatan: dto.catatan,
      });
    }

    item.status = PenyusutanStatus.SELESAI;
    const saved = await this.repo.save(item);

    // Soft-delete master berkas dari DB inti — arsip musnah tidak bisa
    // dilihat lagi, hanya berita acara yang tersisa.
    try {
      await this.arsipService.softDeleteBerkas(item.berkasId);
    } catch (e: any) {
      this.logger.warn(
        `Pemusnahan sukses tapi gagal hapus berkas inti: ${e?.message}`,
      );
    }

    this.logAudit(
      user,
      saved,
      old,
      saved.status,
      `Pemusnahan arsip — berita acara: ${dto.beritaAcara}`,
    );
    return saved;
  }

  /**
   * Backup data arsip musnah ke database arsipku_arsip_local, lalu
   * hapus master berkas dari database inti (soft delete).
   *
   * Urutan WAJIB: insert ke DB arsip dulu (transaction), baru hapus dari DB inti.
   * Jika insert gagal → rollback, berkas inti TIDAK dihapus, error dilempar.
   */
  async backupData(
    id: string,
    dto: BackupDataDto,
    user: any,
  ): Promise<{
    penyusutanId: string;
    sourceBerkasId: string;
    arsipBerkasId: number;
    isMusnah: boolean;
    deletedAt: Date | null;
  }> {
    const item = await this.getItem(id);

    // ── Validasi ───────────────────────────────────────────────────
    if (item.tuPersnum !== Number(user.persnum)) {
      throw new BadRequestException(
        'Anda tidak memiliki akses untuk melakukan backup data arsip ini',
      );
    }
    // Status boleh DITERIMA (belum diproses) atau SELESAI (pemusnahan sudah
    // dijalankan tapi backup gagal/terlewat). arsipkanBerkas mencegah duplikat.
    if (
      item.status !== PenyusutanStatus.DITERIMA &&
      item.status !== PenyusutanStatus.SELESAI
    ) {
      throw new BadRequestException(
        'Backup data hanya bisa dilakukan untuk penyusutan yang sudah diterima',
      );
    }
    if (
      item.jenisPenyusutan !== 'musnah' &&
      item.jenisPenyusutan !== 'permanen'
    ) {
      throw new BadRequestException(
        'Backup data hanya untuk jenis penyusutan Musnah atau Permanen',
      );
    }
    if (!item.beritaAcara) {
      throw new BadRequestException(
        'Berita acara harus diupload sebelum backup data',
      );
    }

    // ── 1. Insert ke DB arsip (transaction) ─────────────────────────
    // Jika berkas sudah diarsipkan (mis. oleh pemusnahan), lewati insert.
    let arsipBerkasId: number;
    const alreadyArchived = await this.arsipService.isBerkasArchived(
      item.berkasId,
    );
    if (alreadyArchived) {
      arsipBerkasId = 0;
      // Berkas sudah diarsipkan oleh penyusutan lain — catat log saja.
      await this.arsipService.logPenyusutanArchived({
        user: {
          persnum: Number(user.persnum),
          nama: user.nama ?? String(user.persnum),
        },
        penyusutanId: item.id,
        sourceBerkasId: item.berkasId,
        jenisPenyusutan: item.jenisPenyusutan,
        statusSebelumnya: item.status,
        statusBaru: PenyusutanStatus.SELESAI,
        beritaAcaraUrl: item.beritaAcara,
        fotoDokumentasiUrl: item.fotoDokumentasi ?? undefined,
        catatan: dto.catatan ?? undefined,
      });
    } else {
      try {
        const arsipBerkas = await this.arsipService.arsipkanBerkas(
          item.berkasId,
          {
            user: {
              persnum: Number(user.persnum),
              nama: user.nama ?? String(user.persnum),
            },
            penyusutanId: item.id,
            jenisPenyusutan: item.jenisPenyusutan,
            statusSebelumnya: item.status,
            statusBaru: PenyusutanStatus.SELESAI,
            beritaAcaraUrl: item.beritaAcara,
            fotoDokumentasiUrl: item.fotoDokumentasi ?? undefined,
            catatan: dto.catatan ?? undefined,
          },
        );
        arsipBerkasId = arsipBerkas.id;
      } catch (e: any) {
        // Insert gagal → rollback otomatis oleh transaction, berkas inti TIDAK dihapus
        this.logger.error(`Backup data gagal: ${e?.message}`);
        throw new BadRequestException(`Backup gagal: ${e?.message}`);
      }
    }

    // ── 2. Update status penyusutan → SELESAI ──────────────────────
    const old = item.status;
    item.status = PenyusutanStatus.SELESAI;
    const saved = await this.repo.save(item);

    // ── 3. Hapus master berkas dari DB inti (soft delete) ───────────
    // Hanya untuk musnah — permanen tetap bisa dilihat di DB inti.
    let deletedAt: Date | null = null;
    if (item.jenisPenyusutan === 'musnah') {
      try {
        await this.arsipService.softDeleteBerkas(item.berkasId);
        deletedAt = new Date();
      } catch (e: any) {
        this.logger.warn(
          `Backup sukses tapi gagal hapus berkas inti: ${e?.message}`,
        );
      }
    }

    this.logAudit(
      user,
      saved,
      old,
      saved.status,
      `Backup data arsip ${item.jenisPenyusutan} — berkas ${item.berkasId} dipindahkan ke DB arsip`,
    );

    return {
      penyusutanId: saved.id,
      sourceBerkasId: item.berkasId,
      arsipBerkasId,
      isMusnah: item.jenisPenyusutan === 'musnah',
      deletedAt,
    };
  }

  /** Update foto dokumentasi (untuk edit setelah penataan selesai). */
  async updateFotoDokumentasi(
    id: string,
    fotoUrl: string,
    user: any,
  ): Promise<PenyusutanEntity> {
    const item = await this.getItem(id);
    if (item.tuPersnum !== Number(user.persnum)) {
      throw new BadRequestException(
        'Anda tidak memiliki akses untuk memperbarui foto dokumentasi arsip ini',
      );
    }
    item.fotoDokumentasi = fotoUrl || null;
    const saved = await this.repo.save(item);
    this.logAudit(
      user,
      saved,
      saved.status,
      saved.status,
      `Update foto dokumentasi penataan arsip`,
    );
    return saved;
  }

  /** Update berita acara (untuk edit setelah penataan/pemusnahan selesai). */
  async updateBeritaAcara(
    id: string,
    beritaAcaraUrl: string,
    user: any,
  ): Promise<PenyusutanEntity> {
    const item = await this.getItem(id);
    if (item.tuPersnum !== Number(user.persnum)) {
      throw new BadRequestException(
        'Anda tidak memiliki akses untuk memperbarui berita acara arsip ini',
      );
    }
    item.beritaAcara = beritaAcaraUrl || null;
    const saved = await this.repo.save(item);
    this.logAudit(
      user,
      saved,
      saved.status,
      saved.status,
      `Update berita acara penataan/pemusnahan arsip`,
    );
    return saved;
  }

  /** Get fresh presigned URLs for berita acara and foto dokumentasi. */
  async getFileUrls(id: string): Promise<{
    beritaAcaraUrl: string | null;
    fotoDokumentasiUrl: string | null;
  }> {
    const item = await this.getItem(id);
    let beritaAcaraUrl: string | null = null;
    let fotoDokumentasiUrl: string | null = null;

    if (item.beritaAcara) {
      try {
        // Gunakan getPreviewUrl (24 jam) agar preview tidak cepat expired
        beritaAcaraUrl = await this.storageService.getPreviewUrl(
          item.beritaAcara,
        );
      } catch (e) {
        this.logger.warn(`Failed to get berita acara URL: ${e?.message}`);
      }
    }
    if (item.fotoDokumentasi) {
      try {
        fotoDokumentasiUrl = await this.storageService.getPreviewUrl(
          item.fotoDokumentasi,
        );
      } catch (e) {
        this.logger.warn(`Failed to get foto dokumentasi URL: ${e?.message}`);
      }
    }

    return { beritaAcaraUrl, fotoDokumentasiUrl };
  }

  // ─── QUERY ────────────────────────────────────────────────────────

  /** Daftar pengajuan penyusutan untuk Unit Dokumen (TU). */
  async findAllForTu(user: any, filter?: { status?: string; search?: string }) {
    const qb = this.repo
      .createQueryBuilder('p')
      .where('p.tu_persnum = :persnum', { persnum: Number(user.persnum) });

    if (filter?.status) {
      qb.andWhere('p.status = :status', { status: filter.status });
    }
    if (filter?.search) {
      qb.andWhere(
        '(p.nama_berkas LIKE :q OR p.kode_berkas LIKE :q OR p.nomor_usulan LIKE :q)',
        { q: `%${filter.search}%` },
      );
    }
    qb.orderBy('p.created_at', 'DESC');
    const items = await qb.getMany();
    // Load verifikator untuk setiap item
    const result = await this.attachVerifikators(items);
    return result;
  }

  /** Daftar pengajuan untuk verifikasi oleh Atasan Managerial TU. */
  async findAllForAtasan(
    user: any,
    filter?: { status?: string; search?: string },
  ) {
    // Cari penyusutan yang user adalah verifikator-nya
    const levels = await this.levelRepo.find({
      where: { atasanPersnum: Number(user.persnum) },
    });
    if (levels.length === 0) return [];

    // Map penyusutanId -> urutan level user (untuk cek giliran)
    const userLevelByPenyusutan = new Map<string, number>();
    for (const l of levels) {
      userLevelByPenyusutan.set(l.penyusutanId, l.urutan);
    }

    const penyusutanIds = levels.map((l) => l.penyusutanId);
    const qb = this.repo
      .createQueryBuilder('p')
      .where('p.id IN (:...ids)', { ids: penyusutanIds });

    if (filter?.status) {
      qb.andWhere('p.status = :status', { status: filter.status });
    }
    if (filter?.search) {
      qb.andWhere(
        '(p.nama_berkas LIKE :q OR p.kode_berkas LIKE :q OR p.nomor_usulan LIKE :q)',
        { q: `%${filter.search}%` },
      );
    }
    qb.orderBy('p.created_at', 'DESC');
    const items = await qb.getMany();

    // Hanya tampilkan item yang sedang giliran user (urutan user = currentVerifikatorUrutan),
    // ATAU item yang sudah disetujui/ditolak/selesai (untuk riwayat).
    const visibleItems = items.filter((item) => {
      const userUrutan = userLevelByPenyusutan.get(item.id);
      if (userUrutan === undefined) return false;
      // Status DIAJUKAN: tampil jika user sudah/giliran (urutan user <= currentVerifikatorUrutan)
      if (item.status === PenyusutanStatus.DIAJUKAN) {
        return item.currentVerifikatorUrutan >= userUrutan;
      }
      // Status lain (DITERIMA/DITOLAK/SELESAI): tampil untuk semua verifikator
      return true;
    });

    const result = await this.attachVerifikators(visibleItems);
    return result;
  }

  /** Daftar untuk penataan/pemusnahan (status DITERIMA atau SELESAI). */
  async findAllForPenataan(
    user: any,
    filter?: { status?: string; search?: string },
  ) {
    const qb = this.repo
      .createQueryBuilder('p')
      .where('p.tu_persnum = :persnum', { persnum: Number(user.persnum) })
      .andWhere('p.status IN (:...statuses)', {
        statuses: [PenyusutanStatus.DITERIMA, PenyusutanStatus.SELESAI],
      });

    if (filter?.search) {
      qb.andWhere(
        '(p.nama_berkas LIKE :q OR p.kode_berkas LIKE :q OR p.nomor_usulan LIKE :q)',
        { q: `%${filter.search}%` },
      );
    }
    qb.orderBy('p.created_at', 'DESC');
    const items = await qb.getMany();
    const result = await this.attachVerifikators(items);
    return result;
  }

  /** Detail single item + verifikator. */
  async findOne(id: string) {
    const item = await this.getItem(id);
    const levels = await this.levelRepo.find({
      where: { penyusutanId: id },
      order: { urutan: 'ASC' },
    });
    // Cek apakah penyusutan ini sudah dibackup ke DB arsip (berdasarkan log
    // per penyusutan, bukan per berkas — berkas bisa diarsipkan oleh
    // penyusutan lain untuk berkas yang sama).
    let isBackedUp = false;
    try {
      isBackedUp = await this.arsipService.isPenyusutanArchived(item.id);
    } catch {
      isBackedUp = false;
    }
    return { ...item, verifikators: levels, isBackedUp };
  }

  /** Ambil daftar verifikator untuk penyusutan. */
  async getVerifikators(penyusutanId: string) {
    return this.levelRepo.find({
      where: { penyusutanId },
      order: { urutan: 'ASC' },
    });
  }

  /** Cek apakah user adalah atasan managerial TU (terdaftar sebagai verifikator). */
  async isAtasanManagerialTu(user: any): Promise<boolean> {
    try {
      const persnum = Number(user?.persnum);
      if (!persnum || isNaN(persnum)) return false;
      const count = await this.levelRepo
        .createQueryBuilder('l')
        .where('l.atasan_persnum = :p', { p: persnum })
        .getCount();
      return count > 0;
    } catch {
      return false;
    }
  }

  // ─── HELPERS ──────────────────────────────────────────────────────

  private async getItem(id: string): Promise<PenyusutanEntity> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item)
      throw new NotFoundException('Pengajuan penyusutan tidak ditemukan');
    return item;
  }

  private async getLevel(
    penyusutanId: string,
    urutan: number,
  ): Promise<PenyusutanVerifikatorEntity | null> {
    return this.levelRepo.findOne({
      where: { penyusutanId, urutan },
    });
  }

  private async attachVerifikators(items: PenyusutanEntity[]) {
    if (items.length === 0) return items;
    const ids = items.map((i) => i.id);
    const levels = await this.levelRepo.find({
      where: { penyusutanId: In(ids) },
      order: { urutan: 'ASC' },
    });
    return items.map((item) => ({
      ...item,
      verifikators: levels.filter((l) => l.penyusutanId === item.id),
    }));
  }

  private async generateNomorUsulan(): Promise<string> {
    const year = new Date().getFullYear();
    const last = await this.repo
      .createQueryBuilder('p')
      .select('p.nomorUsulan')
      .where('p.nomor_usulan LIKE :pat', { pat: `PEN/%/${year}` })
      .orderBy('p.nomor_usulan', 'DESC')
      .getOne();
    let seq = 1;
    if (last?.nomorUsulan) {
      const m = last.nomorUsulan.match(/PEN\/(\d+)\/\d+/);
      if (m) seq = parseInt(m[1], 10) + 1;
    }
    return `PEN/${String(seq).padStart(3, '0')}/${year}`;
  }

  private logAudit(
    user: any,
    item: PenyusutanEntity,
    oldStatus: PenyusutanStatus | null,
    newStatus: PenyusutanStatus,
    desc: string,
  ) {
    this.auditTrailService.createAsync({
      action: AuditAction.UPDATE,
      module: AuditModule.BERKAS,
      entityType: 'penyusutan',
      entityId: item.id,
      description: `${desc} — ${item.nomorUsulan}: ${oldStatus ?? 'null'} → ${newStatus}`,
      oldValue: oldStatus ? { status: oldStatus } : null,
      newValue: { status: newStatus },
      status: AuditStatus.SUCCESS,
      persnum: Number(user.persnum),
      userName: user.nama,
      userRole: user.activeRole?.name ?? user.role,
    });
  }

  private async notify(
    item: PenyusutanEntity,
    positionId: string | null,
    persnum: number | null,
    title: string,
  ) {
    try {
      await this.notificationService.createNotification({
        positionId: positionId ?? '0',
        userPersnum: persnum ?? undefined,
        type: NotificationType.SYSTEM,
        title,
        body: `Pengajuan ${item.nomorUsulan} — ${item.namaBerkas}`,
        data: {
          action: 'OPEN_PENYUSUTAN',
          id: item.id,
          nomorUsulan: item.nomorUsulan,
        },
      });
    } catch (err) {
      this.logger.error(`notify failed: ${err?.message ?? err}`);
    }
  }
}
