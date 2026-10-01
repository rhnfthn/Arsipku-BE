import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { CreateNaskahSirkulasiDto } from '../dto/naskah_sirkulasi/create_naskah_sirkulasi.dto';
import { UpdateNaskahSirkulasiDto } from '../dto/naskah_sirkulasi/update_naskah_sirkulasi.dto';
import {
  UpdateReadStatusDto,
  UpdateReadStatusResponseDto,
} from '../dto/naskah_sirkulasi/update-read-status.dto';
import {
  InboxQueryDto,
  InboxResponseDto,
  InboxItemDto,
} from '../dto/naskah_sirkulasi/inbox.dto';
import {
  SentMessageQueryDto,
  SentMessageResponseDto,
  SentMessageItemDto,
  PenerimaWithStatusDto,
} from '../dto/naskah_sirkulasi/sent-message.dto';
import {
  InboxSentResponseDto,
  SentItemForCombinedDto,
  InboxSentQueryDto,
} from '../dto/naskah_sirkulasi/inbox-sent.dto';
import {
  TertundaQueryDto,
  TertundaResponseDto,
  TertundaItemDto,
} from '../dto/naskah_sirkulasi/tertunda.dto';
import {
  ToggleFlagResponseDto,
  BulkArchiveSentResponseDto,
} from '../dto/naskah_sirkulasi/toggle-flag.dto';
import { NaskahSirkulasi } from '../entities/naskah_sirkulasi.entity';
import { NaskahEntity } from '../../naskah/entities/naskah.entity';
import { NaskahLampiranEntity } from '../../naskah-lampiran/entities/naskah_lampiran.entity';
import { NaskahReferensiEntity } from '../../naskah-referensi/entities/naskah_referensi.entity';
import { EksternalEntity } from '../../eksternal/entities/eksternal.entity';
// REMOVED: SdiSdeEntity - data now comes from naskah_sirkulasi
// import { SdiSdeEntity } from '../../surat-dinas-eksternal/entities/sdi_sde.entity';
import { LabelService } from '../../label/services/label.service';
import { NaskahLabelEntity } from '../../label/entities/naskah-label.entity';
import { MeilisearchSyncService } from '../../search/services/meilisearch-sync.service';
import { RealtimeEmitService } from '../../realtime/services/realtime-emit.service';

// Label untuk jenis naskah
const JENIS_LABELS: Record<string, string> = {
  ND: 'Nota Dinas',
  SDI: 'Surat Dinas Internal',
  SDE: 'Surat Dinas Eksternal',
  DI: 'Disposisi',
  KA: 'Kajian',
  K: 'Konsep',
  UND: 'Surat Undangan',
  PER: 'Peraturan Direksi',
  KEP: 'Keputusan Direksi',
  INS: 'Instruksi',
  SPR: 'Surat Perintah',
  EDR: 'Surat Edaran',
  SOP: 'Standar Operasional Prosedur (SOP)',
  MOU: 'Kesepakatan Bersama / Nota Kesepahaman',
  PKS: 'Perjanjian Kerja Sama',
  PROC: 'Kontrak Pengadaan',
  PJJ: 'Perjanjian Lainnya',
  LOA: 'Letter of Agreement (LOA)',
  SKU: 'Surat Kuasa',
  BAC: 'Berita Acara',
  KET: 'Surat Keterangan',
  SPE: 'Surat Pengantar',
  RPT: 'Risalah Rapat',
  PEN: 'Pengumuman',
  PGM: 'Sertifikat atau Piagam',
  LAP: 'Laporan',
};

// Type untuk preset date range
type DatePreset = '7_hari' | '30_hari' | '60_hari' | '1_tahun' | 'semua';

@Injectable()
export class NaskahSirkulasiService {
  constructor(
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepo: Repository<NaskahSirkulasi>,
    @InjectRepository(NaskahEntity)
    private readonly naskahRepo: Repository<NaskahEntity>,
    @InjectRepository(EksternalEntity)
    private readonly eksternalRepo: Repository<EksternalEntity>,
    // REMOVED: SdiSdeEntity repository
    // @InjectRepository(SdiSdeEntity)
    // private readonly sdiSdeRepo: Repository<SdiSdeEntity>,
    @InjectRepository(NaskahLabelEntity)
    private readonly naskahLabelRepo: Repository<NaskahLabelEntity>,
    private readonly labelService: LabelService,
    private readonly dataSource: DataSource,
    private readonly meilisearchSyncService: MeilisearchSyncService,
    private readonly realtimeEmitService: RealtimeEmitService,
  ) {}

  /**
   * Helper: Convert preset/custom date range to start & end date strings
   * @param startDate - Custom start date (YYYY-MM-DD)
   * @param endDate - Custom end date (YYYY-MM-DD)
   * @param preset - Preset: 7_hari, 30_hari, 60_hari, 1_tahun, semua
   * @returns { startDate: string | null, endDate: string | null }
   */
  private getDateRangeFromQuery(
    startDate?: string,
    endDate?: string,
    preset?: DatePreset,
  ): { startDate: string | null; endDate: string | null } {
    // Jika preset 'semua' atau tidak ada filter, return null (tanpa filter tanggal)
    if (preset === 'semua') {
      return { startDate: null, endDate: null };
    }

    // Jika ada custom date range, gunakan itu
    if (startDate || endDate) {
      return {
        startDate: startDate || null,
        endDate: endDate || null,
      };
    }

    // Jika ada preset, hitung range dari hari ini
    if (preset) {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

      let daysBack: number;
      switch (preset) {
        case '7_hari':
          daysBack = 7;
          break;
        case '30_hari':
          daysBack = 30;
          break;
        case '60_hari':
          daysBack = 60;
          break;
        case '1_tahun':
          daysBack = 365;
          break;
        default:
          return { startDate: null, endDate: null };
      }

      const startDateCalc = new Date(today);
      startDateCalc.setDate(startDateCalc.getDate() - daysBack);
      const startDateStr = startDateCalc.toISOString().split('T')[0];

      return {
        startDate: startDateStr,
        endDate: todayStr,
      };
    }

    // Default: tidak ada filter tanggal
    return { startDate: null, endDate: null };
  }

  async findAll(): Promise<NaskahSirkulasi[]> {
    return this.naskahSirkulasiRepo.find();
  }

  async findOne(id: string): Promise<NaskahSirkulasi> {
    const naskahSirkulasi = await this.naskahSirkulasiRepo.findOne({
      where: { id },
    });
    if (!naskahSirkulasi) {
      throw new NotFoundException(`Naskah Sirkulasi with ID ${id} not found`);
    }
    return naskahSirkulasi;
  }

  async create(dto: CreateNaskahSirkulasiDto): Promise<NaskahSirkulasi> {
    const newNaskahSirkulasi = this.naskahSirkulasiRepo.create(dto);
    // Partisi: isi tanggal dari naskah induk (kunci partisi RANGE(YEAR(tanggal)))
    if (!newNaskahSirkulasi.tanggal && dto.idNaskah) {
      const naskah = await this.naskahRepo.findOne({
        where: { id: dto.idNaskah },
        select: { tanggal: true },
      });
      newNaskahSirkulasi.tanggal = naskah?.tanggal ?? new Date();
    }
    const saved = await this.naskahSirkulasiRepo.save(newNaskahSirkulasi);

    // Sync to Meilisearch when sirkulasi changes (affects pengirim/penerima info)
    if (saved.idNaskah) {
      this.meilisearchSyncService.syncNaskah(saved.idNaskah).catch(() => {});
    }

    // Emit inbox count refresh ke penerima position
    if (saved.position) {
      try {
        const inboxResult = await this.countUnreadInbox(
          String(saved.position),
        ).catch(() => null);
        const count =
          inboxResult && typeof inboxResult?.data?.count === 'number'
            ? inboxResult.data.count
            : 0;
        this.realtimeEmitService.emitInboxCount(String(saved.position), count);
      } catch {}
    }

    return saved;
  }

  async update(
    id: string,
    dto: UpdateNaskahSirkulasiDto,
  ): Promise<NaskahSirkulasi> {
    const naskahSirkulasi = await this.findOne(id);
    const updated = Object.assign(naskahSirkulasi, dto);
    const saved = await this.naskahSirkulasiRepo.save(updated);

    // Sync to Meilisearch when sirkulasi changes
    if (saved.idNaskah) {
      this.meilisearchSyncService.syncNaskah(saved.idNaskah).catch(() => {});
    }

    return saved;
  }

  async remove(id: string): Promise<{ message: string }> {
    const naskahSirkulasi = await this.findOne(id);
    await this.naskahSirkulasiRepo.remove(naskahSirkulasi);
    return { message: `Naskah Sirkulasi ${id} deleted successfully` };
  }

  // ============================================================
  // UPDATE READ STATUS - Global untuk semua jenis naskah
  // ============================================================

  /**
   * Update status baca pesan (global untuk semua jenis naskah: ND, DI, SDI, SDE, dll)
   *
   * Logic:
   * - Cari sirkulasi berdasarkan id_naskah + position_id (penerima)
   * - Jika sudah terbaca, return info sebelumnya
   * - Jika belum, update send_read_time dan send_read_user
   *
   * @param dto - UpdateReadStatusDto
   * @returns UpdateReadStatusResponseDto
   */
  async updateReadStatus(
    dto: UpdateReadStatusDto,
  ): Promise<UpdateReadStatusResponseDto> {
    // Get naskah untuk info jenis
    const naskah = await this.naskahRepo.findOne({
      where: { id: dto.id_naskah },
    });

    if (!naskah) {
      throw new NotFoundException(
        `Naskah dengan ID ${dto.id_naskah} tidak ditemukan`,
      );
    }

    // Find sirkulasi record for this naskah + position (penerima or tembusan)
    // Menggunakan In() operator agar match baik penerima maupun tembusan
    const sirkulasi = await this.naskahSirkulasiRepo.findOne({
      where: {
        idNaskah: dto.id_naskah,
        position: dto.position_id,
        sirkuler: In(['penerima', 'tembusan']),
      },
    });

    if (!sirkulasi) {
      throw new NotFoundException(
        `Pesan dengan id_naskah ${dto.id_naskah} untuk position ${dto.position_id} tidak ditemukan`,
      );
    }

    // Check if already read
    if (sirkulasi.sendReadTime) {
      return {
        success: true,
        message: 'Pesan sudah terbaca sebelumnya',
        data: {
          id_naskah: dto.id_naskah,
          position_id: dto.position_id,
          jenis_naskah: naskah.jenis,
          is_tembusan: sirkulasi.sirkuler === 'tembusan',
          status_baca: 'terbaca',
          read_time: sirkulasi.sendReadTime,
          read_user: sirkulasi.sendReadUser,
        },
      };
    }

    // Update status to read menggunakan update() langsung (lebih reliable daripada save())
    const now = new Date();
    const readUser = dto.user_id || dto.position_id;

    await this.naskahSirkulasiRepo.update(
      { id: sirkulasi.id, tanggal: sirkulasi.tanggal },
      {
        sendReadTime: now,
        sendReadUser: readUser,
      },
    );

    // Emit inbox count refresh ke penerima position
    try {
      const inboxResult = await this.countUnreadInbox(
        String(dto.position_id),
      ).catch(() => null);
      const count =
        inboxResult && typeof inboxResult?.data?.count === 'number'
          ? inboxResult.data.count
          : 0;
      this.realtimeEmitService.emitInboxCount(String(dto.position_id), count);
    } catch {}

    // Emit tracking update ke PENGIRIM (supaya terkirim page realtime update)
    try {
      const pengirimSirkulasi = await this.naskahSirkulasiRepo.findOne({
        where: { idNaskah: dto.id_naskah, sirkuler: 'pengirim' },
        select: { position: true },
      });
      if (pengirimSirkulasi?.position) {
        this.realtimeEmitService.emitTrackingUpdate(
          String(pengirimSirkulasi.position),
          {
            naskahId: dto.id_naskah,
            sirkulasiId: sirkulasi.id,
            positionId: String(dto.position_id),
            status_baca: 'terbaca',
            read_time: now.toISOString(),
            is_tindak_lanjut: Boolean(sirkulasi.tindakLanjut),
          },
        );
      }
    } catch {}

    return {
      success: true,
      message: 'Status pesan berhasil diupdate menjadi terbaca',
      data: {
        id_naskah: dto.id_naskah,
        position_id: dto.position_id,
        jenis_naskah: naskah.jenis,
        is_tembusan: sirkulasi.sirkuler === 'tembusan',
        status_baca: 'terbaca',
        read_time: now,
        read_user: readUser,
      },
    };
  }

  // ============================================================
  // MARK TINDAK LANJUT - Centralized
  // ============================================================

  /**
   * Centralized method: mark tindak_lanjut=1 on a sirkulasi record
   * and emit tracking:update to the pengirim.
   *
   * @param naskahId - The naskah whose sirkulasi to update
   * @param positionId - The position that performed tindak lanjut
   * @param manager - Optional EntityManager for use inside transactions
   */
  async markTindakLanjut(
    naskahId: string,
    positionId: string | number,
    manager?: any,
  ): Promise<void> {
    if (!naskahId || !positionId) return;

    const repo = manager
      ? manager.getRepository(NaskahSirkulasi)
      : this.naskahSirkulasiRepo;

    // Update tindak_lanjut=1 on the recipient's sirkulasi
    await repo.update(
      {
        idNaskah: naskahId,
        position: String(positionId),
        sirkuler: In(['penerima', 'tembusan']),
      },
      { tindakLanjut: 1 },
    );

    // Emit tracking update to pengirim (fire-and-forget)
    try {
      const pengirimSirk = await repo.findOne({
        where: { idNaskah: naskahId, sirkuler: 'pengirim' },
        select: { position: true },
      });
      if (pengirimSirk?.position) {
        this.realtimeEmitService.emitTrackingUpdate(
          String(pengirimSirk.position),
          {
            naskahId,
            sirkulasiId: '',
            positionId: String(positionId),
            status_baca: 'terbaca',
            read_time: null,
            is_tindak_lanjut: true,
          },
        );
      }
    } catch {}
  }

  /**
   * Mark tindak_lanjut=1 by sirkulasi record ID
   * (for cases where we already have the sirkulasi record).
   */
  async markTindakLanjutById(
    sirkulasiId: string,
    manager?: any,
  ): Promise<void> {
    if (!sirkulasiId) return;

    const repo = manager
      ? manager.getRepository(NaskahSirkulasi)
      : this.naskahSirkulasiRepo;

    const sirkulasi = await repo.findOne({
      where: { id: sirkulasiId },
      select: { id: true, tanggal: true, idNaskah: true, position: true },
    });
    if (!sirkulasi) return;

    await repo.update(
      { id: sirkulasi.id, tanggal: sirkulasi.tanggal },
      { tindakLanjut: 1 },
    );

    // Emit tracking update to pengirim
    try {
      if (sirkulasi.idNaskah) {
        const pengirimSirk = await repo.findOne({
          where: { idNaskah: sirkulasi.idNaskah, sirkuler: 'pengirim' },
          select: { position: true },
        });
        if (pengirimSirk?.position) {
          this.realtimeEmitService.emitTrackingUpdate(
            String(pengirimSirk.position),
            {
              naskahId: sirkulasi.idNaskah,
              sirkulasiId: sirkulasi.id,
              positionId: String(sirkulasi.position),
              status_baca: 'terbaca',
              read_time: null,
              is_tindak_lanjut: true,
            },
          );
        }
      }
    } catch {}
  }

  // ============================================================
  // INBOX - Kotak Masuk
  // ============================================================

  /**
   * Get inbox (kotak masuk) untuk position tertentu
   *
   * Logic:
   * - Ambil semua sirkulasi dimana position = position_id dan sirkuler = 'penerima'
   * - Join dengan tabel naskah untuk mendapatkan jenis, perihal, dll
   * - Filter berdasarkan jenis naskah dan status baca (optional)
   * - Hanya tampilkan naskah dengan status 'final' atau 'final_tte' (bukan draft)
   * - Hanya tampilkan sirkulasi dengan is_draft = false
   *
   * @param positionId - Position ID penerima
   * @param query - Filter options (jenis, status_baca)
   * @returns InboxResponseDto
   */
  async getInbox(
    positionId: string,
    query: InboxQueryDto,
  ): Promise<InboxResponseDto> {
    const sortDirection = query.sort === 'terlama' ? 'ASC' : 'DESC';
    const konsepWorkflowKey = `COALESCE(n.id_naskah_asli, n.id)`;
    const latestKonsepForInboxClause = `
      AND (
        n.jenis <> 'K'
        OR s.id = (
          SELECT s2.id
          FROM naskah_sirkulasi s2
          INNER JOIN naskah n2 ON s2.id_naskah = n2.id
          WHERE s2.position = s.position
          AND s2.sirkuler IN ('penerima', 'tembusan')
          AND s2.is_draft = 0
          AND (s2.is_konsep = 0 OR n2.jenis = 'K')
          AND n2.jenis = 'K'
          AND n2.status IN ('final', 'final_tte')
          AND COALESCE(n2.id_naskah_asli, n2.id) = ${konsepWorkflowKey}
          ORDER BY s2.created_at DESC, s2.id DESC
          LIMIT 1
        )
      )
    `;
    // Build query dengan raw SQL untuk performa dan fleksibilitas
    let summaryWhereClause = `
      WHERE s.position = ?
      AND s.sirkuler IN ('penerima', 'tembusan')
      AND s.is_draft = 0
      AND (s.is_konsep = 0 OR n.jenis = 'K')
      AND n.status IN ('final', 'final_tte')
      ${latestKonsepForInboxClause}
    `;
    const summaryParams: any[] = [positionId];
    let whereClause = summaryWhereClause;
    const params: any[] = [...summaryParams];

    // Filter by jenis naskah hanya untuk data list/pagination, bukan summary total per jenis
    if (query.jenis) {
      whereClause += ` AND n.jenis = ?`;
      params.push(query.jenis);
    }

    // Filter by search (perihal / nomor / nama jabatan pengirim)
    if (query.search && query.search.trim()) {
      const keyword = `%${query.search.trim()}%`;
      whereClause += ` AND (
        n.perihal LIKE ? 
        OR n.nomor LIKE ? 
        OR EXISTS (
          SELECT 1 FROM naskah_sirkulasi sp 
          WHERE sp.id_naskah = s.id_naskah 
          AND sp.sirkuler = 'pengirim' 
          AND sp.position_text LIKE ?
        )
      )`;
      params.push(keyword, keyword, keyword);
    }

    // Filter by status baca
    if (query.status_baca === 'terbaca') {
      whereClause += ` AND s.send_read_time IS NOT NULL`;
      summaryWhereClause += ` AND s.send_read_time IS NOT NULL`;
    } else if (query.status_baca === 'belum_terbaca') {
      whereClause += ` AND s.send_read_time IS NULL`;
      summaryWhereClause += ` AND s.send_read_time IS NULL`;
    }

    // Filter by favorite
    if (query.favorite === true) {
      whereClause += ` AND s.flag_favorit = 1`;
    }

    // Filter by tindak lanjut
    // Default: show all (received naskah stays in kotak-masuk even after the user
    // forwarded/tindak-lanjut'd it — it's still a received item / history; the
    // lanjut BUTTONS are disabled via FE allowedActions when is_tindak_lanjut to
    // prevent double-send). tinjut filter narrows: 'sudah_tinjut' = actioned only,
    // 'belum_tinjut' = not-actioned only.
    // Filter tinjut juga diterapkan ke summaryWhereClause agar badge count tab
    // (Semua/Disposisi/dll) konsisten dengan list yang sedang difilter.
    if (query.tinjut === 'sudah_tinjut') {
      whereClause += ` AND s.tindak_lanjut = 1`;
      summaryWhereClause += ` AND s.tindak_lanjut = 1`;
    } else if (query.tinjut === 'belum_tinjut') {
      whereClause += ` AND s.tindak_lanjut = 0`;
      summaryWhereClause += ` AND s.tindak_lanjut = 0`;
    }

    // Filter by lock
    if (query.lock === true) {
      whereClause += ` AND s.is_locked = 1`;
    }

    // Filter by note
    if (query.note === true) {
      whereClause += ` AND s.flag_note = 1`;
    }

    // Filter by arsip (default: exclude archived items)
    if (query.arsip === true) {
      whereClause += ` AND s.flag_arsip = 1`;
      summaryWhereClause += ` AND s.flag_arsip = 1`;
    } else {
      // Default behavior: exclude archived items unless explicitly requested
      whereClause += ` AND s.flag_arsip = 0`;
      summaryWhereClause += ` AND s.flag_arsip = 0`;
    }

    // Filter by priority (khusus disposisi)
    if (query.priority === true) {
      whereClause += ` AND n.jenis = 'DI' AND EXISTS (SELECT 1 FROM di WHERE di.id_naskah = n.id AND di.is_priority = 1)`;
    }

    // Date Range Filter
    // Gunakan created_at pengirim agar konsisten dengan data tanggal yang ditampilkan di response inbox.
    const inboxDisplayCreatedAtExpr = `COALESCE((SELECT p.created_at FROM naskah_sirkulasi p WHERE p.id_naskah = s.id_naskah AND p.sirkuler = 'pengirim' LIMIT 1), s.created_at)`;
    const inboxLocalDateExpr = `DATE(DATE_ADD(${inboxDisplayCreatedAtExpr}, INTERVAL 7 HOUR))`;
    const dateRange = this.getDateRangeFromQuery(
      query.start_date,
      query.end_date,
      query.preset,
    );
    if (dateRange.startDate) {
      whereClause += ` AND ${inboxLocalDateExpr} >= ?`;
      params.push(dateRange.startDate);
      summaryWhereClause += ` AND ${inboxLocalDateExpr} >= ?`;
      summaryParams.push(dateRange.startDate);
    }
    if (dateRange.endDate) {
      whereClause += ` AND ${inboxLocalDateExpr} <= ?`;
      params.push(dateRange.endDate);
      summaryWhereClause += ` AND ${inboxLocalDateExpr} <= ?`;
      summaryParams.push(dateRange.endDate);
    }

    // Pagination params
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM naskah_sirkulasi s
      INNER JOIN naskah n ON s.id_naskah = n.id
      ${whereClause}
    `;
    const countResult = await this.dataSource.query(countQuery, params);
    const total = parseInt(countResult[0]?.total || '0', 10);
    const totalPages = Math.ceil(total / limit);

    // Get inbox items with pengirim info (with pagination)
    const selectQuery = `
      SELECT 
        s.id as id_sirkulasi,
        s.id_naskah,
        n.jenis,
        n.nomor,
        n.tanggal,
        CASE
          WHEN n.jenis = 'K' THEN CONCAT(
            'konsep-',
            COALESCE(NULLIF(naskah_asal.jenis, ''), 'NASKAH'),
            '-',
            COALESCE(NULLIF(naskah_asal.perihal, ''), NULLIF(n.perihal, ''), '-')
          )
          ELSE n.perihal
        END as perihal,
        n.sifat,
        n.status,
        n.lampiran,
        s.send_read_time,
        s.flag_favorit,
        s.flag_arsip,
        s.flag_note,
        s.note_text,
        s.tindak_lanjut,
        s.is_locked,
        pengirim.position as pengirim_position_id,
        pengirim.position_text as pengirim_position_text,
        pengirim.organization_text as pengirim_organization_text,
        pengirim.nama_sirkuler as pengirim_nama,
        pengirim.id_sirkuler as pengirim_persnum,
        s.position as penerima_position_id,
        s.id_sirkuler as penerima_persnum,
        s.nama_sirkuler as penerima_nama,
        s.position_text as penerima_position_text,
        s.organization_text as penerima_organization_text,
        s.sirkuler as sirkuler_type,
        pengirim.created_at,
        pengirim.updated_at,
        di.is_priority
      FROM naskah_sirkulasi s
      INNER JOIN naskah n ON s.id_naskah = n.id
      LEFT JOIN naskah naskah_asal ON naskah_asal.id = n.id_naskah_asli
      LEFT JOIN naskah_sirkulasi pengirim ON pengirim.id_naskah = s.id_naskah AND pengirim.sirkuler = 'pengirim'
      LEFT JOIN di ON n.id = di.id_naskah
      ${whereClause}
      ORDER BY COALESCE(pengirim.created_at, s.created_at) ${sortDirection}, s.id ${sortDirection}
      LIMIT ? OFFSET ?
    `;
    const rows = await this.dataSource.query(selectQuery, [
      ...params,
      limit,
      offset,
    ]);

    // Get all recipients (kepada) for each naskah
    const naskahIds = [...new Set(rows.map((r: any) => r.id_naskah))];
    const kepadaMap = new Map<string, any[]>();
    const labelsMap = new Map<string, any[]>();

    if (naskahIds.length > 0) {
      const kepadaQuery = `
        SELECT 
          id_naskah,
          position as position_id,
          nama_sirkuler as nama,
          position_text,
          organization_text
        FROM naskah_sirkulasi
        WHERE id_naskah IN (${naskahIds.map(() => '?').join(',')})
        AND sirkuler = 'penerima'
        ORDER BY id
      `;
      const kepadaRows = await this.dataSource.query(kepadaQuery, naskahIds);

      // Group by id_naskah
      kepadaRows.forEach((row: any) => {
        if (!kepadaMap.has(row.id_naskah)) {
          kepadaMap.set(row.id_naskah, []);
        }
        kepadaMap.get(row.id_naskah)?.push({
          position_id: row.position_id || '',
          nama: row.nama || '',
          position_text: row.position_text || '',
          organization_text: row.organization_text || '',
        });
      });

      // Get labels for each naskah (include parent name untuk nested label)
      const labelsQuery = `
        SELECT 
          nl.naskah_id,
          l.nama,
          parent.nama as parent_nama
        FROM naskah_label nl
        INNER JOIN label l ON nl.label_id = l.id
        LEFT JOIN label parent ON l.id_parent = parent.id AND parent.is_active = 1
        WHERE nl.naskah_id IN (${naskahIds.map(() => '?').join(',')})
        AND l.is_active = 1
        ORDER BY l.urutan ASC, l.nama ASC
      `;
      const labelsRows = await this.dataSource.query(labelsQuery, naskahIds);

      // Group labels by naskah_id (with parent hierarchy)
      labelsRows.forEach((row: any) => {
        if (!labelsMap.has(row.naskah_id)) {
          labelsMap.set(row.naskah_id, []);
        }
        // Format: "Parent > Child" jika ada parent, atau hanya "Label" jika tidak ada parent
        const labelName = row.parent_nama
          ? `${row.parent_nama} > ${row.nama}`
          : row.nama;
        labelsMap.get(row.naskah_id)?.push(labelName);
      });
    }

    // Map to InboxItemDto
    const items: InboxItemDto[] = rows.map((row: any) => {
      const item: InboxItemDto = {
        id_sirkulasi: row.id_sirkulasi,
        id_naskah: row.id_naskah,
        jenis: row.jenis,
        jenis_label: JENIS_LABELS[row.jenis] || row.jenis,
        nomor: row.nomor,
        tanggal: row.tanggal,
        perihal: row.perihal,
        sifat: row.sifat,
        status: row.status,
        lampiran: row.lampiran,
        pengirim: {
          position_id: row.pengirim_position_id || '',
          position_text: row.pengirim_position_text || '',
          organization_text: row.pengirim_organization_text || '',
          nama: row.pengirim_nama || '',
          persnum: parseInt(row.pengirim_persnum || '0', 10),
        },
        penerima: {
          position_id: row.penerima_position_id || '',
          persnum: parseInt(row.penerima_persnum || '0', 10),
          nama: row.penerima_nama || '',
          position_text: row.penerima_position_text || '',
          organization_text: row.penerima_organization_text || '',
        },
        kepada: kepadaMap.get(row.id_naskah) || [], // Semua penerima yang dituju
        status_baca: row.send_read_time ? 'terbaca' : 'belum_terbaca',
        read_time: row.send_read_time,
        is_favorit: row.flag_favorit === 1,
        is_arsip: row.flag_arsip === 1,
        is_note: row.flag_note === 1,
        note_text: row.note_text || null,
        is_tindak_lanjut: row.tindak_lanjut === 1,
        is_locked: row.is_locked === 1,
        labels: labelsMap.get(row.id_naskah) || [], // Labels yang di-assign ke naskah
        is_tembusan: row.sirkuler_type === 'tembusan',
        is_priority: row.jenis === 'DI' ? row.is_priority === 1 : false,
        created_at: row.created_at,
        updated_at: row.updated_at,
        source: 'inbox',
      };

      return item;
    });

    // Get summary counts dengan filter yang sama seperti list/pagination
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_semua,
        SUM(CASE WHEN s.send_read_time IS NULL THEN 1 ELSE 0 END) as total_belum_dibaca,
        SUM(CASE WHEN s.flag_favorit = 1 THEN 1 ELSE 0 END) as total_favorit,
        SUM(CASE WHEN n.jenis = 'DI' AND EXISTS (SELECT 1 FROM di WHERE di.id_naskah = n.id AND di.is_priority = 1) THEN 1 ELSE 0 END) as total_priority,
        SUM(CASE WHEN s.is_locked = 1 THEN 1 ELSE 0 END) as total_lock,
        SUM(CASE WHEN s.flag_note = 1 THEN 1 ELSE 0 END) as total_note,
        SUM(CASE WHEN n.jenis = 'ND' THEN 1 ELSE 0 END) as total_nd,
        SUM(CASE WHEN n.jenis = 'SDI' THEN 1 ELSE 0 END) as total_sdi,
        SUM(CASE WHEN n.jenis = 'SDE' THEN 1 ELSE 0 END) as total_sde,
        SUM(CASE WHEN n.jenis = 'DI' THEN 1 ELSE 0 END) as total_di,
        SUM(CASE WHEN n.jenis = 'KA' THEN 1 ELSE 0 END) as total_ka,
        SUM(CASE WHEN n.jenis = 'K' THEN 1 ELSE 0 END) as total_k
      FROM naskah_sirkulasi s
      INNER JOIN naskah n ON s.id_naskah = n.id
      ${summaryWhereClause}
    `;
    const summaryResult = await this.dataSource.query(
      summaryQuery,
      summaryParams,
    );
    const summary = summaryResult[0] || {};

    return {
      success: true,
      message: 'Berhasil mengambil kotak masuk',
      data: items,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
      summary: {
        total_semua: parseInt(summary.total_semua || '0', 10),
        total_belum_dibaca: parseInt(summary.total_belum_dibaca || '0', 10),
        total_favorit: parseInt(summary.total_favorit || '0', 10),
        total_priority: parseInt(summary.total_priority || '0', 10),
        total_lock: parseInt(summary.total_lock || '0', 10),
        total_note: parseInt(summary.total_note || '0', 10),
        total_per_jenis: {
          ND: parseInt(summary.total_nd || '0', 10),
          SDI: parseInt(summary.total_sdi || '0', 10),
          SDE: parseInt(summary.total_sde || '0', 10),
          DI: parseInt(summary.total_di || '0', 10),
          KA: parseInt(summary.total_ka || '0', 10),
          K: parseInt(summary.total_k || '0', 10),
        },
      },
    };
  }

  /**
   * Get naskah previous & next dari sebuah naskah di kotak masuk user.
   * Hanya naskah yang user punya akses (sebagai penerima/tembusan) yang
   * dikembalikan. Filter jenis ikut serta bila diberikan.
   *
   * Urutan menggunakan created_at pengirim (DESC = terbaru) konsisten
   * dengan getInbox. Flag arsip default diexclude (sesuai inbox).
   *
   * @param positionId - Position ID penerima (dari JWT)
   * @param idNaskah   - ID naskah acuan (naskah yang sedang dibuka)
   * @param jenis      - Filter jenis (optional)
   */
  async getInboxNavigation(
    positionId: string,
    idNaskah: string,
    jenis?: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      current: { id_naskah: string } | null;
      previous: {
        id_naskah: string;
        jenis: string;
        jenis_label: string;
        nomor: string | null;
        perihal: string | null;
        pengirim_position_text: string;
        pengirim_nama: string;
        created_at: Date;
      } | null;
      next: {
        id_naskah: string;
        jenis: string;
        jenis_label: string;
        nomor: string | null;
        perihal: string | null;
        pengirim_position_text: string;
        pengirim_nama: string;
        created_at: Date;
      } | null;
    };
  }> {
    const sortDirection = 'DESC'; // konsisten dengan inbox default (terbaru)
    const konsepWorkflowKey = `COALESCE(n.id_naskah_asli, n.id)`;
    const latestKonsepForInboxClause = `
      AND (
        n.jenis <> 'K'
        OR s.id = (
          SELECT s2.id
          FROM naskah_sirkulasi s2
          INNER JOIN naskah n2 ON s2.id_naskah = n2.id
          WHERE s2.position = s.position
          AND s2.sirkuler IN ('penerima', 'tembusan')
          AND s2.is_draft = 0
          AND (s2.is_konsep = 0 OR n2.jenis = 'K')
          AND n2.jenis = 'K'
          AND n2.status IN ('final', 'final_tte')
          AND COALESCE(n2.id_naskah_asli, n2.id) = ${konsepWorkflowKey}
          ORDER BY s2.created_at DESC, s2.id DESC
          LIMIT 1
        )
      )
    `;
    const orderExpr = `COALESCE(
      (SELECT p.created_at FROM naskah_sirkulasi p
       WHERE p.id_naskah = s.id_naskah AND p.sirkuler = 'pengirim' LIMIT 1),
      s.created_at
    )`;

    const accessCheck = `
      SELECT s.id_naskah
      FROM naskah_sirkulasi s
      INNER JOIN naskah n ON s.id_naskah = n.id
      WHERE s.position = ?
        AND s.sirkuler IN ('penerima', 'tembusan')
        AND s.is_draft = 0
        AND (s.is_konsep = 0 OR n.jenis = 'K')
        AND n.status IN ('final', 'final_tte')
        AND s.flag_arsip = 0
        AND s.id_naskah = ?
      LIMIT 1
    `;
    const accessRows: any[] = await this.dataSource.query(accessCheck, [
      positionId,
      idNaskah,
    ]);
    if (accessRows.length === 0) {
      return {
        success: false,
        message: 'Unauthorized',
        data: { current: null, previous: null, next: null },
      };
    }

    const refQuery = `
      SELECT ${orderExpr} AS ref_created_at, s.id AS ref_sirkulasi_id
      FROM naskah_sirkulasi s
      INNER JOIN naskah n ON s.id_naskah = n.id
      WHERE s.id_naskah = ? AND s.sirkuler IN ('penerima', 'tembusan') AND s.position = ?
      LIMIT 1
    `;
    const refRows: any[] = await this.dataSource.query(refQuery, [
      idNaskah,
      positionId,
    ]);
    if (refRows.length === 0) {
      return {
        success: true,
        message: 'Naskah acuan tidak ditemukan di kotak masuk',
        data: { current: { id_naskah: idNaskah }, previous: null, next: null },
      };
    }
    const refCreatedAt = refRows[0].ref_created_at;
    const refSirkulasiId = refRows[0].ref_sirkulasi_id;

    const baseWhere = `
      WHERE s.position = ?
        AND s.sirkuler IN ('penerima', 'tembusan')
        AND s.is_draft = 0
        AND (s.is_konsep = 0 OR n.jenis = 'K')
        AND n.status IN ('final', 'final_tte')
        AND s.flag_arsip = 0
        ${latestKonsepForInboxClause}
    `;
    const baseParams: any[] = [positionId];
    const jenisClause = jenis ? ` AND n.jenis = ?` : '';
    const jenisParams = jenis ? [jenis] : [];

    const navSelect = `
      SELECT
        s.id_naskah,
        n.jenis,
        n.nomor,
        n.perihal,
        pengirim.position_text AS pengirim_position_text,
        pengirim.nama_sirkuler AS pengirim_nama,
        ${orderExpr} AS created_at
      FROM naskah_sirkulasi s
      INNER JOIN naskah n ON s.id_naskah = n.id
      LEFT JOIN naskah_sirkulasi pengirim
        ON pengirim.id_naskah = s.id_naskah AND pengirim.sirkuler = 'pengirim'
      ${baseWhere}${jenisClause}
        AND (
          ${orderExpr} <op> ?
          OR (${orderExpr} = ? AND s.id <id_op> ?)
        )
      ORDER BY ${orderExpr} <dir>, s.id <dir>
      LIMIT 1
    `;

    const prevQuery = navSelect
      .replace(/<op>/g, '<')
      .replace(/<id_op>/g, '<')
      .replace(/<dir>/g, 'DESC');
    const prevRows: any[] = await this.dataSource.query(prevQuery, [
      ...baseParams,
      ...jenisParams,
      refCreatedAt,
      refCreatedAt,
      refSirkulasiId,
    ]);

    const nextQuery = navSelect
      .replace(/<op>/g, '>')
      .replace(/<id_op>/g, '>')
      .replace(/<dir>/g, 'ASC');
    const nextRows: any[] = await this.dataSource.query(nextQuery, [
      ...baseParams,
      ...jenisParams,
      refCreatedAt,
      refCreatedAt,
      refSirkulasiId,
    ]);

    const mapNav = (row: any) => ({
      id_naskah: row.id_naskah,
      jenis: row.jenis,
      jenis_label: JENIS_LABELS[row.jenis] || row.jenis,
      nomor: row.nomor,
      perihal: row.perihal,
      pengirim_position_text: row.pengirim_position_text || '',
      pengirim_nama: row.pengirim_nama || '',
      created_at: row.created_at,
    });

    return {
      success: true,
      message: 'Berhasil mengambil navigasi kotak masuk',
      data: {
        current: { id_naskah: idNaskah },
        previous: prevRows.length > 0 ? mapNav(prevRows[0]) : null,
        next: nextRows.length > 0 ? mapNav(nextRows[0]) : null,
      },
    };
  }

  // ============================================================
  // TERTUNDA - Surat Tertunda / Pending TTD Basah
  // ============================================================

  /**
   * Get surat tertunda (pending TTD basah) untuk position tertentu
   *
   * Logic:
   * - Ambil sirkulasi dimana position = position_id dan sirkuler = 'pengirim'
   * - Join naskah dengan status = 'pending' (TTD basah, belum dikirim)
   * - Sirkulasi masih isDraft = true (belum terkirim ke penerima)
   *
   * @param positionId - Position ID pengirim
   * @param query - Filter options
   * @returns TertundaResponseDto
   */
  async getTertunda(
    positionId: string,
    query: TertundaQueryDto,
  ): Promise<TertundaResponseDto> {
    const sortDirection = query.sort === 'terlama' ? 'ASC' : 'DESC';
    let summaryWhereClause = `
      WHERE s.position = ?
      AND s.sirkuler = 'pengirim'
      AND s.is_draft = 1
      AND n.status = 'pending'
    `;
    const summaryParams: any[] = [positionId];
    let whereClause = summaryWhereClause;
    const params: any[] = [...summaryParams];

    // Filter by jenis naskah
    if (query.jenis) {
      whereClause += ` AND n.jenis = ?`;
      params.push(query.jenis);
    }

    // Pending belum benar-benar terkirim, jadi tidak punya status baca "terbaca".
    if (query.status_baca === 'terbaca') {
      whereClause += ` AND 1 = 0`;
      summaryWhereClause += ` AND 1 = 0`;
    }

    // Filter by favorite
    if (query.favorite === true) {
      whereClause += ` AND s.flag_favorit = 1`;
      summaryWhereClause += ` AND s.flag_favorit = 1`;
    }

    // Filter by tindak lanjut
    // Default: show all (received naskah stays in kotak-masuk even after the user
    // forwarded/tindak-lanjut'd it — it's still a received item / history; the
    // lanjut BUTTONS are disabled via FE allowedActions when is_tindak_lanjut to
    // prevent double-send). tinjut filter narrows: 'sudah_tinjut' = actioned only,
    // 'belum_tinjut' = not-actioned only.
    if (query.tinjut === 'sudah_tinjut') {
      whereClause += ` AND s.tindak_lanjut = 1`;
      summaryWhereClause += ` AND s.tindak_lanjut = 1`;
    } else if (query.tinjut === 'belum_tinjut') {
      whereClause += ` AND s.tindak_lanjut = 0`;
      summaryWhereClause += ` AND s.tindak_lanjut = 0`;
    }

    // Filter by lock
    if (query.lock === true) {
      whereClause += ` AND s.is_locked = 1`;
      summaryWhereClause += ` AND s.is_locked = 1`;
    }

    // Filter by note
    if (query.note === true) {
      whereClause += ` AND s.flag_note = 1`;
      summaryWhereClause += ` AND s.flag_note = 1`;
    }

    // Filter by arsip (default: exclude archived items)
    if (query.arsip === true) {
      whereClause += ` AND s.flag_arsip = 1`;
      summaryWhereClause += ` AND s.flag_arsip = 1`;
    } else {
      whereClause += ` AND s.flag_arsip = 0`;
      summaryWhereClause += ` AND s.flag_arsip = 0`;
    }

    // Filter by priority (khusus disposisi)
    if (query.priority === true) {
      whereClause += ` AND n.jenis = 'DI' AND EXISTS (SELECT 1 FROM di WHERE di.id_naskah = n.id AND di.is_priority = 1)`;
      summaryWhereClause += ` AND n.jenis = 'DI' AND EXISTS (SELECT 1 FROM di WHERE di.id_naskah = n.id AND di.is_priority = 1)`;
    }

    // Date Range Filter
    const dateRange = this.getDateRangeFromQuery(
      query.start_date,
      query.end_date,
      query.preset,
    );
    if (dateRange.startDate) {
      whereClause += ` AND DATE(s.created_at) >= ?`;
      params.push(dateRange.startDate);
      summaryWhereClause += ` AND DATE(s.created_at) >= ?`;
      summaryParams.push(dateRange.startDate);
    }
    if (dateRange.endDate) {
      whereClause += ` AND DATE(s.created_at) <= ?`;
      params.push(dateRange.endDate);
      summaryWhereClause += ` AND DATE(s.created_at) <= ?`;
      summaryParams.push(dateRange.endDate);
    }

    // Pagination
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM naskah_sirkulasi s
      INNER JOIN naskah n ON s.id_naskah = n.id
      ${whereClause}
    `;
    const countResult = await this.dataSource.query(countQuery, params);
    const total = parseInt(countResult[0]?.total || '0', 10);
    const totalPages = Math.ceil(total / limit);

    // Get tertunda items
    const selectQuery = `
      SELECT 
        s.id as id_sirkulasi,
        s.id_naskah,
        n.jenis,
        n.nomor,
        n.tanggal,
        n.perihal,
        n.sifat,
        n.status,
        n.lampiran,
        s.position as pengirim_position_id,
        s.position_text as pengirim_position_text,
        s.organization_text as pengirim_organization_text,
        s.nama_sirkuler as pengirim_nama,
        s.flag_favorit,
        s.flag_note,
        s.note_text,
        s.flag_arsip,
        s.tindak_lanjut,
        s.is_locked,
        s.created_at,
        s.updated_at,
        di.is_priority
      FROM naskah_sirkulasi s
      INNER JOIN naskah n ON s.id_naskah = n.id
      LEFT JOIN di ON n.id = di.id_naskah
      ${whereClause}
      ORDER BY s.created_at ${sortDirection}, s.id ${sortDirection}
      LIMIT ? OFFSET ?
    `;
    const rows = await this.dataSource.query(selectQuery, [
      ...params,
      limit,
      offset,
    ]);

    // Get summary counts
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_semua,
        SUM(CASE WHEN n.jenis = 'ND' THEN 1 ELSE 0 END) as total_nd,
        SUM(CASE WHEN n.jenis = 'SDI' THEN 1 ELSE 0 END) as total_sdi,
        SUM(CASE WHEN n.jenis = 'SDE' THEN 1 ELSE 0 END) as total_sde,
        SUM(CASE WHEN n.jenis = 'DI' THEN 1 ELSE 0 END) as total_di,
        SUM(CASE WHEN n.jenis = 'KA' THEN 1 ELSE 0 END) as total_ka
      FROM naskah_sirkulasi s
      INNER JOIN naskah n ON s.id_naskah = n.id
      ${summaryWhereClause}
    `;
    const summaryResult = await this.dataSource.query(
      summaryQuery,
      summaryParams,
    );
    const summaryData = summaryResult[0] || {};

    if (rows.length === 0) {
      return {
        success: true,
        message: 'Tidak ada surat tertunda',
        data: [],
        pagination: { total, page, limit, totalPages },
        summary: {
          total_semua: parseInt(summaryData.total_semua || '0', 10),
          total_per_jenis: {
            ND: parseInt(summaryData.total_nd || '0', 10),
            SDI: parseInt(summaryData.total_sdi || '0', 10),
            SDE: parseInt(summaryData.total_sde || '0', 10),
            DI: parseInt(summaryData.total_di || '0', 10),
            KA: parseInt(summaryData.total_ka || '0', 10),
          },
        },
      };
    }

    // Get penerima for each naskah
    const naskahIds = rows.map((r: any) => r.id_naskah);
    const penerimaQuery = `
      SELECT id_naskah, position as position_id, position_text, nama_sirkuler as nama
      FROM naskah_sirkulasi
      WHERE id_naskah IN (${naskahIds.map(() => '?').join(',')})
      AND sirkuler = 'penerima'
      ORDER BY urutan ASC
    `;
    const penerimaRows = await this.dataSource.query(penerimaQuery, naskahIds);

    // Group penerima by naskah
    const penerimaMap = new Map<string, any[]>();
    for (const p of penerimaRows) {
      const list = penerimaMap.get(p.id_naskah) || [];
      list.push({
        position_id: p.position_id || '',
        position_text: p.position_text || '',
        nama: p.nama || null,
      });
      penerimaMap.set(p.id_naskah, list);
    }

    // Get lampiran count for each naskah
    const lampiranQuery = `
      SELECT id_naskah, COUNT(*) as total
      FROM naskah_lampiran
      WHERE id_naskah IN (${naskahIds.map(() => '?').join(',')})
      GROUP BY id_naskah
    `;
    const lampiranRows = await this.dataSource.query(lampiranQuery, naskahIds);
    const lampiranMap = new Map<string, number>();
    for (const l of lampiranRows) {
      lampiranMap.set(l.id_naskah, parseInt(l.total || '0', 10));
    }

    // Build response items
    const items: TertundaItemDto[] = rows.map((row: any) => ({
      id_naskah: row.id_naskah,
      id_sirkulasi: row.id_sirkulasi,
      jenis: row.jenis,
      jenis_label: JENIS_LABELS[row.jenis] || row.jenis,
      nomor: row.nomor || null,
      tanggal: row.tanggal,
      perihal: row.perihal || null,
      sifat: row.sifat || 'biasa',
      status: 'pending' as const,
      lampiran: lampiranMap.get(row.id_naskah) || 0,
      favorit: !!row.flag_favorit,
      note: !!row.flag_note,
      note_text: row.note_text || null,
      arsip: !!row.flag_arsip,
      is_locked: !!row.is_locked,
      is_tindak_lanjut: !!row.tindak_lanjut,
      pengirim: {
        position_id: row.pengirim_position_id || '',
        position_text: row.pengirim_position_text || '',
        organization_text: row.pengirim_organization_text || '',
        nama: row.pengirim_nama || null,
      },
      penerima: penerimaMap.get(row.id_naskah) || [],
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return {
      success: true,
      message: `Ditemukan ${total} surat tertunda`,
      data: items,
      pagination: { total, page, limit, totalPages },
      summary: {
        total_semua: parseInt(summaryData.total_semua || '0', 10),
        total_per_jenis: {
          ND: parseInt(summaryData.total_nd || '0', 10),
          SDI: parseInt(summaryData.total_sdi || '0', 10),
          SDE: parseInt(summaryData.total_sde || '0', 10),
          DI: parseInt(summaryData.total_di || '0', 10),
          KA: parseInt(summaryData.total_ka || '0', 10),
        },
      },
    };
  }

  /**
   * Get count surat tertunda untuk position tertentu
   */
  async countTertunda(positionId: string): Promise<{ total: number }> {
    const result = await this.dataSource.query(
      `SELECT COUNT(*) as total
       FROM naskah_sirkulasi s
       INNER JOIN naskah n ON s.id_naskah = n.id
       WHERE s.position = ?
       AND s.sirkuler = 'pengirim'
       AND s.is_draft = 1
       AND n.status = 'pending'`,
      [positionId],
    );
    return { total: parseInt(result[0]?.total || '0', 10) };
  }

  // ============================================================
  // SENT MESSAGE - Kotak Keluar (Global untuk semua jenis naskah)
  // ============================================================

  /**
   * Get sent messages (kotak keluar) untuk position tertentu
   *
   * Logic:
   * - Ambil semua sirkulasi dimana position = position_id dan sirkuler = 'pengirim'
   * - Join dengan tabel naskah untuk mendapatkan jenis, perihal, dll
   * - Hanya tampilkan naskah dengan status 'final' atau 'final_tte' (bukan draft)
   * - Hanya tampilkan sirkulasi dengan is_draft = false
   * - Untuk setiap naskah, ambil daftar penerima dan status baca mereka
   *
   * @param positionId - Position ID pengirim
   * @param query - Filter options (jenis, status_baca)
   * @returns SentMessageResponseDto
   */
  async getSentMessage(
    positionId: string,
    query: SentMessageQueryDto,
  ): Promise<SentMessageResponseDto> {
    const sortDirection = query.sort === 'terlama' ? 'ASC' : 'DESC';
    const konsepWorkflowKey = `COALESCE(n.id_naskah_asli, n.id)`;
    const latestKonsepForSenderClause = `
      AND (
        n.jenis <> 'K'
        OR s.id = (
          SELECT s2.id
          FROM naskah_sirkulasi s2
          INNER JOIN naskah n2 ON s2.id_naskah = n2.id
          WHERE s2.position = s.position
          AND s2.sirkuler = 'pengirim'
          AND s2.is_draft = 0
          AND s2.is_konsep = 0
          AND n2.jenis = 'K'
          AND COALESCE(n2.id_naskah_asli, n2.id) = ${konsepWorkflowKey}
          ORDER BY s2.created_at DESC, s2.id DESC
          LIMIT 1
        )
      )
    `;
    const activityAtExpr = `
      CASE
        WHEN n.jenis = 'K' THEN COALESCE(
          (
            SELECT MAX(s3.created_at)
            FROM naskah_sirkulasi s3
            INNER JOIN naskah n3 ON s3.id_naskah = n3.id
            WHERE s3.sirkuler = 'pengirim'
            AND s3.is_draft = 0
            AND s3.is_konsep = 0
            AND n3.jenis = 'K'
            AND COALESCE(n3.id_naskah_asli, n3.id) = ${konsepWorkflowKey}
          ),
          s.created_at
        )
        ELSE s.created_at
      END
    `;
    // Build base query untuk mendapat naskah yang dikirim oleh position ini
    let summaryWhereClause = `
      WHERE s.position = ?
      AND s.sirkuler = 'pengirim'
      AND s.is_draft = 0
      AND s.is_konsep = 0
      AND n.status IN ('final', 'final_tte')
      ${latestKonsepForSenderClause}
    `;
    const summaryParams: any[] = [positionId];
    let whereClause = summaryWhereClause;
    const params: any[] = [...summaryParams];

    // Filter by jenis naskah hanya untuk data list/pagination, bukan summary total per jenis
    if (query.jenis) {
      whereClause += ` AND n.jenis = ?`;
      params.push(query.jenis);
    }

    // Filter by search (perihal / nomor / nama penerima / jabatan penerima)
    if (query.search && query.search.trim()) {
      const keyword = `%${query.search.trim()}%`;
      whereClause += ` AND (
        n.perihal LIKE ? 
        OR n.nomor LIKE ? 
        OR EXISTS (
          SELECT 1 FROM naskah_sirkulasi sp 
          WHERE sp.id_naskah = s.id_naskah 
          AND sp.sirkuler = 'penerima' 
          AND (sp.nama_sirkuler LIKE ? OR sp.position_text LIKE ?)
        )
      )`;
      params.push(keyword, keyword, keyword, keyword);
    }

    // Filter by read status.
    // Untuk SDE, pertahankan perilaku existing: tetap tampil walaupun filter status_baca aktif.
    if (query.status_baca === 'terbaca') {
      whereClause += `
        AND (
          n.jenis = 'SDE'
          OR EXISTS (
            SELECT 1
            FROM naskah_sirkulasi sr
            WHERE sr.id_naskah = s.id_naskah
            AND sr.sirkuler = 'penerima'
            AND sr.send_read_time IS NOT NULL
          )
        )
      `;
      summaryWhereClause += `
        AND (
          n.jenis = 'SDE'
          OR EXISTS (
            SELECT 1
            FROM naskah_sirkulasi sr
            WHERE sr.id_naskah = s.id_naskah
            AND sr.sirkuler = 'penerima'
            AND sr.send_read_time IS NOT NULL
          )
        )
      `;
    } else if (query.status_baca === 'belum_terbaca') {
      whereClause += `
        AND (
          n.jenis = 'SDE'
          OR EXISTS (
            SELECT 1
            FROM naskah_sirkulasi sr
            WHERE sr.id_naskah = s.id_naskah
            AND sr.sirkuler = 'penerima'
            AND sr.send_read_time IS NULL
          )
        )
      `;
      summaryWhereClause += `
        AND (
          n.jenis = 'SDE'
          OR EXISTS (
            SELECT 1
            FROM naskah_sirkulasi sr
            WHERE sr.id_naskah = s.id_naskah
            AND sr.sirkuler = 'penerima'
            AND sr.send_read_time IS NULL
          )
        )
      `;
    }

    // Filter by favorite
    if (query.favorite === true) {
      whereClause += ` AND s.flag_favorit = 1`;
    }

    // Filter by tindak lanjut
    // Default: show all (received naskah stays in kotak-masuk even after the user
    // forwarded/tindak-lanjut'd it — it's still a received item / history; the
    // lanjut BUTTONS are disabled via FE allowedActions when is_tindak_lanjut to
    // prevent double-send). tinjut filter narrows: 'sudah_tinjut' = actioned only,
    // 'belum_tinjut' = not-actioned only.
    // Filter tinjut juga diterapkan ke summaryWhereClause agar badge count tab
    // konsisten dengan list yang sedang difilter.
    if (query.tinjut === 'sudah_tinjut') {
      whereClause += ` AND s.tindak_lanjut = 1`;
      summaryWhereClause += ` AND s.tindak_lanjut = 1`;
    } else if (query.tinjut === 'belum_tinjut') {
      whereClause += ` AND s.tindak_lanjut = 0`;
      summaryWhereClause += ` AND s.tindak_lanjut = 0`;
    }

    // Filter by lock
    if (query.lock === true) {
      whereClause += ` AND s.is_locked = 1`;
    }

    // Filter by note
    if (query.note === true) {
      whereClause += ` AND s.flag_note = 1`;
    }

    // Filter by arsip (default: exclude archived items)
    if (query.arsip === true) {
      whereClause += ` AND s.flag_arsip = 1`;
      summaryWhereClause += ` AND s.flag_arsip = 1`;
    } else {
      whereClause += ` AND s.flag_arsip = 0`;
      summaryWhereClause += ` AND s.flag_arsip = 0`;
    }

    // Filter by priority (khusus disposisi)
    if (query.priority === true) {
      whereClause += ` AND n.jenis = 'DI' AND EXISTS (SELECT 1 FROM di WHERE di.id_naskah = n.id AND di.is_priority = 1)`;
    }

    // Date Range Filter
    const dateRange = this.getDateRangeFromQuery(
      query.start_date,
      query.end_date,
      query.preset,
    );
    if (dateRange.startDate) {
      whereClause += ` AND DATE(${activityAtExpr}) >= ?`;
      params.push(dateRange.startDate);
      summaryWhereClause += ` AND DATE(${activityAtExpr}) >= ?`;
      summaryParams.push(dateRange.startDate);
    }
    if (dateRange.endDate) {
      whereClause += ` AND DATE(${activityAtExpr}) <= ?`;
      params.push(dateRange.endDate);
      summaryWhereClause += ` AND DATE(${activityAtExpr}) <= ?`;
      summaryParams.push(dateRange.endDate);
    }

    // Pagination params
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM naskah_sirkulasi s
      INNER JOIN naskah n ON s.id_naskah = n.id
      ${whereClause}
    `;
    const countResult = await this.dataSource.query(countQuery, params);
    const total = parseInt(countResult[0]?.total || '0', 10);
    const totalPages = Math.ceil(total / limit);

    // Get naskah yang dikirim beserta info pengirim (with pagination)
    const selectQuery = `
      SELECT 
        s.id as id_sirkulasi,
        s.id_naskah,
        n.jenis,
        n.nomor,
        n.tanggal,
        CASE
          WHEN n.jenis = 'K' THEN CONCAT(
            'konsep-',
            COALESCE(NULLIF(naskah_asal.jenis, ''), 'NASKAH'),
            '-',
            COALESCE(NULLIF(naskah_asal.perihal, ''), NULLIF(n.perihal, ''), '-')
          )
          ELSE n.perihal
        END as perihal,
        n.sifat,
        n.status,
        n.lampiran,
        s.position as pengirim_position_id,
        s.position_text as pengirim_position_text,
        s.organization_text as pengirim_organization_text,
        s.nama_sirkuler as pengirim_nama,
        s.id_sirkuler as pengirim_persnum,
        s.flag_favorit,
        s.flag_note,
        s.note_text,
        s.flag_arsip,
        s.tindak_lanjut,
        s.is_locked,
        ${activityAtExpr} as created_at,
        s.updated_at,
        di.is_priority
      FROM naskah_sirkulasi s
      INNER JOIN naskah n ON s.id_naskah = n.id
      LEFT JOIN naskah naskah_asal ON naskah_asal.id = n.id_naskah_asli
      LEFT JOIN di ON n.id = di.id_naskah
      ${whereClause}
      ORDER BY created_at ${sortDirection}, s.id ${sortDirection}
      LIMIT ? OFFSET ?
    `;
    const rows = await this.dataSource.query(selectQuery, [
      ...params,
      limit,
      offset,
    ]);

    // Get summary counts dengan filter yang sama seperti list/pagination
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_semua,
        SUM(CASE WHEN s.flag_favorit = 1 THEN 1 ELSE 0 END) as total_favorit,
        SUM(CASE WHEN n.jenis = 'DI' AND EXISTS (SELECT 1 FROM di WHERE di.id_naskah = n.id AND di.is_priority = 1) THEN 1 ELSE 0 END) as total_priority,
        SUM(CASE WHEN s.is_locked = 1 THEN 1 ELSE 0 END) as total_lock,
        SUM(CASE WHEN s.flag_note = 1 THEN 1 ELSE 0 END) as total_note,
        SUM(CASE WHEN n.jenis = 'ND' THEN 1 ELSE 0 END) as total_nd,
        SUM(CASE WHEN n.jenis = 'SDI' THEN 1 ELSE 0 END) as total_sdi,
        SUM(CASE WHEN n.jenis = 'SDE' THEN 1 ELSE 0 END) as total_sde,
        SUM(CASE WHEN n.jenis = 'DI' THEN 1 ELSE 0 END) as total_di,
        SUM(CASE WHEN n.jenis = 'KA' THEN 1 ELSE 0 END) as total_ka,
        SUM(CASE WHEN n.jenis = 'K' THEN 1 ELSE 0 END) as total_k
      FROM naskah_sirkulasi s
      INNER JOIN naskah n ON s.id_naskah = n.id
      ${summaryWhereClause}
    `;
    const summaryResult = await this.dataSource.query(
      summaryQuery,
      summaryParams,
    );
    const summaryData = summaryResult[0] || {};

    const summary = {
      total_semua: parseInt(summaryData.total_semua || '0', 10),
      total_favorit: parseInt(summaryData.total_favorit || '0', 10),
      total_priority: parseInt(summaryData.total_priority || '0', 10),
      total_lock: parseInt(summaryData.total_lock || '0', 10),
      total_note: parseInt(summaryData.total_note || '0', 10),
      total_per_jenis: {
        ND: parseInt(summaryData.total_nd || '0', 10),
        SDI: parseInt(summaryData.total_sdi || '0', 10),
        SDE: parseInt(summaryData.total_sde || '0', 10),
        DI: parseInt(summaryData.total_di || '0', 10),
        KA: parseInt(summaryData.total_ka || '0', 10),
        K: parseInt(summaryData.total_k || '0', 10),
      },
    };

    if (rows.length === 0) {
      return {
        success: true,
        message: 'Tidak ada pesan yang dikirim',
        data: [],
        pagination: {
          total,
          page,
          limit,
          totalPages,
        },
        summary,
      };
    }

    // Get all naskah IDs untuk query labels
    const naskahIds = rows.map((r: any) => r.id_naskah);
    const labelsMap = new Map<string, string[]>();

    // Get labels for all naskah
    if (naskahIds.length > 0) {
      const labelsQuery = `
        SELECT 
          nl.naskah_id,
          l.nama,
          parent.nama as parent_nama
        FROM naskah_label nl
        INNER JOIN label l ON nl.label_id = l.id
        LEFT JOIN label parent ON l.id_parent = parent.id AND parent.is_active = 1
        WHERE nl.naskah_id IN (${naskahIds.map(() => '?').join(',')})
        AND l.is_active = 1
        ORDER BY l.urutan ASC, l.nama ASC
      `;
      const labelsRows = await this.dataSource.query(labelsQuery, naskahIds);

      // Group labels by naskah_id
      labelsRows.forEach((row: any) => {
        if (!labelsMap.has(row.naskah_id)) {
          labelsMap.set(row.naskah_id, []);
        }
        const labelName = row.parent_nama
          ? `${row.parent_nama} > ${row.nama}`
          : row.nama;
        labelsMap.get(row.naskah_id)?.push(labelName);
      });
    }

    // Untuk setiap naskah, ambil daftar penerima
    const items: SentMessageItemDto[] = [];
    const mapInternalRecipientStatus = (p: any) => ({
      position_id: p.position_id || '',
      position_text: p.position_text || '',
      organization_text: p.organization_text || '',
      nama: p.nama || null,
      persnum: p.persnum ? parseInt(p.persnum, 10) || 0 : 0,
      status_baca: p.send_read_time ? 'terbaca' : 'belum_terbaca',
      read_time: p.send_read_time || null,
      is_tindak_lanjut: p.tindak_lanjut === 1,
    });

    const buildTrackingSummary = (penerimaRows: any[], tembusanRows: any[]) => {
      const allRecipients = [...penerimaRows, ...tembusanRows];
      const terbaca = allRecipients.filter(
        (p: any) => p.status_baca === 'terbaca',
      ).length;
      const tindakLanjut = allRecipients.filter(
        (p: any) => p.is_tindak_lanjut,
      ).length;

      return {
        summary_baca: {
          total: allRecipients.length,
          terbaca,
          belum_terbaca: allRecipients.length - terbaca,
        },
        summary_tindak_lanjut: {
          total: allRecipients.length,
          sudah: tindakLanjut,
          belum: allRecipients.length - tindakLanjut,
        },
      };
    };

    const getKonsepTrackingLogs = async (naskahId: string) => {
      const workflowRows = await this.dataSource.query(
        `
          SELECT
            s.id as id_sirkulasi,
            s.id_naskah,
            n.jenis,
            n.nomor,
            n.perihal,
            s.position as pengirim_position_id,
            s.position_text as pengirim_position_text,
            s.organization_text as pengirim_organization_text,
            s.nama_sirkuler as pengirim_nama,
            s.created_at
          FROM naskah_sirkulasi s
          INNER JOIN naskah n ON s.id_naskah = n.id
          WHERE s.sirkuler = 'pengirim'
          AND s.is_draft = 0
          AND s.is_konsep = 0
          AND n.jenis = 'K'
          AND COALESCE(n.id_naskah_asli, n.id) = (
            SELECT COALESCE(nref.id_naskah_asli, nref.id)
            FROM naskah nref
            WHERE nref.id = ?
            LIMIT 1
          )
          ORDER BY s.created_at ASC, s.id ASC
        `,
        [naskahId],
      );

      const workflowNaskahIds = workflowRows.map((row: any) => row.id_naskah);
      if (workflowNaskahIds.length === 0) return [];

      const recipientRows = await this.dataSource.query(
        `
          SELECT
            id_naskah,
            sirkuler,
            position as position_id,
            position_text,
            organization_text,
            nama_sirkuler as nama,
            send_read_time,
            tindak_lanjut
          FROM naskah_sirkulasi
          WHERE id_naskah IN (${workflowNaskahIds.map(() => '?').join(',')})
          AND sirkuler IN ('penerima', 'tembusan')
          ORDER BY id_naskah ASC, sirkuler ASC, urutan ASC, id ASC
        `,
        workflowNaskahIds,
      );

      const recipientsByNaskah = new Map<
        string,
        { penerima: any[]; tembusan: any[] }
      >();
      for (const recipient of recipientRows) {
        const group = recipientsByNaskah.get(recipient.id_naskah) || {
          penerima: [],
          tembusan: [],
        };
        const mapped = mapInternalRecipientStatus(recipient);
        if (recipient.sirkuler === 'tembusan') group.tembusan.push(mapped);
        else group.penerima.push(mapped);
        recipientsByNaskah.set(recipient.id_naskah, group);
      }

      return workflowRows.map((workflowRow: any) => {
        const grouped = recipientsByNaskah.get(workflowRow.id_naskah) || {
          penerima: [],
          tembusan: [],
        };
        const summaries = buildTrackingSummary(
          grouped.penerima,
          grouped.tembusan,
        );

        return {
          id_sirkulasi: workflowRow.id_sirkulasi,
          id_naskah: workflowRow.id_naskah,
          jenis: workflowRow.jenis,
          jenis_label: JENIS_LABELS[workflowRow.jenis] || workflowRow.jenis,
          nomor: workflowRow.nomor,
          perihal: workflowRow.perihal,
          created_at: workflowRow.created_at,
          pengirim: {
            position_id: workflowRow.pengirim_position_id || '',
            position_text: workflowRow.pengirim_position_text || '',
            organization_text: workflowRow.pengirim_organization_text || '',
            nama: workflowRow.pengirim_nama || null,
          },
          penerima: grouped.penerima,
          tembusan: grouped.tembusan,
          ...summaries,
        };
      });
    };

    for (const row of rows) {
      let penerima: any[] = [];
      let tembusan: any[] = [];

      // Untuk SDE, ambil data penerima dari naskah_sirkulasi (penerima eksternal)
      if (row.jenis === 'SDE') {
        // Get penerima from naskah_sirkulasi (penerima eksternal stored with sirkuler='penerima')
        const penerimaQuery = `
          SELECT 
            id_sirkuler as id,
            nama_sirkuler as nama,
            alamat,
            telepon,
            email,
            company_text as company,
            area_text as area,
            send_read_time,
            tindak_lanjut
          FROM naskah_sirkulasi
          WHERE id_naskah = ?
          AND sirkuler = 'penerima'
          ORDER BY urutan ASC
        `;
        const penerimaRows = await this.dataSource.query(penerimaQuery, [
          row.id_naskah,
        ]);

        if (penerimaRows && penerimaRows.length > 0) {
          // For each penerima, try to enrich with data from eksternal table
          for (const p of penerimaRows) {
            // Try to find in eksternal table by id
            if (p.id) {
              const eksternalData = await this.eksternalRepo.findOne({
                where: { id: p.id },
              });

              if (eksternalData) {
                penerima.push({
                  id: eksternalData.id,
                  nama: eksternalData.nama,
                  alamat: eksternalData.alamat || null,
                  telepon: eksternalData.telepon || null,
                  email: eksternalData.email || null,
                  kontak: eksternalData.kontak || null,
                  company: eksternalData.company,
                  area: eksternalData.area,
                  status_baca: p.send_read_time ? 'terbaca' : 'belum_terbaca',
                  read_time: p.send_read_time || null,
                  is_tindak_lanjut: p.tindak_lanjut === 1,
                });
              } else {
                // Fallback to sirkulasi data
                penerima.push({
                  id: p.id,
                  nama: p.nama || '',
                  alamat: p.alamat || null,
                  telepon: p.telepon || null,
                  email: p.email || null,
                  kontak: null,
                  company: p.company || null,
                  area: p.area || null,
                  status_baca: p.send_read_time ? 'terbaca' : 'belum_terbaca',
                  read_time: p.send_read_time || null,
                  is_tindak_lanjut: p.tindak_lanjut === 1,
                });
              }
            }
          }
        } else {
          console.log(
            '⚠️ SDE Warning - No penerima found in sirkulasi for naskah:',
            row.id_naskah,
          );
        }
      } else {
        // Untuk jenis lain (ND, SDI, DI, KA), ambil dari naskah_sirkulasi
        const penerimaQuery = `
          SELECT 
            position as position_id,
            position_text,
            organization_text,
            nama_sirkuler as nama,
            id_sirkuler as persnum,
            send_read_time,
            tindak_lanjut
          FROM naskah_sirkulasi
          WHERE id_naskah = ?
          AND sirkuler = 'penerima'
        `;
        const penerimaRows = await this.dataSource.query(penerimaQuery, [
          row.id_naskah,
        ]);

        // Map penerima dengan status baca
        penerima = penerimaRows.map(mapInternalRecipientStatus);

        const tembusanQuery = `
          SELECT 
            position as position_id,
            position_text,
            organization_text,
            nama_sirkuler as nama,
            id_sirkuler as persnum,
            send_read_time,
            tindak_lanjut
          FROM naskah_sirkulasi
          WHERE id_naskah = ?
          AND sirkuler = 'tembusan'
        `;
        const tembusanRows = await this.dataSource.query(tembusanQuery, [
          row.id_naskah,
        ]);

        tembusan = tembusanRows.map(mapInternalRecipientStatus);
      }

      // Filter by status_baca jika diperlukan (hanya untuk non-SDE)
      if (query.status_baca && row.jenis !== 'SDE') {
        const hasMatchingSirkulasi = [...penerima, ...tembusan].some(
          (p: any) => p.status_baca === query.status_baca,
        );
        if (!hasMatchingSirkulasi) {
          continue; // Skip naskah ini jika tidak ada penerima/tembusan yang match
        }
      }

      let trackingLogs: any[] = [];
      if (row.jenis === 'K') {
        trackingLogs = await getKonsepTrackingLogs(row.id_naskah);
      }

      if (trackingLogs.length === 0) {
        const summaries = buildTrackingSummary(penerima, tembusan);
        trackingLogs = [
          {
            id_sirkulasi: row.id_sirkulasi,
            id_naskah: row.id_naskah,
            jenis: row.jenis,
            jenis_label: JENIS_LABELS[row.jenis] || row.jenis,
            nomor: row.nomor,
            perihal: row.perihal,
            created_at: row.created_at,
            pengirim: {
              position_id: row.pengirim_position_id || '',
              position_text: row.pengirim_position_text || '',
              organization_text: row.pengirim_organization_text || '',
              nama: row.pengirim_nama || null,
            },
            penerima,
            tembusan,
            ...summaries,
          },
        ];
      }

      // Hitung summary baca (hanya untuk non-SDE)
      let terbaca = 0;
      let belumTerbaca = 0;
      const trackingRecipients = trackingLogs.flatMap((log: any) => [
        ...(log.penerima || []),
        ...(log.tembusan || []),
      ]);
      const allSirkulasi =
        row.jenis === 'K' && trackingRecipients.length > 0
          ? trackingRecipients
          : [...penerima, ...tembusan];

      if (row.jenis !== 'SDE') {
        terbaca = allSirkulasi.filter(
          (p: any) => p.status_baca === 'terbaca',
        ).length;
        belumTerbaca = allSirkulasi.filter(
          (p: any) => p.status_baca === 'belum_terbaca',
        ).length;
      }

      // Get lampiran count
      const lampiranCountResult = await this.dataSource.query(
        `SELECT COUNT(*) as total FROM naskah_lampiran WHERE id_naskah = ?`,
        [row.id_naskah],
      );
      const lampiranCount = parseInt(lampiranCountResult[0]?.total || '0', 10);

      items.push({
        id_sirkulasi: row.id_sirkulasi,
        id_naskah: row.id_naskah,
        jenis: row.jenis,
        jenis_label: JENIS_LABELS[row.jenis] || row.jenis,
        nomor: row.nomor,
        tanggal: row.tanggal,
        perihal: row.perihal,
        sifat: row.sifat,
        status: row.status,
        lampiran: lampiranCount,
        pengirim: {
          position_id: row.pengirim_position_id || '',
          position_text: row.pengirim_position_text || '',
          organization_text: row.pengirim_organization_text || '',
          nama: row.pengirim_nama || null,
          persnum: parseInt(row.pengirim_persnum || '0', 10),
        },
        penerima,
        tembusan,
        tracking_logs: trackingLogs,
        summary_baca: {
          total: allSirkulasi.length,
          terbaca,
          belum_terbaca: belumTerbaca,
        },
        favorit: !!row.flag_favorit,
        note: !!row.flag_note,
        note_text: row.note_text || null,
        arsip: !!row.flag_arsip,
        is_tindak_lanjut: !!row.tindak_lanjut,
        is_locked: !!row.is_locked,
        is_priority: row.jenis === 'DI' ? !!row.is_priority : undefined,
        labels: labelsMap.get(row.id_naskah) || [],
        created_at: row.created_at,
        updated_at: row.updated_at,
        source: 'sent',
      });
    }

    return {
      success: true,
      message: 'Berhasil mengambil kotak keluar',
      data: items,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
      summary,
    };
  }

  /**
   * Get naskah previous & next dari sebuah naskah di kotak keluar (terkirim) user.
   * Hanya naskah yang user kirim (sirkuler = 'pengirim', is_draft=0, is_konsep=0,
   * status final/final_tte) yang dikembalikan. Filter jenis ikut serta bila ada.
   *
   * Urutan menggunakan created_at pengirim (DESC = terbaru) konsisten dengan getSentMessage.
   * Flag arsip default diexclude (sesuai sent default).
   */
  async getSentNavigation(
    positionId: string,
    idNaskah: string,
    jenis?: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      current: { id_naskah: string } | null;
      previous: {
        id_naskah: string;
        jenis: string;
        jenis_label: string;
        nomor: string | null;
        perihal: string | null;
        pengirim_position_text: string;
        pengirim_nama: string;
        created_at: Date;
      } | null;
      next: {
        id_naskah: string;
        jenis: string;
        jenis_label: string;
        nomor: string | null;
        perihal: string | null;
        pengirim_position_text: string;
        pengirim_nama: string;
        created_at: Date;
      } | null;
    };
  }> {
    const konsepWorkflowKey = `COALESCE(n.id_naskah_asli, n.id)`;
    const latestKonsepForSenderClause = `
      AND (
        n.jenis <> 'K'
        OR s.id = (
          SELECT s2.id
          FROM naskah_sirkulasi s2
          INNER JOIN naskah n2 ON s2.id_naskah = n2.id
          WHERE s2.position = s.position
          AND s2.sirkuler = 'pengirim'
          AND s2.is_draft = 0
          AND s2.is_konsep = 0
          AND n2.jenis = 'K'
          AND COALESCE(n2.id_naskah_asli, n2.id) = ${konsepWorkflowKey}
          ORDER BY s2.created_at DESC, s2.id DESC
          LIMIT 1
        )
      )
    `;
    const activityAtExpr = `
      CASE
        WHEN n.jenis = 'K' THEN COALESCE(
          (
            SELECT MAX(s3.created_at)
            FROM naskah_sirkulasi s3
            INNER JOIN naskah n3 ON s3.id_naskah = n3.id
            WHERE s3.sirkuler = 'pengirim'
            AND s3.is_draft = 0
            AND s3.is_konsep = 0
            AND n3.jenis = 'K'
            AND COALESCE(n3.id_naskah_asli, n3.id) = ${konsepWorkflowKey}
          ),
          s.created_at
        )
        ELSE s.created_at
      END
    `;

    const accessCheck = `
      SELECT s.id_naskah
      FROM naskah_sirkulasi s
      INNER JOIN naskah n ON s.id_naskah = n.id
      WHERE s.position = ?
        AND s.sirkuler = 'pengirim'
        AND s.is_draft = 0
        AND s.is_konsep = 0
        AND n.status IN ('final', 'final_tte')
        AND s.flag_arsip = 0
        AND s.id_naskah = ?
      LIMIT 1
    `;
    const accessRows: any[] = await this.dataSource.query(accessCheck, [
      positionId,
      idNaskah,
    ]);
    if (accessRows.length === 0) {
      return {
        success: false,
        message: 'Unauthorized',
        data: { current: null, previous: null, next: null },
      };
    }

    // 2) Ambil activity_at pengirim untuk naskah acuan
    const refRows: any[] = await this.dataSource.query(
      `SELECT ${activityAtExpr} AS ref_created_at, s.id AS ref_sirkulasi_id
       FROM naskah_sirkulasi s
       INNER JOIN naskah n ON s.id_naskah = n.id
       WHERE s.id_naskah = ? AND s.sirkuler = 'pengirim' AND s.position = ?
       LIMIT 1`,
      [idNaskah, positionId],
    );
    if (refRows.length === 0) {
      return {
        success: true,
        message: 'Naskah acuan tidak ditemukan di kotak keluar',
        data: { current: { id_naskah: idNaskah }, previous: null, next: null },
      };
    }
    const refCreatedAt = refRows[0].ref_created_at;
    const refSirkulasiId = refRows[0].ref_sirkulasi_id;

    const baseWhere = `
      WHERE s.position = ?
        AND s.sirkuler = 'pengirim'
        AND s.is_draft = 0
        AND s.is_konsep = 0
        AND n.status IN ('final', 'final_tte')
        AND s.flag_arsip = 0
        ${latestKonsepForSenderClause}
    `;
    const baseParams: any[] = [positionId];
    const jenisClause = jenis ? ` AND n.jenis = ?` : '';
    const jenisParams = jenis ? [jenis] : [];

    const orderExpr = activityAtExpr;

    const navSelect = `
      SELECT
        s.id_naskah,
        n.jenis,
        n.nomor,
        n.perihal,
        s.position_text AS pengirim_position_text,
        s.nama_sirkuler AS pengirim_nama,
        ${orderExpr} AS created_at
      FROM naskah_sirkulasi s
      INNER JOIN naskah n ON s.id_naskah = n.id
      ${baseWhere}${jenisClause}
        AND (
          ${orderExpr} <op> ?
          OR (${orderExpr} = ? AND s.id <id_op> ?)
        )
      ORDER BY ${orderExpr} <dir>, s.id <dir>
      LIMIT 1
    `;

    const prevQuery = navSelect
      .replace(/<op>/g, '<')
      .replace(/<id_op>/g, '<')
      .replace(/<dir>/g, 'DESC');
    const prevRows: any[] = await this.dataSource.query(prevQuery, [
      ...baseParams,
      ...jenisParams,
      refCreatedAt,
      refCreatedAt,
      refSirkulasiId,
    ]);

    const nextQuery = navSelect
      .replace(/<op>/g, '>')
      .replace(/<id_op>/g, '>')
      .replace(/<dir>/g, 'ASC');
    const nextRows: any[] = await this.dataSource.query(nextQuery, [
      ...baseParams,
      ...jenisParams,
      refCreatedAt,
      refCreatedAt,
      refSirkulasiId,
    ]);

    const mapNav = (row: any) => ({
      id_naskah: row.id_naskah,
      jenis: row.jenis,
      jenis_label: JENIS_LABELS[row.jenis] || row.jenis,
      nomor: row.nomor,
      perihal: row.perihal,
      pengirim_position_text: row.pengirim_position_text || '',
      pengirim_nama: row.pengirim_nama || '',
      created_at: row.created_at,
    });

    return {
      success: true,
      message: 'Berhasil mengambil navigasi kotak keluar',
      data: {
        current: { id_naskah: idNaskah },
        previous: prevRows.length > 0 ? mapNav(prevRows[0]) : null,
        next: nextRows.length > 0 ? mapNav(nextRows[0]) : null,
      },
    };
  }

  /**
   * Get naskah previous & next dari sebuah naskah di daftar tertunda user.
   * Hanya naskah dengan sirkuler='pengirim', is_draft=1, status='pending'.
   * Filter jenis ikut serta bila ada.
   *
   * Urutan menggunakan created_at pengirim (DESC = terbaru) konsisten dengan getTertunda.
   * Flag arsip default diexclude (sesuai tertunda default).
   */
  async getTertundaNavigation(
    positionId: string,
    idNaskah: string,
    jenis?: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      current: { id_naskah: string } | null;
      previous: {
        id_naskah: string;
        jenis: string;
        jenis_label: string;
        nomor: string | null;
        perihal: string | null;
        pengirim_position_text: string;
        pengirim_nama: string;
        created_at: Date;
      } | null;
      next: {
        id_naskah: string;
        jenis: string;
        jenis_label: string;
        nomor: string | null;
        perihal: string | null;
        pengirim_position_text: string;
        pengirim_nama: string;
        created_at: Date;
      } | null;
    };
  }> {
    const accessCheck = `
      SELECT s.id_naskah
      FROM naskah_sirkulasi s
      INNER JOIN naskah n ON s.id_naskah = n.id
      WHERE s.position = ?
        AND s.sirkuler = 'pengirim'
        AND s.is_draft = 1
        AND n.status = 'pending'
        AND s.flag_arsip = 0
        AND s.id_naskah = ?
      LIMIT 1
    `;
    const accessRows: any[] = await this.dataSource.query(accessCheck, [
      positionId,
      idNaskah,
    ]);
    if (accessRows.length === 0) {
      return {
        success: false,
        message: 'Unauthorized',
        data: { current: null, previous: null, next: null },
      };
    }

    const refRows: any[] = await this.dataSource.query(
      `SELECT s.created_at AS ref_created_at
       FROM naskah_sirkulasi s
       WHERE s.id_naskah = ? AND s.sirkuler = 'pengirim' AND s.position = ?
       LIMIT 1`,
      [idNaskah, positionId],
    );
    if (refRows.length === 0) {
      return {
        success: true,
        message: 'Naskah acuan tidak ditemukan di daftar tertunda',
        data: { current: { id_naskah: idNaskah }, previous: null, next: null },
      };
    }
    const refCreatedAt = refRows[0].ref_created_at;

    const baseWhere = `
      WHERE s.position = ?
        AND s.sirkuler = 'pengirim'
        AND s.is_draft = 1
        AND n.status = 'pending'
        AND s.flag_arsip = 0
    `;
    const baseParams: any[] = [positionId];
    const jenisClause = jenis ? ` AND n.jenis = ?` : '';
    const jenisParams = jenis ? [jenis] : [];

    const orderExpr = `s.created_at`;

    const navSelect = `
      SELECT
        s.id_naskah,
        n.jenis,
        n.nomor,
        n.perihal,
        s.position_text AS pengirim_position_text,
        s.nama_sirkuler AS pengirim_nama,
        ${orderExpr} AS created_at
      FROM naskah_sirkulasi s
      INNER JOIN naskah n ON s.id_naskah = n.id
      ${baseWhere}${jenisClause}
        AND ${orderExpr} <> ?
        AND ${orderExpr} <op> ?
      ORDER BY ${orderExpr} <dir>, s.id <dir>
      LIMIT 1
    `;

    const prevQuery = navSelect.replace(/<op>/g, '<').replace(/<dir>/g, 'DESC');
    const prevRows: any[] = await this.dataSource.query(prevQuery, [
      ...baseParams,
      ...jenisParams,
      refCreatedAt,
      refCreatedAt,
    ]);

    const nextQuery = navSelect.replace(/<op>/g, '>').replace(/<dir>/g, 'ASC');
    const nextRows: any[] = await this.dataSource.query(nextQuery, [
      ...baseParams,
      ...jenisParams,
      refCreatedAt,
      refCreatedAt,
    ]);

    const mapNav = (row: any) => ({
      id_naskah: row.id_naskah,
      jenis: row.jenis,
      jenis_label: JENIS_LABELS[row.jenis] || row.jenis,
      nomor: row.nomor,
      perihal: row.perihal,
      pengirim_position_text: row.pengirim_position_text || '',
      pengirim_nama: row.pengirim_nama || '',
      created_at: row.created_at,
    });

    return {
      success: true,
      message: 'Berhasil mengambil navigasi tertunda',
      data: {
        current: { id_naskah: idNaskah },
        previous: prevRows.length > 0 ? mapNav(prevRows[0]) : null,
        next: nextRows.length > 0 ? mapNav(nextRows[0]) : null,
      },
    };
  }

  // ============================================================
  // TOGGLE FLAG - Favorit, Note, Arsip
  // ============================================================

  /**
   * Toggle flag (favorit, note, arsip) pada naskah_sirkulasi
   *
   * @param idSirkulasi - ID sirkulasi
   * @param flagType - Jenis flag: 'favorit' | 'note' | 'arsip'
   * @param action - Action: 'toggle' (default) | 'delete'
   * @returns ToggleFlagResponseDto
   */
  async toggleFlag(
    idSirkulasi: string,
    flagType: 'favorit' | 'note' | 'arsip' | 'tindak_lanjut' | 'lock',
    action: 'toggle' | 'delete' = 'toggle',
    noteText?: string,
  ): Promise<ToggleFlagResponseDto> {
    // Cari record
    const sirkulasi = await this.naskahSirkulasiRepo.findOne({
      where: { id: idSirkulasi },
    });

    if (!sirkulasi) {
      return {
        success: false,
        message: 'Data sirkulasi tidak ditemukan',
        data: null,
      };
    }

    // Tentukan field yang akan di-toggle
    let currentValue: number;
    let fieldName: string;

    switch (flagType) {
      case 'favorit':
        currentValue = sirkulasi.flagFavorit || 0;
        fieldName = 'flagFavorit';
        break;
      case 'note':
        currentValue = sirkulasi.flagNote || 0;
        fieldName = 'flagNote';
        break;
      case 'arsip':
        currentValue = sirkulasi.flagArsip || 0;
        fieldName = 'flagArsip';
        break;
      case 'tindak_lanjut':
        currentValue = sirkulasi.tindakLanjut || 0;
        fieldName = 'tindakLanjut';
        break;
      case 'lock':
        currentValue = sirkulasi.isLocked || 0;
        fieldName = 'isLocked';
        break;
    }

    // Handle action: toggle or delete
    let newValue: number;
    let message: string;

    if (action === 'delete') {
      // Delete: Set value to 0 (remove flag)
      newValue = 0;
      message = `Flag ${flagType} berhasil dihapus`;
    } else {
      // Toggle: Switch between 0 and 1
      newValue = currentValue === 1 ? 0 : 1;
      message = `Flag ${flagType} berhasil diubah`;
    }

    // Update database
    const updateData: any = {
      [fieldName]: newValue,
    };

    // Save note_text when toggling note flag
    if (flagType === 'note') {
      updateData.noteText = newValue === 1 ? noteText || null : null;
    }
    if (flagType === 'arsip' && newValue === 1) {
      updateData.tindakLanjut = 1;
    }

    // NaskahSirkulasi punya composite PK (id, tanggal) — update harus pakai
    // full key, bukan string id saja (kalau tidak, TypeORM throw "multiple
    // primary columns").
    await this.naskahSirkulasiRepo.update(
      { id: idSirkulasi, tanggal: sirkulasi.tanggal },
      updateData,
    );

    // Emit realtime flag update ke position pemilik sirkulasi agar web & mobile
    // sinkron (note/lock/favorit/arsip) tanpa perlu refresh manual.
    if (sirkulasi.position) {
      this.realtimeEmitService.emitFlagUpdate(sirkulasi.position, {
        id_sirkulasi: idSirkulasi,
        flag_type: flagType,
        new_value: newValue === 1,
        note_text:
          flagType === 'note'
            ? newValue === 1
              ? noteText || null
              : null
            : undefined,
      });
    }

    return {
      success: true,
      message,
      data: {
        id_sirkulasi: idSirkulasi,
        flag_type: flagType,
        new_value: newValue === 1,
        action,
        note_text:
          flagType === 'note'
            ? newValue === 1
              ? noteText || null
              : null
            : undefined,
      },
    };
  }

  // ============================================================
  // BULK ARCHIVE/DELETE SENT - Bulk archive atau delete pesan terkirim
  // ============================================================

  /**
   * Bulk archive atau delete pesan terkirim
   *
   * Archive: Set flag_arsip = 1 pada sirkulasi pengirim untuk setiap naskah
   * Delete: Hapus naskah beserta semua data terkait (sirkulasi, lampiran, referensi)
   *
   * @param naskahIds - Array of naskah IDs
   * @param positionId - Position ID pengirim (untuk validasi ownership)
   * @param action - 'archive' atau 'delete'
   */
  async bulkArchiveOrDeleteSent(
    naskahIds: string[],
    positionId: number,
    action: 'archive' | 'delete',
  ): Promise<BulkArchiveSentResponseDto> {
    const failedIds: string[] = [];
    let totalProcessed = 0;

    for (const naskahId of naskahIds) {
      try {
        // Verify ownership - cari sirkulasi pengirim untuk naskah ini
        const pengirimSirkulasi = await this.naskahSirkulasiRepo.findOne({
          where: {
            idNaskah: naskahId,
            sirkuler: 'pengirim',
            position: String(positionId),
          },
        });

        if (!pengirimSirkulasi) {
          failedIds.push(naskahId);
          continue;
        }

        if (action === 'archive') {
          // Archive: Set flag_arsip = 1 pada sirkulasi pengirim
          await this.naskahSirkulasiRepo.update(
            { id: pengirimSirkulasi.id, tanggal: pengirimSirkulasi.tanggal },
            {
              flagArsip: 1,
              tindakLanjut: 1,
            },
          );
          totalProcessed++;
        } else if (action === 'delete') {
          // Delete: Hapus naskah beserta semua data terkait
          const queryRunner = this.dataSource.createQueryRunner();
          await queryRunner.connect();
          await queryRunner.startTransaction();

          try {
            // Delete lampiran
            await queryRunner.manager.delete(NaskahLampiranEntity, {
              id_naskah: naskahId,
            });

            // Delete referensi
            await queryRunner.manager.delete(NaskahReferensiEntity, {
              id_naskah: naskahId,
            });

            // Delete semua sirkulasi
            await queryRunner.manager.delete(NaskahSirkulasi, {
              idNaskah: naskahId,
            });

            // Delete naskah
            await queryRunner.manager.delete(NaskahEntity, {
              id: naskahId,
            });

            await queryRunner.commitTransaction();
            totalProcessed++;
          } catch (error) {
            await queryRunner.rollbackTransaction();
            failedIds.push(naskahId);
          } finally {
            await queryRunner.release();
          }
        }
      } catch (error) {
        failedIds.push(naskahId);
      }
    }

    const actionText = action === 'archive' ? 'diarsipkan' : 'dihapus';

    return {
      success: true,
      message:
        totalProcessed > 0
          ? `Berhasil ${actionText} ${totalProcessed} pesan terkirim`
          : `Tidak ada pesan terkirim yang berhasil ${actionText}`,
      data: {
        total_requested: naskahIds.length,
        total_processed: totalProcessed,
        failed_ids: failedIds,
      },
    };
  }

  // ============================================================
  // INBOX & SENT - Combined Endpoint
  // ============================================================

  /**
   * Get combined inbox and sent messages
   *
   * @param positionId - Position ID
   * @param query - Filter options
   * @returns InboxSentResponseDto
   */
  async getInboxAndSent(
    positionId: string,
    query: InboxSentQueryDto,
  ): Promise<InboxSentResponseDto> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;

    const params: any[] = [];

    // --- QUERY BUILDER HELPERS ---

    // 1. INBOX PART (includes tembusan)
    let inboxWhere = `
      s.position = ?
      AND s.sirkuler IN ('penerima', 'tembusan')
      AND s.is_draft = 0
      AND s.is_konsep = 0
      AND n.status IN ('final', 'final_tte')
    `;
    const inboxParams = [positionId];

    if (query.jenis) {
      inboxWhere += ` AND n.jenis = ?`;
      inboxParams.push(query.jenis);
    }
    if (query.status_baca === 'terbaca') {
      inboxWhere += ` AND s.send_read_time IS NOT NULL`;
    } else if (query.status_baca === 'belum_terbaca') {
      inboxWhere += ` AND s.send_read_time IS NULL`;
    }

    // Favorit and Arsip filters for inbox
    if (query.is_favorit === true) {
      inboxWhere += ` AND s.flag_favorit = 1`;
    }
    if (query.is_arsip === true) {
      inboxWhere += ` AND s.flag_arsip = 1`;
    }

    // 2. SENT PART
    let sentWhere = `
      s.position = ?
      AND s.sirkuler = 'pengirim'
      AND s.is_draft = 0
      AND s.is_konsep = 0
      AND n.status IN ('final', 'final_tte')
    `;
    const sentParams = [positionId];

    if (query.jenis) {
      sentWhere += ` AND n.jenis = ?`;
      sentParams.push(query.jenis);
    }
    // Filter status_baca for sent items (check if ANY recipient matches)
    if (query.status_baca) {
      if (query.status_baca === 'terbaca') {
        sentWhere += ` 
          AND EXISTS (
            SELECT 1 FROM naskah_sirkulasi r 
            WHERE r.id_naskah = s.id_naskah 
            AND r.sirkuler = 'penerima' 
            AND r.send_read_time IS NOT NULL
          )
        `;
      } else {
        sentWhere += ` 
          AND EXISTS (
            SELECT 1 FROM naskah_sirkulasi r 
            WHERE r.id_naskah = s.id_naskah 
            AND r.sirkuler = 'penerima' 
            AND r.send_read_time IS NULL
          )
        `;
      }
    }

    // Favorit and Arsip filters for sent
    if (query.is_favorit === true) {
      sentWhere += ` AND s.flag_favorit = 1`;
    }
    if (query.is_arsip === true) {
      sentWhere += ` AND s.flag_arsip = 1`;
    }

    // --- DYNAMIC QUERY BASED ON SOURCE FILTER ---
    // If source is specified, only query that source. Otherwise UNION both.

    const inboxSelect = `
        SELECT 
          s.id as id_sirkulasi,
          s.id_naskah,
          n.jenis,
          n.nomor,
          n.tanggal,
          n.perihal,
          n.sifat,
          n.status,
          n.lampiran,
          s.send_read_time,
          s.flag_favorit,
          s.flag_arsip,
          s.flag_note,
          s.note_text,
          s.tindak_lanjut,
          s.is_locked,
          COALESCE(
            (SELECT p.created_at FROM naskah_sirkulasi p WHERE p.id_naskah = s.id_naskah AND p.sirkuler = 'pengirim' LIMIT 1),
            s.created_at
          ) as created_at,
          s.updated_at,
          'inbox' as source,
          
          (SELECT position FROM naskah_sirkulasi p WHERE p.id_naskah = s.id_naskah AND p.sirkuler = 'pengirim' LIMIT 1) as pengirim_position_id,
          (SELECT position_text FROM naskah_sirkulasi p WHERE p.id_naskah = s.id_naskah AND p.sirkuler = 'pengirim' LIMIT 1) as pengirim_position_text,
          (SELECT organization_text FROM naskah_sirkulasi p WHERE p.id_naskah = s.id_naskah AND p.sirkuler = 'pengirim' LIMIT 1) as pengirim_organization_text,
          (SELECT nama_sirkuler FROM naskah_sirkulasi p WHERE p.id_naskah = s.id_naskah AND p.sirkuler = 'pengirim' LIMIT 1) as pengirim_nama,
          (SELECT id_sirkuler FROM naskah_sirkulasi p WHERE p.id_naskah = s.id_naskah AND p.sirkuler = 'pengirim' LIMIT 1) as pengirim_persnum,
          
          s.position as my_position_id,
          s.id_sirkuler as my_persnum,
          s.nama_sirkuler as my_nama,
          s.position_text as my_position_text,
          s.organization_text as my_organization_text,
          
          s.sirkuler as sirkuler_type,
          (SELECT is_priority FROM di WHERE di.id_naskah = s.id_naskah LIMIT 1) as is_priority

        FROM naskah_sirkulasi s
        JOIN naskah n ON s.id_naskah = n.id
        WHERE ${inboxWhere}
    `;

    const sentSelect = `
        SELECT 
          s.id as id_sirkulasi,
          s.id_naskah,
          n.jenis,
          n.nomor,
          n.tanggal,
          n.perihal,
          n.sifat,
          n.status,
          n.lampiran,
          NULL as send_read_time,
          s.flag_favorit,
          s.flag_arsip,
          s.flag_note,
          s.note_text,
          0 as tindak_lanjut, 
          0 as is_locked,
          s.created_at,
          s.updated_at,
          'sent' as source,

          s.position as pengirim_position_id,
          s.position_text as pengirim_position_text,
          s.organization_text as pengirim_organization_text,
          s.nama_sirkuler as pengirim_nama,
          s.id_sirkuler as pengirim_persnum,

          NULL as my_position_id,
          NULL as my_persnum,
          NULL as my_nama,
          NULL as my_position_text,
          NULL as my_organization_text,
          
          NULL as sirkuler_type,
          NULL as is_priority

        FROM naskah_sirkulasi s
        JOIN naskah n ON s.id_naskah = n.id
        WHERE ${sentWhere}
    `;

    let dataQuery: string;
    let dataParams: any[];

    if (query.source === 'inbox') {
      dataQuery = `(${inboxSelect}) ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      dataParams = [...inboxParams, limit, offset];
    } else if (query.source === 'sent') {
      dataQuery = `(${sentSelect}) ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      dataParams = [...sentParams, limit, offset];
    } else {
      // Full UNION
      dataQuery = `(${inboxSelect}) UNION ALL (${sentSelect}) ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      dataParams = [...inboxParams, ...sentParams, limit, offset];
    }

    // Execute pagination query
    const rows = await this.dataSource.query(dataQuery, dataParams);

    // Hydrate Data (Labels, Recipients, etc.)
    const naskahIds = [...new Set(rows.map((r: any) => r.id_naskah))];
    const labelsMap = new Map<string, string[]>();
    const kepadaMap = new Map<string, any[]>();
    const penerimaStatusMap = new Map<string, any[]>(); // For sent items

    if (naskahIds.length > 0) {
      // 1. Labels
      const labelsQuery = `
        SELECT nl.naskah_id, l.nama, parent.nama as parent_nama
        FROM naskah_label nl
        INNER JOIN label l ON nl.label_id = l.id
        LEFT JOIN label parent ON l.id_parent = parent.id AND parent.is_active = 1
        WHERE nl.naskah_id IN (${naskahIds.map(() => '?').join(',')})
        AND l.is_active = 1
        ORDER BY l.urutan ASC, l.nama ASC
      `;
      const labelsRows = await this.dataSource.query(labelsQuery, naskahIds);
      labelsRows.forEach((row: any) => {
        if (!labelsMap.has(row.naskah_id)) labelsMap.set(row.naskah_id, []);
        const labelName = row.parent_nama
          ? `${row.parent_nama} > ${row.nama}`
          : row.nama;
        labelsMap.get(row.naskah_id)?.push(labelName);
      });

      // 2. Recipients (Kepada) - For Inbox mostly, but acceptable for detail
      // Using existing logic to fetch all 'penerima'
      const kepadaQuery = `
        SELECT 
          id_naskah, position as position_id, nama_sirkuler as nama, 
          position_text, organization_text, send_read_time, tindak_lanjut
        FROM naskah_sirkulasi
        WHERE id_naskah IN (${naskahIds.map(() => '?').join(',')})
        AND sirkuler = 'penerima'
        ORDER BY id
      `;
      const kepadaRows = await this.dataSource.query(kepadaQuery, naskahIds);

      kepadaRows.forEach((row: any) => {
        // Populate Kepada Map (for Inbox display of 'To:')
        if (!kepadaMap.has(row.id_naskah)) kepadaMap.set(row.id_naskah, []);
        kepadaMap.get(row.id_naskah)?.push({
          position_id: row.position_id || '',
          nama: row.nama || '',
          position_text: row.position_text || '',
          organization_text: row.organization_text || '',
        });

        // Populate Penerima Status Map (for Sent display)
        if (!penerimaStatusMap.has(row.id_naskah))
          penerimaStatusMap.set(row.id_naskah, []);
        penerimaStatusMap.get(row.id_naskah)?.push({
          position_id: row.position_id || '',
          nama: row.nama || null,
          position_text: row.position_text || '',
          organization_text: row.organization_text || '',
          status_baca: row.send_read_time ? 'terbaca' : 'belum_terbaca',
          read_time: row.send_read_time || null,
          is_tindak_lanjut: row.tindak_lanjut === 1,
        });
      });

      // 3. SDE Recipients (External) - Special handling for SDE if needed
      // Logic for SDE in getSentMessage is complex (fetching from naskah_sirkulasi then eksternal table)
      // For simplicity/performance in this combined view, we might reuse the standard sirkulasi names
      // or duplicate the complex SDE logic if strict fidelity is required.
      // Implementing simplified SDE logic here relying on sirkulasi names which should be present.
    }

    // Map Results
    const results: (InboxItemDto | SentItemForCombinedDto)[] = [];
    for (const row of rows) {
      // Lampiran count separate query if not in 'n.lampiran' field?
      // Existing code used `SELECT COUNT(*) FROM naskah_lampiran`. `n.lampiran` might be a string descriptor or count?
      // Checking existing getInbox: `n.lampiran` is selected. But getSentMessage calculates it using count.
      // Let's optimize: assume n.lampiran is what we want OR query count if needed.
      // Use existing pattern: `getSentMessage` does a count query. `getInbox` does not?
      // Wait, getInbox selects `n.lampiran` and puts it in item.lampiran.
      // getSentMessage selects `n.lampiran` but THEN overwrites item.lampiran with a COUNT query.
      // This suggests `n.lampiran` column might be unreliable or different.
      // I will follow the specific logic per source.

      let lampiranVal = row.lampiran;
      if (row.source === 'sent') {
        // Sent needs count? Or can we just use n.lampiran if it's correct?
        // Optimally: one bulk query for lampiran counts. For now, doing per-row is slow but safe refactor.
        // Let's stick to what worked before:
        const lampiranCountResult = await this.dataSource.query(
          `SELECT COUNT(*) as total FROM naskah_lampiran WHERE id_naskah = ?`,
          [row.id_naskah],
        );
        lampiranVal = parseInt(lampiranCountResult[0]?.total || '0', 10);
      }

      if (row.source === 'inbox') {
        results.push({
          id_sirkulasi: row.id_sirkulasi,
          id_naskah: row.id_naskah,
          jenis: row.jenis,
          jenis_label: JENIS_LABELS[row.jenis] || row.jenis,
          nomor: row.nomor,
          tanggal: row.tanggal,
          perihal: row.perihal,
          sifat: row.sifat,
          status: row.status,
          lampiran: lampiranVal,
          pengirim: {
            position_id: row.pengirim_position_id || '',
            position_text: row.pengirim_position_text || '',
            organization_text: row.pengirim_organization_text || '',
            nama: row.pengirim_nama || '',
            persnum: parseInt(row.pengirim_persnum || '0', 10),
          },
          penerima: {
            position_id: row.my_position_id || '',
            persnum: parseInt(row.my_persnum || '0', 10),
            nama: row.my_nama || '',
            position_text: row.my_position_text || '',
            organization_text: row.my_organization_text || '',
          },
          kepada: kepadaMap.get(row.id_naskah) || [],
          status_baca: row.send_read_time ? 'terbaca' : 'belum_terbaca',
          read_time: row.send_read_time,
          is_favorit: row.flag_favorit === 1,
          is_arsip: row.flag_arsip === 1,
          is_note: row.flag_note === 1,
          note_text: row.note_text || null,
          is_tindak_lanjut: row.tindak_lanjut === 1,
          is_locked: row.is_locked === 1,
          labels: labelsMap.get(row.id_naskah) || [],
          is_tembusan: row.sirkuler_type === 'tembusan',
          created_at: row.created_at,
          updated_at: row.updated_at,
          source: 'inbox',
          is_priority: row.jenis === 'DI' ? row.is_priority === 1 : undefined,
        });
      } else {
        // Sent
        const recipients = penerimaStatusMap.get(row.id_naskah) || [];
        const terbaca = recipients.filter(
          (p) => p.status_baca === 'terbaca',
        ).length;
        const belumTerbaca = recipients.filter(
          (p) => p.status_baca === 'belum_terbaca',
        ).length;

        results.push({
          id_sirkulasi: row.id_sirkulasi,
          id_naskah: row.id_naskah,
          jenis: row.jenis,
          jenis_label: JENIS_LABELS[row.jenis] || row.jenis,
          nomor: row.nomor,
          tanggal: row.tanggal,
          perihal: row.perihal,
          sifat: row.sifat,
          status: row.status,
          lampiran: lampiranVal,
          pengirim: {
            position_id: row.pengirim_position_id || '',
            position_text: row.pengirim_position_text || '',
            organization_text: row.pengirim_organization_text || '',
            nama: row.pengirim_nama || null,
          },
          penerima: recipients, // Use Hydrated recipients
          tembusan: [],
          summary_baca: {
            total: recipients.length,
            terbaca,
            belum_terbaca: belumTerbaca,
          },
          favorit: !!row.flag_favorit,
          note: !!row.flag_note,
          arsip: !!row.flag_arsip,
          labels: labelsMap.get(row.id_naskah) || [],
          created_at: row.created_at,
          updated_at: row.updated_at,
          source: 'sent',

          // Consistent fields for Inbox compatibility
          is_favorit: !!row.flag_favorit,
          is_arsip: !!row.flag_arsip,
          is_note: !!row.flag_note,
          note_text: row.note_text || null,
          is_tindak_lanjut: false,
          is_locked: false,
        });
      }
    }

    // --- COUNT QUERY ---
    // Conditionally count based on source filter
    let countQuery: string;
    let countParams: any[];

    if (query.source === 'inbox') {
      countQuery = `
        SELECT COUNT(*) as total
        FROM naskah_sirkulasi s 
        JOIN naskah n ON s.id_naskah = n.id 
        WHERE ${inboxWhere}
      `;
      countParams = [...inboxParams];
    } else if (query.source === 'sent') {
      countQuery = `
        SELECT COUNT(*) as total
        FROM naskah_sirkulasi s 
        JOIN naskah n ON s.id_naskah = n.id 
        WHERE ${sentWhere}
      `;
      countParams = [...sentParams];
    } else {
      // Count both
      countQuery = `
        SELECT (
          (SELECT COUNT(*) 
           FROM naskah_sirkulasi s 
           JOIN naskah n ON s.id_naskah = n.id 
           WHERE ${inboxWhere})
          +
          (SELECT COUNT(*) 
           FROM naskah_sirkulasi s 
           JOIN naskah n ON s.id_naskah = n.id 
           WHERE ${sentWhere})
        ) as total
      `;
      countParams = [...inboxParams, ...sentParams];
    }

    const countResult = await this.dataSource.query(countQuery, countParams);
    const total = parseInt(countResult[0]?.total || '0', 10);
    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      message: 'Berhasil mengambil data gabungan inbox dan sent',
      data: results,
      pagination: {
        total,
        page: parseInt(page as any, 10),
        limit: parseInt(limit as any, 10),
        total_pages: totalPages,
      },
    };
  }

  // ============================================================
  // COUNT UNREAD INBOX - Count kotak masuk yg belum dibaca
  // ============================================================

  /**
   * Menghitung jumlah kotak masuk yang belum dibaca untuk position tertentu
   *
   * @param positionId - Position ID penerima
   * @returns { position_id: number, count: number }
   */
  async countUnreadInbox(positionId: string): Promise<any> {
    const konsepWorkflowKey = `COALESCE(n.id_naskah_asli, n.id)`;
    const latestKonsepForInboxClause = `
      AND (
        n.jenis <> 'K'
        OR s.id = (
          SELECT s2.id
          FROM naskah_sirkulasi s2
          INNER JOIN naskah n2 ON s2.id_naskah = n2.id
          WHERE s2.position = s.position
          AND s2.sirkuler IN ('penerima', 'tembusan')
          AND s2.is_draft = 0
          AND (s2.is_konsep = 0 OR n2.jenis = 'K')
          AND n2.jenis = 'K'
          AND n2.status IN ('final', 'final_tte')
          AND COALESCE(n2.id_naskah_asli, n2.id) = ${konsepWorkflowKey}
          ORDER BY s2.created_at DESC, s2.id DESC
          LIMIT 1
        )
      )
    `;
    const query = `
      SELECT COUNT(*) as count
      FROM naskah_sirkulasi s
      INNER JOIN naskah n ON s.id_naskah = n.id
      WHERE s.position = ?
      AND s.sirkuler IN ('penerima', 'tembusan')
      AND s.is_draft = 0
      AND (s.is_konsep = 0 OR n.jenis = 'K')
      AND s.send_read_time IS NULL
      AND n.status IN ('final', 'final_tte')
      ${latestKonsepForInboxClause}
    `;

    const result = await this.dataSource.query(query, [positionId]);
    const count = parseInt(result[0]?.count || '0', 10);

    return {
      success: true,
      message: 'Berhasil mengambil jumlah kotak masuk belum dibaca',
      data: {
        position_id: parseInt(positionId),
        count: count,
      },
    };
  }
}
