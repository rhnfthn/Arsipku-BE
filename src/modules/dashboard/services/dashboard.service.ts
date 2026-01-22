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
};

@Injectable()
export class DashboardService {
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
   */
  async getDashboardData(positionId: number): Promise<DashboardResponseDto> {
    const positionIdStr = positionId.toString();

    // ==========================================
    // 1. SUMMARY DATA - KOTAK MASUK
    // ==========================================

    // Total Pesan Masuk: semua surat yang diterima
    const totalPesanMasuk = await this.naskahSirkulasiRepo.count({
      where: {
        position: positionIdStr,
        sirkuler: 'penerima',
        isDraft: false,
      },
    });

    // Pesan Baru: surat masuk yang BELUM DIBACA (send_read_time = null)
    const pesanBaru = await this.naskahSirkulasiRepo.count({
      where: {
        position: positionIdStr,
        sirkuler: 'penerima',
        sendReadTime: IsNull(),
        isDraft: false,
      },
    });

    // ==========================================
    // 2. SUMMARY DATA - KOTAK KELUAR
    // ==========================================

    // Surat Terkirim: total surat yang sudah dikirim (bukan draft)
    const suratTerkirim = await this.naskahSirkulasiRepo.count({
      where: {
        position: positionIdStr,
        sirkuler: 'pengirim',
        isDraft: false,
      },
    });

    // Draft Tersimpan: naskah dengan status 'draf' yang dibuat user ini
    const draftTersimpan = await this.naskahSirkulasiRepo
      .createQueryBuilder('ns')
      .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
      .where('ns.position = :positionId', { positionId: positionIdStr })
      .andWhere('ns.sirkuler = :sirkuler', { sirkuler: 'pengirim' })
      .andWhere('n.status = :status', { status: 'draf' })
      .getCount();

    // ==========================================
    // 3. SUMMARY DATA - DISPOSISI
    // ==========================================

    // Disposisi Masuk: surat dengan jenis = 'DI' yang diterima
    const disposisiMasuk = await this.naskahSirkulasiRepo
      .createQueryBuilder('ns')
      .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
      .where('ns.position = :positionId', { positionId: positionIdStr })
      .andWhere('ns.sirkuler = :sirkuler', { sirkuler: 'penerima' })
      .andWhere('n.jenis = :jenis', { jenis: 'DI' })
      .andWhere('ns.is_draft = :isDraft', { isDraft: false })
      .getCount();

    // Disposisi Belum Dibaca
    const disposisiBelumDibaca = await this.naskahSirkulasiRepo
      .createQueryBuilder('ns')
      .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
      .where('ns.position = :positionId', { positionId: positionIdStr })
      .andWhere('ns.sirkuler = :sirkuler', { sirkuler: 'penerima' })
      .andWhere('n.jenis = :jenis', { jenis: 'DI' })
      .andWhere('ns.is_draft = :isDraft', { isDraft: false })
      .andWhere('ns.send_read_time IS NULL')
      .getCount();

    // ==========================================
    // 4. SUMMARY DATA - DIGITAL SIGNATURE
    // ==========================================

    // Dokumen yang menunggu TTD dari user ini (status = 'waiting')
    const digsigMenungguTtd = await this.digsigSignerRepo.count({
      where: {
        positionId: positionId,
        status: 'waiting',
      },
    });

    // Dokumen yang masih on_progress (user sudah TTD tapi menunggu signer lain)
    const digsigOnProgress = await this.digsigSignerRepo
      .createQueryBuilder('ds')
      .innerJoin('digsig_document', 'dd', 'ds.id_document = dd.id')
      .where('ds.position_id = :positionId', { positionId })
      .andWhere('ds.status = :status', { status: 'signed' })
      .andWhere('dd.status = :docStatus', { docStatus: 'on_progress' })
      .getCount();

    // ==========================================
    // 5. SUMMARY DATA - KONSEP (Draft Workflow)
    // ==========================================

    // Konsep masuk: konsep yang dikirim ke position ini untuk review
    const konsepMasuk = await this.konsepRepo.count({
      where: {
        toPosition: positionIdStr,
      },
    });

    // Konsep belum dibaca
    const konsepBelumDibaca = await this.konsepRepo.count({
      where: {
        toPosition: positionIdStr,
        sendReadTime: IsNull(),
      },
    });

    // ==========================================
    // 6. SUMMARY DATA - FLAGS & ACTIONS
    // ==========================================

    // Surat Favorit
    const suratFavorit = await this.naskahSirkulasiRepo.count({
      where: {
        position: positionIdStr,
        flagFavorit: 1,
        isDraft: false,
      },
    });

    // Surat Arsip
    const suratArsip = await this.naskahSirkulasiRepo.count({
      where: {
        position: positionIdStr,
        flagArsip: 1,
        isDraft: false,
      },
    });

    // Perlu Tindak Lanjut
    const perluTindakLanjut = await this.naskahSirkulasiRepo.count({
      where: {
        position: positionIdStr,
        sirkuler: 'penerima',
        tindakLanjut: 0,
        isDraft: false,
      },
    });

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
        'n.tanggal as tanggal',
        'ns.send_read_time as send_read_time',
        'ns.flag_favorit as flag_favorit',
        'ns.flag_note as flag_note',
        'ns.flag_arsip as flag_arsip',
        'pengirim.nama_sirkuler as pengirim_nama',
        'pengirim.organization_text as pengirim_organization',
      ])
      .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
      .leftJoin(
        'naskah_sirkulasi',
        'pengirim',
        "pengirim.id_naskah = ns.id_naskah AND pengirim.sirkuler = 'pengirim'",
      )
      .where('ns.position = :positionId', { positionId: positionIdStr })
      .andWhere('ns.sirkuler = :sirkuler', { sirkuler: 'penerima' })
      .andWhere('ns.is_draft = :isDraft', { isDraft: false })
      .orderBy('n.tanggal', 'DESC')
      .limit(10)
      .getRawMany();

    const suratMasukTerbaru: SuratMasukTerbaruItemDto[] = suratMasukRaw.map(
      (row) => ({
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
      }),
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
    // 9. STATISTIK SURAT PER JENIS
    // ==========================================

    const statistikJenisSurat: StatistikJenisSuratDto[] = [];
    const jenisArr = ['ND', 'SDI', 'SDE', 'DI', 'KA'];

    for (const jenis of jenisArr) {
      // Jumlah masuk per jenis
      const jumlahMasuk = await this.naskahSirkulasiRepo
        .createQueryBuilder('ns')
        .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
        .where('ns.position = :positionId', { positionId: positionIdStr })
        .andWhere('ns.sirkuler = :sirkuler', { sirkuler: 'penerima' })
        .andWhere('n.jenis = :jenis', { jenis })
        .andWhere('ns.is_draft = :isDraft', { isDraft: false })
        .getCount();

      // Jumlah keluar per jenis
      const jumlahKeluar = await this.naskahSirkulasiRepo
        .createQueryBuilder('ns')
        .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
        .where('ns.position = :positionId', { positionId: positionIdStr })
        .andWhere('ns.sirkuler = :sirkuler', { sirkuler: 'pengirim' })
        .andWhere('n.jenis = :jenis', { jenis })
        .andWhere('ns.is_draft = :isDraft', { isDraft: false })
        .getCount();

      statistikJenisSurat.push({
        jenis,
        jenis_label: JENIS_SURAT_LABELS[jenis] || jenis,
        jumlah_masuk: jumlahMasuk,
        jumlah_keluar: jumlahKeluar,
      });
    }

    // ==========================================
    // 10. STATISTIK SURAT (6 bulan terakhir)
    // ==========================================

    const now = new Date();
    const statistikBulanan: StatistikBulananDto[] = [];

    for (let i = 5; i >= 0; i--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const bulanNumber = targetDate.getMonth() + 1;
      const tahun = targetDate.getFullYear();

      // Start dan end of month
      const startOfMonth = new Date(tahun, bulanNumber - 1, 1);
      const endOfMonth = new Date(tahun, bulanNumber, 0, 23, 59, 59);

      // Surat Masuk bulan ini
      const suratMasukBulan = await this.naskahSirkulasiRepo
        .createQueryBuilder('ns')
        .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
        .where('ns.position = :positionId', { positionId: positionIdStr })
        .andWhere('ns.sirkuler = :sirkuler', { sirkuler: 'penerima' })
        .andWhere('ns.is_draft = :isDraft', { isDraft: false })
        .andWhere('n.tanggal >= :start', { start: startOfMonth })
        .andWhere('n.tanggal <= :end', { end: endOfMonth })
        .getCount();

      // Surat Terkirim bulan ini
      const suratTerkirimBulan = await this.naskahSirkulasiRepo
        .createQueryBuilder('ns')
        .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
        .where('ns.position = :positionId', { positionId: positionIdStr })
        .andWhere('ns.sirkuler = :sirkuler', { sirkuler: 'pengirim' })
        .andWhere('ns.is_draft = :isDraft', { isDraft: false })
        .andWhere('n.tanggal >= :start', { start: startOfMonth })
        .andWhere('n.tanggal <= :end', { end: endOfMonth })
        .getCount();

      statistikBulanan.push({
        bulan: NAMA_BULAN[bulanNumber - 1],
        bulan_number: bulanNumber,
        tahun: tahun,
        surat_masuk: suratMasukBulan,
        surat_terkirim: suratTerkirimBulan,
      });
    }

    return {
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
  }
}
