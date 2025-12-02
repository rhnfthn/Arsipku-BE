import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThanOrEqual } from 'typeorm';
import { NaskahEntity } from '../entity/naskah.entity';
import { NaskahSirkulasi } from '../entity/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../entity/naskah_lampiran.entity';
import { NaskahReferensiEntity } from '../entity/naskah_referensi.entity';
import {
  GetDraftListResponseDto,
  DraftListItemDto,
  GetDraftDetailResponseDto,
  DraftDetailDataDto,
  DraftDetailPenerimaDto,
  DraftDetailLampiranDto,
  DraftDetailReferensiDto,
  DraftDetailPetunjukDto,
  UpdateDraftResponseDto,
  DeleteDraftResponseDto,
  SignDraftResponseDto,
} from '../dto/draft/draft.dto';

// Mapping jenis ke text
const JENIS_TEXT_MAP: Record<string, string> = {
  ND: 'Nota Dinas',
  DI: 'Disposisi',
  SDI: 'Surat Dinas Internal',
  SDE: 'Surat Dinas Eksternal',
  KA: 'Korespondensi Aktif',
};

// Mapping petunjuk disposisi kode ke label
const PETUNJUK_LABEL_MAP: Record<string, string> = {
  untuk_diketahui: 'Untuk Diketahui',
  proses_lanjut: 'Proses Lanjut',
  koordinasikan: 'Koordinasikan',
  cek: 'Cek',
  monitor: 'Monitor',
  evaluasi: 'Evaluasi',
  dikaji_kemungkinannya: 'Dikaji Kemungkinannya',
  laporkan: 'Laporkan',
  untuk_menjadi_perhatian: 'Untuk Menjadi Perhatian',
  untuk_dijadikan_acuan: 'Untuk Dijadikan Acuan/ Dipergunakan',
  harap_mewakili: 'Harap Mewakili',
  harap_mendampingi: 'Harap Mendampingi',
  tunjuk_perwakilan: 'Tunjuk Perwakilan',
  siapkan_bahan_materi: 'Siapkan Bahan/ Materi',
  lainnya: 'Lainnya',
};

@Injectable()
export class DraftService {
  constructor(
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepository: Repository<NaskahSirkulasi>,
    @InjectRepository(NaskahLampiranEntity)
    private readonly naskahLampiranRepository: Repository<NaskahLampiranEntity>,
    @InjectRepository(NaskahReferensiEntity)
    private readonly naskahReferensiRepository: Repository<NaskahReferensiEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // ============================================================
  // GET /draft/list
  // ============================================================

  /**
   * Get list of draft naskah for a position
   */
  async getDraftList(
    positionId: number,
    jenis?: 'ND' | 'DI' | 'SDI' | 'SDE' | 'KA',
    search?: string,
    days: number = 30,
  ): Promise<GetDraftListResponseDto> {
    // Calculate date filter
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    // Build query
    const queryBuilder = this.naskahRepository
      .createQueryBuilder('naskah')
      .innerJoin(
        'naskah_sirkulasi',
        'sirkulasi',
        'sirkulasi.id_naskah = naskah.id AND sirkulasi.sirkuler = :sirkuler AND sirkulasi.position = :position',
        { sirkuler: 'pengirim', position: String(positionId) },
      )
      .where('naskah.status = :status', { status: 'draf' })
      .andWhere('naskah.tanggal >= :dateFrom', { dateFrom });

    // Filter by jenis if provided
    if (jenis) {
      queryBuilder.andWhere('naskah.jenis = :jenis', { jenis });
    }

    // Search by perihal or nomor
    if (search) {
      queryBuilder.andWhere(
        '(naskah.perihal LIKE :search OR naskah.nomor LIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Order by tanggal desc
    queryBuilder.orderBy('naskah.tanggal', 'DESC');

    // Execute query
    const naskahs = await queryBuilder.getMany();

    // Build response items
    const items: DraftListItemDto[] = [];

    for (const naskah of naskahs) {
      // Get penerima for this naskah
      const penerimaList = await this.naskahSirkulasiRepository.find({
        where: {
          idNaskah: naskah.id,
          sirkuler: 'penerima',
        },
      });

      // Get first penerima name for display
      const firstPenerima = penerimaList.length > 0 
        ? penerimaList[0].positionText || penerimaList[0].namaSirkuler || 'Unknown'
        : '-';

      const tanggal = new Date(naskah.tanggal);

      items.push({
        id_naskah: naskah.id,
        jenis: naskah.jenis,
        jenis_text: JENIS_TEXT_MAP[naskah.jenis] || naskah.jenis,
        penerima: firstPenerima,
        penerima_count: penerimaList.length,
        isi_pesan: naskah.perihal || naskah.konten?.substring(0, 100) || '-',
        tanggal: tanggal,
        waktu: tanggal.toTimeString().substring(0, 5),
      });
    }

    return {
      success: true,
      data: {
        total: items.length,
        items,
      },
    };
  }

  // ============================================================
  // GET /draft/detail/:id
  // ============================================================

  /**
   * Get detail of a draft naskah
   */
  async getDraftDetail(
    idNaskah: string,
    positionId: number,
  ): Promise<GetDraftDetailResponseDto> {
    // Get naskah
    const naskah = await this.naskahRepository.findOne({
      where: { id: idNaskah },
    });

    if (!naskah) {
      throw new NotFoundException(`Naskah dengan ID ${idNaskah} tidak ditemukan`);
    }

    if (naskah.status !== 'draf') {
      throw new ForbiddenException(
        `Naskah ini bukan draft (status: ${naskah.status})`,
      );
    }

    // Get pengirim
    const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
      where: {
        idNaskah: idNaskah,
        sirkuler: 'pengirim',
      },
    });

    if (!pengirimSirkulasi) {
      throw new NotFoundException(`Data pengirim tidak ditemukan untuk naskah ${idNaskah}`);
    }

    // Verify ownership
    if (String(pengirimSirkulasi.position) !== String(positionId)) {
      throw new ForbiddenException(
        `Anda tidak memiliki akses ke draft ini`,
      );
    }

    // Get penerima
    const penerimaList = await this.naskahSirkulasiRepository.find({
      where: {
        idNaskah: idNaskah,
        sirkuler: 'penerima',
      },
    });

    const penerima: DraftDetailPenerimaDto[] = penerimaList.map((p) => ({
      position_id: Number(p.position),
      position_text: p.positionText || '',
      nama: p.namaSirkuler || '',
      organization_text: p.organizationText || '',
    }));

    // Get tembusan (for ND)
    let tembusan: DraftDetailPenerimaDto[] | undefined;
    if (naskah.jenis === 'ND') {
      const tembusanList = await this.naskahSirkulasiRepository.find({
        where: {
          idNaskah: idNaskah,
          sirkuler: 'tembusan',
        },
      });

      if (tembusanList.length > 0) {
        tembusan = tembusanList.map((t) => ({
          position_id: Number(t.position),
          position_text: t.positionText || '',
          nama: t.namaSirkuler || '',
          organization_text: t.organizationText || '',
        }));
      }
    }

    // Get referensi
    let referensi: DraftDetailReferensiDto | undefined;
    const referensiData = await this.naskahReferensiRepository.findOne({
      where: { id_naskah: idNaskah },
    });

    if (referensiData) {
      referensi = {
        id: referensiData.id,
        ref_jenis: referensiData.ref_jenis || undefined,
        ref_pengirim: referensiData.ref_pengirim || undefined,
        ref_tanggal: referensiData.ref_tanggal || undefined,
        ref_nomor: referensiData.ref_nomor || undefined,
        ref_perihal: referensiData.ref_perihal || undefined,
      };
    }

    // Get petunjuk disposisi (for DI - stored in konten as JSON)
    let petunjuk_disposisi: DraftDetailPetunjukDto[] | undefined;
    if (naskah.jenis === 'DI' && naskah.konten) {
      try {
        const kontenData = JSON.parse(naskah.konten) as Array<{ kode: string; catatan?: string }>;
        petunjuk_disposisi = kontenData.map((p) => ({
          kode: p.kode,
          label: PETUNJUK_LABEL_MAP[p.kode] || p.kode,
          catatan: p.catatan,
        }));
      } catch {
        // konten is not JSON, skip
      }
    }

    // Get lampiran
    let lampiran: DraftDetailLampiranDto[] | undefined;
    const lampiranList = await this.naskahLampiranRepository.find({
      where: { id_naskah: idNaskah },
    });

    if (lampiranList.length > 0) {
      lampiran = lampiranList.map((l) => ({
        id: l.id,
        nama_file: l.file_name || '',
        url: l.file_pdf || '',
      }));
    }

    // Build response
    const data: DraftDetailDataDto = {
      id_naskah: naskah.id,
      jenis: naskah.jenis,
      jenis_text: JENIS_TEXT_MAP[naskah.jenis] || naskah.jenis,
      nomor: naskah.nomor || undefined,
      tanggal: naskah.tanggal,
      sifat: naskah.sifat,
      perihal: naskah.perihal || undefined,
      konten: naskah.jenis !== 'DI' ? naskah.konten || undefined : undefined,
      status: naskah.status,
      pengirim: {
        position_id: Number(pengirimSirkulasi.position),
        position_text: pengirimSirkulasi.positionText || '',
        nama: pengirimSirkulasi.namaSirkuler || '',
        organization_text: pengirimSirkulasi.organizationText || '',
      },
      penerima,
      tembusan,
      referensi,
      petunjuk_disposisi,
      lampiran,
      klasifikasi: naskah.klasifikasi || undefined,
      klasifikasi_text: naskah.klasifikasi_text || undefined,
    };

    return {
      success: true,
      data,
    };
  }

  // ============================================================
  // DELETE /draft/delete/:id
  // ============================================================

  /**
   * Delete a draft naskah
   */
  async deleteDraft(
    idNaskah: string,
    positionId: number,
  ): Promise<DeleteDraftResponseDto> {
    // Get naskah
    const naskah = await this.naskahRepository.findOne({
      where: { id: idNaskah },
    });

    if (!naskah) {
      throw new NotFoundException(`Naskah dengan ID ${idNaskah} tidak ditemukan`);
    }

    if (naskah.status !== 'draf') {
      throw new ForbiddenException(
        `Hanya naskah dengan status 'draf' yang bisa dihapus. Status saat ini: '${naskah.status}'`,
      );
    }

    // Verify ownership
    const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
      where: {
        idNaskah: idNaskah,
        sirkuler: 'pengirim',
      },
    });

    if (!pengirimSirkulasi) {
      throw new NotFoundException(`Data pengirim tidak ditemukan untuk naskah ${idNaskah}`);
    }

    if (String(pengirimSirkulasi.position) !== String(positionId)) {
      throw new ForbiddenException(
        `Anda tidak memiliki akses untuk menghapus draft ini`,
      );
    }

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Delete lampiran
      await queryRunner.manager.delete(NaskahLampiranEntity, {
        id_naskah: idNaskah,
      });

      // Delete referensi
      await queryRunner.manager.delete(NaskahReferensiEntity, {
        id_naskah: idNaskah,
      });

      // Delete sirkulasi
      await queryRunner.manager.delete(NaskahSirkulasi, {
        idNaskah: idNaskah,
      });

      // Delete naskah
      await queryRunner.manager.delete(NaskahEntity, {
        id: idNaskah,
      });

      // Commit
      await queryRunner.commitTransaction();

      return {
        success: true,
        message: 'Draft berhasil dihapus',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ============================================================
  // PUT /draft/sign/:id - Sign draft (TTE)
  // ============================================================

  /**
   * Sign a draft naskah (change status to final_tte)
   */
  async signDraft(
    idNaskah: string,
    positionId: number,
    signatureData?: string,
  ): Promise<SignDraftResponseDto> {
    // Get naskah
    const naskah = await this.naskahRepository.findOne({
      where: { id: idNaskah },
    });

    if (!naskah) {
      throw new NotFoundException(`Naskah dengan ID ${idNaskah} tidak ditemukan`);
    }

    if (naskah.status !== 'final') {
      throw new ForbiddenException(
        `Hanya naskah dengan status 'final' yang bisa di-TTE. Status saat ini: '${naskah.status}'`,
      );
    }

    // Verify ownership (pengirim harus yang sign)
    const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
      where: {
        idNaskah: idNaskah,
        sirkuler: 'pengirim',
      },
    });

    if (!pengirimSirkulasi) {
      throw new NotFoundException(`Data pengirim tidak ditemukan untuk naskah ${idNaskah}`);
    }

    if (String(pengirimSirkulasi.position) !== String(positionId)) {
      throw new ForbiddenException(
        `Anda tidak memiliki akses untuk menandatangani naskah ini`,
      );
    }

    // Update status to final_tte
    naskah.status = 'final_tte';
    // TODO: Store signature data if needed
    // naskah.final_pdf = signatureData or generate signed PDF

    await this.naskahRepository.save(naskah);

    return {
      success: true,
      message: 'Naskah berhasil ditandatangani (TTE)',
      data: {
        id_naskah: idNaskah,
        status: 'final_tte',
        signed_at: new Date(),
      },
    };
  }
}
