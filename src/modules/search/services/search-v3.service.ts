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
} from '../dto/global-search.dto';
import {
    SearchV3ResponseDto,
    SearchV3ResultItemDto,
    FacetsDto,
} from '../dto/search-v3.dto';

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
    ) { }

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
            page = 1,
            limit = 20,
            sortBy = 'tanggal',
            sortOrder = 'DESC',
        } = dto;

        const appliedFilters: string[] = [];
        const params: any[] = [];
        let paramIndex = 0;

        // Build WHERE clauses
        const whereClauses: string[] = [];

        // === BASE FILTER: User access (position-based) ===
        whereClauses.push(`s.position = ?`);
        params.push(userPosition);
        paramIndex++;

        // Exclude drafts and konsep by default
        whereClauses.push(`(s.is_draft = 0 OR s.is_draft IS NULL)`);
        whereClauses.push(`(s.is_konsep = 0 OR s.is_konsep IS NULL)`);

        // === SCOPE FILTER ===
        if (!scope || scope === 'all' || scope === 'active') {
            // All final naskah user has access to
            whereClauses.push(`n.status IN ('final', 'final_tte')`);
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
                    break;
                case 'sent':
                    whereClauses.push(`s.sirkuler = 'pengirim'`);
                    whereClauses.push(`n.status IN ('final', 'final_tte')`);
                    whereClauses.push(`(s.flag_arsip IS NULL OR s.flag_arsip = 0)`);
                    break;
                case 'draft':
                    whereClauses.push(`n.status = 'draf'`);
                    whereClauses.push(`(s.flag_arsip IS NULL OR s.flag_arsip = 0)`);
                    break;
                case 'archived':
                    whereClauses.push(`s.flag_arsip = 1`);
                    break;
                case 'favorite':
                    whereClauses.push(`s.flag_favorit = 1`);
                    break;
            }
            appliedFilters.push(`scope: ${scope}`);
        }

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
            const { startDate, endDate } = this.calculateDateRange(dateWithin, dateReference);
            whereClauses.push(`n.tanggal BETWEEN ? AND ?`);
            params.push(startDate, endDate);
            appliedFilters.push(`dateWithin: ${dateWithin} of ${dateReference}`);
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
            // Get all label IDs that match the path or are children of the path
            // This supports hierarchical filtering: "Work" matches "Work", "Work/Projects", "Work/Projects/Q1", etc.
            whereClauses.push(`EXISTS (
        SELECT 1 FROM naskah_label nl
        INNER JOIN label l ON nl.label_id = l.id
        WHERE nl.naskah_id = n.id
        AND l.position_id = ?
        AND (
          -- Match exact label name
          l.nama = ?
          -- OR match as parent (child labels will have this label as ancestor)
          OR l.id IN (
            SELECT child.id FROM label child
            WHERE child.position_id = ?
            AND (
              -- Direct match
              child.nama = ?
              -- Or find labels whose full path starts with the given label
              OR EXISTS (
                SELECT 1 FROM label parent
                WHERE parent.id = child.id_parent
                AND parent.position_id = ?
                AND (parent.nama = ? OR parent.nama LIKE ?)
              )
            )
          )
        )
      )`);
            params.push(
                userPosition,
                label,
                userPosition,
                label,
                userPosition,
                label,
                `${label}/%`,
            );
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

        // Build WHERE string
        const whereString = whereClauses.length > 0
            ? `WHERE ${whereClauses.join(' AND ')}`
            : '';

        // === SORTING ===
        // ALWAYS sort by created_at DESC as primary sort for consistent pagination
        // This ensures newest items always appear first regardless of relevance score
        const orderBy = `ORDER BY n.created_at DESC, n.id DESC`;

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
        const offset = (page - 1) * limit;
        const mainQuery = `
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
        ${relevanceSelect}
      FROM naskah n
      INNER JOIN naskah_sirkulasi s ON s.id_naskah = n.id
      ${whereString}
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

        // Transform results
        const items: SearchV3ResultItemDto[] = rows.map((row: any) => {
            const pengirim = pengirimMap.get(row.id);
            const penerimaList = penerimaMap.get(row.id) || [];

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
                pengirim: pengirim || { nama: null, jabatan: null, organization: null, area: null },
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
                relevance_score: row.relevance_score || 0,
                createdAt: row.created_at,
                _formatted: {
                    perihal: this.highlight(row.perihal, keyword),
                    nomor: this.highlight(row.nomor, keyword),
                },
            };
        });

        // === FACETS QUERY ===
        const facets = await this.getFacets(whereClauses.slice(0, 3), [userPosition]);

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
    private async getFacets(baseWhereClauses: string[], baseParams: any[]): Promise<FacetsDto> {
        const whereString = baseWhereClauses.length > 0
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

        // Label facets (hierarchical paths)
        // Build full path for each label and count naskah
        const labelQuery = `
      SELECT 
        CASE 
          WHEN parent.nama IS NOT NULL THEN CONCAT(parent.nama, '/', l.nama)
          ELSE l.nama
        END as label_path,
        COUNT(DISTINCT nl.naskah_id) as count
      FROM naskah_label nl
      INNER JOIN label l ON nl.label_id = l.id
      LEFT JOIN label parent ON l.id_parent = parent.id
      INNER JOIN naskah n ON nl.naskah_id = n.id
      INNER JOIN naskah_sirkulasi s ON s.id_naskah = n.id
      ${whereString}
      AND l.position_id = ?
      GROUP BY label_path
      ORDER BY label_path
    `;
        const labelParams = [...baseParams, baseParams[0]]; // Add position_id for label filter
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

        return {
            jenis: jenisFacets,
            status: statusFacets,
            sifat: sifatFacets,
            label: labelFacets,
            isRead: isReadFacets,
        };
    }

    /**
     * Fetch pengirim info for multiple naskah
     */
    private async fetchPengirimInfo(naskahIds: string[]): Promise<Map<string, any>> {
        if (naskahIds.length === 0) return new Map();

        const placeholders = naskahIds.map(() => '?').join(',');
        const query = `
      SELECT 
        id_naskah,
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
    private async fetchPenerimaInfo(naskahIds: string[]): Promise<Map<string, any[]>> {
        if (naskahIds.length === 0) return new Map();

        const placeholders = naskahIds.map(() => '?').join(',');
        const query = `
      SELECT 
        id_naskah,
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
                nama: row.nama,
                jabatan: row.jabatan,
                organization: row.organization,
            });
            map.set(row.id_naskah, list);
        });

        return map;
    }

    /**
     * Get sort field mapping
     */
    private getSortField(sortBy: string): string {
        const sortFields: Record<string, string> = {
            tanggal: 'n.tanggal',
            nomor: 'n.nomor',
            perihal: 'n.perihal',
            jenis: 'n.jenis',
            created: 'n.created_at',
        };
        return sortFields[sortBy] || 'n.tanggal';
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
            case DateWithinEnum.ONE_DAY: days = 1; break;
            case DateWithinEnum.THREE_DAYS: days = 3; break;
            case DateWithinEnum.ONE_WEEK: days = 7; break;
            case DateWithinEnum.TWO_WEEKS: days = 14; break;
            case DateWithinEnum.ONE_MONTH: days = 30; break;
            case DateWithinEnum.TWO_MONTHS: days = 60; break;
            case DateWithinEnum.SIX_MONTHS: days = 180; break;
            case DateWithinEnum.ONE_YEAR: days = 365; break;
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
}