import { Role, TenantType, Environment } from '../lib/prisma/index.js'

// JWT Payload
export interface JWTPayload {
  sub: string // user_id
  email: string
  role: Role
  tenant_context?: TenantContext[]
  environment_scope?: Environment[]
  iat: number
  exp: number
  iss: string
}

export interface TenantContext {
  tenant_id: string
  tenant_name: string
  tenant_type: TenantType
  role: Role
}

// API Client Authentication
export interface APIClientAuth {
  client_id: string
  tenant_id: string
  scopes: string[]
  environment: Environment
}

// Request Context
export interface RequestContext {
  user_id?: string
  tenant_id?: string
  role: Role
  api_client_id?: string
  correlation_id: string
  ip_address?: string
  user_agent?: string
}

// RBAC Types
export type Permission = 
  | 'partners:read'
  | 'partners:write'
  | 'partners:delete'
  | 'tenants:read'
  | 'tenants:write'
  | 'tenants:delete'
  | 'plans:read'
  | 'plans:write'
  | 'domains:read'
  | 'domains:write'
  | 'domains:verify'
  | 'usage:read'
  | 'system:read'
  | 'system:write'

export interface AccessRule {
  role: Role
  permissions: Permission[]
  conditions?: AccessCondition[]
}

export interface AccessCondition {
  field: string
  operator: 'equals' | 'in' | 'not_equals'
  value: any
}