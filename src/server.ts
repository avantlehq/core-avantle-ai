import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUI from '@fastify/swagger-ui'

import { appConfig, validateConfig } from './lib/config.js'
import { logger } from './lib/logger.js'
import { connectDatabase, disconnectDatabase } from './lib/database.js'
import { getVersionString } from './lib/version.js'

// Import middleware
import { authMiddleware } from './middleware/auth.js'
import { rbacMiddleware } from './middleware/rbac.js'
import { correlationMiddleware } from './middleware/correlation.js'
import { errorHandlerMiddleware } from './middleware/error-handler.js'

// Import routes
import { healthRoutes } from './routes/health.js'
import { versionRoutes } from './routes/version.js'
import { authRoutes } from './routes/auth.js'
import { partnerRoutes } from './routes/partners.js'
import { tenantRoutes } from './routes/tenants.js'
import { domainRoutes } from './routes/domains.js'
import { planRoutes } from './routes/plans.js'
import { usageRoutes } from './routes/usage.js'
import { adminRoutes } from './routes/admin.js'
import { systemRoutes } from './routes/system.js'

async function buildServer() {
  // Validate configuration
  const configErrors = validateConfig()
  if (configErrors.length > 0) {
    logger.error('Configuration validation failed', { errors: configErrors })
    throw new Error(`Configuration errors: ${configErrors.join(', ')}`)
  }

  // Initialize Fastify
  const fastify = Fastify({
    logger: false, // Use our custom logger
    trustProxy: true,
  })

  // Register core plugins
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // Allow Swagger UI
  })

  await fastify.register(cors, appConfig.cors)

  await fastify.register(jwt, {
    secret: appConfig.jwt.secret,
    sign: {
      expiresIn: appConfig.jwt.expires_in,
      issuer: appConfig.jwt.issuer,
      audience: appConfig.jwt.audience,
    },
    verify: {
      issuer: appConfig.jwt.issuer,
      audience: appConfig.jwt.audience,
    },
  })

  await fastify.register(rateLimit, {
    max: appConfig.rateLimit.max,
    timeWindow: appConfig.rateLimit.window,
    errorResponseBuilder: (req, context) => ({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
        correlation_id: req.headers['x-correlation-id'] as string || 'unknown',
      },
    }),
  })

  // OpenAPI Documentation
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Avantle Core API',
        description: 'Control plane for multi-tenant privacy platform',
        version: '1.0.0',
        contact: {
          name: 'Avantle Support',
          email: 'support@avantle.ai',
        },
      },
      servers: [
        {
          url: 'http://localhost:3001',
          description: 'Development server',
        },
        {
          url: 'https://core.avantle.ai',
          description: 'Production server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          apiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
          },
        },
      },
      security: [
        { bearerAuth: [] },
        { apiKeyAuth: [] },
      ],
    },
  })

  await fastify.register(swaggerUI, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  })

  // Register middleware
  await fastify.register(correlationMiddleware)
  await fastify.register(errorHandlerMiddleware)

  // Register routes
  await fastify.register(healthRoutes, { prefix: '/health' })
  await fastify.register(versionRoutes, { prefix: '/version' })
  await fastify.register(authRoutes, { prefix: '/auth' })
  
  // Protected routes with authentication
  await fastify.register(async function(fastify) {
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
  fastify.get('/', {
    schema: {
      description: 'API root endpoint',
      tags: ['Root'],
      response: {
        200: {
          type: 'object',
          properties: {
            service: { type: 'string' },
            version: { type: 'string' },
            timestamp: { type: 'string' },
            docs: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    return {
      service: 'Avantle Core API',
      version: getVersionString(),
      timestamp: new Date().toISOString(),
      docs: '/docs',
    }
  })

  return fastify
}

async function startServer() {
  try {
    // Connect to database
    await connectDatabase()

    // Build and start server
    const server = await buildServer()
    
    await server.listen({
      host: appConfig.server.host,
      port: appConfig.server.port,
    })

    logger.info('Server started successfully', {
      host: appConfig.server.host,
      port: appConfig.server.port,
      env: appConfig.server.node_env,
    })

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown`)
      
      try {
        await server.close()
        await disconnectDatabase()
        logger.info('Server shutdown complete')
        process.exit(0)
      } catch (error) {
        logger.error('Error during shutdown', {}, error as Error)
        process.exit(1)
      }
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))

  } catch (error) {
    logger.error('Failed to start server', {}, error as Error)
    process.exit(1)
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer()
}

export { buildServer, startServer }