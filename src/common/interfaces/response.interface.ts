/**
 * Standard API Response Interface
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  statusCode?: number;
}

/**
 * Paginated Response Interface
 */
export interface PaginatedResponse<T = any> {
  success: boolean;
  data: T[];
  total: number;
  page?: number;
  limit?: number;
  totalPages?: number;
}

/**
 * Error Response Interface
 */
export interface ErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  error?: string;
  timestamp?: string;
}
