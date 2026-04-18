export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T> {
  meta: {
    total: number;
    page: number;
    limit: number;
  }
}
