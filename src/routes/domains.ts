import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getPrisma } from '../lib/database.js'
import { logger } from '../lib/logger.js'
import { Role, DomainStatus } from '../lib/prisma/index.js'
import { ErrorCode } from '../types/api.js'

const createDomainSchema = z.object({
  tenant_id: z.string().cuid(),
  hostname: z.string().min(1).max(255).toLowerCase(),
})

const updateDomainSchema = z.object({
  status: z.nativeEnum(DomainStatus).optional(),
  redirect_rules: z.record(z.any()).optional(),
  ssl_config: z.record(z.any()).optional(),
})

export const domainRoutes: FastifyPluginAsync = async (fastify) => {
  // List all domains (admin) or tenant domains
  fastify.get('/', {
    schema: {
      description: 'List domains',
      tags: ['Domains'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1, default: 1 },
          page_size: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          tenant_id: { type: 'string' },
          status: { type: 'string', enum: Object.values(DomainStatus) },
          hostname: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { page = 1, page_size = 20, tenant_id, status, hostname } = request.query as any
    const db = getPrisma()

    try {
      let where: any = {}

      // Filter by accessible tenants for non-admin users
      if (request.user.role !== Role.PLATFORM_ADMIN) {
        const userTenantIds = (request.user.tenant_context || []).map(tc => tc.tenant_id)
        where.tenant_id = { in: userTenantIds }
      }

      // Apply filters
      if (tenant_id) where.tenant_id = tenant_id
      if (status) where.status = status
      if (hostname) where.hostname = { contains: hostname, mode: 'insensitive' }

      const offset = (page - 1) * page_size

      const [domains, totalCount] = await Promise.all([
        db.domain.findMany({
          where,
          skip: offset,
          take: page_size,
          include: {
            tenant: {
              select: {
                id: true,
                name: true,
                partner: {
                  select: { name: true },
                },
              },
            },
          },
          orderBy: { created_at: 'desc' },
        }),
        db.domain.count({ where }),
      ])

      return {
        success: true,
        data: domains.map(domain => ({
          id: domain.id,
          hostname: domain.hostname,
          status: domain.status,
          verified_at: domain.verified_at?.toISOString(),
          last_verified_at: domain.last_verified_at?.toISOString(),
          verification_errors: domain.verification_errors,
          dns_records: domain.dns_records,
          created_at: domain.created_at.toISOString(),
          tenant: {
            id: domain.tenant.id,
            name: domain.tenant.name,
            partner_name: domain.tenant.partner.name,
          },
        })),
        meta: {
          correlation_id: request.correlationId,
          timestamp: new Date().toISOString(),
          version: '1.0.0',
          pagination: {
            total_count: totalCount,
            page,
            page_size,
            total_pages: Math.ceil(totalCount / page_size),
            has_next: offset + page_size < totalCount,
            has_prev: page > 1,
          },
        },
      }

    } catch (error) {
      logger.error('Failed to list domains', {
        correlation_id: request.correlationId,
        user_id: request.user.sub,
      }, error as Error)

      throw error
    }
  })

  // Create domain
  fastify.post('/', {
    schema: {
      description: 'Register new domain',
      tags: ['Domains'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['tenant_id', 'hostname'],
        properties: {
          tenant_id: { type: 'string' },
          hostname: { type: 'string', minLength: 1, maxLength: 255 },
        },
      },
    },
  }, async (request, reply) => {
    const body = createDomainSchema.parse(request.body)
    const db = getPrisma()

    try {
      // Check if user can manage domains for this tenant
      if (request.user.role !== Role.PLATFORM_ADMIN) {
        const userTenantIds = (request.user.tenant_context || []).map(tc => tc.tenant_id)
        if (!userTenantIds.includes(body.tenant_id)) {
          return reply.status(403).send({
            success: false,
            error: {
              code: ErrorCode.FORBIDDEN,
              message: 'Access denied to this tenant',
              correlation_id: request.correlationId,
            },
          })
        }
      }

      // Check tenant exists and domain limit
      const tenant = await db.tenant.findUnique({
        where: { id: body.tenant_id },
        include: {
          _count: { select: { domains: true } },
        },
      })

      if (!tenant || tenant.status !== 'ACTIVE') {
        return reply.status(400).send({
          success: false,
          error: {
            code: ErrorCode.RESOURCE_NOT_FOUND,
            message: 'Tenant not found or inactive',
            correlation_id: request.correlationId,
          },
        })
      }

      // Check domain limit per tenant
      const MAX_DOMAINS_PER_TENANT = 50 // From config
      if (tenant._count.domains >= MAX_DOMAINS_PER_TENANT) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'DOMAIN_LIMIT_EXCEEDED',
            message: `Tenant has reached maximum domain limit (${MAX_DOMAINS_PER_TENANT})`,
            correlation_id: request.correlationId,
          },
        })
      }

      // Validate hostname format
      const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
      if (!hostnameRegex.test(body.hostname)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ErrorCode.INVALID_FORMAT,
            message: 'Invalid hostname format',
            correlation_id: request.correlationId,
          },
        })
      }

      const domain = await db.domain.create({
        data: {
          tenant_id: body.tenant_id,
          hostname: body.hostname,
          status: DomainStatus.PENDING,
        },
      })

      logger.info('Domain created', {
        correlation_id: request.correlationId,
        domain_id: domain.id,
        hostname: body.hostname,
        tenant_id: body.tenant_id,
        created_by: request.user.sub,
      })

      return reply.status(201).send({
        success: true,
        data: {
          id: domain.id,
          hostname: domain.hostname,
          status: domain.status,
          tenant_id: domain.tenant_id,
          created_at: domain.created_at.toISOString(),
        },
      })

    } catch (error) {
      logger.error('Failed to create domain', {
        correlation_id: request.correlationId,
        hostname: body.hostname,
        tenant_id: body.tenant_id,
      }, error as Error)

      throw error
    }
  })

  // Verify domain
  fastify.post('/:id/verify', {
    schema: {
      description: 'Force domain verification',
      tags: ['Domains'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getPrisma()

    try {
      // Get domain with tenant info
      const domain = await db.domain.findUnique({
        where: { id },
        include: {
          tenant: true,
        },
      })

      if (!domain) {
        return reply.status(404).send({
          success: false,
          error: {
            code: ErrorCode.RESOURCE_NOT_FOUND,
            message: 'Domain not found',
            correlation_id: request.correlationId,
          },
        })
      }

      // Check access
      if (request.user.role !== Role.PLATFORM_ADMIN) {
        const userTenantIds = (request.user.tenant_context || []).map(tc => tc.tenant_id)
        if (!userTenantIds.includes(domain.tenant_id)) {
          return reply.status(403).send({
            success: false,
            error: {
              code: ErrorCode.FORBIDDEN,
              message: 'Access denied to this domain',
              correlation_id: request.correlationId,
            },
          })
        }
      }

      // Simulate domain verification process
      // In a real implementation, this would:
      // 1. Check DNS records
      // 2. Verify SSL certificate
      // 3. Test HTTP/HTTPS connectivity
      
      const now = new Date()
      let status: DomainStatus
      let verification_errors: string[] = []

      // Simple verification simulation
      const isValidFormat = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(domain.hostname)
      
      if (isValidFormat && !domain.hostname.includes('invalid')) {
        status = DomainStatus.VERIFIED
      } else {
        status = DomainStatus.FAILED
        verification_errors = ['DNS resolution failed', 'Invalid hostname format']
      }

      const updatedDomain = await db.domain.update({
        where: { id },
        data: {
          status,
          verified_at: status === DomainStatus.VERIFIED ? now : null,
          last_verified_at: now,
          verification_errors,
          dns_records: status === DomainStatus.VERIFIED ? {
            A: ['127.0.0.1'],
            TXT: [`avantle-verification=${domain.id}`],
          } : null,
        },
      })

      logger.info('Domain verification attempted', {
        correlation_id: request.correlationId,
        domain_id: id,
        hostname: domain.hostname,
        status,
        verified_by: request.user.sub,
      })

      return {
        success: true,
        data: {
          id: updatedDomain.id,
          hostname: updatedDomain.hostname,
          status: updatedDomain.status,
          verified_at: updatedDomain.verified_at?.toISOString(),
          last_verified_at: updatedDomain.last_verified_at?.toISOString(),
          verification_errors: updatedDomain.verification_errors,
          dns_records: updatedDomain.dns_records,
        },
      }

    } catch (error) {
      logger.error('Failed to verify domain', {
        correlation_id: request.correlationId,
        domain_id: id,
      }, error as Error)

      throw error
    }
  })

  // Resolve hostname to tenant (public endpoint for product integrations)
  fastify.get('/resolve', {
    schema: {
      description: 'Resolve hostname to tenant information',
      tags: ['Domains'],
      querystring: {
        type: 'object',
        required: ['hostname'],
        properties: {
          hostname: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                tenant_id: { type: 'string' },
                tenant_name: { type: 'string' },
                tenant_type: { type: 'string' },
                domain_status: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { hostname } = request.query as { hostname: string }
    const db = getPrisma()

    try {
      const domain = await db.domain.findUnique({
        where: { hostname: hostname.toLowerCase() },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              tenant_type: true,
              status: true,
            },
          },
        },
      })

      if (!domain || domain.status !== DomainStatus.VERIFIED || domain.tenant.status !== 'ACTIVE') {
        return reply.status(404).send({
          success: false,
          error: {
            code: ErrorCode.RESOURCE_NOT_FOUND,
            message: 'Domain not found or not verified',
            correlation_id: request.correlationId,
          },
        })
      }

      return {
        success: true,
        data: {
          tenant_id: domain.tenant.id,
          tenant_name: domain.tenant.name,
          tenant_type: domain.tenant.tenant_type,
          domain_status: domain.status,
        },
      }

    } catch (error) {
      logger.error('Failed to resolve hostname', {
        correlation_id: request.correlationId,
        hostname,
      }, error as Error)

      throw error
    }
  })

  // Update domain
  fastify.put('/:id', {
    schema: {
      description: 'Update domain configuration',
      tags: ['Domains'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: Object.values(DomainStatus) },
          redirect_rules: { type: 'object' },
          ssl_config: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateDomainSchema.parse(request.body)
    const db = getPrisma()

    try {
      // Get domain with tenant info
      const domain = await db.domain.findUnique({
        where: { id },
      })

      if (!domain) {
        return reply.status(404).send({
          success: false,
          error: {
            code: ErrorCode.RESOURCE_NOT_FOUND,
            message: 'Domain not found',
            correlation_id: request.correlationId,
          },
        })
      }

      // Check access
      if (request.user.role !== Role.PLATFORM_ADMIN) {
        const userTenantIds = (request.user.tenant_context || []).map(tc => tc.tenant_id)
        if (!userTenantIds.includes(domain.tenant_id)) {
          return reply.status(403).send({
            success: false,
            error: {
              code: ErrorCode.FORBIDDEN,
              message: 'Access denied to this domain',
              correlation_id: request.correlationId,
            },
          })
        }
      }

      const updatedDomain = await db.domain.update({
        where: { id },
        data: body,
      })

      logger.info('Domain updated', {
        correlation_id: request.correlationId,
        domain_id: id,
        changes: Object.keys(body),
        updated_by: request.user.sub,
      })

      return {
        success: true,
        data: {
          id: updatedDomain.id,
          hostname: updatedDomain.hostname,
          status: updatedDomain.status,
          redirect_rules: updatedDomain.redirect_rules,
          ssl_config: updatedDomain.ssl_config,
          updated_at: updatedDomain.updated_at.toISOString(),
        },
      }

    } catch (error) {
      logger.error('Failed to update domain', {
        correlation_id: request.correlationId,
        domain_id: id,
      }, error as Error)

      throw error
    }
  })
}