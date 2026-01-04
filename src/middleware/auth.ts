import { FastifyPluginAsync } from 'fastify'
import { JWTPayload, RequestContext } from '../types/auth.js'
import { logger } from '../lib/logger.js'
import { ErrorCode } from '../types/api.js'

declare module 'fastify' {
  interface FastifyRequest {
    user: JWTPayload
    context: RequestContext
  }
}

export const authMiddleware: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    try {
      // Skip auth for health checks and docs
      if (request.url.startsWith('/health') || request.url.startsWith('/docs')) {
        return
      }

      // Extract JWT token
      const token = request.headers.authorization?.replace('Bearer ', '')
      if (!token) {
        return reply.status(401).send({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'Authorization token required',
            correlation_id: request.correlationId,
          },
        })
      }

      // Verify JWT
      let payload: JWTPayload
      try {
        payload = await request.jwtVerify() as JWTPayload
      } catch (error) {
        logger.warn('JWT verification failed', {
          correlation_id: request.correlationId,
          ip_address: request.ip,
          user_agent: request.headers['user-agent'],
        })

        return reply.status(401).send({
          success: false,
          error: {
            code: ErrorCode.TOKEN_INVALID,
            message: 'Invalid or expired token',
            correlation_id: request.correlationId,
          },
        })
      }

      // Attach user to request
      request.user = payload

      // Create request context
      request.context = {
        user_id: payload.sub,
        role: payload.role,
        correlation_id: request.correlationId,
        ip_address: request.ip,
        user_agent: request.headers['user-agent'] as string,
      }

      // Extract tenant context for tenant-scoped requests
      if (request.url.startsWith('/tenants/')) {
        const tenantMatch = request.url.match(/^\/tenants\/([^\/]+)/)
        if (tenantMatch) {
          request.context.tenant_id = tenantMatch[1]
        }
      }

      logger.debug('Authentication successful', {
        correlation_id: request.correlationId,
        user_id: payload.sub,
        role: payload.role,
        tenant_id: request.context.tenant_id,
      })

    } catch (error) {
      logger.error('Authentication middleware error', {
        correlation_id: request.correlationId,
        ip_address: request.ip,
      }, error as Error)

      return reply.status(500).send({
        success: false,
        error: {
          code: ErrorCode.INTERNAL_SERVER_ERROR,
          message: 'Authentication error',
          correlation_id: request.correlationId,
        },
      })
    }
  })
}