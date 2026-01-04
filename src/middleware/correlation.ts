import { FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'crypto'

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string
  }
}

export const correlationMiddleware: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    // Get correlation ID from header or generate new one
    const correlationId = (request.headers['x-correlation-id'] as string) || randomUUID()
    
    // Attach to request
    request.correlationId = correlationId
    
    // Add to response headers
    reply.header('x-correlation-id', correlationId)
  })
}