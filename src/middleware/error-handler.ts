import { FastifyPluginAsync, FastifyError } from 'fastify'
import { ZodError } from 'zod'
import { Prisma } from '../lib/prisma/index.js'
import { logger } from '../lib/logger.js'
import { ErrorCode } from '../types/api.js'

export const errorHandlerMiddleware: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler(async (error: FastifyError, request, reply) => {
    const correlationId = request.correlationId || 'unknown'
    
    // Log error with context
    logger.error('Request error', {
      correlation_id: correlationId,
      url: request.url,
      method: request.method,
      user_id: (request as any).user?.sub,
      tenant_id: (request as any).user?.tenant_id,
      ip_address: request.ip,
    }, error)

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Validation failed',
          details: {
            issues: error.issues.map(issue => ({
              field: issue.path.join('.'),
              message: issue.message,
              received: issue.received,
            })),
          },
          correlation_id: correlationId,
        },
      })
    }

    // Handle Prisma errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case 'P2002':
          return reply.status(409).send({
            success: false,
            error: {
              code: ErrorCode.RESOURCE_ALREADY_EXISTS,
              message: 'Resource already exists',
              details: { constraint: error.meta?.target },
              correlation_id: correlationId,
            },
          })
        
        case 'P2025':
          return reply.status(404).send({
            success: false,
            error: {
              code: ErrorCode.RESOURCE_NOT_FOUND,
              message: 'Resource not found',
              correlation_id: correlationId,
            },
          })
        
        case 'P2003':
          return reply.status(400).send({
            success: false,
            error: {
              code: ErrorCode.RESOURCE_CONFLICT,
              message: 'Foreign key constraint failed',
              correlation_id: correlationId,
            },
          })
      }
    }

    // Handle Fastify JWT errors
    if (error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
      return reply.status(401).send({
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Authorization header required',
          correlation_id: correlationId,
        },
      })
    }

    if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
      return reply.status(401).send({
        success: false,
        error: {
          code: ErrorCode.TOKEN_EXPIRED,
          message: 'JWT token expired',
          correlation_id: correlationId,
        },
      })
    }

    if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID') {
      return reply.status(401).send({
        success: false,
        error: {
          code: ErrorCode.TOKEN_INVALID,
          message: 'JWT token invalid',
          correlation_id: correlationId,
        },
      })
    }

    // Handle rate limiting
    if (error.statusCode === 429) {
      return reply.status(429).send({
        success: false,
        error: {
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: 'Rate limit exceeded',
          correlation_id: correlationId,
        },
      })
    }

    // Handle custom application errors
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        success: false,
        error: {
          code: error.code || ErrorCode.VALIDATION_ERROR,
          message: error.message,
          correlation_id: correlationId,
        },
      })
    }

    // Handle unknown errors
    const statusCode = error.statusCode || 500
    const errorCode = statusCode >= 500 ? ErrorCode.INTERNAL_SERVER_ERROR : ErrorCode.VALIDATION_ERROR

    return reply.status(statusCode).send({
      success: false,
      error: {
        code: errorCode,
        message: statusCode >= 500 ? 'Internal server error' : error.message,
        correlation_id: correlationId,
      },
    })
  })
}