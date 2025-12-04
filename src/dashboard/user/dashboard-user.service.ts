import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { NaskahSirkulasi } from 'src/persuratan/entity/naskah_sirkulasi.entity';
import { NaskahEntity } from 'src/persuratan/entity/naskah.entity';
import {
  DashboardUserResponseDto,
  DashboardSummaryDto,
  SuratMasukTerbaruItemDto,
  StatistikBulananDto,
} from './dashboard-user.dto';

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

@Injectable()
export class DashboardUserService {
  constructor(
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepo: Repository<NaskahSirkulasi>,
    @InjectRepository(NaskahEntity)
    private readonly naskahRepo: Repository<NaskahEntity>,
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
   * Get Dashboard Data untuk user berdasarkan position_id
   */
  async getDashboardData(positionId: number): Promise<DashboardUserResponseDto> {
    const positionIdStr = positionId.toString();

    // ==========================================
    // 1. SUMMARY DATA
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

    // Surat Terkirim: total surat yang sudah dikirim (bukan draft)
    const suratTerkirim = await this.naskahSirkulasiRepo.count({
      where: {
        position: positionIdStr,
        sirkuler: 'pengirim',
        isDraft: false,
      },
    });

    // Disposisi Masuk: surat dengan jenis = 'DI' yang diterima
    const disposisiMasuk = await this.naskahSirkulasiRepo
      .createQueryBuilder('ns')
      .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
      .where('ns.position = :positionId', { positionId: positionIdStr })
      .andWhere('ns.sirkuler = :sirkuler', { sirkuler: 'penerima' })
      .andWhere('n.jenis = :jenis', { jenis: 'DI' })
      .andWhere('ns.is_draft = :isDraft', { isDraft: false })
      .getCount();

    // Draft Tersimpan: naskah dengan status 'draf' yang dibuat user ini
    const draftTersimpan = await this.naskahSirkulasiRepo
      .createQueryBuilder('ns')
      .innerJoin('naskah', 'n', 'ns.id_naskah = n.id')
      .where('ns.position = :positionId', { positionId: positionIdStr })
      .andWhere('ns.sirkuler = :sirkuler', { sirkuler: 'pengirim' })
      .andWhere('n.status = :status', { status: 'draf' })
      .getCount();

    const summary: DashboardSummaryDto = {
      total_pesan_masuk: totalPesanMasuk,
      pesan_baru: pesanBaru,
      surat_terkirim: suratTerkirim,
      disposisi_masuk: disposisiMasuk,
      draft_tersimpan: draftTersimpan,
    };

    // ==========================================
    // 2. SURAT MASUK TERBARU (10 terbaru)
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
    // 3. STATISTIK SURAT (6 bulan terakhir)
    // ==========================================

    const now = new Date();
    const statistik: StatistikBulananDto[] = [];

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

      statistik.push({
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
        statistik,
      },
    };
  }
}
