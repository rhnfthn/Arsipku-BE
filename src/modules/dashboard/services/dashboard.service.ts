import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not, In } from 'typeorm';
import { NaskahSirkulasi } from 'src/modules/naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { NaskahEntity } from 'src/modules/naskah/entities/naskah.entity';
import { DigsigDocumentEntity, DigsigDocumentSignerEntity } from 'src/modules/digsig/entities';
import { KonsepEntity } from 'src/modules/konsep/entities/konsep.entity';
import {
  DashboardResponseDto,
  DashboardSummaryDto,
  SuratMasukTerbaruItemDto,
  StatistikBulananDto,
  DigsigMenungguTtdItemDto,
  StatistikJenisSuratDto,
} from '../dto/dashboard.dto';

const NAMA_BULAN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const JENIS_SURAT_LABELS: Record<string, string> = {
  ND: 'Nota Dinas',
  SDI: 'Surat Dinas Internal',
  SDE: 'Surat Dinas Eksternal',
  DI: 'Disposisi',
  KA: 'Kajian',
  K: 'Konsep',
};

interface DashboardCacheEntry {
  data: DashboardResponseDto;
  expires: number;
}

const DASHBOARD_CACHE_TTL_MS = 60_000; // 60 detik
const DASHBOARD_MAX_CACHE = 5_000;

@Injectable()
export class DashboardService {
  private readonly dashboardCache = new Map<string, DashboardCacheEntry>();

  constructor(
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepo: Repository<NaskahSirkulasi>,
    @InjectRepository(NaskahEntity)
    private readonly naskahRepo: Repository<NaskahEntity>,
    @InjectRepository(DigsigDocumentEntity)
    private readonly digsigDocumentRepo: Repository<DigsigDocumentEntity>,
    @InjectRepository(DigsigDocumentSignerEntity)
    private readonly digsigSignerRepo: Repository<DigsigDocumentSignerEntity>,
    @InjectRepository(KonsepEntity)
    private readonly konsepRepo: Repository<KonsepEntity>,
  ) {}

  /** Invalidate cache dashboard untuk user tertentu (atau semua) */
  invalidateDashboardCache(positionId?: number, persnum?: number) {
    if (positionId !== undefined) {
      this.dashboardCache.delete(`dashboard:${positionId}:${persnum ?? ''}`);
    } else {
      this.dashboardCache.clear();
    }
  }

  /**
   * Format waktu relatif untuk tampilan
   */
  private formatWaktuRelatif(tanggal: Date | null): string {
    if (!tanggal) return '-';

    const now = new Date();
    const target = new Date(tanggal);
    const diffMs = now.getTime() - target.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Hari ini - tampilkan jam
    if (diffDays === 0) {
      const hours = target.getHours().toString().padStart(2, '0');
      const minutes = target.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    }

    // Kemarin
    if (diffDays === 1) {
      return 'Kemarin';
    }

    // 2-7 hari lalu
    if (diffDays <= 7) {
      return `${diffDays} hari lalu`;
    }

    // Lebih dari 7 hari - tampilkan tanggal
    const day = target.getDate().toString().padStart(2, '0');
    const month = (target.getMonth() + 1).toString().padStart(2, '0');
    const year = target.getFullYear();
    return `${day}/${month}/${year}`;
  }

  /**
   * Get Dashboard Data berdasarkan position_id
   * @param positionId - position_id untuk query naskah sirkulasi
   * @param persnum - persnum dari JWT untuk query digsig (agar konsisten dengan penandatanganan)
   */
  async getDashboardData(positionId: number, persnum?: number): Promise<DashboardResponseDto> {
    const positionIdStr = positionId.toString();

    // ==========================================
    // CACHE CHECK (TTL 60s per user)
    // ==========================================
    const cacheKey = `dashboard:${positionId}:${persnum ?? ''}`;
    const nowTs = Date.now();
    const cached = this.dashboardCache.get(cacheKey);
    if (cached && cached.expires > nowTs) {
      return cached.data;
    }

    // ==========================================
    // 1-6. SUMMARY DATA — semua count dijalankan PARALEL
    // ==========================================

    const sirkulerValues = ['penerima', 'tembusan'];
    const statuses = ['final', 'final_tte'];

    const [
      totalPesanMasuk,
      pesanBaru,
      suratTerkirim,
      draftTersimpan,
      disposisiMasuk,
      disposisiBelumDibaca,
      disposisiHighPriority,
      disposisiBelumTinjut,
      konsepMasuk,
      konsepBelumDibaca,
      suratFavorit,
      suratArsip,
      perluTindakLanjut,
      suratSudahDitinjut,
    ] = await Promise.all([
      // Total Pesan Masuk
      this.naskahSirkulasiRepo
        .createQueryBuilder('ns')
        .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
        .where('ns.position = :positionId', { positionId: positionIdStr })
        .andWhere('ns.sirkuler IN (:...sirkulerValues)', { sirkulerValues })
        .andWhere('ns.is_draft = :isDraft', { isDraft: false })
        .andWhere('(ns.is_konsep = :isKonsep OR ns.is_konsep IS NULL)', { isKonsep: false })
        .andWhere('n.status IN (:...statuses)', { statuses })
        .getCount(),

      // Pesan Baru (belum dibaca)
      this.naskahSirkulasiRepo
        .createQueryBuilder('ns')
        .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
        .where('ns.position = :positionId', { positionId: positionIdStr })
        .andWhere('ns.sirkuler IN (:...sirkulerValues)', { sirkulerValues })
        .andWhere('ns.send_read_time IS NULL')
        .andWhere('ns.is_draft = :isDraft', { isDraft: false })
        .andWhere('(ns.is_konsep = :isKonsep OR ns.is_konsep IS NULL)', { isKonsep: false })
        .andWhere('n.status IN (:...statuses)', { statuses })
        .getCount(),

      // Surat Terkirim
      this.naskahSirkulasiRepo
        .createQueryBuilder('ns')
        .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
        .where('ns.position = :positionId', { positionId: positionIdStr })
        .andWhere('ns.sirkuler = :sirkuler', { sirkuler: 'pengirim' })
        .andWhere('ns.is_draft = :isDraft', { isDraft: false })
        .andWhere('n.status IN (:...statuses)', { statuses })
        .getCount(),

      // Draft Tersimpan
      this.naskahSirkulasiRepo
        .createQueryBuilder('ns')
        .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
        .where('ns.position = :positionId', { positionId: positionIdStr })
        .andWhere('ns.sirkuler = :sirkuler', { sirkuler: 'pengirim' })
        .andWhere('n.status = :status', { status: 'draf' })
        .getCount(),

      // Disposisi Masuk
      this.naskahSirkulasiRepo
        .createQueryBuilder('ns')
        .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
        .where('ns.position = :positionId', { positionId: positionIdStr })
        .andWhere('ns.sirkuler IN (:...sirkulerValues)', { sirkulerValues })
        .andWhere('n.jenis = :jenis', { jenis: 'DI' })
        .andWhere('ns.is_draft = :isDraft', { isDraft: false })
        .getCount(),

      // Disposisi Belum Dibaca
      this.naskahSirkulasiRepo
        .createQueryBuilder('ns')
        .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
        .where('ns.position = :positionId', { positionId: positionIdStr })
        .andWhere('ns.sirkuler IN (:...sirkulerValues)', { sirkulerValues })
        .andWhere('n.jenis = :jenis', { jenis: 'DI' })
        .andWhere('ns.is_draft = :isDraft', { isDraft: false })
        .andWhere('ns.send_read_time IS NULL')
        .getCount(),

      // Disposisi High Priority
      this.naskahSirkulasiRepo
        .createQueryBuilder('ns')
        .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
        .innerJoin('di', 'd', 'n.id = d.id_naskah')
        .where('ns.position = :positionId', { positionId: positionIdStr })
        .andWhere('ns.sirkuler IN (:...sirkulerValues)', { sirkulerValues })
        .andWhere('n.jenis = :jenis', { jenis: 'DI' })
        .andWhere('ns.is_draft = :isDraft', { isDraft: false })
        .andWhere('d.is_priority = :isPriority', { isPriority: 1 })
        .getCount(),

      // Disposisi Belum Ditindaklanjuti
      this.naskahSirkulasiRepo
        .createQueryBuilder('ns')
        .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
        .where('ns.position = :positionId', { positionId: positionIdStr })
        .andWhere('ns.sirkuler IN (:...sirkulerValues)', { sirkulerValues })
        .andWhere('n.jenis = :jenis', { jenis: 'DI' })
        .andWhere('ns.is_draft = :isDraft', { isDraft: false })
        .andWhere('ns.send_read_time IS NOT NULL')
        .andWhere('ns.tindak_lanjut = :tindakLanjut', { tindakLanjut: 0 })
        .getCount(),

      // Konsep Masuk
      this.konsepRepo.count({ where: { toPosition: positionIdStr } }),

      // Konsep Belum Dibaca
      this.konsepRepo.count({
        where: { toPosition: positionIdStr, sendReadTime: IsNull() },
      }),

      // Surat Favorit
      this.naskahSirkulasiRepo.count({
        where: { position: positionIdStr, flagFavorit: 1, isDraft: false },
      }),

      // Surat Arsip
      this.naskahSirkulasiRepo.count({
        where: { position: positionIdStr, flagArsip: 1, isDraft: false },
      }),

      // Perlu Tindak Lanjut
      this.naskahSirkulasiRepo
        .createQueryBuilder('ns')
        .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
        .where('ns.position = :positionId', { positionId: positionIdStr })
        .andWhere('ns.sirkuler IN (:...sirkulerValues)', { sirkulerValues })
        .andWhere('ns.tindak_lanjut = :tindakLanjut', { tindakLanjut: 0 })
        .andWhere('ns.is_draft = :isDraft', { isDraft: false })
        // ponytail: mirror inbox `(is_konsep=0 OR jenis='K')` so dashboard matches inbox list (exclude legacy NULL is_konsep)
        .andWhere('(ns.is_konsep = :isKonsep OR n.jenis = :konsepJenis)', { isKonsep: false, konsepJenis: 'K' })
        .andWhere('n.status IN (:...statuses)', { statuses })
        // ponytail: exclude archived so count matches inbox default (inbox hides flag_arsip=1)
        .andWhere('ns.flag_arsip = :flagArsip', { flagArsip: false })
        .getCount(),

      // Surat Sudah Ditindaklanjuti
      this.naskahSirkulasiRepo
        .createQueryBuilder('ns')
        .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
        .where('ns.position = :positionId', { positionId: positionIdStr })
        .andWhere('ns.sirkuler IN (:...sirkulerValues)', { sirkulerValues })
        .andWhere('ns.tindak_lanjut = :tindakLanjut', { tindakLanjut: 1 })
        .andWhere('ns.is_draft = :isDraft', { isDraft: false })
        // ponytail: mirror inbox `(is_konsep=0 OR jenis='K')` so dashboard matches inbox list (exclude legacy NULL is_konsep)
        .andWhere('(ns.is_konsep = :isKonsep OR n.jenis = :konsepJenis)', { isKonsep: false, konsepJenis: 'K' })
        .andWhere('n.status IN (:...statuses)', { statuses })
        // ponytail: exclude archived so count matches inbox default (inbox hides flag_arsip=1)
        .andWhere('ns.flag_arsip = :flagArsip', { flagArsip: false })
        .getCount(),
    ]);

    // Digsig counts (butuh persnum, jalankan paralel juga)
    let digsigMenungguTtd = 0;
    let digsigOnProgress = 0;
    if (persnum) {
      [digsigMenungguTtd, digsigOnProgress] = await Promise.all([
        this.digsigSignerRepo
          .createQueryBuilder('ds')
          .innerJoin('digsig_document', 'dd', 'ds.id_document = dd.id')
          .where('ds.persnum = :persnum', { persnum })
          .andWhere('ds.status = :status', { status: 'waiting' })
          .andWhere('dd.status = :docStatus', { docStatus: 'on_progress' })
          .getCount(),
        this.digsigSignerRepo
          .createQueryBuilder('ds')
          .innerJoin('digsig_document', 'dd', 'ds.id_document = dd.id')
          .where('ds.persnum = :persnum', { persnum })
          .andWhere('ds.status = :status', { status: 'signed' })
          .andWhere('dd.status = :docStatus', { docStatus: 'on_progress' })
          .getCount(),
      ]);
    }

    const summary: DashboardSummaryDto = {
      // Kotak Masuk
      total_pesan_masuk: totalPesanMasuk,
      pesan_baru: pesanBaru,
      // Kotak Keluar
      surat_terkirim: suratTerkirim,
      draft_tersimpan: draftTersimpan,
      // Disposisi
      disposisi_masuk: disposisiMasuk,
      disposisi_belum_dibaca: disposisiBelumDibaca,
      disposisi_high_priority: disposisiHighPriority,
      disposisi_belum_tinjut: disposisiBelumTinjut,
      // Digital Signature
      digsig_menunggu_ttd: digsigMenungguTtd,
      digsig_on_progress: digsigOnProgress,
      // Konsep
      konsep_masuk: konsepMasuk,
      konsep_belum_dibaca: konsepBelumDibaca,
      // Flags
      surat_favorit: suratFavorit,
      surat_arsip: suratArsip,
      perlu_tindak_lanjut: perluTindakLanjut,
      surat_sudah_ditinjut: suratSudahDitinjut,
    };

    // ==========================================
    // 7. SURAT MASUK TERBARU (10 terbaru)
    // ==========================================

    const suratMasukRaw = await this.naskahSirkulasiRepo
      .createQueryBuilder('ns')
      .select([
        'ns.id as id_sirkulasi',
        'ns.id_naskah as id',
        'n.jenis as jenis',
        'n.perihal as perihal',
        'COALESCE(pengirim.created_at, ns.created_at) as tanggal',
        'ns.send_read_time as send_read_time',
        'ns.flag_favorit as flag_favorit',
        'ns.flag_note as flag_note',
        'ns.flag_arsip as flag_arsip',
        'pengirim.nama_sirkuler as pengirim_nama',
        'pengirim.organization_text as pengirim_organization',
        'di.is_priority as is_priority',
      ])
      .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
      .leftJoin(
        'naskah_sirkulasi',
        'pengirim',
        "pengirim.id_naskah = ns.id_naskah AND pengirim.sirkuler = 'pengirim'",
      )
      .leftJoin('di', 'di', 'n.id = di.id_naskah')
      .where('ns.position = :positionId', { positionId: positionIdStr })
      .andWhere('ns.sirkuler IN (:...sirkulerValues)', { sirkulerValues: ['penerima', 'tembusan'] })
      .andWhere('ns.is_draft = :isDraft', { isDraft: false })
      .andWhere('(ns.is_konsep = :isKonsep OR ns.is_konsep IS NULL)', { isKonsep: false })
      .andWhere('n.status IN (:...statuses)', { statuses: ['final', 'final_tte'] })
      .orderBy('COALESCE(pengirim.created_at, ns.created_at)', 'DESC')
      .addOrderBy('ns.id', 'DESC')
      .limit(10)
      .getRawMany();

    const suratMasukTerbaru: SuratMasukTerbaruItemDto[] = suratMasukRaw.map(
      (row) => {
        const item: SuratMasukTerbaruItemDto = {
          id: row.id,
          id_sirkulasi: row.id_sirkulasi,
          jenis: row.jenis,
          pengirim_nama: row.pengirim_nama,
          pengirim_organization: row.pengirim_organization,
          perihal: row.perihal,
          tanggal: row.tanggal,
          waktu_relatif: this.formatWaktuRelatif(row.tanggal),
          sudah_dibaca: row.send_read_time !== null,
          flag_favorit: row.flag_favorit === 1,
          flag_note: row.flag_note === 1,
          flag_arsip: row.flag_arsip === 1,
        };

        // Add is_priority field hanya untuk disposisi (DI)
        if (row.jenis === 'DI' && row.is_priority !== null && row.is_priority !== undefined) {
          item.is_priority = row.is_priority === 1;
        }

        return item;
      },
    );

    // ==========================================
    // 8. DOKUMEN DIGSIG MENUNGGU TTD (5 terbaru)
    // ==========================================

    const digsigMenungguRaw = await this.digsigSignerRepo
      .createQueryBuilder('ds')
      .select([
        'ds.id as id',
        'ds.id_document as id_document',
        'ds.urutan as urutan',
        'dd.nomor_dokumen as nomor_dokumen',
        'dd.perihal as perihal',
        'dd.jenis_naskah as jenis_naskah',
        'dd.tanggal_dokumen as tanggal_dokumen',
        'dd.created_by_name as created_by_name',
        'dd.total_signers as total_signers',
      ])
      .innerJoin('digsig_document', 'dd', 'ds.id_document = dd.id')
      .where('ds.position_id = :positionId', { positionId })
      .andWhere('ds.status = :status', { status: 'waiting' })
      .andWhere('dd.status = :docStatus', { docStatus: 'on_progress' })
      .orderBy('dd.tanggal_dokumen', 'DESC')
      .limit(5)
      .getRawMany();

    const digsigMenungguTtdList: DigsigMenungguTtdItemDto[] = digsigMenungguRaw.map(
      (row) => ({
        id: row.id,
        id_document: row.id_document,
        nomor_dokumen: row.nomor_dokumen,
        perihal: row.perihal,
        jenis_naskah: row.jenis_naskah,
        tanggal_dokumen: row.tanggal_dokumen,
        waktu_relatif: this.formatWaktuRelatif(row.tanggal_dokumen),
        created_by_name: row.created_by_name,
        urutan: row.urutan,
        total_signers: row.total_signers,
      }),
    );

    // ==========================================
    // 9. STATISTIK SURAT PER JENIS (GROUP BY — 2 query)
    // ==========================================

    const jenisArr = ['ND', 'SDI', 'SDE', 'DI', 'KA', 'K'];

    const [masukPerJenisRaw, keluarPerJenisRaw] = await Promise.all([
      // Jumlah masuk per jenis (group by)
      this.naskahSirkulasiRepo
        .createQueryBuilder('ns')
        .select('n.jenis', 'jenis')
        .addSelect('COUNT(*)', 'jumlah')
        .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
        .where('ns.position = :positionId', { positionId: positionIdStr })
        .andWhere('ns.sirkuler IN (:...sirkulerValues)', { sirkulerValues })
        .andWhere('ns.is_draft = :isDraft', { isDraft: false })
        .groupBy('n.jenis')
        .getRawMany(),

      // Jumlah keluar per jenis (group by)
      this.naskahSirkulasiRepo
        .createQueryBuilder('ns')
        .select('n.jenis', 'jenis')
        .addSelect('COUNT(*)', 'jumlah')
        .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
        .where('ns.position = :positionId', { positionId: positionIdStr })
        .andWhere('ns.sirkuler = :sirkuler', { sirkuler: 'pengirim' })
        .andWhere('ns.is_draft = :isDraft', { isDraft: false })
        .groupBy('n.jenis')
        .getRawMany(),
    ]);

    const masukMap = new Map<string, number>(
      masukPerJenisRaw.map((r) => [r.jenis, Number(r.jumlah)]),
    );
    const keluarMap = new Map<string, number>(
      keluarPerJenisRaw.map((r) => [r.jenis, Number(r.jumlah)]),
    );

    const statistikJenisSurat: StatistikJenisSuratDto[] = jenisArr.map((jenis) => ({
      jenis,
      jenis_label: JENIS_SURAT_LABELS[jenis] || jenis,
      jumlah_masuk: masukMap.get(jenis) || 0,
      jumlah_keluar: keluarMap.get(jenis) || 0,
    }));

    // ==========================================
    // 10. STATISTIK SURAT (6 bulan terakhir) — GROUP BY (2 query)
    // ==========================================

    const now = new Date();
    // Awal bulan 5 bulan lalu (rentang 6 bulan termasuk bulan ini)
    const rangeStart = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0);
    const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [masukPerBulanRaw, keluarPerBulanRaw] = await Promise.all([
      // Surat masuk per bulan
      this.naskahSirkulasiRepo
        .createQueryBuilder('ns')
        .select('YEAR(n.tanggal)', 'tahun')
        .addSelect('MONTH(n.tanggal)', 'bulan')
        .addSelect('COUNT(*)', 'jumlah')
        .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
        .where('ns.position = :positionId', { positionId: positionIdStr })
        .andWhere('ns.sirkuler IN (:...sirkulerValues)', { sirkulerValues })
        .andWhere('ns.is_draft = :isDraft', { isDraft: false })
        .andWhere('n.tanggal >= :start', { start: rangeStart })
        .andWhere('n.tanggal <= :end', { end: rangeEnd })
        .groupBy('YEAR(n.tanggal)')
        .addGroupBy('MONTH(n.tanggal)')
        .getRawMany(),

      // Surat keluar per bulan
      this.naskahSirkulasiRepo
        .createQueryBuilder('ns')
        .select('YEAR(n.tanggal)', 'tahun')
        .addSelect('MONTH(n.tanggal)', 'bulan')
        .addSelect('COUNT(*)', 'jumlah')
        .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
        .where('ns.position = :positionId', { positionId: positionIdStr })
        .andWhere('ns.sirkuler = :sirkuler', { sirkuler: 'pengirim' })
        .andWhere('ns.is_draft = :isDraft', { isDraft: false })
        .andWhere('n.tanggal >= :start', { start: rangeStart })
        .andWhere('n.tanggal <= :end', { end: rangeEnd })
        .groupBy('YEAR(n.tanggal)')
        .addGroupBy('MONTH(n.tanggal)')
        .getRawMany(),
    ]);

    const masukBulanMap = new Map<string, number>(
      masukPerBulanRaw.map((r) => [`${r.tahun}-${r.bulan}`, Number(r.jumlah)]),
    );
    const keluarBulanMap = new Map<string, number>(
      keluarPerBulanRaw.map((r) => [`${r.tahun}-${r.bulan}`, Number(r.jumlah)]),
    );

    const statistikBulanan: StatistikBulananDto[] = [];
    for (let i = 5; i >= 0; i--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const bulanNumber = targetDate.getMonth() + 1;
      const tahun = targetDate.getFullYear();
      const key = `${tahun}-${bulanNumber}`;

      statistikBulanan.push({
        bulan: NAMA_BULAN[bulanNumber - 1],
        bulan_number: bulanNumber,
        tahun: tahun,
        surat_masuk: masukBulanMap.get(key) || 0,
        surat_terkirim: keluarBulanMap.get(key) || 0,
      });
    }

    const response: DashboardResponseDto = {
      success: true,
      message: 'Dashboard data berhasil diambil',
      data: {
        summary,
        surat_masuk_terbaru: suratMasukTerbaru,
        digsig_menunggu_ttd: digsigMenungguTtdList,
        statistik_bulanan: statistikBulanan,
        statistik_jenis_surat: statistikJenisSurat,
      },
    };

    // ==========================================
    // SIMPAN KE CACHE (TTL 60s)
    // ==========================================
    if (this.dashboardCache.size >= DASHBOARD_MAX_CACHE) {
      this.dashboardCache.clear();
    }
    this.dashboardCache.set(cacheKey, {
      data: response,
      expires: Date.now() + DASHBOARD_CACHE_TTL_MS,
    });

    return response;
  }
}
