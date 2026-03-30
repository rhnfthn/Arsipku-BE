import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThanOrEqual, In } from 'typeorm';
import { NaskahEntity } from '../../naskah/entities/naskah.entity';
import { NaskahSirkulasi } from '../../naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../naskah-lampiran/entities/naskah_lampiran.entity';
import { NaskahReferensiEntity } from '../../naskah-referensi/entities/naskah_referensi.entity';
// REFACTOR: SdiSdeEntity tidak lagi digunakan - data diambil dari naskah_sirkulasi
// import { SdiSdeEntity } from '../../surat-dinas-eksternal/entities/sdi_sde.entity';
import { EksternalEntity } from '../../eksternal/entities/eksternal.entity';
import { LabelService } from '../../label/services/label.service';
import { NaskahLabelEntity } from '../../label/entities/naskah-label.entity';
import { MeilisearchSyncService } from '../../search/services/meilisearch-sync.service';
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
  BulkDeleteDraftResponseDto,
} from '../dto/draft/draft.dto';

// Mapping jenis ke text
const JENIS_TEXT_MAP: Record<string, string> = {
  ND: 'Nota Dinas',
  DI: 'Disposisi',
  SDI: 'Surat Dinas Internal',
  SDE: 'Surat Dinas Eksternal',
  KA: 'Kajian',
  K: 'Konsep',
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
    // REFACTOR: SdiSdeEntity tidak lagi digunakan
    // @InjectRepository(SdiSdeEntity)
    // private readonly sdiSdeRepository: Repository<SdiSdeEntity>,
    @InjectRepository(EksternalEntity)
    private readonly eksternalRepository: Repository<EksternalEntity>,
    @InjectRepository(NaskahLabelEntity)
    private readonly naskahLabelRepository: Repository<NaskahLabelEntity>,
    private readonly labelService: LabelService,
    private readonly dataSource: DataSource,
    private readonly meilisearchSyncService: MeilisearchSyncService,
  ) {}

  /**
   * Helper: Convert preset/custom date range to start & end date strings
   * @param startDate - Custom start date (YYYY-MM-DD)
   * @param endDate - Custom end date (YYYY-MM-DD)
   * @param preset - Preset: 7_hari, 30_hari, 60_hari, 1_tahun, semua
   * @param days - Legacy days parameter (deprecated)
   * @returns { startDate: string | null, endDate: string | null }
   */
  private getDateRangeFromQuery(
    startDate?: string,
    endDate?: string,
    preset?: '7_hari' | '30_hari' | '60_hari' | '1_tahun' | 'semua',
    days?: number,
  ): { startDate: string | null; endDate: string | null } {
    // Jika preset 'semua', return null (tanpa filter tanggal)
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

    // Legacy: jika ada days parameter (backward compatibility)
    if (days && days > 0) {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const startDateCalc = new Date(today);
      startDateCalc.setDate(startDateCalc.getDate() - days);
      const startDateStr = startDateCalc.toISOString().split('T')[0];

      return {
        startDate: startDateStr,
        endDate: todayStr,
      };
    }

    // Default: 30 hari terakhir
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const startDateCalc = new Date(today);
    startDateCalc.setDate(startDateCalc.getDate() - 30);
    const startDateStr = startDateCalc.toISOString().split('T')[0];

    return {
      startDate: startDateStr,
      endDate: todayStr,
    };
  }

  // ============================================================
  // GET /draft/list
  // ============================================================

  /**
   * Get list of draft naskah for a position
   */
  async getDraftList(
    positionId: number,
    jenis?: 'ND' | 'DI' | 'SDI' | 'SDE' | 'KA' | 'K',
    search?: string,
    days?: number, // DEPRECATED: use startDate/endDate/preset instead
    startDate?: string, // Format: YYYY-MM-DD
    endDate?: string, // Format: YYYY-MM-DD
    preset?: '7_hari' | '30_hari' | '60_hari' | '1_tahun' | 'semua',
    page: number = 1,
    limit: number = 10,
  ): Promise<GetDraftListResponseDto> {
    // Calculate date range
    const dateRange = this.getDateRangeFromQuery(startDate, endDate, preset, days);

    // Step 1: Get sirkulasi records for this position as pengirim
    const sirkulasiQuery = this.naskahSirkulasiRepository
      .createQueryBuilder('sirkulasi')
      .where('sirkulasi.sirkuler = :sirkuler', { sirkuler: 'pengirim' })
      .andWhere('sirkulasi.position = :position', { position: String(positionId) });

    const sirkulasiRecords = await sirkulasiQuery.getMany();
    const naskahIdsFromSirkulasi = sirkulasiRecords.map(s => s.idNaskah);

    // If no sirkulasi found, return empty result
    if (naskahIdsFromSirkulasi.length === 0) {
      return {
        success: true,
        data: [],
        pagination: {
          total: 0,
          page,
          limit,
          totalPages: 0,
        },
      };
    }

    // Step 2: Build query for naskah
    const queryBuilder = this.naskahRepository
      .createQueryBuilder('naskah')
      .where('naskah.id IN (:...naskahIds)', { naskahIds: naskahIdsFromSirkulasi })
      .andWhere('naskah.status = :status', { status: 'draf' });

    // Apply date range filter
    if (dateRange.startDate) {
      queryBuilder.andWhere('DATE(naskah.tanggal) >= :startDate', { startDate: dateRange.startDate });
    }
    if (dateRange.endDate) {
      queryBuilder.andWhere('DATE(naskah.tanggal) <= :endDate', { endDate: dateRange.endDate });
    }

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

    // Order by tanggal terbaru
    queryBuilder
      .orderBy('naskah.tanggal', 'DESC')
      .addOrderBy('naskah.id', 'DESC');

    // Get total count for pagination
    const total = await queryBuilder.getCount();
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    // Apply pagination
    queryBuilder.skip(offset).take(limit);

    // Execute query
    const naskahs = await queryBuilder.getMany();

    // Get all naskah IDs untuk query labels
    const naskahIds = naskahs.map(n => n.id);
    const labelsMap = new Map<string, string[]>();

    // Get labels for all naskah using repository approach
    if (naskahIds.length > 0) {
      try {
        const naskahLabels = await this.naskahLabelRepository.find({
          where: {
            naskahId: In(naskahIds),
          },
          relations: ['label', 'label.parent'],
        });

        // Group labels by naskah_id
        for (const nl of naskahLabels) {
          if (!nl.label || !nl.label.isActive) continue;

          if (!labelsMap.has(nl.naskahId)) {
            labelsMap.set(nl.naskahId, []);
          }

          const labelName = nl.label.parent?.nama && nl.label.parent.isActive
            ? `${nl.label.parent.nama} > ${nl.label.nama}`
            : nl.label.nama;
          
          labelsMap.get(nl.naskahId)?.push(labelName);
        }
      } catch (error) {
        // Log error but continue without labels
        console.error('Error fetching labels for draft list:', error);
      }
    }

    // Build response items
    const items: DraftListItemDto[] = [];

    for (const naskah of naskahs) {
      // Get pengirim for timestamp (created_at)
      const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
        where: {
          idNaskah: naskah.id,
          sirkuler: 'pengirim',
          position: String(positionId),
        },
      });

      // Get penerima for this naskah
      let penerima: any[] = [];

      // For SDE, get penerima from naskah_sirkulasi (REFACTORED)
      if (naskah.jenis === 'SDE') {
        // REFACTOR: Data penerima eksternal sekarang ada di naskah_sirkulasi
        const penerimaList = await this.naskahSirkulasiRepository.find({
          where: {
            idNaskah: naskah.id,
            sirkuler: 'penerima',
          },
        });

        console.log('🔍 SDE Draft Debug - Naskah ID:', naskah.id);
        console.log('🔍 SDE Draft Debug - Penerima found from sirkulasi:', penerimaList.length);

        for (const p of penerimaList) {
          // idSirkuler untuk SDE adalah ID eksternal (UUID string)
          const eksternalId = p.idSirkuler || null;
          
          // Jika ada ID eksternal, coba ambil detail dari tabel eksternal
          if (eksternalId) {
            const eksternalData = await this.eksternalRepository.findOne({
              where: { id: eksternalId },
            });

            if (eksternalData) {
              penerima.push({
                id: eksternalData.id,
                nama: eksternalData.nama,
                alamat: eksternalData.alamat || p.alamat || null,
                telepon: eksternalData.telepon || p.telepon || null,
                email: eksternalData.email || p.email || null,
                kontak: eksternalData.kontak || null,
                company: eksternalData.company || p.companyText || null,
                area: eksternalData.area || p.areaText || null,
              });
            } else {
              // Fallback ke data dari sirkulasi
              penerima.push({
                id: eksternalId,
                nama: p.namaSirkuler || '',
                alamat: p.alamat || null,
                telepon: p.telepon || null,
                email: p.email || null,
                kontak: null,
                company: p.companyText || null,
                area: p.areaText || null,
              });
            }
          } else {
            // Tidak ada ID eksternal, gunakan data dari sirkulasi saja
            penerima.push({
              nama: p.namaSirkuler || p.positionText || '',
              alamat: p.alamat || null,
              telepon: p.telepon || null,
              email: p.email || null,
              kontak: null,
              company: p.companyText || null,
              area: p.areaText || null,
            });
          }
        }
        
        console.log('🔍 SDE Draft Debug - penerima processed:', penerima.length);
      } else {
        // For other jenis (ND, SDI, DI, KA), get from naskah_sirkulasi
        const penerimaList = await this.naskahSirkulasiRepository.find({
          where: {
            idNaskah: naskah.id,
            sirkuler: 'penerima',
          },
        });

        // Map all penerima
        penerima = penerimaList.map((p) => ({
          position_id: Number(p.position),
          position_text: p.positionText || '',
          nama: p.namaSirkuler || '',
          organization_text: p.organizationText || '',
        }));
      }

      // Use created_at or updated_at from sirkulasi (pengirim)
      const tanggal = pengirimSirkulasi?.updatedAt 
        ? new Date(pengirimSirkulasi.updatedAt)
        : pengirimSirkulasi?.createdAt
        ? new Date(pengirimSirkulasi.createdAt)
        : new Date(naskah.tanggal);

      // Format waktu in UTC (HH:mm)
      const waktuUTC = `${String(tanggal.getUTCHours()).padStart(2, '0')}:${String(tanggal.getUTCMinutes()).padStart(2, '0')}`;

      items.push({
        id_naskah: naskah.id,
        jenis: naskah.jenis,
        jenis_text: JENIS_TEXT_MAP[naskah.jenis] || naskah.jenis,
        penerima: penerima,
        penerima_count: penerima.length,
        isi_pesan: naskah.perihal || naskah.konten?.substring(0, 100) || '-',
        tanggal: tanggal,
        waktu: waktuUTC,
        labels: labelsMap.get(naskah.id) || [],
      });
    }

    return {
      success: true,
      data: items,
      pagination: {
        total,
        page,
        limit,
        totalPages,
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

    // Sync to Meilisearch (non-blocking)
    this.meilisearchSyncService.syncNaskah(idNaskah).catch(() => { });

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

  // ============================================================
  // DELETE /draft/bulk-delete - Bulk delete drafts
  // ============================================================

  /**
   * Bulk delete draft naskah
   * Menghapus beberapa draft sekaligus berdasarkan array ID
   * 
   * @param naskahIds - Array of naskah IDs to delete
   * @param positionId - Position ID untuk validasi ownership
   */
  async bulkDeleteDraft(
    naskahIds: string[],
    positionId: number,
  ): Promise<BulkDeleteDraftResponseDto> {
    const failedIds: string[] = [];
    let totalDeleted = 0;

    // Process each naskah
    for (const naskahId of naskahIds) {
      try {
        // Get naskah
        const naskah = await this.naskahRepository.findOne({
          where: { id: naskahId },
        });

        if (!naskah) {
          failedIds.push(naskahId);
          continue;
        }

        if (naskah.status !== 'draf') {
          failedIds.push(naskahId);
          continue;
        }

        // Verify ownership
        const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
          where: {
            idNaskah: naskahId,
            sirkuler: 'pengirim',
          },
        });

        if (!pengirimSirkulasi) {
          failedIds.push(naskahId);
          continue;
        }

        if (String(pengirimSirkulasi.position) !== String(positionId)) {
          failedIds.push(naskahId);
          continue;
        }

        // Start transaction for this naskah
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

          // Delete sirkulasi
          await queryRunner.manager.delete(NaskahSirkulasi, {
            idNaskah: naskahId,
          });

          // Delete naskah
          await queryRunner.manager.delete(NaskahEntity, {
            id: naskahId,
          });

          // Commit
          await queryRunner.commitTransaction();
          totalDeleted++;

          // Remove from Meilisearch (non-blocking)
          this.meilisearchSyncService.deleteNaskah(naskahId).catch(() => { });
        } catch (error) {
          await queryRunner.rollbackTransaction();
          failedIds.push(naskahId);
        } finally {
          await queryRunner.release();
        }
      } catch (error) {
        failedIds.push(naskahId);
      }
    }

    return {
      success: true,
      message: totalDeleted > 0 
        ? `Berhasil menghapus ${totalDeleted} draft` 
        : 'Tidak ada draft yang berhasil dihapus',
      data: {
        total_requested: naskahIds.length,
        total_deleted: totalDeleted,
        failed_ids: failedIds,
      },
    };
  }
}
