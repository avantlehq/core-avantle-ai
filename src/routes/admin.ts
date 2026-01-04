import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getPrisma } from '../lib/database.js'
import { logger } from '../lib/logger.js'
import { DashboardStats, RecentActivity } from '../types/tenant.js'
import { Role, TenantType } from '../lib/prisma/index.js'

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // Ensure all admin routes require PlatformAdmin role
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.user.role !== Role.PLATFORM_ADMIN) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Platform administrator access required',
          correlation_id: request.correlationId,
        },
      })
    }
  })

  // Dashboard statistics
  fastify.get('/dashboard-stats', {
    schema: {
      description: 'Get dashboard statistics for admin console',
      tags: ['Admin Console'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                total_partners: { type: 'number' },
                total_tenants: { type: 'number' },
                active_domains: { type: 'number' },
                this_month_signups: { type: 'number' },
                total_api_clients: { type: 'number' },
                total_usage_events: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const db = getPrisma()

    try {
      const [
        totalPartners,
        totalTenants,
        activeDomains,
        thisMonthSignups,
        totalApiClients,
        totalUsageEvents,
      ] = await Promise.all([
        db.partner.count({
          where: { status: 'ACTIVE' },
        }),
        db.tenant.count({
          where: { status: 'ACTIVE' },
        }),
        db.domain.count({
          where: { status: 'VERIFIED' },
        }),
        db.tenant.count({
          where: {
            created_at: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
        }),
        db.aPIClient.count({
          where: { status: 'ACTIVE' },
        }),
        db.usageCounter.count(),
      ])

      const stats: DashboardStats = {
        total_partners: totalPartners,
        total_tenants: totalTenants,
        active_domains: activeDomains,
        this_month_signups: thisMonthSignups,
        total_api_clients: totalApiClients,
        total_usage_events: totalUsageEvents,
      }

      return {
        success: true,
        data: stats,
      }

    } catch (error) {
      logger.error('Failed to fetch dashboard stats', {
        correlation_id: request.correlationId,
        user_id: request.user.sub,
      }, error as Error)

      throw error
    }
  })

  // Recent activity
  fastify.get('/recent-activity', {
    schema: {
      description: 'Get recent activity for admin dashboard',
      tags: ['Admin Console'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                recent_partners: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      tenant_count: { type: 'number' },
                      created_at: { type: 'string' },
                      last_active_at: { type: 'string' },
                    },
                  },
                },
                recent_tenants: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      tenant_type: { type: 'string' },
                      partner_name: { type: 'string' },
                      user_count: { type: 'number' },
                      domain_count: { type: 'number' },
                      created_at: { type: 'string' },
                    },
                  },
                },
                recent_domains: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      hostname: { type: 'string' },
                      tenant_name: { type: 'string' },
                      status: { type: 'string' },
                      created_at: { type: 'string' },
                      verified_at: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const db = getPrisma()

    try {
      const [recentPartners, recentTenants, recentDomains] = await Promise.all([
        // Recent partners with tenant counts
        db.partner.findMany({
          take: 5,
          orderBy: { created_at: 'desc' },
          include: {
            _count: {
              select: { tenants: true },
            },
          },
        }),

        // Recent tenants with partner info and counts
        db.tenant.findMany({
          take: 5,
          orderBy: { created_at: 'desc' },
          include: {
            partner: {
              select: { name: true },
            },
            _count: {
              select: {
                memberships: true,
                domains: true,
              },
            },
          },
        }),

        // Recent domains
        db.domain.findMany({
          take: 5,
          orderBy: { created_at: 'desc' },
          include: {
            tenant: {
              select: { name: true },
            },
          },
        }),
      ])

      const activity: RecentActivity = {
        recent_partners: recentPartners.map(partner => ({
          id: partner.id,
          name: partner.name,
          tenant_count: partner._count.tenants,
          created_at: partner.created_at.toISOString(),
          last_active_at: partner.last_active_at?.toISOString(),
        })),
        recent_tenants: recentTenants.map(tenant => ({
          id: tenant.id,
          name: tenant.name,
          tenant_type: tenant.tenant_type,
          partner_name: tenant.partner.name,
          user_count: tenant._count.memberships,
          domain_count: tenant._count.domains,
          created_at: tenant.created_at.toISOString(),
        })),
        recent_domains: recentDomains.map(domain => ({
          id: domain.id,
          hostname: domain.hostname,
          tenant_name: domain.tenant.name,
          status: domain.status,
          created_at: domain.created_at.toISOString(),
          verified_at: domain.verified_at?.toISOString(),
        })),
      }

      return {
        success: true,
        data: activity,
      }

    } catch (error) {
      logger.error('Failed to fetch recent activity', {
        correlation_id: request.correlationId,
        user_id: request.user.sub,
      }, error as Error)

      throw error
    }
  })

  // Resolve hostname to tenant
  fastify.get('/resolve-hostname', {
    schema: {
      description: 'Resolve hostname to tenant information',
      tags: ['Admin Console'],
      security: [{ bearerAuth: [] }],
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
                partner_name: { type: 'string' },
                domain_status: { type: 'string' },
                verified_at: { type: 'string' },
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
        where: { hostname },
        include: {
          tenant: {
            include: {
              partner: {
                select: { name: true },
              },
            },
          },
        },
      })

      if (!domain) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'RESOURCE_NOT_FOUND',
            message: `Domain ${hostname} not found`,
            correlation_id: request.correlationId,
          },
        })
      }

      return {
        success: true,
        data: {
          tenant_id: domain.tenant.id,
          tenant_name: domain.tenant.name,
          partner_name: domain.tenant.partner.name,
          domain_status: domain.status,
          verified_at: domain.verified_at?.toISOString(),
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
}