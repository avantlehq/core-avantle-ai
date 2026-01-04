import { config } from 'dotenv'

// Load environment variables
config()

export const appConfig = {
  // Server Configuration
  server: {
    host: process.env.HOST || '0.0.0.0',
    port: parseInt(process.env.PORT || '3001', 10),
    node_env: process.env.NODE_ENV || 'development',
    api_version: process.env.API_VERSION || 'v1',
    log_level: process.env.LOG_LEVEL || 'info',
  },

  // Database Configuration
  database: {
    url: process.env.DATABASE_URL || '',
  },

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || '',
    expires_in: process.env.JWT_EXPIRES_IN || '24h',
    issuer: 'core.avantle.ai',
    audience: 'avantle-platform',
  },

  // CORS Configuration
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },

  // Rate Limiting
  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10),
    window: process.env.RATE_LIMIT_WINDOW || '1 minute',
    // Per-tenant rate limits
    tenant_max: 100,
    api_client_max: 50,
  },

  // Platform Limits
  limits: {
    max_tenants_per_partner: 100,
    max_domains_per_tenant: 50,
    max_api_clients_per_tenant: 20,
    max_webhooks_per_tenant: 10,
  },

  // Admin Configuration
  admin: {
    email: process.env.PLATFORM_ADMIN_EMAIL || 'admin@avantle.ai',
    password: process.env.PLATFORM_ADMIN_PASSWORD || '',
  },

  // Webhook Configuration
  webhook: {
    secret: process.env.WEBHOOK_SECRET || '',
    timeout_ms: 5000,
    retry_attempts: 3,
  },

  // Monitoring
  monitoring: {
    sentry_dsn: process.env.SENTRY_DSN || '',
    enable_metrics: process.env.NODE_ENV === 'production',
  },

  // Product Registry
  products: {
    allowed_keys: [
      'dpia',
      'lms', 
      'osdm',
      'notes',
      'core'
    ],
    key_pattern: /^[a-z][a-z0-9-]*[a-z0-9]$/,
  },

  // Security
  security: {
    bcrypt_rounds: 12,
    max_login_attempts: 5,
    lockout_duration_ms: 15 * 60 * 1000, // 15 minutes
    password_min_length: 8,
  },
} as const

// Validation
export function validateConfig(): string[] {
  const errors: string[] = []

  if (!appConfig.database.url) {
    errors.push('DATABASE_URL is required')
  }

  if (!appConfig.jwt.secret || appConfig.jwt.secret.length < 32) {
    errors.push('JWT_SECRET is required and must be at least 32 characters')
  }

  if (!appConfig.admin.password) {
    errors.push('PLATFORM_ADMIN_PASSWORD is required')
  }

  if (appConfig.server.node_env === 'production') {
    if (!appConfig.webhook.secret) {
      errors.push('WEBHOOK_SECRET is required in production')
    }
  }

  return errors
}