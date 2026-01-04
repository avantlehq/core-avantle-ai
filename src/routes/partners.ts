import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getPrisma } from '../lib/database.js'
import { logger } from '../lib/logger.js'
import { Role, PartnerStatus } from '../lib/prisma/index.js'
import { ErrorCode } from '../types/api.js'

const createPartnerSchema = z.object({
  name: z.string().min(1).max(255),
  billing_email: z.string().email(),
})

const updatePartnerSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  billing_email: z.string().email().optional(),
  status: z.nativeEnum(PartnerStatus).optional(),
})

export const partnerRoutes: FastifyPluginAsync = async (fastify) => {
  // List partners
  fastify.get('/', {
    schema: {
      description: 'List partners',
      tags: ['Partners'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1, default: 1 },
          page_size: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          status: { type: 'string', enum: Object.values(PartnerStatus) },
        },
      },
    },
  }, async (request, reply) => {
    const { page = 1, page_size = 20, status } = request.query as any
    const db = getPrisma()

    try {
      const where = status ? { status } : {}
      const offset = (page - 1) * page_size

      const [partners, totalCount] = await Promise.all([
        db.partner.findMany({
          where,
          skip: offset,
          take: page_size,
          include: {
            _count: {
              select: { tenants: true },
            },
          },
          orderBy: { created_at: 'desc' },
        }),
        db.partner.count({ where }),
      ])

      return {
        success: true,
        data: partners.map(partner => ({
          id: partner.id,
          name: partner.name,
          status: partner.status,
          billing_email: partner.billing_email,
          tenant_count: partner._count.tenants,
          created_at: partner.created_at.toISOString(),
          updated_at: partner.updated_at.toISOString(),
          last_active_at: partner.last_active_at?.toISOString(),
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
      logger.error('Failed to list partners', {
        correlation_id: request.correlationId,
        user_id: request.user.sub,
      }, error as Error)

      throw error
    }
  })

  // Create partner
  fastify.post('/', {
    schema: {
      description: 'Create new partner (PlatformAdmin only)',
      tags: ['Partners'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name', 'billing_email'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          billing_email: { type: 'string', format: 'email' },
        },
      },
    },
    preHandler: async (request, reply) => {
      if (request.user.role !== Role.PLATFORM_ADMIN) {
        return reply.status(403).send({
          success: false,
          error: {
            code: ErrorCode.FORBIDDEN,
            message: 'Only platform administrators can create partners',
            correlation_id: request.correlationId,
          },
        })
      }
    },
  }, async (request, reply) => {
    const body = createPartnerSchema.parse(request.body)
    const db = getPrisma()

    try {
      const partner = await db.partner.create({
        data: {
          name: body.name,
          billing_email: body.billing_email,
          created_by_user_id: request.user.sub,
        },
      })

      logger.info('Partner created', {
        correlation_id: request.correlationId,
        partner_id: partner.id,
        created_by: request.user.sub,
      })

      return reply.status(201).send({
        success: true,
        data: {
          id: partner.id,
          name: partner.name,
          status: partner.status,
          billing_email: partner.billing_email,
          created_at: partner.created_at.toISOString(),
        },
      })

    } catch (error) {
      logger.error('Failed to create partner', {
        correlation_id: request.correlationId,
        name: body.name,
      }, error as Error)

      throw error
    }
  })

  // Get partner by ID
  fastify.get('/:id', {
    schema: {
      description: 'Get partner by ID',
      tags: ['Partners'],
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
      const partner = await db.partner.findUnique({
        where: { id },
        include: {
          _count: {
            select: { tenants: true },
          },
          tenants: {
            select: {
              id: true,
              name: true,
              status: true,
              tenant_type: true,
              created_at: true,
            },
            orderBy: { created_at: 'desc' },
          },
        },
      })

      if (!partner) {
        return reply.status(404).send({
          success: false,
          error: {
            code: ErrorCode.RESOURCE_NOT_FOUND,
            message: 'Partner not found',
            correlation_id: request.correlationId,
          },
        })
      }

      // Check access for non-admin users
      if (request.user.role !== Role.PLATFORM_ADMIN) {
        // PartnerAdmin can only access their own partner
        const userMemberships = request.user.tenant_context || []
        const hasAccess = userMemberships.some(tc => 
          partner.tenants.some(tenant => tenant.id === tc.tenant_id)
        )
        
        if (!hasAccess) {
          return reply.status(403).send({
            success: false,
            error: {
              code: ErrorCode.FORBIDDEN,
              message: 'Access denied to this partner',
              correlation_id: request.correlationId,
            },
          })
        }
      }

      return {
        success: true,
        data: {
          id: partner.id,
          name: partner.name,
          status: partner.status,
          billing_email: partner.billing_email,
          tenant_count: partner._count.tenants,
          created_at: partner.created_at.toISOString(),
          updated_at: partner.updated_at.toISOString(),
          last_active_at: partner.last_active_at?.toISOString(),
          tenants: partner.tenants.map(tenant => ({
            id: tenant.id,
            name: tenant.name,
            status: tenant.status,
            tenant_type: tenant.tenant_type,
            created_at: tenant.created_at.toISOString(),
          })),
        },
      }

    } catch (error) {
      logger.error('Failed to get partner', {
        correlation_id: request.correlationId,
        partner_id: id,
      }, error as Error)

      throw error
    }
  })

  // Update partner
  fastify.put('/:id', {
    schema: {
      description: 'Update partner',
      tags: ['Partners'],
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
          name: { type: 'string', minLength: 1, maxLength: 255 },
          billing_email: { type: 'string', format: 'email' },
          status: { type: 'string', enum: Object.values(PartnerStatus) },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updatePartnerSchema.parse(request.body)
    const db = getPrisma()

    try {
      // Check if partner exists and user has access
      const existingPartner = await db.partner.findUnique({
        where: { id },
        include: {
          tenants: {
            select: { id: true },
          },
        },
      })

      if (!existingPartner) {
        return reply.status(404).send({
          success: false,
          error: {
            code: ErrorCode.RESOURCE_NOT_FOUND,
            message: 'Partner not found',
            correlation_id: request.correlationId,
          },
        })
      }

      // Check access for non-admin users
      if (request.user.role !== Role.PLATFORM_ADMIN) {
        const userMemberships = request.user.tenant_context || []
        const hasAccess = userMemberships.some(tc => 
          existingPartner.tenants.some(tenant => tenant.id === tc.tenant_id)
        )
        
        if (!hasAccess) {
          return reply.status(403).send({
            success: false,
            error: {
              code: ErrorCode.FORBIDDEN,
              message: 'Access denied to this partner',
              correlation_id: request.correlationId,
            },
          })
        }

        // Non-admin users cannot change status
        if (body.status && request.user.role !== Role.PLATFORM_ADMIN) {
          delete body.status
        }
      }

      const partner = await db.partner.update({
        where: { id },
        data: body,
      })

      logger.info('Partner updated', {
        correlation_id: request.correlationId,
        partner_id: id,
        updated_by: request.user.sub,
        changes: Object.keys(body),
      })

      return {
        success: true,
        data: {
          id: partner.id,
          name: partner.name,
          status: partner.status,
          billing_email: partner.billing_email,
          updated_at: partner.updated_at.toISOString(),
        },
      }

    } catch (error) {
      logger.error('Failed to update partner', {
        correlation_id: request.correlationId,
        partner_id: id,
      }, error as Error)

      throw error
    }
  })

  // Update partner status (admin only)
  fastify.put('/:id/status', {
    schema: {
      description: 'Update partner status (PlatformAdmin only)',
      tags: ['Partners'],
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
        required: ['status'],
        properties: {
          status: { type: 'string', enum: Object.values(PartnerStatus) },
        },
      },
    },
    preHandler: async (request, reply) => {
      if (request.user.role !== Role.PLATFORM_ADMIN) {
        return reply.status(403).send({
          success: false,
          error: {
            code: ErrorCode.FORBIDDEN,
            message: 'Only platform administrators can change partner status',
            correlation_id: request.correlationId,
          },
        })
      }
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status } = request.body as { status: PartnerStatus }
    const db = getPrisma()

    try {
      const partner = await db.partner.update({
        where: { id },
        data: { status },
      })

      logger.info('Partner status updated', {
        correlation_id: request.correlationId,
        partner_id: id,
        new_status: status,
        updated_by: request.user.sub,
      })

      return {
        success: true,
        data: {
          id: partner.id,
          status: partner.status,
          updated_at: partner.updated_at.toISOString(),
        },
      }

    } catch (error) {
      logger.error('Failed to update partner status', {
        correlation_id: request.correlationId,
        partner_id: id,
        status,
      }, error as Error)

      throw error
    }
  })
}