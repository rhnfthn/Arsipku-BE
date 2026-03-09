import {
    GlobalSearchDto,
    SearchResultItemDto,
    GlobalSearchResponseDto,
    NaskahSourceEnum,
} from './global-search.dto';

/**
 * Extended result item with V3 features
 */
export class SearchV3ResultItemDto extends SearchResultItemDto {
    /** Sirkulasi ID for toggle-flag API */
    id_sirkulasi: string;

    /** Read timestamp (actual Date, not just boolean) */
    read_time: Date | null;

    /** Relevance score (0-100) */
    relevance_score: number;

    /** Priority flag for disposisi (jenis=DI only) */
    priority: boolean;

    /** Labels with full hierarchical paths and IDs */
    label: { id: string; path: string }[];

    /** Highlighted fields with <em> tags */
    _formatted: {
        perihal: string | null;
        nomor: string | null;
    };
}

/**
 * Facet counts for filter sidebar
 */
export class FacetsDto {
    jenis: Record<string, number>;
    status: Record<string, number>;
    sifat: Record<string, number>;
    /** Label facets with full paths (e.g., "Work/Projects": 10) */
    label?: Record<string, number>;
    /** Read status facets: { "true": count, "false": count } */
    isRead?: Record<string, number>;
    /** Kategori facets: tindak lanjut & read status counts */
    kategori?: Record<string, number>;
}

/**
 * Response DTO for Search V3
 */
export class SearchV3ResponseDto {
    success: boolean;
    message: string;
    data: {
        items: SearchV3ResultItemDto[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
        filters: {
            applied: string[];
            keyword?: string;
        };
        facets: FacetsDto;
    };
}

// Re-export GlobalSearchDto for use in controller
export { GlobalSearchDto };