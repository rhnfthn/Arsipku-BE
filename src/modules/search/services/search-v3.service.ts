import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Brackets } from 'typeorm';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';
import { LabelEntity, NaskahLabelEntity } from '../../label/entities';
import {
  GlobalSearchDto,
  DateWithinEnum,
  NaskahSourceEnum,
  KategoriEnum,
  SearchScopeEnum,
} from '../dto/global-search.dto';
import {
  SearchV3ResponseDto,
  SearchV3ResultItemDto,
  FacetsDto,
} from '../dto/search-v3.dto';
import {
  SearchSuggestionDto,
  SearchSuggestionResponseDto,
  SuggestionItemDto,
  SuggestionTypeEnum,
} from '../dto/search-suggestion.dto';

// Label mappings
const SOURCE_LABELS: Record<NaskahSourceEnum, string> = {
  [NaskahSourceEnum.INBOX]: 'Kotak Masuk',
  [NaskahSourceEnum.SENT]: 'Terkirim',
  [NaskahSourceEnum.DRAFT]: 'Draft',
  [NaskahSourceEnum.CC]: 'Tembusan',
};

const JENIS_LABELS: Record<string, string> = {
  ND: 'Nota Dinas',
  SDI: 'Surat Dinas Internal',
  SDE: 'Surat Dinas Eksternal',
  DI: 'Disposisi Internal',
  KA: 'Kajian',
  K: 'Konsep',
};

/**
 * Search V3 Service
 *
 * SQL-only search with Meilisearch-like features:
 * - N-gram FULLTEXT for typo tolerance
 * - Relevance ranking
 * - Highlighting
 * - Faceted search
 */
@Injectable()
export class SearchV3Service {
  private readonly logger = new Logger(SearchV3Service.name);

  constructor(
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
    @InjectRepository(NaskahSirkulasi)
    private readonly sirkulasiRepository: Repository<NaskahSirkulasi>,
    @InjectRepository(LabelEntity)
    private readonly labelRepository: Repository<LabelEntity>,
    @InjectRepository(NaskahLabelEntity)
    private readonly naskahLabelRepository: Repository<NaskahLabelEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Main search method
   */
  async search(
    dto: GlobalSearchDto,
    userPosition: string,
    userPersnum: number,
  ): Promise<SearchV3ResponseDto> {
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
      label,
      isRead,
      kategori,
      page = 1,
      limit = 20,
      sortBy = 'created',
      sortOrder = 'DESC',
    } = dto;

    const appliedFilters: string[] = [];
    const params: any[] = [];
    let paramIndex = 0;
    const isDraftSearch = status === 'draf' || scope === SearchScopeEnum.DRAFT;
    const isPendingSearch = scope === SearchScopeEnum.PENDING;

    // Build WHERE clauses
    const whereClauses: string[] = [];

    // === BASE FILTER: User access (position-based) ===
    whereClauses.push(`s.position = ?`);
    params.push(userPosition);
    paramIndex++;

    // Exclude drafts and konsep by default, but allow them when explicitly searching drafts or pending.
    // For inbox/sent scope, allow konsep with jenis='K' (matches /naskah_sirkulasi/inbox behavior).
    if (!isDraftSearch && !isPendingSearch) {
      whereClauses.push(`(s.is_draft = 0 OR s.is_draft IS NULL)`);
      if (scope === SearchScopeEnum.INBOX || scope === SearchScopeEnum.SENT) {
        whereClauses.push(
          `(s.is_konsep = 0 OR s.is_konsep IS NULL OR n.jenis = 'K')`,
        );
      } else {
        whereClauses.push(`(s.is_konsep = 0 OR s.is_konsep IS NULL)`);
      }
    }

    // === SCOPE FILTER ===
    if (!scope || scope === 'all' || scope === 'active') {
      // Default scope shows final documents, unless user explicitly requests draft status.
      if (!isDraftSearch) {
        whereClauses.push(`n.status IN ('final', 'final_tte')`);
      } else {
        // Align draft search behavior with /draft/list:
        // only drafts owned by the user as pengirim and exclude archived by default.
        whereClauses.push(`s.sirkuler = 'pengirim'`);
        whereClauses.push(`(s.flag_arsip IS NULL OR s.flag_arsip = 0)`);
      }
      if (scope === 'active') {
        whereClauses.push(`(s.flag_arsip IS NULL OR s.flag_arsip = 0)`);
      }
      appliedFilters.push(`scope: ${scope || 'all'}`);
    } else {
      switch (scope) {
        case 'inbox':
          whereClauses.push(`s.sirkuler IN ('penerima', 'tembusan')`);
          whereClauses.push(`n.status IN ('final', 'final_tte')`);
          whereClauses.push(`(s.flag_arsip IS NULL OR s.flag_arsip = 0)`);
          // Konsep workflow: only show latest konsep per naskah_asli
          // (matches /naskah_sirkulasi/inbox behavior)
          whereClauses.push(`(
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
                            AND COALESCE(n2.id_naskah_asli, n2.id) = COALESCE(n.id_naskah_asli, n.id)
                            ORDER BY s2.created_at DESC, s2.id DESC
                            LIMIT 1
                        )
                    )`);
          break;
        case 'sent':
          whereClauses.push(`s.sirkuler = 'pengirim'`);
          whereClauses.push(`n.status IN ('final', 'final_tte')`);
          whereClauses.push(`(s.flag_arsip IS NULL OR s.flag_arsip = 0)`);
          // Konsep workflow: only show latest konsep per naskah_asli
          // (matches /naskah_sirkulasi/sent behavior)
          whereClauses.push(`(
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
                            AND COALESCE(n2.id_naskah_asli, n2.id) = COALESCE(n.id_naskah_asli, n.id)
                            ORDER BY s2.created_at DESC, s2.id DESC
                            LIMIT 1
                        )
                    )`);
          break;
        case 'draft':
          whereClauses.push(`s.sirkuler = 'pengirim'`);
          whereClauses.push(`n.status = 'draf'`);
          whereClauses.push(`(s.flag_arsip IS NULL OR s.flag_arsip = 0)`);
          break;
        case 'archived':
          whereClauses.push(`s.flag_arsip = 1`);
          break;
        case 'favorite':
          whereClauses.push(`s.flag_favorit = 1`);
          break;
        case 'priority':
          // Disposisi prioritas: jenis=DI dan is_priority=1 dari tabel di
          whereClauses.push(`n.jenis = 'DI'`);
          whereClauses.push(
            `EXISTS (SELECT 1 FROM di WHERE di.id_naskah = n.id AND di.is_priority = 1)`,
          );
          whereClauses.push(`n.status IN ('final', 'final_tte')`);
          whereClauses.push(`(s.flag_arsip IS NULL OR s.flag_arsip = 0)`);
          break;
        case 'pending':
          // Naskah tertunda: menunggu TTD basah (status=pending)
          // Konsisten dengan endpoint naskah_sirkulasi/tertunda
          whereClauses.push(`s.sirkuler = 'pengirim'`);
          whereClauses.push(`s.is_draft = 1`);
          whereClauses.push(`n.status = 'pending'`);
          break;
      }
      appliedFilters.push(`scope: ${scope}`);
    }

    // Save the base access/scope filter set for facets before adding extra user filters.
    const facetBaseWhereClauses = [...whereClauses];
    const facetBaseParams = [...params];

    // === KEYWORD SEARCH (N-gram FULLTEXT or LIKE fallback) ===
    let relevanceSelect = '0 AS relevance_score';
    let relevanceParams: any[] = [];
    if (keyword) {
      // Try FULLTEXT first, fallback to LIKE
      whereClauses.push(`(
        n.perihal LIKE ? OR 
        n.nomor LIKE ? OR 
        n.klasifikasi LIKE ?
      )`);
      const keywordPattern = `%${keyword}%`;
      params.push(keywordPattern, keywordPattern, keywordPattern);

      // Calculate relevance score based on match position (params separate from WHERE)
      relevanceSelect = `
        CASE 
          WHEN n.perihal LIKE ? THEN 100
          WHEN n.nomor LIKE ? THEN 90
          WHEN n.klasifikasi LIKE ? THEN 80
          ELSE 50
        END AS relevance_score
      `;
      relevanceParams = [`${keyword}%`, `${keyword}%`, `${keyword}%`];

      appliedFilters.push(`keyword: ${keyword}`);
    }

    // === PERIHAL FILTER ===
    if (perihal) {
      whereClauses.push(`n.perihal LIKE ?`);
      params.push(`%${perihal}%`);
      appliedFilters.push(`perihal: ${perihal}`);
    }

    // === HAS WORDS ===
    if (hasWords) {
      const words = hasWords.split(' ').filter(Boolean);
      words.forEach((word) => {
        whereClauses.push(`n.perihal LIKE ?`);
        params.push(`%${word}%`);
      });
      appliedFilters.push(`hasWords: ${hasWords}`);
    }

    // === DOESN'T HAVE ===
    if (doesntHave) {
      const excludeWords = doesntHave.split(' ').filter(Boolean);
      excludeWords.forEach((word) => {
        whereClauses.push(`n.perihal NOT LIKE ?`);
        params.push(`%${word}%`);
      });
      appliedFilters.push(`doesntHave: ${doesntHave}`);
    }

    // === JENIS FILTER ===
    if (jenis) {
      whereClauses.push(`n.jenis = ?`);
      params.push(jenis);
      appliedFilters.push(`jenis: ${jenis}`);
    }

    // === SIFAT FILTER ===
    if (sifat) {
      whereClauses.push(`n.sifat = ?`);
      params.push(sifat);
      appliedFilters.push(`sifat: ${sifat}`);
    }

    // === STATUS FILTER ===
    if (status) {
      whereClauses.push(`n.status = ?`);
      params.push(status);
      appliedFilters.push(`status: ${status}`);
    }

    // === KLASIFIKASI FILTER ===
    if (klasifikasi) {
      whereClauses.push(`n.klasifikasi LIKE ?`);
      params.push(`%${klasifikasi}%`);
      appliedFilters.push(`klasifikasi: ${klasifikasi}`);
    }

    // === NOMOR FILTER ===
    if (nomor) {
      whereClauses.push(`n.nomor LIKE ?`);
      params.push(`%${nomor}%`);
      appliedFilters.push(`nomor: ${nomor}`);
    }

    // === DATE FILTERS ===
    if (dateFrom) {
      whereClauses.push(`n.tanggal >= ?`);
      params.push(dateFrom);
      appliedFilters.push(`dateFrom: ${dateFrom}`);
    }

    if (dateTo) {
      whereClauses.push(`n.tanggal <= ?`);
      params.push(dateTo);
      appliedFilters.push(`dateTo: ${dateTo}`);
    }

    if (dateWithin && dateReference) {
      const { startDate, endDate } = this.calculateDateRange(
        dateWithin,
        dateReference,
      );
      whereClauses.push(`n.tanggal BETWEEN ? AND ?`);
      params.push(startDate, endDate);
      appliedFilters.push(`dateWithin: ${dateWithin} of ${dateReference}`);
    }

    // Align draft search with /draft/list behavior:
    // if no explicit date filter is provided, default to the last 30 days.
    if (isDraftSearch && !dateFrom && !dateTo && !dateWithin) {
      const { startDate, endDate } = this.getDraftDefaultDateRange();
      whereClauses.push(`DATE(n.tanggal) >= ?`);
      whereClauses.push(`DATE(n.tanggal) <= ?`);
      params.push(startDate, endDate);
      appliedFilters.push('defaultDraftRange: 30_hari');
    }

    // === HAS ATTACHMENT ===
    if (hasAttachment === true) {
      whereClauses.push(`n.lampiran IS NOT NULL AND n.lampiran != ''`);
      appliedFilters.push('hasAttachment: true');
    }

    // === FROM (pengirim) FILTER ===
    if (from) {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM naskah_sirkulasi p 
        WHERE p.id_naskah = n.id 
        AND p.sirkuler = 'pengirim'
        AND (p.nama_sirkuler LIKE ? OR p.position_text LIKE ? OR p.organization_text LIKE ?)
      )`);
      const fromPattern = `%${from}%`;
      params.push(fromPattern, fromPattern, fromPattern);
      appliedFilters.push(`from: ${from}`);
    }

    // === TO (penerima) FILTER ===
    if (to) {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM naskah_sirkulasi r 
        WHERE r.id_naskah = n.id 
        AND r.sirkuler IN ('penerima', 'tembusan')
        AND (r.nama_sirkuler LIKE ? OR r.position_text LIKE ? OR r.organization_text LIKE ?)
      )`);
      const toPattern = `%${to}%`;
      params.push(toPattern, toPattern, toPattern);
      appliedFilters.push(`to: ${to}`);
    }

    // === PENGIRIM POSITION FILTER (list) ===
    if (dto.pengirimPosition && dto.pengirimPosition.length > 0) {
      const placeholdersSirkuler = dto.pengirimPosition
        .map(() => '?')
        .join(',');
      const placeholdersPosition = dto.pengirimPosition
        .map(() => '?')
        .join(',');
      whereClauses.push(`EXISTS (
        SELECT 1 FROM naskah_sirkulasi pp
        WHERE pp.id_naskah = n.id
        AND pp.sirkuler = 'pengirim'
        AND (pp.id_sirkuler IN (${placeholdersSirkuler}) OR pp.position IN (${placeholdersPosition}))
      )`);
      dto.pengirimPosition.forEach((p) => params.push(String(p)));
      dto.pengirimPosition.forEach((p) => params.push(String(p)));
      appliedFilters.push(
        `pengirimPosition: ${dto.pengirimPosition.join(',')}`,
      );
    }

    // === PENERIMA POSITION FILTER (list) ===
    if (dto.penerimaPosition && dto.penerimaPosition.length > 0) {
      const placeholdersSirkuler = dto.penerimaPosition
        .map(() => '?')
        .join(',');
      const placeholdersPosition = dto.penerimaPosition
        .map(() => '?')
        .join(',');
      whereClauses.push(`EXISTS (
        SELECT 1 FROM naskah_sirkulasi pr
        WHERE pr.id_naskah = n.id
        AND pr.sirkuler IN ('penerima', 'tembusan')
        AND (pr.id_sirkuler IN (${placeholdersSirkuler}) OR pr.position IN (${placeholdersPosition}))
      )`);
      dto.penerimaPosition.forEach((p) => params.push(String(p)));
      dto.penerimaPosition.forEach((p) => params.push(String(p)));
      appliedFilters.push(
        `penerimaPosition: ${dto.penerimaPosition.join(',')}`,
      );
    }

    // === ORGANIZATION FILTERS ===
    if (areaFrom) {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM naskah_sirkulasi pa 
        WHERE pa.id_naskah = n.id AND pa.sirkuler = 'pengirim' AND pa.area_text LIKE ?
      )`);
      params.push(`%${areaFrom}%`);
      appliedFilters.push(`areaFrom: ${areaFrom}`);
    }

    if (subAreaFrom) {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM naskah_sirkulasi ps 
        WHERE ps.id_naskah = n.id AND ps.sirkuler = 'pengirim' AND ps.sub_area_text LIKE ?
      )`);
      params.push(`%${subAreaFrom}%`);
      appliedFilters.push(`subAreaFrom: ${subAreaFrom}`);
    }

    if (organizationFrom) {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM naskah_sirkulasi po 
        WHERE po.id_naskah = n.id AND po.sirkuler = 'pengirim' AND po.organization_text LIKE ?
      )`);
      params.push(`%${organizationFrom}%`);
      appliedFilters.push(`organizationFrom: ${organizationFrom}`);
    }

    // === HIERARCHICAL LABEL FILTER (Gmail-style) ===
    if (label) {
      // Use recursive CTE to build full label paths and match against the filter
      // This supports hierarchical filtering: "Work" matches "Work", "Work/Projects", "Work/Projects/Q1", etc.
      whereClauses.push(`EXISTS (
        SELECT 1 FROM naskah_label nl
        WHERE nl.naskah_id = n.id
        AND nl.label_id IN (
          WITH RECURSIVE label_path AS (
            -- Base case: start with each label
            SELECT 
              id,
              id_parent,
              position_id,
              CAST(nama AS CHAR(1000)) as full_path
            FROM label
            WHERE position_id = ?
            
            UNION ALL
            
            -- Recursive case: prepend parent name and move UP the tree
            SELECT 
              lp.id,
              p.id_parent,
              lp.position_id,
              CAST(CONCAT(p.nama, '/', lp.full_path) AS CHAR(1000)) as full_path
            FROM label_path lp
            INNER JOIN label p ON lp.id_parent = p.id
            WHERE p.position_id = ?
          )
          SELECT lp.id 
          FROM label_path lp
          WHERE lp.id_parent IS NULL
          AND (
            -- Exact match
            lp.full_path = ?
            -- Or the filter is a parent prefix (e.g., "Work" matches "Work/Projects")
            OR lp.full_path LIKE ?
          )
        )
      )`);
      params.push(userPosition, userPosition, label, `${label}/%`);
      appliedFilters.push(`label: ${label}`);
    }

    // === UNREAD STATUS FILTER ===
    if (isRead !== undefined) {
      if (isRead === true) {
        // Filter for READ documents (read_time is NOT NULL)
        whereClauses.push(`s.send_read_time IS NOT NULL`);
        appliedFilters.push('isRead: true');
      } else {
        // Filter for UNREAD documents (read_time IS NULL)
        whereClauses.push(`s.send_read_time IS NULL`);
        appliedFilters.push('isRead: false');
      }
    }

    // === FAVORIT FILTER ===
    if (dto.favorit !== undefined) {
      if (dto.favorit === true) {
        whereClauses.push(`s.flag_favorit = 1`);
        appliedFilters.push('favorit: true');
      } else {
        whereClauses.push(`(s.flag_favorit IS NULL OR s.flag_favorit = 0)`);
        appliedFilters.push('favorit: false');
      }
    }

    // === PRIORITY FILTER ===
    if (dto.priority !== undefined) {
      if (dto.priority === true) {
        whereClauses.push(`n.jenis = 'DI'`);
        whereClauses.push(
          `EXISTS (SELECT 1 FROM di WHERE di.id_naskah = n.id AND di.is_priority = 1)`,
        );
        appliedFilters.push('priority: true');
      } else {
        whereClauses.push(
          `(n.jenis != 'DI' OR NOT EXISTS (SELECT 1 FROM di WHERE di.id_naskah = n.id AND di.is_priority = 1))`,
        );
        appliedFilters.push('priority: false');
      }
    }

    // === KATEGORI FILTER ===
    if (kategori) {
      switch (kategori) {
        case KategoriEnum.SUDAH_TINDAK_LANJUT:
          whereClauses.push(`s.tindak_lanjut = 1`);
          break;
        case KategoriEnum.BELUM_TINDAK_LANJUT:
          whereClauses.push(`(s.tindak_lanjut = 0 OR s.tindak_lanjut IS NULL)`);
          break;
        case KategoriEnum.SUDAH_DIBACA:
          whereClauses.push(`s.send_read_time IS NOT NULL`);
          break;
        case KategoriEnum.BELUM_DIBACA:
          whereClauses.push(`s.send_read_time IS NULL`);
          break;
      }
      appliedFilters.push(`kategori: ${kategori}`);
    }

    // Build WHERE string
    const whereString =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // === SORTING ===
    // Use user-provided sortBy/sortOrder with whitelist validation (SQL injection safe)
    // When keyword search is active, relevance_score is used as secondary sort
    const sortField = this.getSortField(sortBy);
    const safeOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const orderBy = keyword
      ? `ORDER BY relevance_score DESC, ${sortField} ${safeOrder}, created_at DESC`
      : `ORDER BY ${sortField} ${safeOrder}, created_at DESC`;

    // === COUNT QUERY ===
    const countQuery = `
      SELECT COUNT(DISTINCT n.id) as total
      FROM naskah n
      INNER JOIN naskah_sirkulasi s ON s.id_naskah = n.id
      ${whereString}
    `;
    const countResult = await this.dataSource.query(countQuery, params);
    const total = parseInt(countResult[0]?.total || '0', 10);

    // === MAIN QUERY ===
    // Subquery pattern: DISTINCT first (dedup), then ORDER BY + LIMIT (sort, then paginate)
    // This prevents MySQL from optimizing away the ORDER BY when using DISTINCT
    const offset = (page - 1) * limit;
    const mainQuery = `
      SELECT * FROM (
        SELECT DISTINCT
          n.id,
          n.jenis,
          n.nomor,
          n.tanggal,
          n.perihal,
          n.sifat,
          n.status,
          n.klasifikasi,
          n.lampiran,
          n.final_pdf,
          n.created_at,
          s.id as id_sirkulasi,
          s.sirkuler,
          s.send_read_time as read_time,
          s.flag_favorit,
          s.flag_arsip,
          s.flag_note,
          (SELECT di.is_priority FROM di WHERE di.id_naskah = n.id LIMIT 1) as is_priority,
          ${relevanceSelect}
        FROM naskah n
        INNER JOIN naskah_sirkulasi s ON s.id_naskah = n.id
        ${whereString}
      ) AS search_results
      ${orderBy}
      LIMIT ? OFFSET ?
    `;

    // relevanceParams come first (for SELECT), then WHERE params, then LIMIT/OFFSET
    const mainParams = [...relevanceParams, ...params, limit, offset];
    const rows = await this.dataSource.query(mainQuery, mainParams);

    // Get naskah IDs for pengirim/penerima info
    const naskahIds = rows.map((r: any) => r.id);

    // Fetch pengirim info
    const pengirimMap = await this.fetchPengirimInfo(naskahIds);

    // Fetch penerima info
    const penerimaMap = await this.fetchPenerimaInfo(naskahIds);

    // Fetch labels info
    const labelsMap = await this.fetchLabelsInfo(naskahIds, userPosition);

    // Transform results
    const items: SearchV3ResultItemDto[] = rows.map((row: any) => {
      const pengirim = pengirimMap.get(row.id);
      const penerimaList = penerimaMap.get(row.id) || [];
      const labelsList = labelsMap.get(row.id) || [];

      // Determine source
      let source: NaskahSourceEnum;
      if (row.status === 'draf') {
        source = NaskahSourceEnum.DRAFT;
      } else if (row.sirkuler === 'pengirim') {
        source = NaskahSourceEnum.SENT;
      } else if (row.sirkuler === 'tembusan') {
        source = NaskahSourceEnum.CC;
      } else {
        source = NaskahSourceEnum.INBOX;
      }

      // Determine user roles
      const userRoles: Array<'pengirim' | 'penerima' | 'tembusan'> = [];
      if (row.sirkuler === 'pengirim') userRoles.push('pengirim');
      if (row.sirkuler === 'penerima') userRoles.push('penerima');
      if (row.sirkuler === 'tembusan') userRoles.push('tembusan');

      const hasLampiran = !!(row.lampiran && row.lampiran.trim() !== '');

      return {
        id: row.id,
        id_sirkulasi: row.id_sirkulasi,
        jenis: row.jenis,
        jenisText: JENIS_LABELS[row.jenis] || row.jenis,
        nomor: row.nomor,
        tanggal: row.tanggal,
        perihal: row.perihal,
        sifat: row.sifat,
        status: row.status,
        klasifikasi: row.klasifikasi,
        klasifikasiText: row.klasifikasi,
        pengirim: pengirim || {
          persnum: null,
          position_id: null,
          nama: null,
          jabatan: null,
          organization: null,
          area: null,
        },
        penerima: penerimaList,
        lampiranCount: hasLampiran ? 1 : 0,
        hasAttachment: hasLampiran,
        finalPdf: row.final_pdf,
        source,
        sourceLabel: SOURCE_LABELS[source],
        userRoles,
        isRead: row.read_time != null,
        read_time: row.read_time,
        isArchived: row.flag_arsip === 1,
        isFavorite: row.flag_favorit === 1,
        priority: row.jenis === 'DI' ? row.is_priority === 1 : false,
        relevance_score: row.relevance_score || 0,
        createdAt: row.created_at,
        label: labelsList,
        _formatted: {
          perihal: this.highlight(row.perihal, keyword),
          nomor: this.highlight(row.nomor, keyword),
        },
      };
    });

    // === FACETS QUERY ===
    const facets = await this.getFacets(facetBaseWhereClauses, facetBaseParams);

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
        facets,
      },
    };
  }

  /**
   * Highlight matched keywords with <em> tags
   */
  private highlight(text: string | null, keyword?: string): string | null {
    if (!text || !keyword) return text;

    const words = keyword.split(' ').filter(Boolean);
    let result = text;

    words.forEach((word) => {
      const regex = new RegExp(`(${this.escapeRegex(word)})`, 'gi');
      result = result.replace(regex, '<em>$1</em>');
    });

    return result;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get facet counts
   */
  private async getFacets(
    baseWhereClauses: string[],
    baseParams: any[],
  ): Promise<FacetsDto> {
    const whereString =
      baseWhereClauses.length > 0
        ? `WHERE ${baseWhereClauses.join(' AND ')}`
        : '';

    // Jenis facets
    const jenisQuery = `
      SELECT n.jenis, COUNT(DISTINCT n.id) as count
      FROM naskah n
      INNER JOIN naskah_sirkulasi s ON s.id_naskah = n.id
      ${whereString}
      GROUP BY n.jenis
    `;
    const jenisRows = await this.dataSource.query(jenisQuery, baseParams);
    const jenisFacets: Record<string, number> = {};
    jenisRows.forEach((row: any) => {
      jenisFacets[row.jenis] = parseInt(row.count, 10);
    });

    // Status facets
    const statusQuery = `
      SELECT n.status, COUNT(DISTINCT n.id) as count
      FROM naskah n
      INNER JOIN naskah_sirkulasi s ON s.id_naskah = n.id
      ${whereString}
      GROUP BY n.status
    `;
    const statusRows = await this.dataSource.query(statusQuery, baseParams);
    const statusFacets: Record<string, number> = {};
    statusRows.forEach((row: any) => {
      statusFacets[row.status] = parseInt(row.count, 10);
    });

    // Sifat facets
    const sifatQuery = `
      SELECT n.sifat, COUNT(DISTINCT n.id) as count
      FROM naskah n
      INNER JOIN naskah_sirkulasi s ON s.id_naskah = n.id
      ${whereString}
      GROUP BY n.sifat
    `;
    const sifatRows = await this.dataSource.query(sifatQuery, baseParams);
    const sifatFacets: Record<string, number> = {};
    sifatRows.forEach((row: any) => {
      sifatFacets[row.sifat] = parseInt(row.count, 10);
    });

    // Label facets (hierarchical paths using recursive CTE)
    // Build full path for each label and count naskah
    const labelQuery = `
      WITH RECURSIVE label_path AS (
        -- Base case: start with each label
        SELECT 
          id,
          id_parent,
          position_id,
          CAST(nama AS CHAR(1000)) as full_path
        FROM label
        WHERE position_id = ?
        
        UNION ALL
        
        -- Recursive case: prepend parent name and move UP the tree
        SELECT 
          lp.id,
          p.id_parent,
          lp.position_id,
          CAST(CONCAT(p.nama, '/', lp.full_path) AS CHAR(1000)) as full_path
        FROM label_path lp
        INNER JOIN label p ON lp.id_parent = p.id
        WHERE p.position_id = ?
      )
      SELECT 
        lp.full_path as label_path,
        COUNT(DISTINCT nl.naskah_id) as count
      FROM naskah_label nl
      INNER JOIN label_path lp ON nl.label_id = lp.id AND lp.id_parent IS NULL
      INNER JOIN naskah n ON nl.naskah_id = n.id
      INNER JOIN naskah_sirkulasi s ON s.id_naskah = n.id
      ${whereString}
      GROUP BY lp.full_path
      ORDER BY lp.full_path
    `;
    // Position params for CTE + base WHERE params
    const labelParams = [baseParams[0], baseParams[0], ...baseParams];
    const labelRows = await this.dataSource.query(labelQuery, labelParams);
    const labelFacets: Record<string, number> = {};
    labelRows.forEach((row: any) => {
      if (row.label_path) {
        labelFacets[row.label_path] = parseInt(row.count, 10);
      }
    });

    // isRead facets (read vs unread counts)
    const isReadQuery = `
      SELECT 
        CASE WHEN s.send_read_time IS NOT NULL THEN 'true' ELSE 'false' END as is_read,
        COUNT(DISTINCT n.id) as count
      FROM naskah n
      INNER JOIN naskah_sirkulasi s ON s.id_naskah = n.id
      ${whereString}
      GROUP BY is_read
    `;
    const isReadRows = await this.dataSource.query(isReadQuery, baseParams);
    const isReadFacets: Record<string, number> = {};
    isReadRows.forEach((row: any) => {
      isReadFacets[row.is_read] = parseInt(row.count, 10);
    });

    // Kategori facets (tindak lanjut + read status combined)
    const kategoriQuery = `
      SELECT 
        CASE WHEN s.tindak_lanjut = 1 THEN 'sudah_tindak_lanjut' ELSE 'belum_tindak_lanjut' END as kategori,
        COUNT(DISTINCT n.id) as count
      FROM naskah n
      INNER JOIN naskah_sirkulasi s ON s.id_naskah = n.id
      ${whereString}
      GROUP BY kategori
      
      UNION ALL
      
      SELECT 
        CASE WHEN s.send_read_time IS NOT NULL THEN 'sudah_dibaca' ELSE 'belum_dibaca' END as kategori,
        COUNT(DISTINCT n.id) as count
      FROM naskah n
      INNER JOIN naskah_sirkulasi s ON s.id_naskah = n.id
      ${whereString}
      GROUP BY kategori
    `;
    const kategoriRows = await this.dataSource.query(kategoriQuery, [
      ...baseParams,
      ...baseParams,
    ]);
    const kategoriFacets: Record<string, number> = {};
    kategoriRows.forEach((row: any) => {
      kategoriFacets[row.kategori] = parseInt(row.count, 10);
    });

    // Favorit facets (favorited vs non-favorited counts)
    const favoritQuery = `
      SELECT 
        CASE WHEN s.flag_favorit = 1 THEN 'true' ELSE 'false' END as is_favorit,
        COUNT(DISTINCT n.id) as count
      FROM naskah n
      INNER JOIN naskah_sirkulasi s ON s.id_naskah = n.id
      ${whereString}
      GROUP BY is_favorit
    `;
    const favoritRows = await this.dataSource.query(favoritQuery, baseParams);
    const favoritFacets: Record<string, number> = {};
    favoritRows.forEach((row: any) => {
      favoritFacets[row.is_favorit] = parseInt(row.count, 10);
    });

    // Priority facets (priority DI vs non-priority counts)
    const priorityQuery = `
      SELECT 
        CASE WHEN n.jenis = 'DI' AND EXISTS (SELECT 1 FROM di WHERE di.id_naskah = n.id AND di.is_priority = 1) THEN 'true' ELSE 'false' END as is_priority,
        COUNT(DISTINCT n.id) as count
      FROM naskah n
      INNER JOIN naskah_sirkulasi s ON s.id_naskah = n.id
      ${whereString}
      GROUP BY is_priority
    `;
    const priorityRows = await this.dataSource.query(priorityQuery, baseParams);
    const priorityFacets: Record<string, number> = {};
    priorityRows.forEach((row: any) => {
      priorityFacets[row.is_priority] = parseInt(row.count, 10);
    });

    return {
      jenis: jenisFacets,
      status: statusFacets,
      sifat: sifatFacets,
      label: labelFacets,
      isRead: isReadFacets,
      kategori: kategoriFacets,
      favorit: favoritFacets,
      priority: priorityFacets,
    };
  }

  /**
   * Fetch pengirim info for multiple naskah
   */
  private async fetchPengirimInfo(
    naskahIds: string[],
  ): Promise<Map<string, any>> {
    if (naskahIds.length === 0) return new Map();

    const placeholders = naskahIds.map(() => '?').join(',');
    const query = `
      SELECT 
        id_naskah,
        TRIM(id_sirkuler) as persnum,
        position as position_id,
        nama_sirkuler as nama,
        position_text as jabatan,
        organization_text as organization,
        area_text as area
      FROM naskah_sirkulasi
      WHERE id_naskah IN (${placeholders})
      AND sirkuler = 'pengirim'
    `;
    const rows = await this.dataSource.query(query, naskahIds);

    const map = new Map<string, any>();
    rows.forEach((row: any) => {
      map.set(row.id_naskah, {
        persnum: row.persnum || null,
        position_id: row.position_id || null,
        nama: row.nama,
        jabatan: row.jabatan,
        organization: row.organization,
        area: row.area,
      });
    });

    return map;
  }

  /**
   * Fetch penerima info for multiple naskah
   */
  private async fetchPenerimaInfo(
    naskahIds: string[],
  ): Promise<Map<string, any[]>> {
    if (naskahIds.length === 0) return new Map();

    const placeholders = naskahIds.map(() => '?').join(',');
    const query = `
      SELECT 
        id_naskah,
        TRIM(id_sirkuler) as persnum,
        position as position_id,
        nama_sirkuler as nama,
        position_text as jabatan,
        organization_text as organization
      FROM naskah_sirkulasi
      WHERE id_naskah IN (${placeholders})
      AND sirkuler IN ('penerima', 'tembusan')
    `;
    const rows = await this.dataSource.query(query, naskahIds);

    const map = new Map<string, any[]>();
    rows.forEach((row: any) => {
      const list = map.get(row.id_naskah) || [];
      list.push({
        persnum: row.persnum || null,
        position_id: row.position_id || null,
        nama: row.nama,
        jabatan: row.jabatan,
        organization: row.organization,
      });
      map.set(row.id_naskah, list);
    });

    return map;
  }

  /**
   * Fetch labels with full hierarchical paths for multiple naskah
   */
  private async fetchLabelsInfo(
    naskahIds: string[],
    userPosition: string,
  ): Promise<Map<string, { id: string; path: string }[]>> {
    if (naskahIds.length === 0) return new Map();

    const placeholders = naskahIds.map(() => '?').join(',');
    const query = `
      WITH RECURSIVE label_path AS (
        -- Base case: start with each label
        SELECT 
          id,
          id_parent,
          position_id,
          CAST(nama AS CHAR(1000)) as full_path
        FROM label
        WHERE position_id = ?
        
        UNION ALL
        
        -- Recursive case: prepend parent name and move UP the tree
        SELECT 
          lp.id,
          p.id_parent,
          lp.position_id,
          CAST(CONCAT(p.nama, '/', lp.full_path) AS CHAR(1000)) as full_path
        FROM label_path lp
        INNER JOIN label p ON lp.id_parent = p.id
        WHERE p.position_id = ?
      )
      SELECT 
        nl.naskah_id,
        nl.label_id,
        lp.full_path as label_path
      FROM naskah_label nl
      INNER JOIN label_path lp ON nl.label_id = lp.id AND lp.id_parent IS NULL
      WHERE nl.naskah_id IN (${placeholders})
      ORDER BY nl.naskah_id, lp.full_path
    `;
    const params = [userPosition, userPosition, ...naskahIds];
    const rows = await this.dataSource.query(query, params);

    const map = new Map<string, { id: string; path: string }[]>();
    rows.forEach((row: any) => {
      const list = map.get(row.naskah_id) || [];
      if (row.label_path) {
        list.push({ id: row.label_id, path: row.label_path });
      }
      map.set(row.naskah_id, list);
    });

    return map;
  }

  /**
   * Get sort field mapping (whitelist-based, SQL injection safe)
   * Only allows known column names to be used in ORDER BY
   */
  private getSortField(sortBy: string): string {
    // Column names without table prefix — used in outer query over the subquery alias
    const sortFields: Record<string, string> = {
      tanggal: 'tanggal',
      nomor: 'nomor',
      perihal: 'perihal',
      jenis: 'jenis',
      created: 'created_at',
      relevance: 'relevance_score',
    };
    return sortFields[sortBy] || 'created_at';
  }

  /**
   * Suggestions for pengirim/penerima (raw SQL, consistent with V3 approach)
   * Searches by nama_sirkuler or position_text with parameterized queries
   */
  async getSuggestions(
    dto: SearchSuggestionDto,
  ): Promise<SearchSuggestionResponseDto> {
    const { q, type = SuggestionTypeEnum.ALL, limit = 10 } = dto;

    const whereClauses: string[] = [];
    const params: any[] = [];

    // Filter by type (whitelist safe — enum validated by DTO)
    if (type === SuggestionTypeEnum.PENGIRIM) {
      whereClauses.push(`sirkuler = ?`);
      params.push('pengirim');
    } else if (type === SuggestionTypeEnum.PENERIMA) {
      whereClauses.push(`sirkuler IN ('penerima', 'tembusan')`);
    }

    // Search by nama or jabatan (parameterized)
    whereClauses.push(`(nama_sirkuler LIKE ? OR position_text LIKE ?)`);
    params.push(`%${q}%`, `%${q}%`);

    // Exclude null/empty names
    whereClauses.push(`nama_sirkuler IS NOT NULL`);
    whereClauses.push(`nama_sirkuler != ''`);

    const whereString =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const query = `
            SELECT 
                nama_sirkuler AS nama,
                position_text AS jabatan,
                organization_text AS organization,
                area_text AS area,
                sub_area_text AS subArea,
                GROUP_CONCAT(DISTINCT sirkuler) AS sirkuler,
                position
            FROM naskah_sirkulasi
            ${whereString}
            GROUP BY nama_sirkuler, position_text, organization_text, area_text, sub_area_text, position
            ORDER BY nama_sirkuler ASC
            LIMIT ?
        `;
    params.push(limit);

    const rawResults = await this.dataSource.query(query, params);

    const items: SuggestionItemDto[] = rawResults.map((row: any) => ({
      nama: row.nama,
      jabatan: row.jabatan || null,
      organization: row.organization || null,
      area: row.area || null,
      subArea: row.subArea || null,
      roles: row.sirkuler ? row.sirkuler.split(',') : [],
      position: row.position || null,
    }));

    return {
      success: true,
      message: `Ditemukan ${items.length} suggestion`,
      data: {
        items,
        query: q,
        total: items.length,
      },
    };
  }

  /**
   * Calculate date range for dateWithin filter
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
   * Match /draft/list default date behavior: last 30 days when no date filter is provided.
   */
  private getDraftDefaultDateRange(): { startDate: string; endDate: string } {
    const today = new Date();
    const endDate = today.toISOString().split('T')[0];
    const startDateCalc = new Date(today);
    startDateCalc.setDate(startDateCalc.getDate() - 30);

    return {
      startDate: startDateCalc.toISOString().split('T')[0],
      endDate,
    };
  }
}
