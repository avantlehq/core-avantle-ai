import { FastifyPluginAsync } from 'fastify'
import { getPrisma } from '../lib/database.js'
import { logger } from '../lib/logger.js'
import { Role } from '../lib/prisma/index.js'
import { ErrorCode } from '../types/api.js'
import { appConfig } from '../lib/config.js'

export const systemRoutes: FastifyPluginAsync = async (fastify) => {
  // Ensure all system routes require admin access
  fastify.addHook('preHandler', async (request, reply) => {
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
  })

  // Get system information
  fastify.get('/info', {
    schema: {
      description: 'Get system information (PlatformAdmin only)',
      tags: ['System'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                service: { type: 'string' },
                version: { type: 'string' },
                environment: { type: 'string' },
                node_version: { type: 'string' },
                uptime_seconds: { type: 'number' },
                memory_usage: {
                  type: 'object',
                  properties: {
                    rss: { type: 'number' },
                    heap_used: { type: 'number' },
                    heap_total: { type: 'number' },
                    external: { type: 'number' },
                  },
                },
                limits: {
                  type: 'object',
                  properties: {
                    max_tenants_per_partner: { type: 'number' },
                    max_domains_per_tenant: { type: 'number' },
                    max_api_clients_per_tenant: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const memUsage = process.memoryUsage()
    
    return {
      success: true,
      data: {
        service: 'Avantle Core API',
        version: appConfig.server.api_version,
        environment: appConfig.server.node_env,
        node_version: process.version,
        uptime_seconds: Math.floor(process.uptime()),
        memory_usage: {
          rss: Math.round(memUsage.rss / 1024 / 1024), // MB
          heap_used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
          heap_total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
          external: Math.round(memUsage.external / 1024 / 1024), // MB
        },
        limits: appConfig.limits,
      },
    }
  })

  // Get system metrics
  fastify.get('/metrics', {
    schema: {
      description: 'Get system metrics (PlatformAdmin only)',
      tags: ['System'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const db = getPrisma()

    try {
      // Collect various system metrics
      const [
        totalPartners,
        totalTenants,
        totalUsers,
        totalDomains,
        totalApiClients,
        totalUsageRecords,
        recentLogins,
        activeTenants,
      ] = await Promise.all([
        db.partner.count(),
        db.tenant.count(),
        db.user.count(),
        db.domain.count(),
        db.aPIClient.count(),
        db.usageCounter.count(),
        
        // Recent logins (proxy using audit logs)
        db.auditLog.count({
          where: {
            action: 'login',
            timestamp: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
            },
          },
        }),
        
        // Tenants with recent activity
        db.tenant.count({
          where: {
            updated_at: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
            },
          },
        }),
      ])

      // Database metrics
      const dbMetrics = await db.$queryRaw<Array<{ table_name: string; row_count: number }>>`
        SELECT 
          schemaname,
          tablename as table_name,
          n_tup_ins + n_tup_upd + n_tup_del as total_operations
        FROM pg_stat_user_tables 
        WHERE schemaname = 'public'
        ORDER BY total_operations DESC
        LIMIT 10
      `

      return {
        success: true,
        data: {
          timestamp: new Date().toISOString(),
          overview: {
            total_partners: totalPartners,
            total_tenants: totalTenants,
            total_users: totalUsers,
            total_domains: totalDomains,
            total_api_clients: totalApiClients,
            total_usage_records: totalUsageRecords,
          },
          activity: {
            recent_logins_24h: recentLogins,
            active_tenants_7d: activeTenants,
          },
          database: {
            table_operations: dbMetrics,
          },
          system: {
            uptime_seconds: Math.floor(process.uptime()),
            memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            node_version: process.version,
          },
        },
      }

    } catch (error) {
      logger.error('Failed to get system metrics', {
        correlation_id: request.correlationId,
        user_id: request.user.sub,
      }, error as Error)

      throw error
    }
  })

  // System maintenance mode toggle
  fastify.post('/maintenance', {
    schema: {
      description: 'Toggle maintenance mode (PlatformAdmin only)',
      tags: ['System'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['enabled'],
        properties: {
          enabled: { type: 'boolean' },
          message: { type: 'string', maxLength: 500 },
        },
      },
    },
  }, async (request, reply) => {
    const { enabled, message } = request.body as { enabled: boolean; message?: string }

    // In a real implementation, this would:
    // 1. Update a maintenance flag in Redis/database
    // 2. Notify load balancer to return 503
    // 3. Gracefully stop accepting new requests

    logger.info('Maintenance mode toggled', {
      correlation_id: request.correlationId,
      enabled,
      message,
      toggled_by: request.user.sub,
    })

    // For demo purposes, just return success
    return {
      success: true,
      data: {
        maintenance_enabled: enabled,
        message: message || (enabled ? 'System maintenance in progress' : 'System operational'),
        timestamp: new Date().toISOString(),
      },
    }
  })

  // Get audit logs
  fastify.get('/audit-logs', {
    schema: {
      description: 'Get system audit logs (PlatformAdmin only)',
      tags: ['System'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1, default: 1 },
          page_size: { type: 'number', minimum: 1, maximum: 100, default: 50 },
          tenant_id: { type: 'string' },
          actor_id: { type: 'string' },
          entity_type: { type: 'string' },
          action: { type: 'string' },
          start_date: { type: 'string', format: 'date-time' },
          end_date: { type: 'string', format: 'date-time' },
        },
      },
    },
  }, async (request, reply) => {
    const {
      page = 1,
      page_size = 50,
      tenant_id,
      actor_id,
      entity_type,
      action,
      start_date,
      end_date,
    } = request.query as any
    
    const db = getPrisma()

    try {
      let where: any = {}

      if (tenant_id) where.tenant_id = tenant_id
      if (actor_id) where.actor_id = actor_id
      if (entity_type) where.entity_type = entity_type
      if (action) where.action = { contains: action, mode: 'insensitive' }

      if (start_date || end_date) {
        where.timestamp = {}
        if (start_date) where.timestamp.gte = new Date(start_date)
        if (end_date) where.timestamp.lte = new Date(end_date)
      }

      const offset = (page - 1) * page_size

      const [auditLogs, totalCount] = await Promise.all([
        db.auditLog.findMany({
          where,
          skip: offset,
          take: page_size,
          include: {
            user: {
              select: {
                email: true,
                name: true,
              },
            },
            tenant: {
              select: {
                name: true,
              },
            },
          },
          orderBy: { timestamp: 'desc' },
        }),
        db.auditLog.count({ where }),
      ])

      return {
        success: true,
        data: auditLogs.map(log => ({
          id: log.id,
          timestamp: log.timestamp.toISOString(),
          actor_type: log.actor_type,
          actor_id: log.actor_id,
          actor_email: log.user?.email,
          actor_name: log.user?.name,
          entity_type: log.entity_type,
          entity_id: log.entity_id,
          action: log.action,
          tenant_id: log.tenant_id,
          tenant_name: log.tenant?.name,
          ip_address: log.ip_address,
          user_agent: log.user_agent,
          request_id: log.request_id,
          // Note: old_values and new_values are excluded for brevity
          // They contain potentially sensitive data and should be included selectively
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
      logger.error('Failed to get audit logs', {
        correlation_id: request.correlationId,
        user_id: request.user.sub,
      }, error as Error)

      throw error
    }
  })

  // Clear old audit logs
  fastify.delete('/audit-logs/cleanup', {
    schema: {
      description: 'Cleanup old audit logs (PlatformAdmin only)',
      tags: ['System'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['older_than_days'],
        properties: {
          older_than_days: { type: 'number', minimum: 30 }, // At least 30 days
          dry_run: { type: 'boolean', default: false },
        },
      },
    },
  }, async (request, reply) => {
    const { older_than_days, dry_run = false } = request.body as { older_than_days: number; dry_run?: boolean }
    const db = getPrisma()

    try {
      const cutoffDate = new Date(Date.now() - older_than_days * 24 * 60 * 60 * 1000)

      if (dry_run) {
        // Count records that would be deleted
        const count = await db.auditLog.count({
          where: {
            timestamp: {
              lt: cutoffDate,
            },
          },
        })

        return {
          success: true,
          data: {
            dry_run: true,
            records_to_delete: count,
            cutoff_date: cutoffDate.toISOString(),
          },
        }
      } else {
        // Actually delete the records
        const result = await db.auditLog.deleteMany({
          where: {
            timestamp: {
              lt: cutoffDate,
            },
          },
        })

        logger.info('Audit logs cleaned up', {
          correlation_id: request.correlationId,
          records_deleted: result.count,
          cutoff_date: cutoffDate.toISOString(),
          performed_by: request.user.sub,
        })

        return {
          success: true,
          data: {
            dry_run: false,
            records_deleted: result.count,
            cutoff_date: cutoffDate.toISOString(),
          },
        }
      }

    } catch (error) {
      logger.error('Failed to cleanup audit logs', {
        correlation_id: request.correlationId,
        older_than_days,
        dry_run,
      }, error as Error)

      throw error
    }
  })
}