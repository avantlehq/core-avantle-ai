import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUI from '@fastify/swagger-ui'

import { appConfig } from './lib/config.js'
import { logger } from './lib/logger.js'

// Import middleware
import { authMiddleware } from './middleware/auth.js'
import { rbacMiddleware } from './middleware/rbac.js'
import { correlationMiddleware } from './middleware/correlation.js'
import { errorHandlerMiddleware } from './middleware/error-handler.js'

// Import routes
import { healthRoutes } from './routes/health.js'
import { authRoutes } from './routes/auth.js'
import { partnerRoutes } from './routes/partners.js'
import { tenantRoutes } from './routes/tenants.js'
import { domainRoutes } from './routes/domains.js'
import { planRoutes } from './routes/plans.js'
import { usageRoutes } from './routes/usage.js'
import { adminRoutes } from './routes/admin.js'
import { systemRoutes } from './routes/system.js'

export function build(opts = {}) {
  const app = Fastify({
    logger: false,
    trustProxy: true,
    ...opts
  })

  // Register core plugins
  app.register(helmet, {
    contentSecurityPolicy: false,
  })

  app.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
  })

  app.register(jwt, {
    secret: process.env.JWT_SECRET || 'fallback-secret-for-testing',
    sign: {
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    },
  })

  if (process.env.NODE_ENV !== 'test') {
    app.register(rateLimit, {
      max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
      timeWindow: '1 minute'
    })
  }

  // OpenAPI Documentation
  app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Avantle Core API',
        description: 'Control plane for multi-tenant privacy platform',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  })

  app.register(swaggerUI, {
    routePrefix: '/docs',
  })

  // Register middleware
  app.register(correlationMiddleware)
  app.register(errorHandlerMiddleware)

  // Register routes
  app.register(healthRoutes, { prefix: '/health' })
  app.register(authRoutes, { prefix: '/auth' })
  
  // Protected routes with authentication
  app.register(async function(fastify) {
    await fastify.register(authMiddleware)
    await fastify.register(rbacMiddleware)
    
    // API routes
    await fastify.register(partnerRoutes, { prefix: '/partners' })
    await fastify.register(tenantRoutes, { prefix: '/tenants' })
    await fastify.register(domainRoutes, { prefix: '/domains' })
    await fastify.register(planRoutes, { prefix: '/plans' })
    await fastify.register(usageRoutes, { prefix: '/usage' })
    await fastify.register(systemRoutes, { prefix: '/system' })
    await fastify.register(adminRoutes, { prefix: '/admin' })
  })

  // Root endpoint
  app.get('/', async () => {
    return {
      service: 'Avantle Core API',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      docs: '/docs',
    }
  })

  return app
}

export default build