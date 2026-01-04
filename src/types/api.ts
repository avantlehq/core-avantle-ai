// Standard API Response Types
export interface APIResponse<T = any> {
  success: boolean
  data?: T
  error?: APIError
  meta?: ResponseMeta
}

export interface APIError {
  code: string
  message: string
  details?: Record<string, any>
  correlation_id: string
}

export interface ResponseMeta {
  correlation_id: string
  timestamp: string
  version: string
  pagination?: PaginationMeta
}

export interface PaginationMeta {
  total_count: number
  page: number
  page_size: number
  total_pages: number
  has_next: boolean
  has_prev: boolean
}

// Pagination Request
export interface PaginationParams {
  page?: number
  page_size?: number
  limit?: number
  offset?: number
}

// Filtering
export interface FilterParam {
  field: string
  operator: 'eq' | 'ne' | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'starts_with'
  value: any
}

// Sorting
export interface SortParam {
  field: string
  direction: 'asc' | 'desc'
}

// Common Query Parameters
export interface QueryParams extends PaginationParams {
  filter?: FilterParam[]
  sort?: SortParam[]
  include?: string[]
}

// Health Check Response
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  version: string
  services: {
    database: ServiceHealth
    redis?: ServiceHealth
  }
}

export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  response_time_ms?: number
  error?: string
}

// Error Codes
export enum ErrorCode {
  // Authentication & Authorization
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  
  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT = 'INVALID_FORMAT',
  
  // Resource Management
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
  RESOURCE_CONFLICT = 'RESOURCE_CONFLICT',
  
  // Business Logic
  TENANT_LIMIT_EXCEEDED = 'TENANT_LIMIT_EXCEEDED',
  INVALID_TENANT_TYPE = 'INVALID_TENANT_TYPE',
  DOMAIN_VERIFICATION_FAILED = 'DOMAIN_VERIFICATION_FAILED',
  
  // System Errors
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  MAINTENANCE_MODE = 'MAINTENANCE_MODE'
}