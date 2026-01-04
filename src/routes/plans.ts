import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getPrisma } from '../lib/database.js'
import { logger } from '../lib/logger.js'
import { Role } from '../lib/prisma/index.js'
import { ErrorCode } from '../types/api.js'

const createPlanSchema = z.object({
  key: z.string().min(1).max(50).regex(/^[a-z][a-z0-9-]*[a-z0-9]$/),
  name: z.string().min(1).max(255),
  limits: z.record(z.any()),
})

const updatePlanSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  limits: z.record(z.any()).optional(),
})

const attachPlanSchema = z.object({
  tenant_id: z.string().cuid(),
  plan_id: z.string().cuid(),
  effective_from: z.string().datetime().optional(),
})

export const planRoutes: FastifyPluginAsync = async (fastify) => {
  // List plans
  fastify.get('/', {
    schema: {
      description: 'List all plans',
      tags: ['Plans'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1, default: 1 },
          page_size: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          active_only: { type: 'boolean', default: false },
        },
      },
    },
  }, async (request, reply) => {
    const { page = 1, page_size = 20, active_only = false } = request.query as any
    const db = getPrisma()

    try {
      const offset = (page - 1) * page_size

      const [plans, totalCount] = await Promise.all([
        db.plan.findMany({
          skip: offset,
          take: page_size,
          include: {
            _count: {
              select: { tenant_plans: true },
            },
          },
          orderBy: { created_at: 'desc' },
        }),
        db.plan.count(),
      ])

      return {
        success: true,
        data: plans.map(plan => ({
          id: plan.id,
          key: plan.key,
          name: plan.name,
          limits: plan.limits,
          tenant_count: plan._count.tenant_plans,
          created_at: plan.created_at.toISOString(),
          updated_at: plan.updated_at.toISOString(),
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
      logger.error('Failed to list plans', {
        correlation_id: request.correlationId,
        user_id: request.user.sub,
      }, error as Error)

      throw error
    }
  })

  // Create plan (admin only)
  fastify.post('/', {
    schema: {
      description: 'Create new plan (PlatformAdmin only)',
      tags: ['Plans'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['key', 'name', 'limits'],
        properties: {
          key: { 
            type: 'string', 
            minLength: 1, 
            maxLength: 50,
            pattern: '^[a-z][a-z0-9-]*[a-z0-9]$',
          },
          name: { type: 'string', minLength: 1, maxLength: 255 },
          limits: { 
            type: 'object',
            description: 'JSON object with quota limits',
          },
        },
      },
    },
    preHandler: async (request, reply) => {
      if (request.user.role !== Role.PLATFORM_ADMIN) {
        return reply.status(403).send({
          success: false,
          error: {
            code: ErrorCode.FORBIDDEN,
            message: 'Only platform administrators can create plans',
            correlation_id: request.correlationId,
          },
        })
      }
    },
  }, async (request, reply) => {
    const body = createPlanSchema.parse(request.body)
    const db = getPrisma()

    try {
      const plan = await db.plan.create({
        data: {
          key: body.key,
          name: body.name,
          limits: body.limits,
        },
      })

      logger.info('Plan created', {
        correlation_id: request.correlationId,
        plan_id: plan.id,
        plan_key: plan.key,
        created_by: request.user.sub,
      })

      return reply.status(201).send({
        success: true,
        data: {
          id: plan.id,
          key: plan.key,
          name: plan.name,
          limits: plan.limits,
          created_at: plan.created_at.toISOString(),
        },
      })

    } catch (error) {
      logger.error('Failed to create plan', {
        correlation_id: request.correlationId,
        plan_key: body.key,
      }, error as Error)

      throw error
    }
  })

  // Get plan by ID
  fastify.get('/:id', {
    schema: {
      description: 'Get plan by ID',
      tags: ['Plans'],
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
      const plan = await db.plan.findUnique({
        where: { id },
        include: {
          _count: {
            select: { tenant_plans: true },
          },
          tenant_plans: {
            include: {
              tenant: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: { effective_from: 'desc' },
            take: 10, // Recent assignments
          },
        },
      })

      if (!plan) {
        return reply.status(404).send({
          success: false,
          error: {
            code: ErrorCode.RESOURCE_NOT_FOUND,
            message: 'Plan not found',
            correlation_id: request.correlationId,
          },
        })
      }

      return {
        success: true,
        data: {
          id: plan.id,
          key: plan.key,
          name: plan.name,
          limits: plan.limits,
          tenant_count: plan._count.tenant_plans,
          created_at: plan.created_at.toISOString(),
          updated_at: plan.updated_at.toISOString(),
          recent_assignments: plan.tenant_plans.map(tp => ({
            tenant_id: tp.tenant.id,
            tenant_name: tp.tenant.name,
            effective_from: tp.effective_from.toISOString(),
            effective_to: tp.effective_to?.toISOString(),
          })),
        },
      }

    } catch (error) {
      logger.error('Failed to get plan', {
        correlation_id: request.correlationId,
        plan_id: id,
      }, error as Error)

      throw error
    }
  })

  // Update plan (admin only)
  fastify.put('/:id', {
    schema: {
      description: 'Update plan (PlatformAdmin only)',
      tags: ['Plans'],
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
          limits: { type: 'object' },
        },
      },
    },
    preHandler: async (request, reply) => {
      if (request.user.role !== Role.PLATFORM_ADMIN) {
        return reply.status(403).send({
          success: false,
          error: {
            code: ErrorCode.FORBIDDEN,
            message: 'Only platform administrators can update plans',
            correlation_id: request.correlationId,
          },
        })
      }
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updatePlanSchema.parse(request.body)
    const db = getPrisma()

    try {
      const plan = await db.plan.update({
        where: { id },
        data: body,
      })

      logger.info('Plan updated', {
        correlation_id: request.correlationId,
        plan_id: id,
        changes: Object.keys(body),
        updated_by: request.user.sub,
      })

      return {
        success: true,
        data: {
          id: plan.id,
          key: plan.key,
          name: plan.name,
          limits: plan.limits,
          updated_at: plan.updated_at.toISOString(),
        },
      }

    } catch (error) {
      logger.error('Failed to update plan', {
        correlation_id: request.correlationId,
        plan_id: id,
      }, error as Error)

      throw error
    }
  })

  // Attach plan to tenant
  fastify.post('/attach', {
    schema: {
      description: 'Attach plan to tenant',
      tags: ['Plans'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['tenant_id', 'plan_id'],
        properties: {
          tenant_id: { type: 'string' },
          plan_id: { type: 'string' },
          effective_from: { 
            type: 'string', 
            format: 'date-time',
            description: 'When the plan becomes effective (defaults to now)',
          },
        },
      },
    },
    preHandler: async (request, reply) => {
      // Only PlatformAdmin and PartnerAdmin can attach plans
      if (![Role.PLATFORM_ADMIN, Role.PARTNER_ADMIN].includes(request.user.role)) {
        return reply.status(403).send({
          success: false,
          error: {
            code: ErrorCode.FORBIDDEN,
            message: 'Insufficient permissions to attach plans',
            correlation_id: request.correlationId,
          },
        })
      }
    },
  }, async (request, reply) => {
    const body = attachPlanSchema.parse(request.body)
    const db = getPrisma()

    try {
      // Check if tenant exists and user has access
      const tenant = await db.tenant.findUnique({
        where: { id: body.tenant_id },
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

      // Check access for PartnerAdmin
      if (request.user.role === Role.PARTNER_ADMIN) {
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

      // Check if plan exists
      const plan = await db.plan.findUnique({
        where: { id: body.plan_id },
      })

      if (!plan) {
        return reply.status(404).send({
          success: false,
          error: {
            code: ErrorCode.RESOURCE_NOT_FOUND,
            message: 'Plan not found',
            correlation_id: request.correlationId,
          },
        })
      }

      const effectiveFrom = body.effective_from ? new Date(body.effective_from) : new Date()

      // End current plan if exists
      await db.tenantPlan.updateMany({
        where: {
          tenant_id: body.tenant_id,
          effective_to: null,
        },
        data: {
          effective_to: effectiveFrom,
        },
      })

      // Create new plan assignment
      const tenantPlan = await db.tenantPlan.create({
        data: {
          tenant_id: body.tenant_id,
          plan_id: body.plan_id,
          effective_from: effectiveFrom,
        },
        include: {
          plan: {
            select: {
              key: true,
              name: true,
            },
          },
          tenant: {
            select: {
              name: true,
            },
          },
        },
      })

      logger.info('Plan attached to tenant', {
        correlation_id: request.correlationId,
        tenant_id: body.tenant_id,
        plan_id: body.plan_id,
        effective_from: effectiveFrom.toISOString(),
        attached_by: request.user.sub,
      })

      return reply.status(201).send({
        success: true,
        data: {
          id: tenantPlan.id,
          tenant_id: body.tenant_id,
          tenant_name: tenantPlan.tenant.name,
          plan_id: body.plan_id,
          plan_key: tenantPlan.plan.key,
          plan_name: tenantPlan.plan.name,
          effective_from: tenantPlan.effective_from.toISOString(),
          created_at: tenantPlan.created_at.toISOString(),
        },
      })

    } catch (error) {
      logger.error('Failed to attach plan to tenant', {
        correlation_id: request.correlationId,
        tenant_id: body.tenant_id,
        plan_id: body.plan_id,
      }, error as Error)

      throw error
    }
  })

  // Get tenant's current plan
  fastify.get('/tenant/:tenant_id/current', {
    schema: {
      description: 'Get tenant\'s current plan',
      tags: ['Plans'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['tenant_id'],
        properties: {
          tenant_id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { tenant_id } = request.params as { tenant_id: string }
    const db = getPrisma()

    try {
      // Check access to this tenant
      if (request.user.role !== Role.PLATFORM_ADMIN) {
        const userTenantIds = (request.user.tenant_context || []).map(tc => tc.tenant_id)
        if (!userTenantIds.includes(tenant_id)) {
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

      const currentPlan = await db.tenantPlan.findFirst({
        where: {
          tenant_id,
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
      })

      if (!currentPlan) {
        return reply.status(404).send({
          success: false,
          error: {
            code: ErrorCode.RESOURCE_NOT_FOUND,
            message: 'No active plan found for this tenant',
            correlation_id: request.correlationId,
          },
        })
      }

      return {
        success: true,
        data: {
          id: currentPlan.id,
          plan_id: currentPlan.plan.id,
          plan_key: currentPlan.plan.key,
          plan_name: currentPlan.plan.name,
          limits: currentPlan.plan.limits,
          effective_from: currentPlan.effective_from.toISOString(),
          effective_to: currentPlan.effective_to?.toISOString(),
        },
      }

    } catch (error) {
      logger.error('Failed to get tenant current plan', {
        correlation_id: request.correlationId,
        tenant_id,
      }, error as Error)

      throw error
    }
  })
}