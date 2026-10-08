import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransferActiveToInactiveEntity } from '../../transfer-active-to-inactive/entities/transfer-active-to-inactive.entity';
import { TransferApprovalLevelEntity } from '../../transfer-active-to-inactive/entities/approval-level.entity';
import { TransferActiveToInactiveStatus } from '../../transfer-active-to-inactive/enums/transfer-status.enum';
import { Berkas } from '../../berkas/entities/berkas.entity';
import {
  TuFilterDto,
  VerifikasiBerkasDto,
  AjukanAtasanTuDto,
  KembalikanDto,
  SetujuiPenerimaanDto,
  TolakPenerimaanDto,
  SetujuiTerakhirDto,
  SelesaiPenataanDto,
} from '../dto/tu-verifikasi.dto';
import { NotificationService } from '../../notification/services';
import { NotificationType } from '../../notification/entities/notification.entity';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { StorageService } from '../../storage/services/storage.service';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@Injectable()
export class TuVerifikasiService {
  private readonly logger = new Logger(TuVerifikasiService.name);

  constructor(
    @InjectRepository(TransferActiveToInactiveEntity)
    private readonly transferRepo: Repository<TransferActiveToInactiveEntity>,
    @InjectRepository(Berkas)
    private readonly berkasRepo: Repository<Berkas>,
    @InjectRepository(TransferApprovalLevelEntity)
    private readonly levelRepo: Repository<TransferApprovalLevelEntity>,
    private readonly notificationService: NotificationService,
    private readonly orgDataService: OrgDataService,
    private readonly storageService: StorageService,
  ) {}

  /** Status yang relevan untuk TU (notifikasi usulan masuk).
   *  Mencakup SELURUH siklus TU: dari diterima sampai selesai penataan. */
  private readonly TU_STATUSES = [
    TransferActiveToInactiveStatus.DIKIRIM,
    TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_BERKAS_FISIK,
    TransferActiveToInactiveStatus.BERKAS_FISIK_SESUAI,
    TransferActiveToInactiveStatus.BERKAS_FISIK_TIDAK_SESUAI,
    TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_PERSETUJUAN_TU,
    TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TU,
    TransferActiveToInactiveStatus.MENUNGGU_PERSETUJUAN_TERAKHIR_TU,
    TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TERAKHIR_TU,
    TransferActiveToInactiveStatus.MENUNGGU_TTD_PIHAK_KEDUA,
    TransferActiveToInactiveStatus.ARSIP_INAKTIF_DITERIMA,
    TransferActiveToInactiveStatus.PENATAAN_ARSIP_INAKTIF,
    TransferActiveToInactiveStatus.SELESAI,
  ];

  /**
   * Petakan pseudo-status (grup label) ke daftar status internal.
   * Dipakai agar filter status seragam di semua role.
   */
  private mapPseudoStatus(
    status: string,
  ): TransferActiveToInactiveStatus[] | null {
    switch (status) {
      case 'MENUNGGU_VERIFIKASI':
        return [
          TransferActiveToInactiveStatus.DIKIRIM,
          TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_BERKAS_FISIK,
          TransferActiveToInactiveStatus.BERKAS_FISIK_SESUAI,
        ];
      case 'MENUNGGU_PENERIMAAN':
        return [
          TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_PERSETUJUAN_TU,
          TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TU,
          TransferActiveToInactiveStatus.MENUNGGU_PERSETUJUAN_TERAKHIR_TU,
          TransferActiveToInactiveStatus.MENUNGGU_TTD_PIHAK_KEDUA,
        ];
      case 'SELESAI':
        return [
          TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TERAKHIR_TU,
          TransferActiveToInactiveStatus.ARSIP_INAKTIF_DITERIMA,
          TransferActiveToInactiveStatus.PENATAAN_ARSIP_INAKTIF,
          TransferActiveToInactiveStatus.SELESAI,
        ];
      default:
        return null;
    }
  }

  /**
   * Daftar usulan yang masuk ke TU (notifikasi usulan pindah arsip).
   * Status: DIKIRIM, MENUNGGU_VERIFIKASI_BERKAS_FISIK, BERKAS_FISIK_SESUAI,
   * BERKAS_FISIK_TIDAK_SESUAI, MENUNGGU_VERIFIKASI_PERSETUJUAN_TU.
   */
  async findAllNotifikasi(filter: TuFilterDto, user?: JwtPayload) {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.max(1, filter.limit ?? 10);

    const qb = this.transferRepo.createQueryBuilder('t');

    // Filter status: default semua status TU, atau filter spesifik.
    // Pseudo-status (grup) dipetakan ke daftar status internal agar label
    // status seragam di semua role.
    if (filter.status) {
      const group = this.mapPseudoStatus(filter.status);
      if (group) {
        qb.andWhere('t.status IN (:...statuses)', { statuses: group });
      } else {
        qb.andWhere('t.status = :status', { status: filter.status });
      }
    } else {
      qb.andWhere('t.status IN (:...statuses)', { statuses: this.TU_STATUSES });
    }

    // Setelah atasan managerial menekan "Pindah Usulan", usulan masih berada
    // pada tahap TTD pejabat pihak pertama. Jangan tampilkan ke Unit Dokumen
    // sebelum BAC benar-benar signed, agar penerimaan baru terbuka setelah QR
    // tanda tangan tersedia.
    qb.andWhere(
      `NOT (
        t.status IN (:...bacSigningStatuses)
        AND t.bac_signed_at IS NULL
      )`,
      {
        bacSigningStatuses: [
          TransferActiveToInactiveStatus.USUL_PINDAH_DIKIRIM,
          TransferActiveToInactiveStatus.SIAPKAN_BERKAS_FISIK,
        ],
      },
    );

    if (filter.search) {
      qb.andWhere(
        '(t.nomor_usulan LIKE :search OR t.arsip_perihal LIKE :search OR t.arsip_kode LIKE :search OR t.sekretaris_name LIKE :search OR t.atasan_name LIKE :search)',
        { search: `%${filter.search}%` },
      );
    }

    qb.orderBy('t.tgl_dikirim', 'DESC').addOrderBy('t.created_at', 'DESC');

    // Filter berjenjang: jika user adalah atasan TU (terdaftar di tu_approval_levels),
    // hanya tampilkan usulan yang gilirannya sudah tiba.
    // TU biasa (tidak terdaftar di tu_approval_levels) tetap melihat semua.
    const hasUserFilter = !!user?.persnum;
    const hasKlasifikasiFilter = !!filter.klasifikasi;
    const hasSearch = !!filter.search;
    if (!hasKlasifikasiFilter && !hasSearch && !hasUserFilter) {
      qb.skip((page - 1) * limit).take(limit);
    }

    const [allData, allTotal] = await qb.getManyAndCount();

    // Resolve sekretarisName dari org_data jika tersimpan sebagai persnum (angka).
    // Tanpa ini, kolom Sekretaris di frontend menampilkan persnum (mis. 10011066)
    // alih-alih nama. Logika sama dengan transfer-active-to-inactive service.
    await this.resolveSekretarisNames(allData);

    // Attach klasifikasi berkas (lookup by arsipId).
    await this.attachKlasifikasi(allData);

    let data = allData;
    let total = allTotal;

    // Filter berjenjang: jika user adalah atasan TU (terdaftar di tu_approval_levels),
    // hanya tampilkan usulan yang gilirannya sudah tiba.
    // TU biasa (tidak terdaftar di tu_approval_levels manapun) tetap melihat semua.
    if (hasUserFilter) {
      const userPersnum = Number(user.persnum);
      // Cek apakah user terdaftar sebagai atasan TU di usulan manapun
      const isAtasanTu = allData.some((d: any) => {
        const levels = d.tuApprovalLevels;
        if (!levels || !Array.isArray(levels)) return false;
        return levels.some((l: any) => Number(l.persnum) === userPersnum);
      });

      if (isAtasanTu) {
        // User adalah atasan TU → filter berjenjang
        data = allData.filter((d: any) => {
          const levels = d.tuApprovalLevels;
          if (!levels || !Array.isArray(levels) || levels.length === 0) {
            // Legacy: tidak ada multi-level → tampilkan (TU biasa)
            return true;
          }
          const myLevel = levels.find(
            (l: any) => Number(l.persnum) === userPersnum,
          );
          if (!myLevel) return true; // User bukan atasan TU di usulan ini → tampilkan (sebagai TU biasa)
          // User adalah atasan TU di usulan ini → hanya tampilkan jika gilirannya
          if (
            d.status === TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TU
          ) {
            const finalLevel = levels.reduce((latest: any, level: any) =>
              level.urutan > latest.urutan ? level : latest,
            );
            return myLevel.urutan === finalLevel.urutan;
          }
          return Number(d.currentTuApprovalLevel) === Number(myLevel.urutan);
        });
        total = data.length;
      }
    }

    // Post-filter by search (klasifikasi & status tidak ada di tabel transfer)
    if (hasSearch) {
      const q = filter.search!.toLowerCase();
      data = allData.filter((d: any) => {
        const klasifikasi = (d.arsipKlasifikasi ?? '').toLowerCase();
        const status = (d.status ?? '').toLowerCase();
        return klasifikasi.includes(q) || status.includes(q);
      });
      total = data.length;
    }

    // Post-filter by klasifikasi (karena klasifikasi ada di tabel berkas)
    if (hasKlasifikasiFilter) {
      const fk = filter.klasifikasi!.toLowerCase();
      data = data.filter((d: any) => {
        const kode = (d.arsipKlasifikasiKode ?? '').toLowerCase();
        const teks = (d.arsipKlasifikasi ?? '').toLowerCase();
        return kode === fk || teks.includes(fk) || kode.includes(fk);
      });
      total = data.length;
    }

    // Paginate manual jika ada post-filter (search/klasifikasi/berjenjang)
    if (hasSearch || hasKlasifikasiFilter || hasUserFilter) {
      const start = (page - 1) * limit;
      data = data.slice(start, start + limit);
    }

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Attach metadata berkas awal ke setiap usulan (lookup by arsipId), termasuk
   * klasifikasi dan lokasi fisik yang dicatat saat pemberkasan.
   */
  private async attachKlasifikasi(
    items: TransferActiveToInactiveEntity[],
  ): Promise<void> {
    const arsipIds = items
      .map((i) => i.arsipId)
      .filter((id): id is string => !!id);
    if (arsipIds.length === 0) return;

    try {
      const berkasList = await this.berkasRepo
        .createQueryBuilder('b')
        .select(['b.id', 'b.klasifikasi', 'b.klasifikasiTeks', 'b.lokasi'])
        .where('b.id IN (:...ids)', { ids: arsipIds })
        .getMany();
      const map = new Map<string, { kode: string; teks: string; lokasi: string | null }>();
      for (const b of berkasList) {
        map.set(b.id, {
          kode: b.klasifikasi ?? '',
          teks: b.klasifikasiTeks ?? b.klasifikasi ?? '-',
          lokasi: b.lokasi ?? null,
        });
      }
      for (const item of items) {
        const entry = map.get(item.arsipId);
        (item as any).arsipKlasifikasi = entry?.teks ?? '-';
        (item as any).arsipKlasifikasiKode = entry?.kode ?? '';
        (item as any).lokasiAwal = entry?.lokasi ?? null;
      }
    } catch (e) {
      this.logger.warn(`Failed to attach klasifikasi: ${e?.message}`);
    }
  }

  /**
   * Resolve sekretarisName dari org_data jika tersimpan sebagai persnum (angka).
   * Dipakai di findAllNotifikasi untuk memastikan nama sekretaris tampil benar.
   */
  private async resolveSekretarisNames(
    items: TransferActiveToInactiveEntity[],
  ): Promise<void> {
    const needsResolve = items.filter(
      (item) =>
        item.sekretarisName && /^\d+$/.test(String(item.sekretarisName).trim()),
    );
    if (needsResolve.length === 0) return;

    try {
      const latestOrg = await this.orgDataService.findLatestOrg();
      if (!latestOrg?.position_json) return;
      const positions = latestOrg.position_json as any[];

      for (const item of needsResolve) {
        const pos = positions.find(
          (p) =>
            p.persnum_person != null &&
            String(p.persnum_person) === String(item.sekretarisName),
        );
        if (pos?.persnum_person_text) {
          item.sekretarisName = pos.persnum_person_text;
        }
      }
    } catch (e) {
      this.logger.warn(
        `Failed to resolve sekretaris names from org_data: ${e?.message}`,
      );
    }
  }

  /** Detail usulan untuk TU. */
  async findOneForTu(id: string) {
    const transfer = await this.transferRepo.findOne({ where: { id } });
    if (!transfer) {
      throw new NotFoundException('Usulan tidak ditemukan');
    }
    if (
      [
        TransferActiveToInactiveStatus.USUL_PINDAH_DIKIRIM,
        TransferActiveToInactiveStatus.SIAPKAN_BERKAS_FISIK,
      ].includes(transfer.status) &&
      !transfer.bacSignedAt
    ) {
      throw new NotFoundException(
        'Usulan belum tersedia di Unit Dokumen karena Berita Acara belum ditandatangani',
      );
    }
    // Load approval levels (daftar atasan verifikasi berjenjang)
    const levels = await this.levelRepo.find({
      where: { transferId: id },
      order: { urutan: 'ASC' },
    });
    (transfer as any).approvalLevels = levels;
    // Resolve sekretarisName dari org_data jika tersimpan sebagai persnum
    await this.resolveSekretarisNames([transfer]);
    // Attach jenis penyusutan (Permanen/Musnah) + klasifikasi dari berkas
    if (transfer.arsipId) {
      const berkas = await this.berkasRepo
        .createQueryBuilder('b')
        .select([
          'b.id',
          'b.tindakanPenyusutanAkhir',
          'b.klasifikasi',
          'b.klasifikasiTeks',
        ])
        .where('b.id = :id', { id: transfer.arsipId })
        .getOne();
      if (berkas) {
        (transfer as any).arsipTindakanPenyusutan =
          berkas.tindakanPenyusutanAkhir ?? null;
        (transfer as any).arsipKlasifikasi =
          berkas.klasifikasiTeks ?? berkas.klasifikasi ?? null;
        (transfer as any).arsipKlasifikasiKode = berkas.klasifikasi ?? null;
      }
    }
    return transfer;
  }

  /** Verifikasi berkas fisik oleh TU. */
  async verifikasiBerkas(
    id: string,
    user: JwtPayload,
    dto: VerifikasiBerkasDto,
  ) {
    const transfer = await this.findOneForTu(id);

    if (
      transfer.status !== TransferActiveToInactiveStatus.DIKIRIM &&
      transfer.status !==
        TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_BERKAS_FISIK
    ) {
      throw new BadRequestException(
        `Status ${transfer.status} tidak bisa diverifikasi berkas fisik`,
      );
    }

    const oldStatus = transfer.status;
    transfer.physicalVerificationNote = dto.catatan ?? null;
    transfer.physicalVerifiedBy = Number(user.persnum);
    transfer.physicalVerifiedAt = new Date();
    transfer.tuPersnum = Number(user.persnum);
    transfer.tuName = user.nama ?? String(user.persnum);

    if (dto.sesuai) {
      transfer.status = TransferActiveToInactiveStatus.BERKAS_FISIK_SESUAI;
    } else {
      transfer.status =
        TransferActiveToInactiveStatus.BERKAS_FISIK_TIDAK_SESUAI;
    }

    const saved = await this.transferRepo.save(transfer);

    // Notifikasi ke sekretaris
    try {
      await this.notificationService.createNotification({
        positionId: '0',
        userPersnum: transfer.sekretarisPersnum,
        type: NotificationType.SYSTEM,
        title: dto.sesuai ? 'Berkas Fisik Sesuai' : 'Berkas Fisik Tidak Sesuai',
        body: `Usulan ${saved.nomorUsulan} — berkas fisik ${
          dto.sesuai ? 'sesuai' : 'tidak sesuai'
        }.`,
        data: {
          action: 'OPEN_TRANSFER_ACTIVE_TO_INACTIVE',
          id: saved.id,
          nomorUsulan: saved.nomorUsulan,
        },
      });
    } catch (e) {
      this.logger.warn(`Failed to send notification: ${(e as Error).message}`);
    }

    return saved;
  }

  /** Ajukan ke Atasan Managerial TU (setelah berkas fisik sesuai).
   *  Status tetap DIKIRIM (Menunggu Verifikasi) — hanya tandai field verifikasi
   *  & atasan TU. Tidak ubah status agar di halaman TU tetap terlihat sebagai
   *  "Menunggu Verifikasi".
   */
  async ajukanAtasanTu(id: string, user: JwtPayload, dto: AjukanAtasanTuDto) {
    const transfer = await this.findOneForTu(id);

    const allowedStatuses = [
      TransferActiveToInactiveStatus.DIKIRIM,
      TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_BERKAS_FISIK,
    ];
    if (!allowedStatuses.includes(transfer.status)) {
      throw new BadRequestException(
        `Status ${transfer.status} tidak bisa diajukan ke Atasan TU`,
      );
    }

    // Tandai verifikasi berkas fisik sesuai + ajukan ke atasan TU
    transfer.physicalVerifiedBy = Number(user.persnum);
    transfer.physicalVerifiedAt = new Date();
    transfer.tuPersnum = Number(user.persnum);
    transfer.tuName = user.nama ?? String(user.persnum);
    transfer.tuApprovedBy = Number(user.persnum);
    transfer.tuApprovedAt = new Date();

    if (!dto.bacPihakKeduaPersnum) {
      throw new BadRequestException(
        'Pejabat penandatangan pihak kedua wajib dipilih',
      );
    }
    transfer.bacPihakKeduaPersnum = Number(dto.bacPihakKeduaPersnum);
    transfer.bacPihakKeduaName = dto.bacPihakKeduaName ?? null;
    transfer.bacPihakKeduaJabatan = dto.bacPihakKeduaJabatan ?? null;
    if (dto.bacTembusan !== undefined) {
      transfer.bacTembusan = dto.bacTembusan.map((copy) => ({
        persnum: Number(copy.persnum),
        name: copy.name,
        jabatan: copy.jabatan,
      }));
    }

    // Multi-level TU approval: simpan daftar atasan TU berjenjang
    if (dto.atasanTuList && dto.atasanTuList.length > 0) {
      transfer.tuApprovalLevels = dto.atasanTuList.map((a, idx) => ({
        persnum: Number(a.persnum),
        name: a.name,
        jabatan: a.jabatan,
        urutan: idx + 1,
        status: 'MENUNGGU' as const,
        verifiedAt: null,
        catatan: null,
      }));
      transfer.totalTuApprovalLevels = dto.atasanTuList.length;
      transfer.currentTuApprovalLevel = 1;
      // Legacy: simpan atasan TU pertama
      transfer.atasanTuPersnum = Number(dto.atasanTuList[0].persnum);
      transfer.atasanTuName = dto.atasanTuList[0].name;
    } else if (dto.atasanTuPersnum) {
      // Legacy: single atasan TU
      transfer.atasanTuPersnum = Number(dto.atasanTuPersnum);
      transfer.tuApprovalLevels = [
        {
          persnum: Number(dto.atasanTuPersnum),
          name: '',
          jabatan: '',
          urutan: 1,
          status: 'MENUNGGU' as const,
          verifiedAt: null,
          catatan: null,
        },
      ];
      transfer.totalTuApprovalLevels = 1;
      transfer.currentTuApprovalLevel = 1;
    }

    // Status → MENUNGGU_VERIFIKASI_PERSETUJUAN_TU (menunggu persetujuan TU level 1)
    transfer.status =
      TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_PERSETUJUAN_TU;

    const saved = await this.transferRepo.save(transfer);

    // Notifikasi ke Atasan Managerial TU level 1
    const firstLevel = transfer.tuApprovalLevels?.[0];
    if (firstLevel) {
      try {
        await this.notificationService.createNotification({
          positionId: '0',
          userPersnum: firstLevel.persnum,
          type: NotificationType.SYSTEM,
          title: 'Usulan Pindah Arsip Menunggu Persetujuan',
          body: `Usulan ${saved.nomorUsulan} telah diverifikasi TU dan menunggu persetujuan Anda.`,
          data: {
            action: 'OPEN_TRANSFER_ACTIVE_TO_INACTIVE',
            id: saved.id,
            nomorUsulan: saved.nomorUsulan,
          },
        });
      } catch (e) {
        this.logger.warn(
          `Failed to send notification: ${(e as Error).message}`,
        );
      }
    }

    return saved;
  }

  /** Kembalikan ke Atasan/Sekretaris (berkas tidak sesuai). */
  async kembalikanKeAtasan(id: string, user: JwtPayload, dto: KembalikanDto) {
    const transfer = await this.findOneForTu(id);

    if (
      transfer.status !== TransferActiveToInactiveStatus.DIKIRIM &&
      transfer.status !==
        TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_BERKAS_FISIK &&
      transfer.status !== TransferActiveToInactiveStatus.BERKAS_FISIK_SESUAI
    ) {
      throw new BadRequestException(
        `Status ${transfer.status} tidak bisa dikembalikan`,
      );
    }

    transfer.status = TransferActiveToInactiveStatus.BERKAS_FISIK_TIDAK_SESUAI;
    transfer.physicalVerificationNote = dto.alasan;
    transfer.physicalVerifiedBy = Number(user.persnum);
    transfer.physicalVerifiedAt = new Date();
    transfer.tuPersnum = Number(user.persnum);
    transfer.tuName = user.nama ?? String(user.persnum);

    const saved = await this.transferRepo.save(transfer);

    // Notifikasi ke sekretaris
    try {
      await this.notificationService.createNotification({
        positionId: '0',
        userPersnum: transfer.sekretarisPersnum,
        type: NotificationType.SYSTEM,
        title: 'Berkas Dikembalikan',
        body: `Usulan ${saved.nomorUsulan} dikembalikan oleh TU: ${dto.alasan}`,
        data: {
          action: 'OPEN_TRANSFER_ACTIVE_TO_INACTIVE',
          id: saved.id,
          nomorUsulan: saved.nomorUsulan,
        },
      });
    } catch (e) {
      this.logger.warn(`Failed to send notification: ${(e as Error).message}`);
    }

    return saved;
  }

  /** Cek apakah user login terdaftar sebagai atasan TU di usulan apapun.
   *  Return { isAtasanTu: boolean } — dipakai sidebar untuk menampilkan menu
   *  "Verifikasi Persetujuan" hanya jika user memang ada di tuApprovalLevels.
   */
  async isAtasanTu(user: JwtPayload): Promise<{ isAtasanTu: boolean }> {
    try {
      const persnum = Number(user.persnum);
      if (!persnum) return { isAtasanTu: false };

      // Sumber utama adalah struktur organisasi. Jangan menunggu user pernah
      // dipilih pada tuApprovalLevels; jika demikian menu atasan baru muncul
      // setelah ada pengajuan sebelumnya.
      const structuralAtasan = await this.getAtasanTuList();
      if (structuralAtasan.some((item) => Number(item.persnum) === persnum)) {
        return { isAtasanTu: true };
      }

      // Cek di kolom JSON tu_approval_levels: cari semua usulan yang
      // tu_approval_levels tidak NULL, lalu filter di aplikasi (JSON array).
      // NOTE: jangan pakai .select() terbatas — JSON column bisa gagal
      // ter-parse bila hanya di-select sebagian. Ambil semua kolom.
      const transfers = await this.transferRepo
        .createQueryBuilder('t')
        .where('t.tu_approval_levels IS NOT NULL')
        .getMany();

      for (const t of transfers) {
        let levels = t.tuApprovalLevels;
        // JSON column kadang dikembalikan sebagai string oleh driver —
        // parse dulu bila perlu.
        if (typeof levels === 'string') {
          try {
            levels = JSON.parse(levels);
          } catch {
            levels = null;
          }
        }
        if (
          Array.isArray(levels) &&
          levels.some((l) => Number(l.persnum) === persnum)
        ) {
          return { isAtasanTu: true };
        }
      }
      return { isAtasanTu: false };
    } catch (error) {
      this.logger.warn(
        `isAtasanTu failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { isAtasanTu: false };
    }
  }

  /** Daftar atasan managerial TU (untuk dropdown pilih atasan TU).
   * Cari di org_data position_json: organization yang mengandung "Corporate Secretary",
   * ambil yang chief=1 (atasan, bukan staff), punya persnum_person.
   */
  async getAtasanTuList() {
    try {
      const latestOrgData = await this.orgDataService.findLatestOrg();
      // Tetap lanjutkan dengan array kosong agar fallback pejabat TU tetap
      // dipakai ketika sinkronisasi struktur organisasi sedang tidak tersedia.
      const positions = Array.isArray(latestOrgData?.position_json)
        ? (latestOrgData.position_json as any[])
        : [];

      // Corporate Secretary Division org ID (sama dengan yang dipakai modul
      // usulan-akses-berkas). Hanya posisi managerial (chief=1) yang boleh
      // menjadi Atasan TU; staff/staf biasa tidak ikut masuk daftar.
      const CORPORATE_SECRETARY_DIVISI_ID = 10002098;
      const atasanTu = positions
        .filter((p) => {
          const divisiId = Number(p.divisi_id ?? 0);
          const orgText = (p.organization_text || '').toUpperCase();
          return (
            (divisiId === CORPORATE_SECRETARY_DIVISI_ID ||
              orgText.includes('CORPORATE SECRETARY') ||
              orgText.includes('TATA NASKAH') ||
              orgText.includes('CORPORATE SEC')) &&
            Number(p.chief) === 1 &&
            p.persnum_person
          );
        })
        .map((p) => ({
          persnum: p.persnum_person,
          name: p.persnum_person_text,
          position: p.position,
          positionText: p.position_text,
          organization: p.organization_id,
          organizationText: p.organization_text,
          displayText: `${p.persnum_person_text} — ${p.position_text} (${p.persnum_person})`,
        }));

      // Fallback: pastikan HERMANA & PRIYO selalu ada di dropdown
      const FALLBACK_ATASAN_TU = [
        {
          persnum: 10010123,
          name: 'HERMANA SOEGIJANTORO',
          positionText: 'EVP Corporate Secretary',
        },
        {
          persnum: 10010970,
          name: 'PRIYO HUTOMO PUTRA',
          positionText: 'VP Corporate Secretary',
        },
      ];
      for (const fb of FALLBACK_ATASAN_TU) {
        const exists = atasanTu.some((a) => Number(a.persnum) === fb.persnum);
        if (!exists) {
          const posData = positions.find(
            (p) => Number(p.persnum_person) === fb.persnum,
          );
          atasanTu.push({
            persnum: fb.persnum,
            name: fb.name,
            position: posData?.position ?? null,
            positionText: posData?.position_text ?? fb.positionText,
            organization: posData?.organization_id ?? null,
            organizationText:
              posData?.organization_text ?? 'Corporate Secretary',
            displayText: `${fb.name} — ${posData?.position_text ?? fb.positionText} (${fb.persnum})`,
          });
        }
      }

      return atasanTu;
    } catch (error) {
      this.logger.warn(
        `getAtasanTuList failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  // ============================================
  // ATASAN MANAGERIAL TU — Verifikasi Persetujuan
  // ============================================

  /** Status yang relevan untuk Atasan Managerial TU. */
  private readonly ATASAN_TU_STATUSES = [
    TransferActiveToInactiveStatus.DIKIRIM,
    TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_PERSETUJUAN_TU,
    TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TU,
    TransferActiveToInactiveStatus.MENUNGGU_PERSETUJUAN_TERAKHIR_TU,
    TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TERAKHIR_TU,
    TransferActiveToInactiveStatus.DITOLAK_PERSETUJUAN_TU,
    TransferActiveToInactiveStatus.DITOLAK_PERSETUJUAN_TERAKHIR_TU,
    TransferActiveToInactiveStatus.MENUNGGU_TTD_PIHAK_KEDUA,
    TransferActiveToInactiveStatus.ARSIP_INAKTIF_DITERIMA,
    TransferActiveToInactiveStatus.PENATAAN_ARSIP_INAKTIF,
    TransferActiveToInactiveStatus.SELESAI,
  ];

  /** Daftar usulan untuk Atasan Managerial TU (berjenjang). */
  async findAllAtasanTu(filter: TuFilterDto, user?: JwtPayload) {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.max(1, filter.limit ?? 10);

    const qb = this.transferRepo.createQueryBuilder('t');

    // Hanya usulan yang sudah diajukan TU (tuApprovedAt terisi)
    qb.andWhere('t.tu_approved_at IS NOT NULL');

    if (filter.status) {
      const group = this.mapPseudoStatus(filter.status);
      if (group) {
        qb.andWhere('t.status IN (:...statuses)', { statuses: group });
      } else {
        qb.andWhere('t.status = :status', { status: filter.status });
      }
    } else {
      qb.andWhere('t.status IN (:...statuses)', {
        statuses: this.ATASAN_TU_STATUSES,
      });
    }

    if (filter.search) {
      qb.andWhere(
        '(t.nomor_usulan LIKE :search OR t.arsip_perihal LIKE :search OR t.sekretaris_name LIKE :search OR t.tu_name LIKE :search)',
        { search: `%${filter.search}%` },
      );
    }

    qb.orderBy('t.tu_approved_at', 'DESC').addOrderBy('t.created_at', 'DESC');

    // Filter berjenjang: hanya tampilkan usulan yang giliran user login.
    // tu_approval_levels adalah JSON array berisi {persnum, urutan, status}.
    // Karena TypeORM tidak bisa query JSON array langsung, ambil semua dulu
    // lalu filter di aplikasi.
    const hasUserFilter = !!user?.persnum;
    if (!hasUserFilter) {
      qb.skip((page - 1) * limit).take(limit);
    }

    const [allData, allTotal] = await qb.getManyAndCount();

    // Resolve sekretarisName dari org_data jika tersimpan sebagai persnum (angka).
    await this.resolveSekretarisNames(allData);

    // Attach klasifikasi berkas (lookup by arsipId) untuk kolom Klasifikasi.
    await this.attachKlasifikasi(allData);

    let data = allData;
    let total = allTotal;

    // Filter berjenjang: hanya usulan di mana user login adalah atasan TU
    // yang sedang giliran (currentTuApprovalLevel = urutan dia di tuApprovalLevels)
    if (hasUserFilter) {
      const userPersnum = Number(user.persnum);
      data = allData.filter((d: any) => {
        const levels = d.tuApprovalLevels;
        if (!levels || !Array.isArray(levels) || levels.length === 0) {
          // Legacy: tidak ada multi-level → cek atasan_tu_persnum
          return Number(d.atasanTuPersnum) === userPersnum;
        }
        // Multi-level: tampilkan giliran aktif dan simpan usulan yang sudah
        // disetujui user sebagai riwayat di daftar verifikasi miliknya.
        const myLevel = levels.find(
          (l: any) => Number(l.persnum) === userPersnum,
        );
        if (!myLevel) return false; // User bukan atasan TU di usulan ini
        const finalLevel = levels.reduce((latest: any, level: any) =>
          level.urutan > latest.urutan ? level : latest,
        );
        const isFinalApprovalTurn =
          d.status === TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TU &&
          myLevel.urutan === finalLevel.urutan;
        const hasAlreadyApproved = myLevel.status === 'DISETUJUI';
        const isCurrentTurn =
          Number(d.currentTuApprovalLevel) === Number(myLevel.urutan);

        return isFinalApprovalTurn || hasAlreadyApproved || isCurrentTurn;
      });
      total = data.length;

      // Paginate manual
      const start = (page - 1) * limit;
      data = data.slice(start, start + limit);
    }

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Setujui penerimaan oleh Atasan TU (multi-level berjenjang). */
  async setujuiPenerimaan(
    id: string,
    user: JwtPayload,
    dto: { catatanVerifikasi?: string },
  ) {
    const transfer = await this.findOneForTu(id);

    if (
      transfer.status !== TransferActiveToInactiveStatus.DIKIRIM &&
      transfer.status !==
        TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_PERSETUJUAN_TU
    ) {
      throw new BadRequestException(
        `Status ${transfer.status} tidak bisa disetujui penerimaan`,
      );
    }

    // Multi-level: cek giliran atasan TU
    const levels = transfer.tuApprovalLevels;
    if (levels && levels.length > 0) {
      const currentLevel = levels.find(
        (l) => l.urutan === transfer.currentTuApprovalLevel,
      );
      if (!currentLevel) {
        throw new BadRequestException('Level verifikasi TU tidak ditemukan');
      }
      if (currentLevel.persnum !== Number(user.persnum)) {
        throw new BadRequestException(
          `Bukan giliran Anda. Saat ini giliran atasan TU urutan ${transfer.currentTuApprovalLevel} (${currentLevel.name}).`,
        );
      }

      // Update level saat ini → DISETUJUI
      currentLevel.status = 'DISETUJUI';
      currentLevel.verifiedAt = new Date().toISOString();
      currentLevel.catatan = dto.catatanVerifikasi ?? null;

      // Cek apakah ada level berikutnya
      const nextLevel = levels.find(
        (l) => l.urutan === transfer.currentTuApprovalLevel + 1,
      );
      if (nextLevel) {
        // Masih ada level berikutnya → tetap MENUNGGU_VERIFIKASI_PERSETUJUAN_TU
        transfer.currentTuApprovalLevel = transfer.currentTuApprovalLevel + 1;
        transfer.atasanTuPersnum = nextLevel.persnum;
        transfer.atasanTuName = nextLevel.name;
        transfer.status =
          TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_PERSETUJUAN_TU;
        transfer.tuApprovalLevels = [...levels];
        const saved = await this.transferRepo.save(transfer);

        // Notifikasi ke atasan TU berikutnya
        try {
          await this.notificationService.createNotification({
            positionId: '0',
            userPersnum: nextLevel.persnum,
            type: NotificationType.SYSTEM,
            title: 'Usulan Pindah Arsip Menunggu Persetujuan',
            body: `Usulan ${saved.nomorUsulan} menunggu persetujuan Anda (Tahap ${nextLevel.urutan} dari ${transfer.totalTuApprovalLevels}).`,
            data: {
              action: 'OPEN_TRANSFER_ACTIVE_TO_INACTIVE',
              id: saved.id,
              nomorUsulan: saved.nomorUsulan,
            },
          });
        } catch (e) {
          this.logger.warn(`notify failed: ${(e as Error).message}`);
        }
        return saved;
      } else {
        // Level terakhir approve → verifikator terakhir melakukan persetujuan terakhir juga.
        const finalLevel = levels.reduce((latest, level) =>
          level.urutan > latest.urutan ? level : latest,
        );
        transfer.currentTuApprovalLevel = finalLevel.urutan;
        transfer.atasanTuPersnum = finalLevel.persnum;
        transfer.atasanTuName = finalLevel.name;
        transfer.status =
          TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TU;
        transfer.tuApprovalLevels = [...levels];
        transfer.physicalVerificationNote =
          dto.catatanVerifikasi ?? transfer.physicalVerificationNote;
        const saved = await this.transferRepo.save(transfer);

        // Notifikasi ke verifikator TU terakhir untuk persetujuan terakhir
        if (finalLevel) {
          try {
            await this.notificationService.createNotification({
              positionId: '0',
              userPersnum: finalLevel.persnum,
              type: NotificationType.SYSTEM,
              title: 'Persetujuan Terakhir Diperlukan',
              body: `Usulan ${saved.nomorUsulan} telah disetujui semua level. Berikan persetujuan terakhir.`,
              data: {
                action: 'OPEN_TRANSFER_ACTIVE_TO_INACTIVE',
                id: saved.id,
                nomorUsulan: saved.nomorUsulan,
              },
            });
          } catch (e) {
            this.logger.warn(`notify failed: ${(e as Error).message}`);
          }
        }
        return saved;
      }
    }

    // Legacy: single atasan TU (tanpa tuApprovalLevels)
    transfer.status = TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TU;
    transfer.atasanTuPersnum = transfer.atasanTuPersnum ?? Number(user.persnum);
    transfer.atasanTuName =
      transfer.atasanTuName ?? user.nama ?? String(user.persnum);
    transfer.physicalVerificationNote =
      dto.catatanVerifikasi ?? transfer.physicalVerificationNote;

    const saved = await this.transferRepo.save(transfer);

    // Notifikasi ke TU
    try {
      await this.notificationService.createNotification({
        positionId: '0',
        userPersnum: transfer.tuPersnum ?? undefined,
        type: NotificationType.SYSTEM,
        title: 'Penerimaan Disetujui Atasan TU',
        body: `Usulan ${saved.nomorUsulan} penerimaan disetujui oleh Atasan TU.`,
        data: {
          action: 'OPEN_TRANSFER_ACTIVE_TO_INACTIVE',
          id: saved.id,
          nomorUsulan: saved.nomorUsulan,
        },
      });
    } catch (e) {
      this.logger.warn(`notify failed: ${(e as Error).message}`);
    }

    // Auto-mark notification as read for the approver
    try {
      const userPos = user.position ? String(user.position) : '0';
      this.notificationService
        .markByNaskahAsRead(userPos, saved.id, Number(user.persnum))
        .catch(() => {});
    } catch (_) {}

    return saved;
  }

  /** Tolak penerimaan oleh Atasan TU. */
  async tolakPenerimaan(
    id: string,
    user: JwtPayload,
    dto: { alasanPenolakan: string },
  ) {
    const transfer = await this.findOneForTu(id);

    if (
      transfer.status !== TransferActiveToInactiveStatus.DIKIRIM &&
      transfer.status !==
        TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_PERSETUJUAN_TU
    ) {
      throw new BadRequestException(
        `Status ${transfer.status} tidak bisa ditolak penerimaan`,
      );
    }

    // Multi-level: update level saat ini → DITOLAK
    const levels = transfer.tuApprovalLevels;
    if (levels && levels.length > 0) {
      const currentLevel = levels.find(
        (l) => l.urutan === transfer.currentTuApprovalLevel,
      );
      if (currentLevel) {
        currentLevel.status = 'DITOLAK';
        currentLevel.verifiedAt = new Date().toISOString();
        currentLevel.catatan = dto.alasanPenolakan;
        transfer.tuApprovalLevels = [...levels];
      }
    }

    transfer.status = TransferActiveToInactiveStatus.DITOLAK_PERSETUJUAN_TU;
    transfer.rejectedNote = dto.alasanPenolakan;

    const saved = await this.transferRepo.save(transfer);

    // Notifikasi ke TU
    try {
      await this.notificationService.createNotification({
        positionId: '0',
        userPersnum: transfer.tuPersnum ?? undefined,
        type: NotificationType.SYSTEM,
        title: 'Penerimaan Ditolak Atasan TU',
        body: `Usulan ${saved.nomorUsulan} penerimaan ditolak: ${dto.alasanPenolakan}`,
        data: {
          action: 'OPEN_TRANSFER_ACTIVE_TO_INACTIVE',
          id: saved.id,
          nomorUsulan: saved.nomorUsulan,
        },
      });
    } catch (e) {
      this.logger.warn(`notify failed: ${(e as Error).message}`);
    }

    // Auto-mark notification as read for the rejector
    try {
      const userPos = user.position ? String(user.position) : '0';
      this.notificationService
        .markByNaskahAsRead(userPos, saved.id, Number(user.persnum))
        .catch(() => {});
    } catch (_) {}

    return saved;
  }

  /** Verifikator TU terakhir menyelesaikan verifikasi → menunggu tanda tangan pihak kedua. */
  async setujuiTerakhir(
    id: string,
    user: JwtPayload,
    dto: { catatanVerifikasi?: string },
  ) {
    const transfer = await this.findOneForTu(id);

    if (
      transfer.status !==
        TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TU &&
      transfer.status !==
        TransferActiveToInactiveStatus.MENUNGGU_PERSETUJUAN_TERAKHIR_TU
    ) {
      throw new BadRequestException(
        `Status ${transfer.status} tidak bisa disetujui terakhir`,
      );
    }

    // Multi-level: hanya verifikator TU terakhir yang bisa persetujuan terakhir
    const levels = transfer.tuApprovalLevels;
    if (levels && levels.length > 0) {
      const finalLevel = levels.reduce((latest, level) =>
        level.urutan > latest.urutan ? level : latest,
      );
      if (!finalLevel || finalLevel.persnum !== Number(user.persnum)) {
        throw new BadRequestException(
          'Hanya verifikator TU terakhir yang dapat melakukan persetujuan terakhir',
        );
      }
    }

    if (!transfer.bacSignedAt) {
      throw new BadRequestException(
        'Berita Acara pihak pertama belum ditandatangani',
      );
    }
    if (!transfer.bacPihakKeduaPersnum) {
      throw new BadRequestException(
        'Pejabat penandatangan pihak kedua belum dipilih',
      );
    }

    transfer.status = TransferActiveToInactiveStatus.MENUNGGU_TTD_PIHAK_KEDUA;
    transfer.tuFinalApprovedBy = Number(user.persnum);
    transfer.tuFinalApprovedAt = new Date();

    const saved = await this.transferRepo.save(transfer);

    // Pihak kedua baru diminta menandatangani setelah seluruh verifikasi TU selesai.
    try {
      await this.notificationService.createNotification({
        positionId: '0',
        userPersnum: transfer.bacPihakKeduaPersnum ?? undefined,
        type: NotificationType.SYSTEM,
        title: 'Penandatanganan Berita Acara Pihak Kedua',
        body: `Verifikasi usulan ${saved.nomorUsulan} telah selesai. Berita Acara menunggu tanda tangan Anda sebagai pihak kedua.`,
        data: {
          action: 'OPEN_TRANSFER_BAC_SIGNING',
          id: saved.id,
          nomorUsulan: saved.nomorUsulan,
          signerType: 'pihak_kedua',
        },
      });
    } catch (e) {
      this.logger.warn(`notify failed: ${(e as Error).message}`);
    }

    // Auto-mark notification as read for the approver
    try {
      const userPos = user.position ? String(user.position) : '0';
      this.notificationService
        .markByNaskahAsRead(userPos, saved.id, Number(user.persnum))
        .catch(() => {});
    } catch (_) {}

    return saved;
  }

  // ============================================
  // TU — Penataan Arsip Inaktif
  // ============================================

  /** Status untuk penataan arsip. */
  private readonly PENATAAN_STATUSES = [
    TransferActiveToInactiveStatus.ARSIP_INAKTIF_DITERIMA,
    TransferActiveToInactiveStatus.PENATAAN_ARSIP_INAKTIF,
    TransferActiveToInactiveStatus.SELESAI,
  ];

  /** Daftar usulan untuk penataan arsip di TU. */
  async findAllPenataan(filter: TuFilterDto) {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.max(1, filter.limit ?? 10);
    const statusFilter = String(filter.status ?? '').toUpperCase();
    const effectiveStatusFilters = [
      'DITERIMA',
      'MENUNGGU_RETENSI_INAKTIF',
      'SIAP_PENYUSUTAN',
    ];
    const hasEffectiveStatusFilter = effectiveStatusFilters.includes(statusFilter);

    const qb = this.transferRepo.createQueryBuilder('t');

    if (filter.status && !hasEffectiveStatusFilter) {
      qb.andWhere('t.status = :status', { status: filter.status });
    } else {
      qb.andWhere('t.status IN (:...statuses)', {
        statuses: this.PENATAAN_STATUSES,
      });
    }

    qb.orderBy('t.received_at', 'DESC').addOrderBy('t.created_at', 'DESC');

    // Klasifikasi dan nasib efektif berasal dari metadata berkas,
    // bukan kolom transfer; filter tersebut diterapkan setelah metadata dimuat.
    const hasSearch = !!filter.search;
    const hasKlasifikasiFilter = !!filter.klasifikasi;
    const nasibFilter = String(filter.nasibAkhir ?? '').trim().toUpperCase();
    const hasNasibFilter = ['PERMANEN', 'MUSNAH'].includes(nasibFilter);
    const hasPostFilter =
      hasSearch ||
      hasKlasifikasiFilter ||
      hasNasibFilter ||
      hasEffectiveStatusFilter;
    if (!hasPostFilter) {
      qb.skip((page - 1) * limit).take(limit);
    }

    const [allData, allTotal] = await qb.getManyAndCount();

    // Resolve sekretarisName dari org_data jika tersimpan sebagai persnum (angka).
    // Tanpa ini, kolom Sekretaris di frontend menampilkan persnum (mis. 10011066)
    // alih-alih nama. Logika sama dengan findAllNotifikasi di service ini.
    await this.resolveSekretarisNames(allData);

    // Ambil metadata dari setiap arsip dalam usulan (termasuk usulan multi-arsip)
    // untuk daftar arsip inaktif TU.
    await this.attachPenataanArsipMetadata(allData);

    let data = allData;
    let total = allTotal;

    // Post-filter by search (klasifikasi & status tidak ada di tabel transfer)
    if (hasSearch) {
      const q = filter.search!.toLowerCase();
      data = allData.filter((d: any) => {
        const searchable = [
          d.nomorUsulan,
          d.sekretarisName,
          d.status,
          ...(d.arsipRows ?? []).flatMap((arsip: any) => [
            arsip.kodeBerkas,
            arsip.klasifikasiKode,
            arsip.klasifikasi,
            arsip.uraianInformasi,
            arsip.kurunWaktu,
            arsip.lokasiSimpan,
            arsip.klasifikasiKeamanan,
            arsip.retensiArsipInaktif,
            arsip.nasibAkhir,
          ]),
        ].filter(Boolean).join(' ').toLowerCase();
        return searchable.includes(q);
      });
      total = data.length;
    }

    // Post-filter by klasifikasi
    if (hasKlasifikasiFilter) {
      const fk = filter.klasifikasi!.toLowerCase();
      data = data.filter((d: any) => {
        return (d.arsipRows ?? []).some((arsip: any) => {
          const kode = String(arsip.klasifikasiKode ?? '').toLowerCase();
          const teks = String(arsip.klasifikasi ?? '').toLowerCase();
          return kode === fk || teks.includes(fk) || kode.includes(fk);
        });
      });
      total = data.length;
    }

    if (hasEffectiveStatusFilter || hasNasibFilter) {
      const todayJakarta = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      const hasExpired = (value: unknown) => {
        if (!value) return false;
        const date = String(value).slice(0, 10);
        return /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= todayJakarta;
      };
      data = data.flatMap((item: any) => {
        if (statusFilter === 'DITERIMA' && item.status === 'SELESAI') {
          return [];
        }
        if (
          ['MENUNGGU_RETENSI_INAKTIF', 'SIAP_PENYUSUTAN'].includes(
            statusFilter,
          ) &&
          item.status !== 'SELESAI'
        ) {
          return [];
        }

        const matchingRows = (item.arsipRows ?? []).filter((archive: any) => {
          const expired = hasExpired(archive.tanggalRetensiInaktifBerakhir);
          if (
            statusFilter === 'MENUNGGU_RETENSI_INAKTIF' &&
            expired
          ) {
            return false;
          }
          if (statusFilter === 'SIAP_PENYUSUTAN' && !expired) {
            return false;
          }

          if (
            hasNasibFilter &&
            String(archive.nasibAkhir ?? '').trim().toUpperCase() !== nasibFilter
          ) {
            return false;
          }
          return true;
        });

        return matchingRows.length ? [{ ...item, arsipRows: matchingRows }] : [];
      });
      total = data.length;
    }

    // Paginate manual jika ada filter pasca-query.
    if (hasPostFilter) {
      const start = (page - 1) * limit;
      data = data.slice(start, start + limit);
    }

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Metadata tabel daftar arsip inaktif, diambil dari master pemberkasan. */
  private async attachPenataanArsipMetadata(
    items: TransferActiveToInactiveEntity[],
  ): Promise<void> {
    const refsByTransfer = new Map<string, any[]>();
    const ids = new Set<string>();
    for (const item of items) {
      let refs: any = item.arsipIds;
      if (typeof refs === 'string') {
        try {
          refs = JSON.parse(refs);
        } catch {
          refs = [];
        }
      }
      if (!Array.isArray(refs) || refs.length === 0) {
        refs = item.arsipId ? [{ id: item.arsipId, perihal: item.arsipPerihal, kode: item.arsipKode }] : [];
      }
      refsByTransfer.set(item.id, refs);
      for (const ref of refs) {
        if (ref?.id) ids.add(String(ref.id));
      }
    }

    if (ids.size === 0) {
      for (const item of items) (item as any).arsipRows = [];
      return;
    }

    const placeholders = [...ids].map(() => '?').join(',');
    const metadataRows: any[] = await this.berkasRepo.manager.query(
      `SELECT
         b.id,
         b.kode_berkas AS kodeBerkas,
         b.klasifikasi AS klasifikasiKode,
         COALESCE(NULLIF(b.klasifikasi_text, ''), k.klasifikasi_text) AS klasifikasi,
         COALESCE(NULLIF(b.isi_ringkas, ''), b.judul_berkas) AS uraianInformasi,
         b.tanggal_dibuat AS tanggalDibuat,
         b.tanggal_ditutup AS tanggalDitutup,
         b.lokasi,
         b.retensi_inaktif_tahun AS retensiInaktifTahun,
         k.retensi_inaktif_tahun AS retensiInaktifMaster,
         b.tanggal_retensi_inaktif_berakhir AS tanggalRetensiInaktifBerakhir,
         b.tindakan_penyusutan_akhir AS nasibAkhir,
         k.keamanan AS klasifikasiKeamanan,
         (SELECT COUNT(*) FROM berkas_naskah bn WHERE bn.berkas_id = b.id) AS jumlahBerkas
       FROM berkas b
       LEFT JOIN klasifikasi k ON k.klasifikasi = b.klasifikasi
       WHERE b.id IN (${placeholders})`,
      [...ids],
    );
    const byId = new Map(metadataRows.map((row) => [String(row.id), row]));
    const formatArchiveCreationDate = (value: unknown): string => {
      if (!value) return '-';
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return `${String(value.getDate()).padStart(2, '0')}/${String(value.getMonth() + 1).padStart(2, '0')}/${value.getFullYear()}`;
      }
      const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
      return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value);
    };

    for (const item of items) {
      const refs = refsByTransfer.get(item.id) ?? [];
      (item as any).arsipRows = refs.map((ref, index) => {
        const berkas = byId.get(String(ref.id));
        const kurunWaktu = formatArchiveCreationDate(berkas?.tanggalDibuat);
        const retensi = berkas?.retensiInaktifTahun ?? berkas?.retensiInaktifMaster;
        const tingkatPerkembangan = String(item.keteranganPenataan ?? '')
          .match(/(?:^|\n)Tingkat Perkembangan: ([^\n]*)/)?.[1];
        const kondisiMedia = String(item.keteranganPenataan ?? '')
          .split('\n')
          .filter((line) => !line.startsWith('Tingkat Perkembangan: '))
          .join(' ')
          .trim();

        return {
          id: String(ref.id ?? item.arsipId),
          urutan: index + 1,
          kodeBerkas: berkas?.kodeBerkas ?? ref.kode ?? item.arsipKode ?? '-',
          klasifikasiKode: berkas?.klasifikasiKode ?? '-',
          klasifikasi: berkas?.klasifikasi ?? '-',
          uraianInformasi: berkas?.uraianInformasi ?? ref.perihal ?? item.arsipPerihal ?? '-',
          kurunWaktu,
          jumlahBerkas: berkas ? Number(berkas.jumlahBerkas) : null,
          tingkatPerkembangan: tingkatPerkembangan || '-',
          lokasiSimpan: item.labelPenataan || item.lokasiPenataan || berkas?.lokasi || '-',
          klasifikasiKeamanan: berkas?.klasifikasiKeamanan ?? '-',
          retensiArsipInaktif: retensi != null ? `${retensi} tahun` : '-',
          tanggalRetensiInaktifBerakhir:
            berkas?.tanggalRetensiInaktifBerakhir ?? null,
          nasibAkhir: berkas?.nasibAkhir ?? '-',
          keterangan: [
            kondisiMedia || null,
            item.beritaAcaraNomor
              ? `No. BA: ${item.beritaAcaraNomor}`
              : item.nomorUsulan
                ? `No. BA: BA/${item.nomorUsulan}`
                : null,
          ].filter(Boolean).join(' | ') || '-',
          transferId: item.id,
          nomorUsulan: item.nomorUsulan,
          status: item.status,
        };
      });
    }
  }

  /** Upload foto lampiran penataan arsip (Max 5MB, image only).
   *  Return key + signed URL (URL langsung dari MinIO, bisa dipakai di <img>). */
  async uploadFotoPenataan(file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
  }): Promise<{ key: string; url: string }> {
    const result = await this.storageService.uploadBuffer(
      file.buffer,
      file.originalname,
      file.mimetype,
      'penataan',
    );
    // Dapatkan signed URL (valid 7 hari) agar frontend bisa langsung tampilkan
    const url = await this.storageService.getFileUrl(result.key, 7 * 24 * 3600);
    return { key: result.key, url };
  }

  /** Ambil foto lampiran penataan arsip. */
  async getFotoPenataan(
    key: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    if (!key || !key.startsWith('penataan/') || key.includes('..')) {
      throw new BadRequestException('Akses ditolak: key file tidak valid');
    }
    const { buffer, contentType } =
      await this.storageService.getFileWithMetadata(key);
    return { buffer, contentType };
  }

  /** Selesai penataan arsip → SELESAI. */
  async selesaiPenataan(
    id: string,
    user: JwtPayload,
    dto: {
      lokasi?: string;
      rak?: string;
      baris?: string;
      kolom?: string;
      keterangan?: string;
      fotoPenataan?: string;
    },
  ) {
    const transfer = await this.findOneForTu(id);

    if (
      transfer.status !==
        TransferActiveToInactiveStatus.ARSIP_INAKTIF_DITERIMA &&
      transfer.status !== TransferActiveToInactiveStatus.PENATAAN_ARSIP_INAKTIF
    ) {
      throw new BadRequestException(
        `Status ${transfer.status} tidak bisa diselesaikan penataan`,
      );
    }

    transfer.lokasiPenataan = dto.lokasi ?? null;
    transfer.rak = dto.rak ?? null;
    transfer.baris = dto.baris ?? null;
    transfer.kolom = dto.kolom ?? null;
    transfer.labelPenataan = [dto.rak, dto.baris, dto.kolom]
      .map((part) => String(part ?? '').trim())
      .filter(Boolean)
      .join('.') || null;
    transfer.keteranganPenataan = dto.keterangan ?? null;
    // Simpan signed URL (bukan key) agar frontend bisa langsung tampilkan
    if (dto.fotoPenataan) {
      transfer.fotoPenataan = await this.storageService.getFileUrl(
        dto.fotoPenataan,
        7 * 24 * 3600,
      );
    } else {
      transfer.fotoPenataan = null;
    }
    transfer.status = TransferActiveToInactiveStatus.SELESAI;
    transfer.arrangedAt = new Date();

    const saved = await this.transferRepo.save(transfer);

    // Notifikasi ke sekretaris
    try {
      await this.notificationService.createNotification({
        positionId: '0',
        userPersnum: transfer.sekretarisPersnum,
        type: NotificationType.SYSTEM,
        title: 'Penataan Arsip Selesai',
        body: `Usulan ${saved.nomorUsulan} arsip telah selesai ditata di ${dto.lokasi || 'lokasi'}.`,
        data: {
          action: 'OPEN_TRANSFER_ACTIVE_TO_INACTIVE',
          id: saved.id,
          nomorUsulan: saved.nomorUsulan,
        },
      });
    } catch (e) {
      this.logger.warn(`notify failed: ${(e as Error).message}`);
    }

    return saved;
  }

  /** Update foto penataan saja (tanpa ubah status) — untuk edit foto
   *  setelah penataan selesai. Simpan signed URL ke kolom foto_penataan
   *  agar frontend bisa langsung tampilkan via <img src>.
   */
  async updateFotoPenataan(id: string, fotoKey: string) {
    const transfer = await this.findOneForTu(id);
    if (!fotoKey) {
      throw new BadRequestException('Key file tidak valid');
    }
    // Dapatkan signed URL (valid 7 hari) dan simpan ke DB
    const url = await this.storageService.getFileUrl(fotoKey, 7 * 24 * 3600);
    transfer.fotoPenataan = url;
    return this.transferRepo.save(transfer);
  }
}
