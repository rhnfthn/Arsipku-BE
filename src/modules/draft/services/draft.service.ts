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
import { GrupPenerimaService } from '../../grup-penerima/services/grup_penerima.service';
import { OrgDataService } from 'src/modules/master-data/org_data/org_data.service';
import {
  GetDraftListResponseDto,
  DraftListItemDto,
  GetDraftDetailResponseDto,
  DraftDetailDataDto,
  DraftDetailPenerimaDto,
  DraftDetailGrupPenerimaDto,
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

interface OrgPositionLite {
  position: number;
  persnum_person_text?: string | null;
}

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
    private readonly grupPenerimaService: GrupPenerimaService,
    private readonly orgDataService: OrgDataService,
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
    favorite?: boolean,
    lock?: boolean,
    note?: boolean,
    arsip?: boolean,
    priority?: boolean,
    search?: string,
    days?: number, // DEPRECATED: use startDate/endDate/preset instead
    startDate?: string, // Format: YYYY-MM-DD
    endDate?: string, // Format: YYYY-MM-DD
    preset?: '7_hari' | '30_hari' | '60_hari' | '1_tahun' | 'semua',
    sort: 'terbaru' | 'terlama' = 'terbaru',
    page: number = 1,
    limit: number = 10,
  ): Promise<GetDraftListResponseDto> {
    // Calculate date range
    const dateRange = this.getDateRangeFromQuery(startDate, endDate, preset, days);

    // Step 2: Build base query for naskah
    const baseQueryBuilder = this.naskahRepository
      .createQueryBuilder('naskah')
      .where('1 = 1')
      .andWhere('naskah.status = :status', { status: 'draf' });

    // Ownership rule:
    // - Primary: creator ownership via naskah.created_by_position
    // - Fallback legacy: if created_by_position is NULL, use pengirim sirkulasi position
    baseQueryBuilder.andWhere(
      `(
        naskah.created_by_position = :position
        OR (
          naskah.created_by_position IS NULL
          AND EXISTS (
            SELECT 1
            FROM naskah_sirkulasi ns_owner
            WHERE ns_owner.id_naskah = naskah.id
              AND ns_owner.sirkuler = 'pengirim'
              AND ns_owner.position = :position
          )
        )
      )`,
      { position: String(positionId) },
    );

    if (favorite === true) {
      baseQueryBuilder.andWhere(
        `EXISTS (
          SELECT 1
          FROM naskah_sirkulasi ns_fav
          WHERE ns_fav.id_naskah = naskah.id
            AND ns_fav.sirkuler = 'pengirim'
            AND ns_fav.position = :position
            AND ns_fav.flag_favorit = 1
        )`,
      );
    }

    if (lock === true) {
      baseQueryBuilder.andWhere(
        `EXISTS (
          SELECT 1
          FROM naskah_sirkulasi ns_lock
          WHERE ns_lock.id_naskah = naskah.id
            AND ns_lock.sirkuler = 'pengirim'
            AND ns_lock.position = :position
            AND ns_lock.is_locked = 1
        )`,
      );
    }

    if (note === true) {
      baseQueryBuilder.andWhere(
        `EXISTS (
          SELECT 1
          FROM naskah_sirkulasi ns_note
          WHERE ns_note.id_naskah = naskah.id
            AND ns_note.sirkuler = 'pengirim'
            AND ns_note.position = :position
            AND ns_note.flag_note = 1
        )`,
      );
    }

    if (arsip === true) {
      baseQueryBuilder.andWhere(
        `EXISTS (
          SELECT 1
          FROM naskah_sirkulasi ns_arsip_true
          WHERE ns_arsip_true.id_naskah = naskah.id
            AND ns_arsip_true.sirkuler = 'pengirim'
            AND ns_arsip_true.position = :position
            AND ns_arsip_true.flag_arsip = 1
        )`,
      );
    } else {
      // Default: show non-archived items for the user.
      // If user has no sender-row (owner-based flow), keep it visible.
      baseQueryBuilder.andWhere(
        `(
          NOT EXISTS (
            SELECT 1
            FROM naskah_sirkulasi ns_arsip_any
            WHERE ns_arsip_any.id_naskah = naskah.id
              AND ns_arsip_any.sirkuler = 'pengirim'
              AND ns_arsip_any.position = :position
          )
          OR EXISTS (
            SELECT 1
            FROM naskah_sirkulasi ns_arsip_false
            WHERE ns_arsip_false.id_naskah = naskah.id
              AND ns_arsip_false.sirkuler = 'pengirim'
              AND ns_arsip_false.position = :position
              AND ns_arsip_false.flag_arsip = 0
          )
        )`,
      );
    }

    // Apply date range filter
    if (dateRange.startDate) {
      baseQueryBuilder.andWhere('DATE(naskah.tanggal) >= :startDate', { startDate: dateRange.startDate });
    }
    if (dateRange.endDate) {
      baseQueryBuilder.andWhere('DATE(naskah.tanggal) <= :endDate', { endDate: dateRange.endDate });
    }

    if (priority === true) {
      baseQueryBuilder.andWhere(`naskah.jenis = 'DI'`);
      baseQueryBuilder.andWhere(
        `EXISTS (SELECT 1 FROM di WHERE di.id_naskah = naskah.id AND di.is_priority = 1)`,
      );
    }

    // Search by perihal or nomor
    if (search) {
      baseQueryBuilder.andWhere(
        '(naskah.perihal LIKE :search OR naskah.nomor LIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Summary follows all non-jenis filters so total_per_jenis stays informative
    const summaryRaw = await baseQueryBuilder
      .clone()
      .select('COUNT(*)', 'total_semua')
      .addSelect(`SUM(CASE WHEN naskah.jenis = 'ND' THEN 1 ELSE 0 END)`, 'total_nd')
      .addSelect(`SUM(CASE WHEN naskah.jenis = 'SDI' THEN 1 ELSE 0 END)`, 'total_sdi')
      .addSelect(`SUM(CASE WHEN naskah.jenis = 'SDE' THEN 1 ELSE 0 END)`, 'total_sde')
      .addSelect(`SUM(CASE WHEN naskah.jenis = 'DI' THEN 1 ELSE 0 END)`, 'total_di')
      .addSelect(`SUM(CASE WHEN naskah.jenis = 'KA' THEN 1 ELSE 0 END)`, 'total_ka')
      .addSelect(`SUM(CASE WHEN naskah.jenis = 'K' THEN 1 ELSE 0 END)`, 'total_k')
      .getRawOne();

    const summary = {
      total_semua: parseInt(summaryRaw?.total_semua || '0', 10),
      total_per_jenis: {
        ND: parseInt(summaryRaw?.total_nd || '0', 10),
        SDI: parseInt(summaryRaw?.total_sdi || '0', 10),
        SDE: parseInt(summaryRaw?.total_sde || '0', 10),
        DI: parseInt(summaryRaw?.total_di || '0', 10),
        KA: parseInt(summaryRaw?.total_ka || '0', 10),
        K: parseInt(summaryRaw?.total_k || '0', 10),
      },
    };

    // List/pagination can still be narrowed by jenis
    const queryBuilder = baseQueryBuilder.clone();
    if (jenis) {
      queryBuilder.andWhere('naskah.jenis = :jenis', { jenis });
    }

    const sortDirection = sort === 'terlama' ? 'ASC' : 'DESC';
    // Samakan logic sort dengan inbox: gunakan timestamp pengirim naskah_sirkulasi.
    const draftDisplayCreatedAtExpr = `COALESCE((SELECT p.created_at FROM naskah_sirkulasi p WHERE p.id_naskah = naskah.id AND p.sirkuler = 'pengirim' AND p.position = :sortPosition LIMIT 1), naskah.tanggal)`;
    queryBuilder
      .setParameter('sortPosition', String(positionId))
      .orderBy(draftDisplayCreatedAtExpr, sortDirection as 'ASC' | 'DESC')
      .addOrderBy('naskah.id', sortDirection as 'ASC' | 'DESC');

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

    const orgDate = dateRange.endDate || new Date().toISOString().split('T')[0];
    const orgData = await this.orgDataService.findOrg(orgDate);
    const orgPositionMap = new Map<number, string | null>();
    if (orgData?.position_json) {
      for (const pos of orgData.position_json as OrgPositionLite[]) {
        orgPositionMap.set(Number(pos.position), pos.persnum_person_text || null);
      }
    }

    // ============================================================
    // BULK FETCH (eliminasi N+1)
    // ============================================================
    if (naskahIds.length > 0) {
      // 1. Bulk pengirim sirkulasi (per naskah, position user)
      const pengirimSirkulasiList = await this.naskahSirkulasiRepository.find({
        where: {
          idNaskah: In(naskahIds),
          sirkuler: 'pengirim',
          position: String(positionId),
        },
      });
      const pengirimSirkMap = new Map<string, (typeof pengirimSirkulasiList)[number]>();
      for (const p of pengirimSirkulasiList) {
        if (p.idNaskah) pengirimSirkMap.set(p.idNaskah, p);
      }

      // 2. Bulk semua penerima sirkulasi
      const allPenerima = await this.naskahSirkulasiRepository.find({
        where: {
          idNaskah: In(naskahIds),
          sirkuler: 'penerima',
        },
      });
      // Group by idNaskah
      const penerimaByNaskah = new Map<string, typeof allPenerima>();
      for (const p of allPenerima) {
        if (!p.idNaskah) continue;
        if (!penerimaByNaskah.has(p.idNaskah)) {
          penerimaByNaskah.set(p.idNaskah, []);
        }
        penerimaByNaskah.get(p.idNaskah)!.push(p);
      }

      // 3. Bulk fetch eksternal untuk SDE penerima
      const sdeNaskahIds = naskahs.filter((n) => n.jenis === 'SDE').map((n) => n.id);
      const eksternalIdSet = new Set<string>();
      for (const naskahId of sdeNaskahIds) {
        const list = penerimaByNaskah.get(naskahId) || [];
        for (const p of list) {
          if (p.idSirkuler) eksternalIdSet.add(p.idSirkuler);
        }
      }
      const eksternalMap = new Map<string, any>();
      if (eksternalIdSet.size > 0) {
        const eksternalList = await this.eksternalRepository.find({
          where: { id: In(Array.from(eksternalIdSet)) },
        });
        for (const e of eksternalList) {
          eksternalMap.set(e.id, e);
        }
      }

      // ============================================================
      // BUILD RESPONSE ITEMS (no N+1)
      // ============================================================
      for (const naskah of naskahs) {
        const pengirimSirkulasi = pengirimSirkMap.get(naskah.id);

        let penerima: any[] = [];
        const penerimaList = penerimaByNaskah.get(naskah.id) || [];

        if (naskah.jenis === 'SDE') {
          for (const p of penerimaList) {
            const eksternalId = p.idSirkuler || null;
            const eksternalData = eksternalId ? eksternalMap.get(eksternalId) : null;

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
            } else if (eksternalId) {
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
            } else {
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
        } else {
          // ND, SDI, DI, KA
          penerima = penerimaList.map((p) => ({
            position_id: Number(p.position),
            position_text: p.positionText || '',
            nama: p.namaSirkuler || '',
            organization_text: p.organizationText || '',
          }));
        }

        // Tanggal — fallback chain
        const tanggal = pengirimSirkulasi?.updatedAt
          ? new Date(pengirimSirkulasi.updatedAt)
          : pengirimSirkulasi?.createdAt
            ? new Date(pengirimSirkulasi.createdAt)
            : new Date(naskah.tanggal);

        const waktuUTC = `${String(tanggal.getUTCHours()).padStart(2, '0')}:${String(tanggal.getUTCMinutes()).padStart(2, '0')}`;

        const isDraftKonsep =
          ['ND', 'SDI', 'SDE'].includes(naskah.jenis) && naskah.nomor === '-';
        const konseptorPositionId = naskah.createdByPosition
          ? Number(naskah.createdByPosition)
          : null;
        const namaKonseptor =
          konseptorPositionId !== null
            ? orgPositionMap.get(konseptorPositionId) || null
            : null;

        items.push({
          id_naskah: naskah.id,
          id_sirkulasi: pengirimSirkulasi?.id || null,
          jenis: naskah.jenis,
          jenis_text: JENIS_TEXT_MAP[naskah.jenis] || naskah.jenis,
          penanda_konsep: isDraftKonsep,
          konseptor_position_id: konseptorPositionId,
          nama_konseptor: namaKonseptor,
          asal_draft: isDraftKonsep ? 'konsep' : 'naskah',
          is_draft_konsep: isDraftKonsep,
          penerima: penerima,
          penerima_count: penerima.length,
          isi_pesan: naskah.perihal || naskah.konten?.substring(0, 100) || '-',
          tanggal: tanggal,
          waktu: waktuUTC,
          labels: labelsMap.get(naskah.id) || [],
        });
      }
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
      summary,
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

    // Get grouped recipient metadata (for prefill tulis surat seperti ND)
    const penerimaGrupIds = Array.from(
      new Set(
        penerimaList
          .filter((p) => p.idGrupPenerima)
          .map((p) => p.idGrupPenerima as string),
      ),
    );
    const penerima_grup: DraftDetailGrupPenerimaDto[] =
      await this.grupPenerimaService.getGrupInfoForResponse(penerimaGrupIds);

    // Get tembusan (for ND)
    let tembusan: DraftDetailPenerimaDto[] | undefined;
    let tembusan_grup: DraftDetailGrupPenerimaDto[] | undefined;
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

        const tembusanGrupIds = Array.from(
          new Set(
            tembusanList
              .filter((t) => t.idGrupPenerima)
              .map((t) => t.idGrupPenerima as string),
          ),
        );
        tembusan_grup = await this.grupPenerimaService.getGrupInfoForResponse(
          tembusanGrupIds,
        );
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
      penerima_grup,
      tembusan,
      tembusan_grup,
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
