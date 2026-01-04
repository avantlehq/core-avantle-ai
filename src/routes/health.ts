import { FastifyPluginAsync } from 'fastify'
import { checkDatabaseHealth } from '../lib/database.js'
import { appConfig } from '../lib/config.js'
import { HealthCheckResponse } from '../types/api.js'

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // Basic health check
  fastify.get('/', {
    schema: {
      description: 'Basic health check',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy'] },
            timestamp: { type: 'string' },
            version: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: appConfig.server.api_version,
    }
  })

  // Detailed health check with dependencies
  fastify.get('/detailed', {
    schema: {
      description: 'Detailed health check including dependencies',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
            timestamp: { type: 'string' },
            version: { type: 'string' },
            services: {
              type: 'object',
              properties: {
                database: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    response_time_ms: { type: 'number' },
                    error: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const timestamp = new Date().toISOString()
    
    // Check database health
    const dbHealth = await checkDatabaseHealth()
    
    // Determine overall status
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    
    if (dbHealth.status === 'unhealthy') {
      overallStatus = 'unhealthy'
    } else if (dbHealth.response_time_ms > 1000) {
      overallStatus = 'degraded'
    }

    const response: HealthCheckResponse = {
      status: overallStatus,
      timestamp,
      version: appConfig.server.api_version,
      services: {
        database: dbHealth,
      },
    }

    // Set appropriate HTTP status
    const httpStatus = overallStatus === 'unhealthy' ? 503 : 200
    
    return reply.status(httpStatus).send(response)
  })

  // Readiness probe (for Kubernetes)
  fastify.get('/ready', {
    schema: {
      description: 'Readiness probe for load balancers',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            ready: { type: 'boolean' },
            timestamp: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const dbHealth = await checkDatabaseHealth()
    const ready = dbHealth.status === 'healthy'
    
    const response = {
      ready,
      timestamp: new Date().toISOString(),
    }

    return reply.status(ready ? 200 : 503).send(response)
  })

  // Liveness probe (for Kubernetes)
  fastify.get('/live', {
    schema: {
      description: 'Liveness probe for container orchestration',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            alive: { type: 'boolean' },
            timestamp: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    return {
      alive: true,
      timestamp: new Date().toISOString(),
    }
  })
}