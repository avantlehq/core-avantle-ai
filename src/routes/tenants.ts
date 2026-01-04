import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getPrisma } from '../lib/database.js'
import { logger } from '../lib/logger.js'
import { Role, TenantStatus, TenantType } from '../lib/prisma/index.js'
import { ErrorCode } from '../types/api.js'
import { TenantConfig } from '../types/tenant.js'

const createTenantSchema = z.object({
  partner_id: z.string().cuid(),
  name: z.string().min(1).max(255),
  tenant_type: z.nativeEnum(TenantType),
})

const updateTenantSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  status: z.nativeEnum(TenantStatus).optional(),
})

export const tenantRoutes: FastifyPluginAsync = async (fastify) => {
  // List tenants
  fastify.get('/', {
    schema: {
      description: 'List tenants',
      tags: ['Tenants'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1, default: 1 },
          page_size: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          partner_id: { type: 'string' },
          status: { type: 'string', enum: Object.values(TenantStatus) },
          tenant_type: { type: 'string', enum: Object.values(TenantType) },
        },
      },
    },
  }, async (request, reply) => {
    const { page = 1, page_size = 20, partner_id, status, tenant_type } = request.query as any
    const db = getPrisma()

    try {
      let where: any = {}

      // Filter by partner for non-admin users
      if (request.user.role === Role.PARTNER_ADMIN) {
        const userTenantIds = (request.user.tenant_context || []).map(tc => tc.tenant_id)
        where.id = { in: userTenantIds }
      } else if (request.user.role === Role.TENANT_ADMIN || request.user.role === Role.TENANT_USER) {
        const userTenantIds = (request.user.tenant_context || []).map(tc => tc.tenant_id)
        where.id = { in: userTenantIds }
      }

      // Apply filters
      if (partner_id) where.partner_id = partner_id
      if (status) where.status = status
      if (tenant_type) where.tenant_type = tenant_type

      const offset = (page - 1) * page_size

      const [tenants, totalCount] = await Promise.all([
        db.tenant.findMany({
          where,
          skip: offset,
          take: page_size,
          include: {
            partner: {
              select: { name: true },
            },
            _count: {
              select: {
                memberships: true,
                domains: true,
                api_clients: true,
              },
            },
          },
          orderBy: { created_at: 'desc' },
        }),
        db.tenant.count({ where }),
      ])

      return {
        success: true,
        data: tenants.map(tenant => ({
          id: tenant.id,
          name: tenant.name,
          tenant_type: tenant.tenant_type,
          status: tenant.status,
          partner_name: tenant.partner.name,
          user_count: tenant._count.memberships,
          domain_count: tenant._count.domains,
          api_client_count: tenant._count.api_clients,
          created_at: tenant.created_at.toISOString(),
          updated_at: tenant.updated_at.toISOString(),
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
      logger.error('Failed to list tenants', {
        correlation_id: request.correlationId,
        user_id: request.user.sub,
      }, error as Error)

      throw error
    }
  })

  // Create tenant
  fastify.post('/', {
    schema: {
      description: 'Create new tenant',
      tags: ['Tenants'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['partner_id', 'name', 'tenant_type'],
        properties: {
          partner_id: { type: 'string' },
          name: { type: 'string', minLength: 1, maxLength: 255 },
          tenant_type: { type: 'string', enum: Object.values(TenantType) },
        },
      },
    },
  }, async (request, reply) => {
    const body = createTenantSchema.parse(request.body)
    const db = getPrisma()

    try {
      // Check if user can create tenants for this partner
      if (request.user.role !== Role.PLATFORM_ADMIN) {
        // PartnerAdmin can only create tenants for their own partner
        if (request.user.role === Role.PARTNER_ADMIN) {
          const userTenantIds = (request.user.tenant_context || []).map(tc => tc.tenant_id)
          const partnerTenants = await db.tenant.findMany({
            where: { 
              id: { in: userTenantIds },
              partner_id: body.partner_id,
            },
          })
          
          if (partnerTenants.length === 0) {
            return reply.status(403).send({
              success: false,
              error: {
                code: ErrorCode.FORBIDDEN,
                message: 'Cannot create tenants for this partner',
                correlation_id: request.correlationId,
              },
            })
          }
        } else {
          return reply.status(403).send({
            success: false,
            error: {
              code: ErrorCode.FORBIDDEN,
              message: 'Insufficient permissions to create tenants',
              correlation_id: request.correlationId,
            },
          })
        }
      }

      // Check partner exists and is active
      const partner = await db.partner.findUnique({
        where: { id: body.partner_id },
        include: {
          _count: { select: { tenants: true } },
        },
      })

      if (!partner || partner.status !== 'ACTIVE') {
        return reply.status(400).send({
          success: false,
          error: {
            code: ErrorCode.RESOURCE_NOT_FOUND,
            message: 'Partner not found or inactive',
            correlation_id: request.correlationId,
          },
        })
      }

      // Check tenant limit per partner
      const MAX_TENANTS_PER_PARTNER = 100 // From config
      if (partner._count.tenants >= MAX_TENANTS_PER_PARTNER) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ErrorCode.TENANT_LIMIT_EXCEEDED,
            message: `Partner has reached maximum tenant limit (${MAX_TENANTS_PER_PARTNER})`,
            correlation_id: request.correlationId,
          },
        })
      }

      const tenant = await db.tenant.create({
        data: {
          partner_id: body.partner_id,
          name: body.name,
          tenant_type: body.tenant_type,
        },
      })

      logger.info('Tenant created', {
        correlation_id: request.correlationId,
        tenant_id: tenant.id,
        partner_id: body.partner_id,
        created_by: request.user.sub,
      })

      return reply.status(201).send({
        success: true,
        data: {
          id: tenant.id,
          name: tenant.name,
          tenant_type: tenant.tenant_type,
          status: tenant.status,
          partner_id: tenant.partner_id,
          created_at: tenant.created_at.toISOString(),
        },
      })

    } catch (error) {
      logger.error('Failed to create tenant', {
        correlation_id: request.correlationId,
        name: body.name,
        partner_id: body.partner_id,
      }, error as Error)

      throw error
    }
  })

  // Get tenant configuration
  fastify.get('/:id/config', {
    schema: {
      description: 'Get tenant configuration (for product integrations)',
      tags: ['Tenants'],
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
      const tenant = await db.tenant.findUnique({
        where: { id },
        include: {
          branding: true,
          domains: {
            select: {
              hostname: true,
              status: true,
              verified_at: true,
            },
            orderBy: { created_at: 'asc' },
          },
          product_access: {
            where: { status: 'ACTIVE' },
            select: {
              product_key: true,
              environment: true,
              status: true,
            },
          },
          tenant_plans: {
            where: {
              effective_from: { lte: new Date() },
              OR: [
                { effective_to: null },
                { effective_to: { gte: new Date() } },
              ],
            },
            include: {
              plan: true,
            },
            orderBy: { effective_from: 'desc' },
            take: 1,
          },
        },
      })

      if (!tenant) {
        return reply.status(404).send({
          success: false,
          error: {
            code: ErrorCode.RESOURCE_NOT_FOUND,
            message: 'Tenant not found',
            correlation_id: request.correlationId,
          },
        })
      }

      const config: TenantConfig = {
        id: tenant.id,
        name: tenant.name,
        tenant_type: tenant.tenant_type,
        branding: tenant.branding ? {
          logo_url: tenant.branding.logo_url,
          favicon_url: tenant.branding.favicon_url,
          primary_color: tenant.branding.primary_color,
          theme_config: tenant.branding.theme_config as Record<string, any>,
          custom_css_url: tenant.branding.custom_css_url,
          legal_links: tenant.branding.legal_links as Record<string, string>,
          footer_text: tenant.branding.footer_text,
        } : undefined,
        product_access: tenant.product_access.map(pa => ({
          product_key: pa.product_key,
          environment: pa.environment,
          status: pa.status,
        })),
        domains: tenant.domains.map(domain => ({
          hostname: domain.hostname,
          status: domain.status,
          verified_at: domain.verified_at?.toISOString(),
          is_primary: false, // Could add logic to determine primary domain
        })),
        plan: tenant.tenant_plans.length > 0 ? {
          plan_key: tenant.tenant_plans[0].plan.key,
          plan_name: tenant.tenant_plans[0].plan.name,
          limits: tenant.tenant_plans[0].plan.limits as Record<string, any>,
          effective_from: tenant.tenant_plans[0].effective_from.toISOString(),
          effective_to: tenant.tenant_plans[0].effective_to?.toISOString(),
        } : undefined,
      }

      return {
        success: true,
        data: config,
      }

    } catch (error) {
      logger.error('Failed to get tenant config', {
        correlation_id: request.correlationId,
        tenant_id: id,
      }, error as Error)

      throw error
    }
  })

  // Update tenant status (admin only)
  fastify.put('/:id/status', {
    schema: {
      description: 'Update tenant status',
      tags: ['Tenants'],
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
          status: { type: 'string', enum: Object.values(TenantStatus) },
        },
      },
    },
    preHandler: async (request, reply) => {
      if (![Role.PLATFORM_ADMIN, Role.PARTNER_ADMIN].includes(request.user.role)) {
        return reply.status(403).send({
          success: false,
          error: {
            code: ErrorCode.FORBIDDEN,
            message: 'Insufficient permissions to change tenant status',
            correlation_id: request.correlationId,
          },
        })
      }
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status } = request.body as { status: TenantStatus }
    const db = getPrisma()

    try {
      // Check if tenant exists and user has access
      const existingTenant = await db.tenant.findUnique({
        where: { id },
      })

      if (!existingTenant) {
        return reply.status(404).send({
          success: false,
          error: {
            code: ErrorCode.RESOURCE_NOT_FOUND,
            message: 'Tenant not found',
            correlation_id: request.correlationId,
          },
        })
      }

      // Check access for PartnerAdmin
      if (request.user.role === Role.PARTNER_ADMIN) {
        const userTenantIds = (request.user.tenant_context || []).map(tc => tc.tenant_id)
        if (!userTenantIds.includes(id)) {
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

      const tenant = await db.tenant.update({
        where: { id },
        data: { status },
      })

      logger.info('Tenant status updated', {
        correlation_id: request.correlationId,
        tenant_id: id,
        new_status: status,
        updated_by: request.user.sub,
      })

      return {
        success: true,
        data: {
          id: tenant.id,
          status: tenant.status,
          updated_at: tenant.updated_at.toISOString(),
        },
      }

    } catch (error) {
      logger.error('Failed to update tenant status', {
        correlation_id: request.correlationId,
        tenant_id: id,
        status,
      }, error as Error)

      throw error
    }
  })
}