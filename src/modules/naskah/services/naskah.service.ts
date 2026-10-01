import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { NaskahEntity } from '../entities/naskah.entity';
import { NaskahSirkulasi } from '../../naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../naskah-lampiran/entities/naskah_lampiran.entity';
import { NaskahReferensiEntity } from '../../naskah-referensi/entities/naskah_referensi.entity';
import { DiEntity } from '../../disposisi/entities/di.entity';
// REMOVED: NdEntity and SdiSdeEntity - data now comes from naskah_sirkulasi and naskah
// import { NdEntity } from '../../nota-dinas/entities/nd.entity';
// import { SdiSdeEntity } from '../../surat-dinas-internal/entities/sdi_sde.entity';
import { StorageService } from '../../storage/services/storage.service';
import { MeilisearchSyncService } from '../../search/services/meilisearch-sync.service';
import { GrupPenerimaService } from '../../grup-penerima/services/grup_penerima.service';
import { NotificationService } from '../../notification/services/notification.service';
import { CreateNaskahDto } from '../dto/naskah/create_naskah.dto';
import { UpdateNaskahDto } from '../dto/naskah/update_naskah.dto';
import { formatWibDateTime } from '../../../common/helpers/date-format.helper';
import {
  NaskahDetailResponseDto,
  SirkulasiDetailDto,
  LampiranDetailDto,
  ReferensiDetailDto,
  DisposisiDetailDto,
} from '../dto/naskah/naskah-detail.dto';
import { compareNaskahFlow } from '../utils/naskah-flow-order.util';
import { createCorrespondenceFinalFileName } from '../../../common/utils/correspondence-file-name.util';

// Label untuk jenis naskah
const JENIS_LABELS: Record<string, string> = {
  ND: 'Nota Dinas',
  SDI: 'Surat Dinas Internal',
  SDE: 'Surat Dinas Eksternal',
  DI: 'Disposisi',
  KA: 'Kajian',
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

@Injectable()
export class NaskahService {
  constructor(
    @InjectRepository(NaskahEntity)
    private naskahRepository: Repository<NaskahEntity>,
    @InjectRepository(NaskahSirkulasi)
    private naskahSirkulasiRepository: Repository<NaskahSirkulasi>,
    @InjectRepository(NaskahLampiranEntity)
    private naskahLampiranRepository: Repository<NaskahLampiranEntity>,
    @InjectRepository(NaskahReferensiEntity)
    private naskahReferensiRepository: Repository<NaskahReferensiEntity>,
    @InjectRepository(DiEntity)
    private diRepository: Repository<DiEntity>,
    // REMOVED: NdEntity and SdiSdeEntity repositories
    // @InjectRepository(NdEntity)
    // private ndRepository: Repository<NdEntity>,
    // @InjectRepository(SdiSdeEntity)
    // private sdiSdeRepository: Repository<SdiSdeEntity>,
    private storageService: StorageService,
    private meilisearchSyncService: MeilisearchSyncService,
    private grupPenerimaService: GrupPenerimaService,
    private notificationService: NotificationService,
    private dataSource: DataSource,
  ) {}

  async create(createNaskahDto: CreateNaskahDto): Promise<NaskahEntity> {
    const naskah = new NaskahEntity();
    naskah.id = uuidv4();
    Object.assign(naskah, createNaskahDto);
    // tanggal adalah bagian PK komposit (id, tanggal) — wajib terisi.
    if (!naskah.tanggal) naskah.tanggal = new Date();

    const saved = await this.naskahRepository.save(naskah);

    // Sync to Meilisearch (non-blocking)
    this.meilisearchSyncService.syncNaskah(saved.id).catch(() => {});

    return saved;
  }

  async findAll(
    jenis?: string,
    status?: string,
    year?: number,
  ): Promise<NaskahEntity[]> {
    const query = this.naskahRepository.createQueryBuilder('naskah');

    if (jenis) {
      query.where('naskah.jenis = :jenis', { jenis });
    }

    if (status) {
      query.andWhere('naskah.status = :status', { status });
    }

    if (year) {
      query.andWhere('YEAR(naskah.tanggal) = :year', { year });
    }

    return await query.orderBy('naskah.tanggal', 'DESC').getMany();
  }

  async findOne(id: string): Promise<NaskahEntity> {
    const naskah = await this.naskahRepository.findOne({
      where: { id },
    });

    if (!naskah) {
      throw new NotFoundException('Naskah tidak ditemukan');
    }

    return naskah;
  }

  async findByJenis(
    jenis: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA',
  ): Promise<NaskahEntity[]> {
    return await this.naskahRepository.find({
      where: { jenis },
      order: { tanggal: 'DESC' },
    });
  }

  async update(
    id: string,
    updateNaskahDto: UpdateNaskahDto,
  ): Promise<NaskahEntity> {
    const naskah = await this.findOne(id);
    Object.assign(naskah, updateNaskahDto);
    const saved = await this.naskahRepository.save(naskah);

    // Sync to Meilisearch (non-blocking)
    this.meilisearchSyncService.syncNaskah(id).catch(() => {});

    return saved;
  }

  async remove(id: string): Promise<void> {
    const naskah = await this.findOne(id);
    // App-layer cascade (replaces dropped FK fk_nd_verifikator_naskah ON DELETE CASCADE):
    // delete verifikator rows then the naskah, atomically. naskah_dinas_verifikator is the
    // only table that used to reference naskah via a DB FK.
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        'DELETE FROM naskah_dinas_verifikator WHERE id_naskah = ?',
        [id],
      );
      await manager.remove(naskah);
    });

    // Remove from Meilisearch (non-blocking)
    this.meilisearchSyncService.deleteNaskah(id).catch(() => {});
  }

  async updateStatus(
    id: string,
    status: 'draf' | 'pending' | 'final' | 'final_tte',
  ): Promise<NaskahEntity> {
    const naskah = await this.findOne(id);
    naskah.status = status;
    const saved = await this.naskahRepository.save(naskah);

    // Sync to Meilisearch (non-blocking)
    this.meilisearchSyncService.syncNaskah(id).catch(() => {});

    return saved;
  }

  /**
   * Finalize Pending - Mengirim surat yang tertunda (TTD basah)
   *
   * Flow:
   * 1. Validasi naskah status = 'pending'
   * 2. Simpan file signed scan (jika ada)
   * 3. Update status naskah: pending → final
   * 4. Update sirkulasi: isDraft = false (surat terlihat oleh penerima)
   * 5. Kirim notifikasi ke penerima dan tembusan
   */
  async finalizePending(
    naskahId: string,
    file: Express.Multer.File,
    user?: {
      persnum: number;
      nama: string;
      positionText: string;
      position?: string;
    },
  ): Promise<{
    success: boolean;
    message: string;
    naskah_id: string;
    signed_file: string;
  }> {
    if (user?.position) {
      await this.assertUserHasAccessToNaskah(naskahId, user.position);
    }

    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    if (!naskah) {
      throw new NotFoundException(
        `Naskah dengan id ${naskahId} tidak ditemukan`,
      );
    }

    if (naskah.status !== 'pending') {
      throw new NotFoundException(
        `Naskah bukan berstatus pending. Status saat ini: ${naskah.status}`,
      );
    }

    // Upload signed file to storage
    const uploadResult = await this.storageService.uploadFile(
      file,
      'signed-documents',
    );
    const signedFileKey = uploadResult.key;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Update naskah status to final + save signed file + track who finalized
      const updateData: Partial<NaskahEntity> = {
        status: 'final',
        final_pdf: signedFileKey,
        ...(user && {
          dikirimOleh: {
            persnum: String(user.persnum),
            nama: user.nama,
            position_text: user.positionText,
          },
        }),
      };

      await queryRunner.manager.update(
        NaskahEntity,
        { id: naskahId },
        updateData,
      );

      // Update all sirkulasi: isDraft = false (now visible to penerima)
      await queryRunner.manager.update(
        NaskahSirkulasi,
        { idNaskah: naskahId },
        { isDraft: false },
      );

      await queryRunner.commitTransaction();

      // Get sirkulasi for notifications (after commit)
      const allSirkulasi = await this.naskahSirkulasiRepository.find({
        where: { idNaskah: naskahId },
      });

      const pengirim = allSirkulasi.find((s) => s.sirkuler === 'pengirim');
      const penerimaList = allSirkulasi.filter(
        (s) => s.sirkuler === 'penerima',
      );
      const tembusanList = allSirkulasi.filter(
        (s) => s.sirkuler === 'tembusan',
      );

      // Send notifications to penerima (non-blocking)
      for (const penerima of penerimaList) {
        this.notificationService
          .createNaskahMasukNotification({
            positionId: penerima.position || '',
            userPersnum: penerima.idSirkuler
              ? Number(penerima.idSirkuler) || undefined
              : undefined,
            naskahId,
            sirkulasiId: penerima.id,
            jenis: naskah.jenis || 'ND',
            nomor: naskah.nomor || '',
            perihal: naskah.perihal || '',
            pengirim: pengirim?.namaSirkuler || pengirim?.positionText || '',
            pengirimPosition: pengirim?.positionText || '',
            isTembusan: false,
          })
          .catch((err) => {
            console.error(
              `[Naskah:FinalizePending] ❌ Failed notification penerima ${penerima.position}:`,
              err.message,
            );
          });
      }

      // Send notifications to tembusan (non-blocking)
      for (const tembusan of tembusanList) {
        this.notificationService
          .createNaskahMasukNotification({
            positionId: tembusan.position || '',
            userPersnum: tembusan.idSirkuler
              ? Number(tembusan.idSirkuler) || undefined
              : undefined,
            naskahId,
            sirkulasiId: tembusan.id,
            jenis: naskah.jenis || 'ND',
            nomor: naskah.nomor || '',
            perihal: naskah.perihal || '',
            pengirim: pengirim?.namaSirkuler || pengirim?.positionText || '',
            pengirimPosition: pengirim?.positionText || '',
            isTembusan: true,
          })
          .catch((err) => {
            console.error(
              `[Naskah:FinalizePending] ❌ Failed notification tembusan ${tembusan.position}:`,
              err.message,
            );
          });
      }

      // Sync to Meilisearch (non-blocking)
      this.meilisearchSyncService.syncNaskah(naskahId).catch(() => {});

      return {
        success: true,
        message: 'Surat tertunda berhasil dikirim',
        naskah_id: naskahId,
        signed_file: signedFileKey,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      // Cleanup uploaded file if transaction failed
      this.storageService.deleteFile(signedFileKey).catch(() => {});
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get Detail Naskah - Global untuk semua jenis naskah
   *
   * Mengambil semua data terkait naskah:
   * - Data utama dari tabel naskah
   * - Sirkulasi (pengirim, penerima, tembusan)
   * - Lampiran files
   * - Referensi surat
   * - Data spesifik per jenis (DI, ND, dll)
   */
  async getDetail(
    naskahId: string,
    userPosition: string,
  ): Promise<NaskahDetailResponseDto> {
    await this.assertUserHasAccessToNaskah(naskahId, userPosition);

    // 1. Get data naskah utama
    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    if (!naskah) {
      throw new NotFoundException(
        `Naskah dengan ID ${naskahId} tidak ditemukan`,
      );
    }

    // 2. Get sirkulasi (pengirim, penerima, tembusan)
    const sirkulasiList = await this.naskahSirkulasiRepository.find({
      where: { idNaskah: naskahId },
    });

    const pengirim = sirkulasiList.find((s) => s.sirkuler === 'pengirim');
    const penerima = sirkulasiList.filter((s) => s.sirkuler === 'penerima');
    const tembusan = sirkulasiList.filter((s) => s.sirkuler === 'tembusan');

    // Extract unique grup penerima IDs from sirkulasi records
    const penerimaGrupIds = [
      ...new Set(
        penerima.filter((p) => p.idGrupPenerima).map((p) => p.idGrupPenerima!),
      ),
    ];
    const tembusanGrupIds = [
      ...new Set(
        tembusan.filter((t) => t.idGrupPenerima).map((t) => t.idGrupPenerima!),
      ),
    ];

    // Enrich grup penerima with nama and position_ids
    const penerimaGrupInfo =
      await this.grupPenerimaService.getGrupInfoForResponse(penerimaGrupIds);
    const tembusanGrupInfo =
      await this.grupPenerimaService.getGrupInfoForResponse(tembusanGrupIds);

    // 3. Get lampiran files
    const lampiranList = await this.naskahLampiranRepository.find({
      where: { id_naskah: naskahId },
    });

    // 4. Get referensi surat
    const referensiList = await this.naskahReferensiRepository.find({
      where: { id_naskah: naskahId },
    });

    // 5. Get data spesifik per jenis
    let detailDisposisi: DisposisiDetailDto | null = null;

    if (naskah.jenis === 'DI') {
      const diData = await this.diRepository.findOne({
        where: { idNaskah: naskahId },
      });

      if (diData) {
        detailDisposisi = {
          id: diData.id,
          kop_logo: diData.kopLogo,
          kop_judul: diData.kopJudul,
          nama_jabatan: diData.namaJabatan,
          nomor_agenda: diData.nomorAgenda,
          tanggal_agenda: diData.tanggalAgenda,
          surat_dari: diData.suratDari,
          tanggal: diData.tanggal,
          nomor: diData.nomor,
          perihal: diData.perihal,
          klasifikasi: diData.klasifikasi,
          kepada_yth: diData.kepadaYth,
          disposisi: diData.disposisi,
          catatan: diData.catatan,
          paraf: diData.paraf,
        };
      }
    }

    // Build response
    return {
      success: true,
      message: 'Berhasil mengambil detail naskah',
      data: {
        // Data utama
        id: naskah.id,
        jenis: naskah.jenis,
        jenis_label: JENIS_LABELS[naskah.jenis] || naskah.jenis,
        klasifikasi: naskah.klasifikasi,
        klasifikasi_text: naskah.klasifikasi_text,
        sifat: naskah.sifat,
        nomor: naskah.nomor,
        tanggal: naskah.tanggal,
        perihal: naskah.perihal,
        konten: naskah.konten,
        lampiran: naskah.lampiran,
        status: naskah.status,
        label_ttd: this.getLabelTtd(naskah.signOption),

        // Sirkulasi
        pengirim: pengirim ? this.mapSirkulasi(pengirim) : null,
        penerima: penerima.map((p) => this.mapSirkulasi(p)),
        tembusan: tembusan.map((t) => this.mapSirkulasi(t)),
        penerima_grup: penerimaGrupInfo,
        tembusan_grup: tembusanGrupInfo,

        // Lampiran files
        lampiran_files: lampiranList.map((l) => this.mapLampiran(l)),

        // Referensi surat
        referensi: referensiList.map((r) => this.mapReferensi(r)),

        // Dikirim oleh (siapa yang mengirim/finalize naskah pending, bisa delegasi)
        dikirim_oleh: naskah.dikirimOleh || null,

        // Data spesifik per jenis
        detail_disposisi: detailDisposisi,
        detail_nota_dinas: null, // TODO: implement jika ada tabel nd
      },
    };
  }

  /**
   * Get label TTD berdasarkan sign_option yang tersimpan di naskah
   * - digsig → TTE BSrE
   * - qr_only → QR Code
   * - ttd_basah → TTD Basah
   * - null → null (draf / legacy)
   */
  private getLabelTtd(signOption: string | null): string | null {
    if (signOption === 'digsig') return 'TTE BSrE';
    if (signOption === 'qr_only') return 'QR Code';
    if (signOption === 'ttd_basah') return 'TTD Basah';
    return null;
  }

  /**
   * Map NaskahSirkulasi entity to SirkulasiDetailDto
   */
  private mapSirkulasi(s: NaskahSirkulasi): SirkulasiDetailDto {
    return {
      id: s.id,
      sirkuler: s.sirkuler,
      company: s.company,
      company_text: s.companyText,
      area: s.area,
      area_text: s.areaText,
      sub_area: s.subArea,
      sub_area_text: s.subAreaText,
      organization: s.organization,
      organization_text: s.organizationText,
      position: s.position,
      position_text: s.positionText,
      position_status: s.positionStatus,
      id_sirkuler: s.idSirkuler,
      nama_sirkuler: s.namaSirkuler,
      email: s.email || null,
      send_read_time: s.sendReadTime,
      send_read_user: s.sendReadUser,
      is_draft: s.isDraft ?? false,
      flag_favorit: !!s.flagFavorit,
      flag_arsip: !!s.flagArsip,
      created_at: s.createdAt,
      updated_at: s.updatedAt,
    };
  }

  /**
   * Map NaskahLampiranEntity to LampiranDetailDto
   */
  private mapLampiran(l: NaskahLampiranEntity): LampiranDetailDto {
    return {
      id: l.id,
      file_name: l.file_name,
      file_pdf: l.file_pdf,
      jenis: l.jenis,
    };
  }

  /**
   * Map NaskahReferensiEntity to ReferensiDetailDto
   */
  private mapReferensi(r: NaskahReferensiEntity): ReferensiDetailDto {
    return {
      id: r.id,
      ref_jenis: r.ref_jenis,
      ref_pengirim: r.ref_pengirim,
      ref_tanggal: r.ref_tanggal,
      ref_nomor: r.ref_nomor,
      ref_perihal: r.ref_perihal,
    };
  }

  /**
   * Count draft naskah berdasarkan position id
   * Draft = status = 'draf'
   */
  async countDraftByPosition(positionId: number): Promise<any> {
    // Count naskah dengan status 'draf' dari sirkulasi pengirim dengan position tertentu
    const count = await this.naskahRepository
      .createQueryBuilder('naskah')
      .innerJoin(
        'naskah_sirkulasi',
        'sirkulasi',
        'sirkulasi.idNaskah = naskah.id',
      )
      .where('naskah.status = :status', { status: 'draf' })
      .andWhere('sirkulasi.sirkuler = :sirkuler', { sirkuler: 'pengirim' })
      .andWhere('sirkulasi.position = :position', {
        position: String(positionId),
      })
      .getCount();

    return {
      success: true,
      message: 'Count draft naskah berhasil diambil',
      data: {
        position_id: positionId,
        count,
      },
    };
  }

  /**
   * Get Detail Naskah dengan Rangkaian Referensi Lengkap
   *
   * Menampilkan chain lengkap naskah dari awal sampai akhir:
   * - Root naskah (awal)
   * - Semua forward/disposisi turunan
   * - Support semua jenis: ND, SDI, SDE, DI, KA
   *
   * Urutan: Terbaru di atas (level tertinggi), awal di bawah (level 0)
   *
   * @param naskahId - ID naskah (bisa dari level mana saja)
   * @returns Full chain dengan detail setiap naskah
   */
  async getDetailWithChain(
    naskahId: string,
    userPosition: string,
    user?: any,
  ): Promise<any> {
    // 🛡️ SUPERADMIN bypass — bisa akses semua naskah tanpa sirkulasi
    const isSuperadmin =
      user?.activeRole?.name?.toUpperCase() === 'SUPERADMIN' ||
      user?.role?.toUpperCase() === 'SUPERADMIN';

    // Fetch user's sirkulasi record once — reuse for access check & flag extraction
    let userSirkulasi = await this.naskahSirkulasiRepository.findOne({
      where: {
        idNaskah: naskahId,
        position: String(userPosition),
      },
    });

    // Jika tidak ada sirkulasi, cek apakah user adalah penerima share
    if (!userSirkulasi) {
      const [shareRows] = await this.dataSource.query(
        `SELECT nsr.id, nsr.status, nsr.opened_at
         FROM naskah_share_recipient nsr
         JOIN naskah_share ns ON ns.id = nsr.share_id
         WHERE ns.naskah_id = ? AND nsr.recipient_id = ? AND ns.status = 'AKTIF'
         LIMIT 1`,
        [naskahId, String(userPosition)],
      );

      if ((!shareRows || shareRows.length === 0) && !isSuperadmin) {
        throw new ForbiddenException('Anda tidak memiliki akses ke naskah ini');
      }

      // Shared users can view but don't have full sirkulasi flags
      userSirkulasi = null as NaskahSirkulasi | null;
    }

    return this.buildChainFlow(naskahId, userPosition, userSirkulasi);
  }

  /**
   * Chain naskah untuk viewer anggota berkas (pemberkasan/persetujuan), tanpa
   * cek peserta korespondensi. Akses dikendalikan di layer berk: naskah harus
   * tercatat di berkas_naskah. user_sirkulasi = null → flag pribadi mati.
   * userPosition = '' → riwayat konsep (draft pre-final) tidak dimuat; tampilan
   * berk = arsip naskah final.
   */
  async getDetailWithChainForBerkas(naskahId: string): Promise<any> {
    return this.buildChainFlow(naskahId, '', null, true);
  }

  private async buildChainFlow(
    naskahId: string,
    userPosition: string,
    userSirkulasi: NaskahSirkulasi | null,
    singleOnly = false,
  ): Promise<any> {
    // Get naskah data
    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    if (!naskah) {
      throw new NotFoundException(
        `Naskah dengan id ${naskahId} tidak ditemukan`,
      );
    }

    // ============================================================
    // BUILD ANCESTOR CHAIN (scoped: root -> naskah yang dilihat)
    // Hanya kumpulkan jalur ancestor (viewed -> parent -> ... -> root).
    // JANGAN traverse forward ke downstream/sibling — anti bocor riwayat
    // naskah orang lain ke viewer yang tidak seharusnya lihat.
    // ============================================================

    // STEP 1: Collect ancestor chain saja (linear, backward only)
    const allNaskahInChain = new Set<string>();
    const allReferensiMap = new Map<string, any>(); // id_naskah -> referensi data

    const traceBackwardOnly = async (startId: string) => {
      const visited = new Set<string>();
      let currentId: string | null = startId;

      while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        allNaskahInChain.add(currentId);

        // Backward: cari naskah yang direferensikan (parent)
        const referensi = await this.naskahReferensiRepository.findOne({
          where: { id_naskah: currentId },
        });

        if (!referensi || !referensi.ref_nomor) break;

        allReferensiMap.set(currentId, referensi);

        // Find parent by ref_nomor (+ ref_jenis jika ada)
        const whereClause: any = { nomor: referensi.ref_nomor };
        if (referensi.ref_jenis) {
          whereClause.jenis = referensi.ref_jenis;
        }
        const parentNaskah = await this.naskahRepository.findOne({
          where: whereClause,
        });

        if (!parentNaskah) break;
        currentId = parentNaskah.id;
      }
    };

    if (singleOnly) {
      // Berk: hanya naskah yg dilihat (inti surat), tanpa rangkaian/riwayat.
      allNaskahInChain.add(naskahId);
    } else {
      await traceBackwardOnly(naskahId);
    }

    // ponytail: leak X — forward MILIK USER (naskah yang user kirim) TIDAK
    // dimasukkan ke chain. Sebelumnya forwardOwnChain ikut naskah child yang
    // pengirimnya == user, sehingga naskah yang user kirim muncul di detail
    // naskah yang user terima (kotak masuk). Naskah kirim user = item terkirim,
    // bukan bagian riwayat inbox. Indikator "sudah tindak lanjut" tetap dari
    // flag is_tindak_lanjut pada user_sirkulasi (bukan dari node chain).
    // Downstream orang lain tetap tidak ikut (tidak pernah di-traverse).
    // STEP 2: Calculate level untuk setiap naskah berdasarkan kedalaman referensi
    // Level = depth dari referenced parent (0 jika tidak ada referensi)
    const naskahIdToLevel = new Map<string, number>();

    const calculateLevel = async (naskahIdParam: string): Promise<number> => {
      if (naskahIdToLevel.has(naskahIdParam)) {
        return naskahIdToLevel.get(naskahIdParam)!;
      }

      const referensi = allReferensiMap.get(naskahIdParam);
      if (!referensi || !referensi.ref_nomor) {
        naskahIdToLevel.set(naskahIdParam, 0);
        return 0;
      }

      // Find parent
      const whereClause: any = { nomor: referensi.ref_nomor };
      if (referensi.ref_jenis) {
        whereClause.jenis = referensi.ref_jenis;
      }
      const parentNaskah = await this.naskahRepository.findOne({
        where: whereClause,
      });

      if (!parentNaskah) {
        naskahIdToLevel.set(naskahIdParam, 0);
        return 0;
      }

      const parentLevel = await calculateLevel(parentNaskah.id);
      const currentLevel = parentLevel + 1;
      naskahIdToLevel.set(naskahIdParam, currentLevel);
      return currentLevel;
    };

    // Calculate level untuk semua naskah dalam chain
    for (const naskahId of allNaskahInChain) {
      await calculateLevel(naskahId);
    }

    // STEP 2b: Include konsep (jenis 'K') yang menempel pada naskah asli via
    // id_naskah_asli — HANYA jika viewer adalah pengirim naskah asli.
    // Penerima/tembusan TIDAK boleh melihat riwayat konsep (draft workflow),
    // mereka hanya melihat naskah final yang dikirim ke mereka.
    // ponytail: leak konsep ke forward — konsep drafts HANYA tampil saat viewer
    // buka naskah_asli itu sendiri (asliId === naskahId), bukan saat buka
    // forward/anak turunannya. Sebelumnya loop iterasi SEMUA naskah di chain,
    // sehingga konsep drafts si asli bocor ke riwayat forward turunannya
    // (viewer = pengirim asli + penerima forward → konsep muncul di riwayat
    // forward). Konsep drafts = riwayat si asli, bukan riwayat forward.
    const asliIdsForKonsep = [...allNaskahInChain];
    for (const asliId of asliIdsForKonsep) {
      if (asliId !== naskahId) continue; // hanya naskah yang sedang dilihat
      const asliNaskah = await this.naskahRepository.findOne({
        where: { id: asliId },
        select: { id: true, jenis: true } as any,
      });
      if (!asliNaskah || asliNaskah.jenis === 'K') continue;

      // Check: hanya pengirim naskah asli yang boleh lihat riwayat konsep
      const isPengirimOfAsli = await this.naskahSirkulasiRepository.findOne({
        where: {
          idNaskah: asliId,
          sirkuler: 'pengirim',
          position: String(userPosition),
        },
        select: { id: true },
      });
      if (!isPengirimOfAsli) continue;

      const konsepKs = await this.naskahRepository.find({
        where: { id_naskah_asli: asliId, jenis: 'K' as any },
        select: { id: true } as any,
      });
      const asliLevel = naskahIdToLevel.get(asliId) ?? 0;
      for (const k of konsepKs) {
        if (!allNaskahInChain.has(k.id)) allNaskahInChain.add(k.id);
        if (!naskahIdToLevel.has(k.id)) naskahIdToLevel.set(k.id, asliLevel);
      }
    }

    // STEP 3: Build flow dengan level yang sudah dihitung
    const flow: any[] = [];

    // Helper function to build node data for flow
    const buildFlowNode = async (
      naskahData: NaskahEntity,
      level: number,
    ): Promise<any> => {
      // Get pengirim
      const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
        where: {
          idNaskah: naskahData.id,
          sirkuler: 'pengirim',
        },
      });

      // Get penerima list
      const penerimaList = await this.naskahSirkulasiRepository.find({
        where: {
          idNaskah: naskahData.id,
          sirkuler: 'penerima',
        },
        order: { createdAt: 'ASC' },
      });

      // Get tembusan list
      const tembusanList = await this.naskahSirkulasiRepository.find({
        where: {
          idNaskah: naskahData.id,
          sirkuler: 'tembusan',
        },
        order: { createdAt: 'ASC' },
      });

      // ponytail: leak Y — naskah tanpa penerima & tembusan (belum dikirim ke
      // siapa pun) tidak should jadi node riwayat. Pengecualian: naskah yang
      // sedang dilihat (naskahId) tetap tampil walau kosong, karena itu subjek
      // yang user buka.
      if (
        penerimaList.length === 0 &&
        tembusanList.length === 0 &&
        naskahData.id !== naskahId
      ) {
        return null;
      }

      // Get lampiran files
      const lampiranFiles = await this.naskahLampiranRepository.find({
        where: { id_naskah: naskahData.id },
      });

      // Get referensi
      const referensiData = await this.naskahReferensiRepository.findOne({
        where: { id_naskah: naskahData.id },
      });

      // Get jenis-specific data
      let jenisSpecificData: any = null;

      if (naskahData.jenis === 'DI') {
        const diData = await this.diRepository.findOne({
          where: { idNaskah: naskahData.id },
        });
        if (diData) {
          jenisSpecificData = {
            kop_logo: diData.kopLogo,
            kop_judul: diData.kopJudul,
            nama_jabatan: diData.namaJabatan,
            nomor_agenda: diData.nomorAgenda,
            tanggal_agenda: diData.tanggalAgenda,
            surat_dari: diData.suratDari,
            kepada_yth: diData.kepadaYth,
            disposisi: diData.disposisi,
            catatan: diData.catatan,
            paraf: diData.paraf,
          };
        }
      } else if (naskahData.jenis === 'ND') {
        // ND: Get data from naskah_sirkulasi (pengirim) and naskah
        if (pengirimSirkulasi) {
          // Build kepada_yth from penerima list
          const kepadaYth = penerimaList
            .map((p) => p.positionText || '')
            .join('; ');
          jenisSpecificData = {
            kepada_yth: kepadaYth,
            nama_tempat: naskahData.tempat || null,
            nama_jabatan: pengirimSirkulasi.positionText || null,
            nama_lengkap: pengirimSirkulasi.namaSirkuler || null,
            tanda_tangan: naskahData.tandaTangan || null,
          };
        }
      } else if (['SDI', 'SDE'].includes(naskahData.jenis || '')) {
        // SDI/SDE: Get data from naskah_sirkulasi (pengirim and penerima) and naskah
        if (pengirimSirkulasi) {
          // Build kepada_yth from penerima list
          const kepadaYth =
            naskahData.jenis === 'SDI'
              ? penerimaList
                  .map((p) => `${p.positionText} - ${p.organizationText}`)
                  .join('; ')
              : penerimaList.map((p) => p.namaSirkuler || '').join('; ');

          // For SDE, get tujuan and alamat from first penerima (if external)
          const firstPenerima =
            penerimaList.length > 0 ? penerimaList[0] : null;

          jenisSpecificData = {
            kepada_yth: kepadaYth,
            tujuan:
              naskahData.jenis === 'SDE'
                ? firstPenerima?.namaSirkuler || null
                : null,
            alamat_tujuan:
              naskahData.jenis === 'SDE' ? firstPenerima?.alamat || null : null,
            nama_tempat: naskahData.tempat || null,
            nama_jabatan: pengirimSirkulasi.positionText || null,
            nama_lengkap: pengirimSirkulasi.namaSirkuler || null,
            tanda_tangan: naskahData.tandaTangan || null,
            kop_logo: null, // Dead code - removed
            kop_nama: null, // Dead code - removed
            alamat_perusahaan: null, // Dead code - removed
          };
        }
      }

      // Get final PDF URL
      const finalPdfUrl = naskahData.final_pdf
        ? await this.storageService.getPreviewUrl(
            naskahData.final_pdf,
            86400,
            createCorrespondenceFinalFileName(
              naskahData.jenis,
              lampiranFiles.length,
            ),
          )
        : null;

      // Extract unique grup penerima IDs
      const penerimaGrupIds = [
        ...new Set(
          penerimaList
            .filter((p) => p.idGrupPenerima)
            .map((p) => p.idGrupPenerima!),
        ),
      ];
      const tembusanGrupIds = [
        ...new Set(
          tembusanList
            .filter((t) => t.idGrupPenerima)
            .map((t) => t.idGrupPenerima!),
        ),
      ];

      // Enrich grup penerima with nama and position_ids
      const penerimaGrupInfo =
        await this.grupPenerimaService.getGrupInfoForResponse(penerimaGrupIds);
      const tembusanGrupInfo =
        await this.grupPenerimaService.getGrupInfoForResponse(tembusanGrupIds);

      // Build pengirim info
      const pengirimInfo = pengirimSirkulasi
        ? {
            position_id: pengirimSirkulasi.position || '',
            position_text: pengirimSirkulasi.positionText || '',
            organization_text: pengirimSirkulasi.organizationText || '',
            nama: pengirimSirkulasi.namaSirkuler || null,
            persnum: pengirimSirkulasi.idSirkuler || null,
          }
        : null;

      // Build penerima list with read status
      const penerimaInfo = penerimaList.map((p) => ({
        position_id: p.position || '',
        position_text: p.positionText || '',
        organization_text: p.organizationText || '',
        nama: p.namaSirkuler || null,
        persnum: p.idSirkuler || null,
        email: p.email || null,
        status_baca: p.sendReadTime ? 'terbaca' : 'belum_dibaca',
        read_time: p.sendReadTime ? p.sendReadTime.toISOString() : null,
      }));

      // Build tembusan list with read status
      const tembusanInfo = tembusanList.map((t) => ({
        position_id: t.position || '',
        position_text: t.positionText || '',
        organization_text: t.organizationText || '',
        nama: t.namaSirkuler || null,
        persnum: t.idSirkuler || null,
        email: t.email || null,
        status_baca: t.sendReadTime ? 'terbaca' : 'belum_dibaca',
        read_time: t.sendReadTime ? t.sendReadTime.toISOString() : null,
      }));

      // Build lampiran info with URLs
      const lampiranInfo = await Promise.all(
        lampiranFiles.map(async (l) => ({
          id: l.id,
          file_name: l.file_name || '',
          file_path: l.file_pdf || '',
          file_url: l.file_pdf
            ? await this.storageService.getFileUrl(l.file_pdf)
            : null,
        })),
      );

      // Build referensi info
      const referensiInfo = referensiData
        ? {
            ref_jenis: referensiData.ref_jenis,
            ref_pengirim: referensiData.ref_pengirim,
            ref_tanggal: referensiData.ref_tanggal,
            ref_nomor: referensiData.ref_nomor,
            ref_perihal: referensiData.ref_perihal,
          }
        : null;

      return {
        id: naskahData.id,
        jenis: naskahData.jenis,
        jenis_label: JENIS_LABELS[naskahData.jenis || ''] || naskahData.jenis,
        nomor: naskahData.nomor,
        tanggal: naskahData.tanggal,
        perihal: naskahData.perihal,
        konten: naskahData.konten,
        sifat: naskahData.sifat,
        klasifikasi: naskahData.klasifikasi,
        klasifikasi_text: naskahData.klasifikasi_text,
        status: naskahData.status,
        lampiran: naskahData.lampiran,
        label_ttd: this.getLabelTtd(naskahData.signOption),

        // Sirkulasi
        pengirim: pengirimInfo,
        penerima: penerimaInfo,
        tembusan: tembusanInfo,
        penerima_grup: penerimaGrupInfo,
        tembusan_grup: tembusanGrupInfo,

        // Lampiran files
        lampiran_files: lampiranInfo,
        jumlah_lampiran: lampiranFiles.length,

        // Final PDF
        final_pdf: naskahData.final_pdf,
        final_pdf_url: finalPdfUrl,

        // Dikirim oleh (siapa yang mengirim/finalize naskah pending, bisa delegasi)
        dikirim_oleh: naskahData.dikirimOleh || null,

        // Referensi
        referensi: referensiInfo,

        // Jenis-specific data
        detail: jenisSpecificData,

        // Level
        level,

        // Timestamps - format WIB string agar FE tampil langsung tanpa konversi
        created_at:
          formatWibDateTime(
            pengirimSirkulasi?.updatedAt || pengirimSirkulasi?.createdAt,
          ) || null,
        updated_at: formatWibDateTime(pengirimSirkulasi?.updatedAt) || null,
      };
    };

    // Build nodes untuk semua naskah dalam chain (termasuk konsep 'K' yang
    // menempel pada naskah asli — lihat STEP 2b — agar riwayat konsep tampil).
    for (const naskahIdInChain of allNaskahInChain) {
      const naskahData = await this.naskahRepository.findOne({
        where: { id: naskahIdInChain },
      });

      if (naskahData) {
        const level = naskahIdToLevel.get(naskahIdInChain) || 0;
        const node = await buildFlowNode(naskahData, level);
        if (node) flow.push(node);
      }
    }

    // Nomor KONSEP adalah sumber urutan workflow yang deterministik. Tanggal
    // saja tidak cukup karena semua versi konsep dapat memiliki tanggal sama.
    flow.sort(compareNaskahFlow);

    return {
      success: true,
      message: 'Berhasil mengambil detail naskah dengan rangkaian lengkap',
      data: flow,
      user_sirkulasi: userSirkulasi
        ? {
            id_sirkulasi: userSirkulasi.id,
            is_favorit: !!userSirkulasi.flagFavorit,
            is_arsip: !!userSirkulasi.flagArsip,
            is_note: !!userSirkulasi.flagNote,
            note_text: userSirkulasi.noteText || null,
            is_tindak_lanjut: !!userSirkulasi.tindakLanjut,
            is_locked: !!userSirkulasi.isLocked,
          }
        : null,
    };
  }

  private async assertUserHasAccessToNaskah(
    naskahId: string,
    userPosition: string,
  ): Promise<void> {
    const access = await this.naskahSirkulasiRepository.findOne({
      where: {
        idNaskah: naskahId,
        position: String(userPosition),
      },
      select: { id: true },
    });

    if (!access) {
      // Cek juga apakah user adalah penerima share
      const [shareRows] = await this.dataSource.query(
        `SELECT 1 FROM naskah_share_recipient nsr
         JOIN naskah_share ns ON ns.id = nsr.share_id
         WHERE ns.naskah_id = ? AND nsr.recipient_id = ? AND ns.status = 'AKTIF'
         LIMIT 1`,
        [naskahId, String(userPosition)],
      );

      if (!shareRows || shareRows.length === 0) {
        throw new ForbiddenException('Anda tidak memiliki akses ke naskah ini');
      }
    }
  }
}
