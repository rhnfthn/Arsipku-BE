import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MeilisearchService, NaskahDocument } from './meilisearch.service';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';
import {
    GlobalSearchDto,
    GlobalSearchResponseDto,
    SearchResultItemDto,
    NaskahSourceEnum,
    DateWithinEnum,
    SearchScopeEnum,
} from '../dto/global-search.dto';

// Label untuk source
const SOURCE_LABELS: Record<NaskahSourceEnum, string> = {
    [NaskahSourceEnum.INBOX]: 'Kotak Masuk',
    [NaskahSourceEnum.SENT]: 'Terkirim',
    [NaskahSourceEnum.DRAFT]: 'Draft',
    [NaskahSourceEnum.CC]: 'Tembusan',
};

// Jenis labels
const JENIS_LABELS: Record<string, string> = {
    ND: 'Nota Dinas',
    SDI: 'Surat Dinas Internal',
    SDE: 'Surat Dinas Eksternal',
    DI: 'Disposisi Internal',
    KA: 'Kajian',
    K: 'Konsep',
};

/**
 * MeilisearchSearchService
 * 
 * High-level search service using Meilisearch.
 * Translates GlobalSearchDto filters to Meilisearch query format.
 */
@Injectable()
export class MeilisearchSearchService {
    private readonly logger = new Logger(MeilisearchSearchService.name);

    constructor(
        private readonly meilisearchService: MeilisearchService,
        @InjectRepository(NaskahSirkulasi)
        private readonly naskahSirkulasiRepository: Repository<NaskahSirkulasi>,
    ) { }

    /**
     * Search using Meilisearch with all filters from GlobalSearchDto
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

        // Build search query
        let searchQuery = '';
        const appliedFilters: string[] = [];

        // === KEYWORD SEARCH ===
        if (keyword) {
            searchQuery = keyword;
            appliedFilters.push(`keyword: ${keyword}`);
        }

        // === PERIHAL SEARCH (add to query) ===
        if (perihal) {
            searchQuery = searchQuery ? `${searchQuery} ${perihal}` : perihal;
            appliedFilters.push(`perihal: ${perihal}`);
        }

        // === HAS WORDS (add to query) ===
        if (hasWords) {
            searchQuery = searchQuery ? `${searchQuery} ${hasWords}` : hasWords;
            appliedFilters.push(`hasWords: ${hasWords}`);
        }

        // === FROM (pengirim) - add to query ===
        if (from) {
            searchQuery = searchQuery ? `${searchQuery} ${from}` : from;
            appliedFilters.push(`from: ${from}`);
        }

        // === TO (penerima) - Note: Meilisearch doesn't easily support this ===
        // We'll rely on filter if possible or add to searchQuery
        if (to) {
            searchQuery = searchQuery ? `${searchQuery} ${to}` : to;
            appliedFilters.push(`to: ${to}`);
        }

        // === NOMOR (add to query for text search) ===
        if (nomor) {
            searchQuery = searchQuery ? `${searchQuery} ${nomor}` : nomor;
            appliedFilters.push(`nomor: ${nomor}`);
        }

        // === BUILD FILTER ARRAY ===
        const filters: string[] = [];

        // Default filter: only naskah where user is involved (by position)
        // Scope determines which role(s) to filter
        if (!scope || scope === 'all' || scope === 'active') {
            // User can see as pengirim, penerima, or tembusan
            filters.push(
                `(pengirim_position = "${userPosition}" OR penerima_positions = "${userPosition}" OR tembusan_positions = "${userPosition}")`
            );

            // Exclude draft status for 'all' and 'active'
            filters.push(`status IN ["final", "final_tte"]`);
            appliedFilters.push(`scope: ${scope || 'all'}`);
        } else {
            switch (scope) {
                case SearchScopeEnum.INBOX:
                    filters.push(`penerima_positions = "${userPosition}"`);
                    filters.push(`status IN ["final", "final_tte"]`);
                    break;
                case SearchScopeEnum.SENT:
                    filters.push(`pengirim_position = "${userPosition}"`);
                    filters.push(`status IN ["final", "final_tte"]`);
                    break;
                case SearchScopeEnum.DRAFT:
                    filters.push(
                        `(pengirim_position = "${userPosition}" OR penerima_positions = "${userPosition}")`
                    );
                    filters.push(`status = "draf"`);
                    break;
                // Note: archived and favorite require sirkulasi flags which we don't have in Meilisearch
                // We'll handle these with post-processing or store flags in document
                default:
                    filters.push(
                        `(pengirim_position = "${userPosition}" OR penerima_positions = "${userPosition}" OR tembusan_positions = "${userPosition}")`
                    );
            }
            appliedFilters.push(`scope: ${scope}`);
        }

        // === JENIS FILTER ===
        if (jenis) {
            filters.push(`jenis = "${jenis}"`);
            appliedFilters.push(`jenis: ${jenis}`);
        }

        // === SIFAT FILTER ===
        if (sifat) {
            filters.push(`sifat = "${sifat}"`);
            appliedFilters.push(`sifat: ${sifat}`);
        }

        // === STATUS FILTER ===
        if (status) {
            filters.push(`status = "${status}"`);
            appliedFilters.push(`status: ${status}`);
        }

        // === KLASIFIKASI FILTER ===
        if (klasifikasi) {
            filters.push(`klasifikasi = "${klasifikasi}"`);
            appliedFilters.push(`klasifikasi: ${klasifikasi}`);
        }

        // === HAS ATTACHMENT FILTER ===
        if (hasAttachment === true) {
            filters.push(`hasAttachment = true`);
            appliedFilters.push('hasAttachment: true');
        }

        // === DATE FILTERS ===
        if (dateFrom) {
            const timestamp = new Date(dateFrom).getTime();
            filters.push(`tanggal >= ${timestamp}`);
            appliedFilters.push(`dateFrom: ${dateFrom}`);
        }

        if (dateTo) {
            const timestamp = new Date(dateTo).getTime();
            filters.push(`tanggal <= ${timestamp}`);
            appliedFilters.push(`dateTo: ${dateTo}`);
        }

        if (dateWithin && dateReference) {
            const { startDate, endDate } = this.calculateDateRange(dateWithin, dateReference);
            const startTimestamp = new Date(startDate).getTime();
            const endTimestamp = new Date(endDate).getTime();
            filters.push(`tanggal >= ${startTimestamp} AND tanggal <= ${endTimestamp}`);
            appliedFilters.push(`dateWithin: ${dateWithin} of ${dateReference}`);
        }

        // === ORGANIZATION FILTERS ===
        if (areaFrom) {
            filters.push(`pengirim_area_text = "${areaFrom}"`);
            appliedFilters.push(`areaFrom: ${areaFrom}`);
        }

        if (subAreaFrom) {
            filters.push(`pengirim_sub_area_text = "${subAreaFrom}"`);
            appliedFilters.push(`subAreaFrom: ${subAreaFrom}`);
        }

        if (organizationFrom) {
            filters.push(`pengirim_organization_text = "${organizationFrom}"`);
            appliedFilters.push(`organizationFrom: ${organizationFrom}`);
        }

        // === DOESN'T HAVE (negative filter - not directly supported, handled post-search) ===
        // Meilisearch doesn't support negative text search, so we'll need to filter results
        const excludeWords = doesntHave ? doesntHave.split(' ').filter(Boolean) : [];

        // === BUILD SORT ===
        const sortField = this.getSortField(sortBy);
        const sort = [`${sortField}:${sortOrder.toLowerCase()}`];

        // === EXECUTE SEARCH ===
        this.logger.debug('Meilisearch query:', { searchQuery, filters, sort });

        try {
            const searchResult = await this.meilisearchService.search(searchQuery, {
                filter: filters.length > 0 ? filters.join(' AND ') : undefined,
                sort,
                offset: (page - 1) * limit,
                limit,
                attributesToRetrieve: ['*'],
            });

            // Transform results
            let items = await this.transformResults(
                searchResult.hits,
                userPosition,
                excludeWords,
            );

            // Apply doesntHave filter (post-processing)
            if (excludeWords.length > 0) {
                items = items.filter((item) => {
                    const text = (item.perihal || '').toLowerCase();
                    return !excludeWords.some((word) => text.includes(word.toLowerCase()));
                });
                appliedFilters.push(`doesntHave: ${doesntHave}`);
            }

            const total = searchResult.estimatedTotalHits || items.length;

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
        } catch (error) {
            this.logger.error('Meilisearch search failed', error);
            throw error;
        }
    }

    /**
     * Transform Meilisearch hits to SearchResultItemDto
     */
    private async transformResults(
        hits: NaskahDocument[],
        userPosition: string,
        excludeWords: string[],
    ): Promise<SearchResultItemDto[]> {
        if (hits.length === 0) {
            return [];
        }

        // Get sirkulasi data for user-specific flags (isRead, isArchived, isFavorite)
        const naskahIds = hits.map((h) => h.id);
        const userSirkulasi = await this.naskahSirkulasiRepository
            .createQueryBuilder('s')
            .where('s.id_naskah IN (:...naskahIds)', { naskahIds })
            .andWhere('s.position = :userPosition', { userPosition })
            .getMany();

        const sirkulasiByNaskah = new Map<string, NaskahSirkulasi[]>();
        userSirkulasi.forEach((s) => {
            if (s.idNaskah) {
                const list = sirkulasiByNaskah.get(s.idNaskah) || [];
                list.push(s);
                sirkulasiByNaskah.set(s.idNaskah, list);
            }
        });

        return hits.map((hit) => {
            const userRecords = sirkulasiByNaskah.get(hit.id) || [];
            const userMainRecord = userRecords[0];

            // Determine source
            let source: NaskahSourceEnum;
            if (hit.status === 'draf') {
                source = NaskahSourceEnum.DRAFT;
            } else if (hit.pengirim_position === userPosition) {
                source = NaskahSourceEnum.SENT;
            } else if (hit.tembusan_positions?.includes(userPosition)) {
                source = NaskahSourceEnum.CC;
            } else if (hit.penerima_positions?.includes(userPosition)) {
                source = NaskahSourceEnum.INBOX;
            } else {
                source = NaskahSourceEnum.INBOX;
            }

            // Determine user roles
            type RoleType = 'pengirim' | 'penerima' | 'tembusan';
            const userRoles: RoleType[] = [];
            if (hit.pengirim_position === userPosition) userRoles.push('pengirim');
            if (hit.penerima_positions?.includes(userPosition)) userRoles.push('penerima');
            if (hit.tembusan_positions?.includes(userPosition)) userRoles.push('tembusan');

            // Determine flags
            const isRead = userMainRecord?.sendReadTime != null;
            const isArchived = userMainRecord?.flagArsip === 1;
            const isFavorite = userMainRecord?.flagFavorit === 1;

            // Build penerima array
            const penerimaCount = hit.penerima_names?.length || 0;
            const penerima: Array<{ nama: string | null; jabatan: string | null; organization: string | null }> = [];
            for (let i = 0; i < penerimaCount; i++) {
                penerima.push({
                    nama: hit.penerima_names?.[i] || null,
                    jabatan: null, // Not stored separately in Meilisearch doc
                    organization: hit.penerima_organizations?.[i] || null,
                });
            }

            return {
                id: hit.id,
                jenis: hit.jenis,
                jenisText: JENIS_LABELS[hit.jenis] || hit.jenis,
                nomor: hit.nomor,
                tanggal: new Date(hit.tanggal),
                perihal: hit.perihal,
                sifat: hit.sifat,
                status: hit.status,
                klasifikasi: hit.klasifikasi,
                klasifikasiText: hit.klasifikasi,
                pengirim: {
                    nama: hit.pengirim_nama,
                    jabatan: hit.pengirim_position_text,
                    organization: hit.pengirim_organization_text,
                    area: hit.pengirim_area_text,
                },
                penerima,
                lampiranCount: hit.hasAttachment ? 1 : 0,
                hasAttachment: hit.hasAttachment,
                finalPdf: hit.final_pdf,
                source,
                sourceLabel: SOURCE_LABELS[source],
                userRoles,
                isRead,
                isArchived,
                isFavorite,
                createdAt: new Date(hit.createdAt),
            };
        });
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
     * Get sort field mapping for Meilisearch
     */
    private getSortField(sortBy: string): string {
        const sortFields: Record<string, string> = {
            tanggal: 'tanggal',
            nomor: 'nomor',
            created: 'createdAt',
        };
        return sortFields[sortBy] || 'tanggal';
    }
}
