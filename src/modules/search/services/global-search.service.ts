import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';
import {
  GlobalSearchDto,
  SearchResultItemDto,
  GlobalSearchResponseDto,
  DateWithinEnum,
  NaskahSourceEnum,
} from '../dto/global-search.dto';

// Label untuk source
const SOURCE_LABELS: Record<NaskahSourceEnum, string> = {
  [NaskahSourceEnum.INBOX]: 'Kotak Masuk',
  [NaskahSourceEnum.SENT]: 'Terkirim',
  [NaskahSourceEnum.DRAFT]: 'Draft',
  [NaskahSourceEnum.CC]: 'Tembusan',
};

/**
 * Service untuk Global Search
 * Mencari naskah di semua jenis (ND, SDI, SDE, DI, KA, K)
 */
@Injectable()
export class GlobalSearchService {
  constructor(
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepository: Repository<NaskahSirkulasi>,
  ) {}

  /**
   * Global Search - mencari naskah dengan berbagai filter
   */
  async search(
    dto: GlobalSearchDto,
    userPosition: string,
    userPersnum: number,
  ): Promise<GlobalSearchResponseDto> {
    const {
      keyword,
      perihal,
      hasWords,
      doesntHave,
      from,
      to,
      jenis,
      sifat,
      status,
      klasifikasi,
      dateFrom,
      dateTo,
      dateWithin,
      dateReference,
      nomor,
      hasAttachment,
      scope,
      areaFrom,
      subAreaFrom,
      organizationFrom,
      page = 1,
      limit = 20,
      sortBy = 'tanggal',
      sortOrder = 'DESC',
    } = dto;

    // Check if we need to join with sirkulasi table (for from/to/area filters)
    const needsSirkulasiJoin = !!(from || to || areaFrom || subAreaFrom || organizationFrom);

    // Build query
    const queryBuilder = this.naskahRepository.createQueryBuilder('naskah');
    
    // Only join sirkulasi if needed for filtering (from/to/area)
    if (needsSirkulasiJoin) {
      queryBuilder.leftJoin('naskah_sirkulasi', 'sirkulasi', 'sirkulasi.id_naskah = naskah.id');
    }

    // Track applied filters
    const appliedFilters: string[] = [];

    // Debug: log scope value
    console.log('[SEARCH] scope:', scope, 'userPosition:', userPosition, 'userPersnum:', userPersnum);

    // === FILTER DEFAULT: HANYA NASKAH YANG USER TERLIBAT ===
    // User hanya bisa melihat naskah dimana dia sebagai pengirim, penerima, atau tembusan
    // Default (tanpa scope atau scope='all'): tampilkan SEMUA naskah user
    // IMPORTANT: Use position (like inbox endpoint) and exclude draft/konsep entries
    // Inbox filter: is_draft=0 AND is_konsep=0 AND status IN ('final', 'final_tte')
    // Search filter: include all sirkulasi roles but exclude draft/konsep entries
    if (!scope || scope === 'all') {
      console.log('[SEARCH] Using default filter (all user naskah by position, exclude draft/konsep)');
      queryBuilder.andWhere(
        `EXISTS (
          SELECT 1 FROM naskah_sirkulasi ns_user 
          WHERE ns_user.id_naskah = naskah.id 
          AND ns_user.position = :userPosition
          AND (ns_user.is_draft = 0 OR ns_user.is_draft IS NULL)
          AND (ns_user.is_konsep = 0 OR ns_user.is_konsep IS NULL)
        )`,
        { userPosition },
      );
      // Also filter by naskah status (final or final_tte only, exclude draf)
      queryBuilder.andWhere('naskah.status IN (:...finalStatuses)', {
        finalStatuses: ['final', 'final_tte'],
      });
      appliedFilters.push('filter: semua naskah user (final only, exclude draft/konsep)');
    }

    // === KEYWORD SEARCH (global) ===
    if (keyword) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('naskah.perihal LIKE :keyword', { keyword: `%${keyword}%` })
            .orWhere('naskah.nomor LIKE :keyword', { keyword: `%${keyword}%` })
            .orWhere('naskah.klasifikasi LIKE :keyword', { keyword: `%${keyword}%` });
        }),
      );
      appliedFilters.push(`keyword: ${keyword}`);
    }

    // === PERIHAL SEARCH ===
    if (perihal) {
      queryBuilder.andWhere('naskah.perihal LIKE :perihal', {
        perihal: `%${perihal}%`,
      });
      appliedFilters.push(`perihal: ${perihal}`);
    }

    // === HAS WORDS ===
    if (hasWords) {
      const words = hasWords.split(' ').filter(Boolean);
      words.forEach((word, index) => {
        queryBuilder.andWhere(`naskah.perihal LIKE :word${index}`, {
          [`word${index}`]: `%${word}%`,
        });
      });
      appliedFilters.push(`hasWords: ${hasWords}`);
    }

    // === DOESN'T HAVE ===
    if (doesntHave) {
      const excludeWords = doesntHave.split(' ').filter(Boolean);
      excludeWords.forEach((word, index) => {
        queryBuilder.andWhere(`naskah.perihal NOT LIKE :exclude${index}`, {
          [`exclude${index}`]: `%${word}%`,
        });
      });
      appliedFilters.push(`doesntHave: ${doesntHave}`);
    }

    // === JENIS NASKAH ===
    if (jenis) {
      queryBuilder.andWhere('naskah.jenis = :jenis', { jenis });
      appliedFilters.push(`jenis: ${jenis}`);
    }

    // === SIFAT ===
    if (sifat) {
      queryBuilder.andWhere('naskah.sifat = :sifat', { sifat });
      appliedFilters.push(`sifat: ${sifat}`);
    }

    // === STATUS ===
    if (status) {
      queryBuilder.andWhere('naskah.status = :status', { status });
      appliedFilters.push(`status: ${status}`);
    }

    // === KLASIFIKASI ===
    if (klasifikasi) {
      queryBuilder.andWhere('naskah.klasifikasi LIKE :klasifikasi', {
        klasifikasi: `%${klasifikasi}%`,
      });
      appliedFilters.push(`klasifikasi: ${klasifikasi}`);
    }

    // === NOMOR ===
    if (nomor) {
      queryBuilder.andWhere('naskah.nomor LIKE :nomor', {
        nomor: `%${nomor}%`,
      });
      appliedFilters.push(`nomor: ${nomor}`);
    }

    // === DATE RANGE ===
    if (dateFrom) {
      queryBuilder.andWhere('naskah.tanggal >= :dateFrom', { dateFrom });
      appliedFilters.push(`dateFrom: ${dateFrom}`);
    }

    if (dateTo) {
      queryBuilder.andWhere('naskah.tanggal <= :dateTo', { dateTo });
      appliedFilters.push(`dateTo: ${dateTo}`);
    }

    // === DATE WITHIN ===
    if (dateWithin && dateReference) {
      const { startDate, endDate } = this.calculateDateRange(
        dateWithin,
        dateReference,
      );
      queryBuilder.andWhere('naskah.tanggal BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
      appliedFilters.push(`dateWithin: ${dateWithin} of ${dateReference}`);
    }

    // === FROM (PENGIRIM) ===
    if (from) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('sirkulasi.nama_sirkuler LIKE :from', { from: `%${from}%` })
            .orWhere('sirkulasi.position_text LIKE :from', { from: `%${from}%` })
            .orWhere('sirkulasi.organization_text LIKE :from', { from: `%${from}%` });
        }),
      );
      queryBuilder.andWhere('sirkulasi.sirkuler = :sirkulerPengirim', {
        sirkulerPengirim: 'pengirim',
      });
      appliedFilters.push(`from: ${from}`);
    }

    // === TO (PENERIMA) ===
    if (to) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('sirkulasi.nama_sirkuler LIKE :to', { to: `%${to}%` })
            .orWhere('sirkulasi.position_text LIKE :to', { to: `%${to}%` })
            .orWhere('sirkulasi.organization_text LIKE :to', { to: `%${to}%` });
        }),
      );
      queryBuilder.andWhere('sirkulasi.sirkuler IN (:...sirkulerPenerima)', {
        sirkulerPenerima: ['penerima', 'tembusan'],
      });
      appliedFilters.push(`to: ${to}`);
    }

    // === SCOPE ===
    // IMPORTANT: All scope filters use position (like inbox endpoint) instead of persnum
    if (scope) {
      switch (scope) {
        case 'inbox':
          // Naskah masuk: user sebagai penerima atau tembusan (exclude archived)
          queryBuilder.andWhere(
            `EXISTS (
              SELECT 1 FROM naskah_sirkulasi ns_inbox 
              WHERE ns_inbox.id_naskah = naskah.id 
              AND ns_inbox.position = :userPositionInbox
              AND ns_inbox.sirkuler IN ('penerima', 'tembusan')
              AND (ns_inbox.flag_arsip IS NULL OR ns_inbox.flag_arsip = 0)
            )`,
            { userPositionInbox: userPosition },
          );
          break;
        case 'sent':
          // Naskah keluar: user sebagai pengirim (exclude archived)
          queryBuilder.andWhere(
            `EXISTS (
              SELECT 1 FROM naskah_sirkulasi ns_sent 
              WHERE ns_sent.id_naskah = naskah.id 
              AND ns_sent.position = :userPositionSent
              AND ns_sent.sirkuler = 'pengirim'
              AND (ns_sent.flag_arsip IS NULL OR ns_sent.flag_arsip = 0)
            )`,
            { userPositionSent: userPosition },
          );
          break;
        case 'draft':
          // Draft naskah user (exclude archived)
          queryBuilder.andWhere('naskah.status = :draftStatus', {
            draftStatus: 'draf',
          });
          queryBuilder.andWhere(
            `EXISTS (
              SELECT 1 FROM naskah_sirkulasi ns_draft 
              WHERE ns_draft.id_naskah = naskah.id 
              AND ns_draft.position = :userPositionDraft
              AND (ns_draft.flag_arsip IS NULL OR ns_draft.flag_arsip = 0)
            )`,
            { userPositionDraft: userPosition },
          );
          break;
        case 'archived':
          // Naskah yang diarsipkan oleh user
          queryBuilder.andWhere(
            `EXISTS (
              SELECT 1 FROM naskah_sirkulasi ns_arch 
              WHERE ns_arch.id_naskah = naskah.id 
              AND ns_arch.position = :userPositionArch
              AND ns_arch.flag_arsip = 1
            )`,
            { userPositionArch: userPosition },
          );
          break;
        case 'favorite':
          // Naskah favorit user (could be archived or not)
          queryBuilder.andWhere(
            `EXISTS (
              SELECT 1 FROM naskah_sirkulasi ns_fav 
              WHERE ns_fav.id_naskah = naskah.id 
              AND ns_fav.position = :userPositionFav
              AND ns_fav.flag_favorit = 1
            )`,
            { userPositionFav: userPosition },
          );
          break;
        case 'active':
          // Naskah aktif (inbox + sent + draft) exclude archived
          queryBuilder.andWhere(
            `EXISTS (
              SELECT 1 FROM naskah_sirkulasi ns_active 
              WHERE ns_active.id_naskah = naskah.id 
              AND ns_active.position = :userPositionActive
              AND (ns_active.flag_arsip IS NULL OR ns_active.flag_arsip = 0)
            )`,
            { userPositionActive: userPosition },
          );
          break;
      }
      appliedFilters.push(`scope: ${scope}`);
    }

    // === HAS ATTACHMENT ===
    if (hasAttachment === true) {
      queryBuilder.andWhere('naskah.lampiran IS NOT NULL');
      queryBuilder.andWhere("naskah.lampiran != ''");
      appliedFilters.push('hasAttachment: true');
    }

    // === ORGANIZATION FROM ===
    if (areaFrom) {
      queryBuilder.andWhere('sirkulasi.area_text LIKE :areaFrom', {
        areaFrom: `%${areaFrom}%`,
      });
      queryBuilder.andWhere('sirkulasi.sirkuler = :areaFromSirkuler', {
        areaFromSirkuler: 'pengirim',
      });
      appliedFilters.push(`areaFrom: ${areaFrom}`);
    }

    if (subAreaFrom) {
      queryBuilder.andWhere('sirkulasi.sub_area_text LIKE :subAreaFrom', {
        subAreaFrom: `%${subAreaFrom}%`,
      });
      appliedFilters.push(`subAreaFrom: ${subAreaFrom}`);
    }

    if (organizationFrom) {
      queryBuilder.andWhere('sirkulasi.organization_text LIKE :organizationFrom', {
        organizationFrom: `%${organizationFrom}%`,
      });
      appliedFilters.push(`organizationFrom: ${organizationFrom}`);
    }

    // === DISTINCT (hanya jika join dengan sirkulasi untuk menghindari duplicate) ===
    if (needsSirkulasiJoin) {
      queryBuilder.distinct(true);
    }

    // === SORTING ===
    const sortField = this.getSortField(sortBy);
    queryBuilder.orderBy(sortField, sortOrder);

    // === COUNT - hitung total sebelum pagination ===
    // Clone query builder untuk count (tanpa pagination)
    const countQuery = queryBuilder.clone();
    let total: number;
    
    if (needsSirkulasiJoin) {
      // Jika ada JOIN, gunakan COUNT DISTINCT untuk akurasi
      const countResult = await countQuery
        .select('COUNT(DISTINCT naskah.id)', 'total')
        .getRawOne();
      total = parseInt(countResult?.total || '0', 10);
      console.log('[SEARCH] COUNT with JOIN:', total);
    } else {
      // Jika tidak ada JOIN, gunakan getCount() biasa (lebih cepat)
      total = await countQuery.getCount();
      console.log('[SEARCH] COUNT without JOIN:', total);
    }

    console.log('[SEARCH] Applied filters:', appliedFilters);

    // === PAGINATION ===
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    // Execute query untuk data
    const results = await queryBuilder.getMany();

    // Transform results with user context for source determination
    // Use position (like inbox) instead of persnum
    const items = await this.transformResults(results, userPosition);

    return {
      success: true,
      message: `Ditemukan ${total} naskah`,
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        filters: {
          applied: appliedFilters,
          keyword,
        },
      },
    };
  }

  /**
   * Calculate date range based on dateWithin
   */
  private calculateDateRange(
    dateWithin: DateWithinEnum,
    dateReference: string,
  ): { startDate: string; endDate: string } {
    const refDate = new Date(dateReference);
    let days = 0;

    switch (dateWithin) {
      case DateWithinEnum.ONE_DAY:
        days = 1;
        break;
      case DateWithinEnum.THREE_DAYS:
        days = 3;
        break;
      case DateWithinEnum.ONE_WEEK:
        days = 7;
        break;
      case DateWithinEnum.TWO_WEEKS:
        days = 14;
        break;
      case DateWithinEnum.ONE_MONTH:
        days = 30;
        break;
      case DateWithinEnum.TWO_MONTHS:
        days = 60;
        break;
      case DateWithinEnum.SIX_MONTHS:
        days = 180;
        break;
      case DateWithinEnum.ONE_YEAR:
        days = 365;
        break;
    }

    const startDate = new Date(refDate);
    startDate.setDate(startDate.getDate() - days);

    const endDate = new Date(refDate);
    endDate.setDate(endDate.getDate() + days);

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    };
  }

  /**
   * Get sort field mapping
   */
  private getSortField(sortBy: string): string {
    const sortFields: Record<string, string> = {
      tanggal: 'naskah.tanggal',
      nomor: 'naskah.nomor',
      perihal: 'naskah.perihal',
      jenis: 'naskah.jenis',
      created: 'naskah.createdAt',
    };
    return sortFields[sortBy] || 'naskah.tanggal';
  }

  /**
   * Transform entity results to DTO
   * Since NaskahEntity doesn't have relations, we fetch sirkulasi separately
   */
  private async transformResults(
    results: NaskahEntity[],
    userPosition: string,
  ): Promise<SearchResultItemDto[]> {
    // Get all naskah IDs
    const naskahIds = results.map((n) => n.id);
    
    if (naskahIds.length === 0) {
      return [];
    }

    // Fetch sirkulasi for all naskah
    const sirkulasiList = await this.naskahSirkulasiRepository
      .createQueryBuilder('sirkulasi')
      .where('sirkulasi.id_naskah IN (:...naskahIds)', { naskahIds })
      .getMany();

    // Group sirkulasi by naskah id
    const sirkulasiByNaskah = new Map<string, NaskahSirkulasi[]>();
    sirkulasiList.forEach((s) => {
      if (s.idNaskah) {
        const list = sirkulasiByNaskah.get(s.idNaskah) || [];
        list.push(s);
        sirkulasiByNaskah.set(s.idNaskah, list);
      }
    });

    return results.map((naskah) => {
      const sirkulasi = sirkulasiByNaskah.get(naskah.id) || [];
      
      // Get pengirim from sirkulasi (sirkuler = 'pengirim')
      const pengirimSirkulasi = sirkulasi.find(
        (s) => s.sirkuler === 'pengirim',
      );

      // Get penerima list (sirkuler = 'penerima' or 'tembusan')
      const penerimaList = sirkulasi
        .filter((s) => ['penerima', 'tembusan'].includes(s.sirkuler || ''))
        .map((s) => ({
          nama: s.namaSirkuler,
          jabatan: s.positionText,
          organization: s.organizationText,
        }));

      // Check if has lampiran
      const hasLampiran = !!(naskah.lampiran && naskah.lampiran.trim() !== '');

      // Determine user's roles and source in this naskah
      // Use position (like inbox) instead of persnum
      const userSirkulasiRecords = sirkulasi.filter(
        (s) => s.position === userPosition,
      );
      
      // Get user's roles (pengirim, penerima, tembusan)
      type RoleType = 'pengirim' | 'penerima' | 'tembusan';
      const validRoles: RoleType[] = ['pengirim', 'penerima', 'tembusan'];
      const userRoles: RoleType[] = userSirkulasiRecords
        .map((s) => s.sirkuler)
        .filter((role): role is RoleType => validRoles.includes(role as RoleType));

      // Get user's main sirkulasi record for flags
      const userMainSirkulasi = userSirkulasiRecords[0];

      // Determine source based on user's role and naskah status
      let source: NaskahSourceEnum;
      if (naskah.status === 'draf') {
        source = NaskahSourceEnum.DRAFT;
      } else if (userRoles.includes('pengirim')) {
        source = NaskahSourceEnum.SENT;
      } else if (userRoles.includes('tembusan')) {
        source = NaskahSourceEnum.CC;
      } else if (userRoles.includes('penerima')) {
        source = NaskahSourceEnum.INBOX;
      } else {
        // Fallback - shouldn't happen if user filter works correctly
        source = NaskahSourceEnum.INBOX;
      }

      // Determine flags from user's sirkulasi record
      const isRead = userMainSirkulasi?.sendReadTime !== null && userMainSirkulasi?.sendReadTime !== undefined;
      const isArchived = userMainSirkulasi?.flagArsip === 1;
      const isFavorite = userMainSirkulasi?.flagFavorit === 1;

      return {
        id: naskah.id,
        jenis: naskah.jenis,
        jenisText: this.getJenisText(naskah.jenis),
        nomor: naskah.nomor,
        tanggal: naskah.tanggal,
        perihal: naskah.perihal,
        sifat: naskah.sifat,
        status: naskah.status,
        klasifikasi: naskah.klasifikasi,
        klasifikasiText: naskah.klasifikasi,
        pengirim: {
          nama: pengirimSirkulasi?.namaSirkuler || null,
          jabatan: pengirimSirkulasi?.positionText || null,
          organization: pengirimSirkulasi?.organizationText || null,
          area: pengirimSirkulasi?.areaText || null,
        },
        penerima: penerimaList,
        lampiranCount: hasLampiran ? 1 : 0,
        hasAttachment: hasLampiran,
        finalPdf: naskah.final_pdf,
        createdAt: naskah.createdAt,
        // New source fields
        source: source,
        sourceLabel: SOURCE_LABELS[source],
        userRoles: userRoles,
        isRead: isRead,
        isArchived: isArchived,
        isFavorite: isFavorite,
      };
    });
  }

  /**
   * Get jenis text
   */
  private getJenisText(jenis: string): string {
    const jenisMap: Record<string, string> = {
      ND: 'Nota Dinas',
      SDI: 'Surat Dinas Internal',
      SDE: 'Surat Dinas Eksternal',
      DI: 'Disposisi Internal',
      KA: 'Kajian',
      K: 'Konsep',
    };
    return jenisMap[jenis] || jenis;
  }
}
