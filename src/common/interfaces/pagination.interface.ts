/**
 * Pagination Options Interface
 */
export interface PaginationOptions {
  page?: number;
  limit?: number;
  skip?: number;
  take?: number;
}

/**
 * Query Options Interface
 */
export interface QueryOptions extends PaginationOptions {
  search?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  filters?: Record<string, any>;
}
