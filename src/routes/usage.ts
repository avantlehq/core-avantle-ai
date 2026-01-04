import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getPrisma } from '../lib/database.js'
import { logger } from '../lib/logger.js'
import { Role, Environment } from '../lib/prisma/index.js'
import { ErrorCode } from '../types/api.js'
import { UsageSummary } from '../types/tenant.js'

const recordUsageSchema = z.object({
  tenant_id: z.string().cuid(),
  product_key: z.string(),
  environment: z.nativeEnum(Environment),
  metric_key: z.string(),
  value: z.number().int().min(0),
  period_start: z.string().datetime(),
})

export const usageRoutes: FastifyPluginAsync = async (fastify) => {
  // Get usage summary for tenant
  fastify.get('/tenant/:tenant_id', {
    schema: {
      description: 'Get usage summary for tenant',
      tags: ['Usage'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['tenant_id'],
        properties: {
          tenant_id: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          period_start: { type: 'string', format: 'date-time' },
          period_end: { type: 'string', format: 'date-time' },
          product_key: { type: 'string' },
          environment: { type: 'string', enum: Object.values(Environment) },
        },
      },
    },
  }, async (request, reply) => {
    const { tenant_id } = request.params as { tenant_id: string }
    const { period_start, period_end, product_key, environment } = request.query as any
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

      // Default to current month if no period specified
      const now = new Date()
      const defaultPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const defaultPeriodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

      const startDate = period_start ? new Date(period_start) : defaultPeriodStart
      const endDate = period_end ? new Date(period_end) : defaultPeriodEnd

      let where: any = {
        tenant_id,
        period_start: {
          gte: startDate,
          lte: endDate,
        },
      }

      if (product_key) where.product_key = product_key
      if (environment) where.environment = environment

      // Get usage counters
      const usageCounters = await db.usageCounter.findMany({
        where,
        orderBy: [
          { product_key: 'asc' },
          { metric_key: 'asc' },
          { period_start: 'desc' },
        ],
      })

      // Get current plan limits
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
          plan: {
            select: {
              limits: true,
            },
          },
        },
        orderBy: { effective_from: 'desc' },
      })

      const planLimits = currentPlan?.plan.limits as Record<string, number> || {}

      // Group and aggregate usage by product/metric
      const usageByMetric = new Map<string, number>()
      usageCounters.forEach(counter => {
        const key = `${counter.product_key}:${counter.environment}:${counter.metric_key}`
        const current = usageByMetric.get(key) || 0
        usageByMetric.set(key, current + Number(counter.value))
      })

      // Convert to usage metrics with limit information
      const metrics = Array.from(usageByMetric.entries()).map(([key, value]) => {
        const [productKey, env, metricKey] = key.split(':')
        const limitKey = `${productKey}_${env}_${metricKey}`
        const limit = planLimits[limitKey]
        
        return {
          product_key: productKey,
          environment: env as Environment,
          metric_key: metricKey,
          value,
          limit,
          percentage_used: limit ? Math.round((value / limit) * 100) : undefined,
        }
      })

      const summary: UsageSummary = {
        tenant_id,
        period_start: startDate.toISOString(),
        period_end: endDate.toISOString(),
        metrics,
        plan_limits: planLimits,
      }

      return {
        success: true,
        data: summary,
      }

    } catch (error) {
      logger.error('Failed to get usage summary', {
        correlation_id: request.correlationId,
        tenant_id,
      }, error as Error)

      throw error
    }
  })

  // Record usage (for product integrations)
  fastify.post('/record', {
    schema: {
      description: 'Record usage metric (for product integrations)',
      tags: ['Usage'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['tenant_id', 'product_key', 'environment', 'metric_key', 'value', 'period_start'],
        properties: {
          tenant_id: { type: 'string' },
          product_key: { type: 'string' },
          environment: { type: 'string', enum: Object.values(Environment) },
          metric_key: { type: 'string' },
          value: { type: 'number', minimum: 0 },
          period_start: { type: 'string', format: 'date-time' },
        },
      },
    },
  }, async (request, reply) => {
    const body = recordUsageSchema.parse(request.body)
    const db = getPrisma()

    try {
      // Check access to this tenant
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

      // Validate product key format
      const productKeyRegex = /^[a-z][a-z0-9-]*[a-z0-9]$/
      if (!productKeyRegex.test(body.product_key)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ErrorCode.INVALID_FORMAT,
            message: 'Invalid product key format',
            correlation_id: request.correlationId,
          },
        })
      }

      const periodStart = new Date(body.period_start)

      // Upsert usage counter (increment if exists)
      const existingCounter = await db.usageCounter.findFirst({
        where: {
          tenant_id: body.tenant_id,
          product_key: body.product_key,
          environment: body.environment,
          metric_key: body.metric_key,
          period_start: periodStart,
        },
      })

      let counter
      if (existingCounter) {
        counter = await db.usageCounter.update({
          where: { id: existingCounter.id },
          data: {
            value: existingCounter.value + BigInt(body.value),
          },
        })
      } else {
        counter = await db.usageCounter.create({
          data: {
            tenant_id: body.tenant_id,
            product_key: body.product_key,
            environment: body.environment,
            metric_key: body.metric_key,
            period_start: periodStart,
            value: BigInt(body.value),
          },
        })
      }

      logger.info('Usage recorded', {
        correlation_id: request.correlationId,
        tenant_id: body.tenant_id,
        product_key: body.product_key,
        metric_key: body.metric_key,
        value: body.value,
        recorded_by: request.user.sub,
      })

      return reply.status(201).send({
        success: true,
        data: {
          id: counter.id,
          tenant_id: counter.tenant_id,
          product_key: counter.product_key,
          environment: counter.environment,
          metric_key: counter.metric_key,
          value: Number(counter.value),
          period_start: counter.period_start.toISOString(),
          updated_at: counter.updated_at.toISOString(),
        },
      })

    } catch (error) {
      logger.error('Failed to record usage', {
        correlation_id: request.correlationId,
        tenant_id: body.tenant_id,
        product_key: body.product_key,
      }, error as Error)

      throw error
    }
  })

  // Get global usage statistics (admin only)
  fastify.get('/global', {
    schema: {
      description: 'Get global usage statistics (PlatformAdmin only)',
      tags: ['Usage'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          period_start: { type: 'string', format: 'date-time' },
          period_end: { type: 'string', format: 'date-time' },
          product_key: { type: 'string' },
          environment: { type: 'string', enum: Object.values(Environment) },
          group_by: { 
            type: 'string', 
            enum: ['product_key', 'environment', 'tenant_id'], 
            default: 'product_key',
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
            message: 'Platform administrator access required',
            correlation_id: request.correlationId,
          },
        })
      }
    },
  }, async (request, reply) => {
    const { period_start, period_end, product_key, environment, group_by = 'product_key' } = request.query as any
    const db = getPrisma()

    try {
      // Default to current month if no period specified
      const now = new Date()
      const defaultPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const defaultPeriodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

      const startDate = period_start ? new Date(period_start) : defaultPeriodStart
      const endDate = period_end ? new Date(period_end) : defaultPeriodEnd

      let where: any = {
        period_start: {
          gte: startDate,
          lte: endDate,
        },
      }

      if (product_key) where.product_key = product_key
      if (environment) where.environment = environment

      // Get usage counters with tenant info
      const usageCounters = await db.usageCounter.findMany({
        where,
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              partner: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      })

      // Group and aggregate based on group_by parameter
      const groupedUsage = new Map<string, {
        key: string
        total_usage: number
        tenant_count: Set<string>
        metrics: Map<string, number>
      }>()

      usageCounters.forEach(counter => {
        let groupKey: string
        switch (group_by) {
          case 'environment':
            groupKey = counter.environment
            break
          case 'tenant_id':
            groupKey = `${counter.tenant.name} (${counter.tenant.partner.name})`
            break
          default: // product_key
            groupKey = counter.product_key
        }

        if (!groupedUsage.has(groupKey)) {
          groupedUsage.set(groupKey, {
            key: groupKey,
            total_usage: 0,
            tenant_count: new Set(),
            metrics: new Map(),
          })
        }

        const group = groupedUsage.get(groupKey)!
        group.total_usage += Number(counter.value)
        group.tenant_count.add(counter.tenant_id)
        
        const metricKey = `${counter.metric_key}`
        const currentMetricUsage = group.metrics.get(metricKey) || 0
        group.metrics.set(metricKey, currentMetricUsage + Number(counter.value))
      })

      // Convert to response format
      const results = Array.from(groupedUsage.values()).map(group => ({
        [group_by]: group.key,
        total_usage: group.total_usage,
        unique_tenants: group.tenant_count.size,
        metrics: Object.fromEntries(group.metrics),
      }))

      // Sort by total usage descending
      results.sort((a, b) => b.total_usage - a.total_usage)

      return {
        success: true,
        data: {
          period_start: startDate.toISOString(),
          period_end: endDate.toISOString(),
          group_by,
          results,
          summary: {
            total_usage: results.reduce((sum, r) => sum + r.total_usage, 0),
            unique_tenants: new Set(usageCounters.map(c => c.tenant_id)).size,
            total_records: usageCounters.length,
          },
        },
      }

    } catch (error) {
      logger.error('Failed to get global usage statistics', {
        correlation_id: request.correlationId,
        user_id: request.user.sub,
      }, error as Error)

      throw error
    }
  })
}