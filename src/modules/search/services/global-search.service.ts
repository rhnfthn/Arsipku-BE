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
} from '../dto/global-search.dto';

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

    // Build query - use left join manually since NaskahEntity doesn't have relations
    const queryBuilder = this.naskahRepository
      .createQueryBuilder('naskah')
      .leftJoin('naskah_sirkulasi', 'sirkulasi', 'sirkulasi.id_naskah = naskah.id');

    // Track applied filters
    const appliedFilters: string[] = [];

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
    if (scope) {
      switch (scope) {
        case 'inbox':
          // Naskah masuk: user sebagai penerima
          queryBuilder.andWhere('sirkulasi.id_sirkuler = :userPersnum', {
            userPersnum: userPersnum.toString(),
          });
          queryBuilder.andWhere('sirkulasi.sirkuler IN (:...inboxSirkuler)', {
            inboxSirkuler: ['penerima', 'tembusan'],
          });
          break;
        case 'sent':
          // Naskah keluar: user sebagai pengirim
          queryBuilder.andWhere('sirkulasi.id_sirkuler = :userPersnum', {
            userPersnum: userPersnum.toString(),
          });
          queryBuilder.andWhere('sirkulasi.sirkuler = :sentSirkuler', {
            sentSirkuler: 'pengirim',
          });
          break;
        case 'draft':
          queryBuilder.andWhere('naskah.status = :draftStatus', {
            draftStatus: 'draf',
          });
          break;
        case 'archived':
          queryBuilder.andWhere('sirkulasi.flag_arsip = :flagArsip', {
            flagArsip: 1,
          });
          break;
        case 'favorite':
          queryBuilder.andWhere('sirkulasi.flag_favorit = :flagFavorit', {
            flagFavorit: 1,
          });
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

    // === DISTINCT (karena join dengan sirkulasi bisa duplicate) ===
    queryBuilder.distinct(true);

    // === SORTING ===
    const sortField = this.getSortField(sortBy);
    queryBuilder.orderBy(sortField, sortOrder);

    // === PAGINATION ===
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    // Execute query
    const [results, total] = await queryBuilder.getManyAndCount();

    // Transform results
    const items = await this.transformResults(results);

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
