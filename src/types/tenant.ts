import { TenantType, Environment } from '../lib/prisma/index.js'

// Tenant Configuration Response
export interface TenantConfig {
  id: string
  name: string
  tenant_type: TenantType
  branding?: TenantBranding
  product_access: ProductAccessInfo[]
  domains: TenantDomain[]
  plan?: TenantPlanInfo
}

export interface TenantBranding {
  logo_url?: string
  favicon_url?: string
  primary_color?: string
  theme_config?: Record<string, any>
  custom_css_url?: string
  legal_links?: Record<string, string>
  footer_text?: string
}

export interface ProductAccessInfo {
  product_key: string
  environment: Environment
  status: string
}

export interface TenantDomain {
  hostname: string
  status: string
  verified_at?: string
  is_primary?: boolean
}

export interface TenantPlanInfo {
  plan_key: string
  plan_name: string
  limits: Record<string, any>
  effective_from: string
  effective_to?: string
}

// Usage Summary
export interface UsageSummary {
  tenant_id: string
  period_start: string
  period_end: string
  metrics: UsageMetric[]
  plan_limits?: Record<string, number>
}

export interface UsageMetric {
  product_key: string
  environment: Environment
  metric_key: string
  value: number
  limit?: number
  percentage_used?: number
}

// Dashboard Statistics
export interface DashboardStats {
  total_partners: number
  total_tenants: number
  active_domains: number
  this_month_signups: number
  total_api_clients: number
  total_usage_events: number
}

export interface RecentActivity {
  recent_partners: PartnerSummary[]
  recent_tenants: TenantSummary[]
  recent_domains: DomainSummary[]
}

export interface PartnerSummary {
  id: string
  name: string
  tenant_count: number
  created_at: string
  last_active_at?: string
}

export interface TenantSummary {
  id: string
  name: string
  tenant_type: TenantType
  partner_name: string
  user_count: number
  domain_count: number
  created_at: string
}

export interface DomainSummary {
  id: string
  hostname: string
  tenant_name: string
  status: string
  created_at: string
  verified_at?: string
}