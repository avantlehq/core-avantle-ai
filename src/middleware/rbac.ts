import { FastifyPluginAsync } from 'fastify'
import { Role } from '../lib/prisma/index.js'
import { Permission, AccessRule } from '../types/auth.js'
import { logger } from '../lib/logger.js'
import { ErrorCode } from '../types/api.js'
import { getPrisma } from '../lib/database.js'

// RBAC Rules Definition
const accessRules: AccessRule[] = [
  // PlatformAdmin - Full access
  {
    role: Role.PLATFORM_ADMIN,
    permissions: [
      'partners:read', 'partners:write', 'partners:delete',
      'tenants:read', 'tenants:write', 'tenants:delete',
      'plans:read', 'plans:write',
      'domains:read', 'domains:write', 'domains:verify',
      'usage:read',
      'system:read', 'system:write'
    ],
  },

  // PartnerAdmin - Own partner and tenants only
  {
    role: Role.PARTNER_ADMIN,
    permissions: [
      'partners:read',
      'tenants:read', 'tenants:write',
      'domains:read', 'domains:write', 'domains:verify',
      'usage:read'
    ],
    conditions: [
      { field: 'partner_id', operator: 'equals', value: 'user.partner_id' }
    ],
  },

  // TenantAdmin - Own tenant only
  {
    role: Role.TENANT_ADMIN,
    permissions: [
      'tenants:read',
      'domains:read', 'domains:write',
      'usage:read'
    ],
    conditions: [
      { field: 'tenant_id', operator: 'equals', value: 'user.tenant_id' }
    ],
  },

  // TenantUser - Read-only access to own tenant
  {
    role: Role.TENANT_USER,
    permissions: [
      'tenants:read',
      'usage:read'
    ],
    conditions: [
      { field: 'tenant_id', operator: 'equals', value: 'user.tenant_id' }
    ],
  },
]

function getRequiredPermission(method: string, path: string): Permission | null {
  // Map HTTP methods and paths to permissions
  const isWrite = ['POST', 'PUT', 'PATCH'].includes(method)
  const isDelete = method === 'DELETE'

  if (path.startsWith('/partners')) {
    if (isDelete) return 'partners:delete'
    return isWrite ? 'partners:write' : 'partners:read'
  }

  if (path.startsWith('/tenants')) {
    if (isDelete) return 'tenants:delete'
    return isWrite ? 'tenants:write' : 'tenants:read'
  }

  if (path.startsWith('/plans')) {
    return isWrite ? 'plans:write' : 'plans:read'
  }

  if (path.startsWith('/domains')) {
    if (path.includes('/verify')) return 'domains:verify'
    return isWrite ? 'domains:write' : 'domains:read'
  }

  if (path.startsWith('/usage') || path.startsWith('/admin/dashboard')) {
    return 'usage:read'
  }

  if (path.startsWith('/system') || path.startsWith('/admin')) {
    return isWrite ? 'system:write' : 'system:read'
  }

  return null
}

async function checkTenantAccess(userId: string, tenantId: string, role: Role): Promise<boolean> {
  const db = getPrisma()

  try {
    if (role === Role.PLATFORM_ADMIN) {
      return true
    }

    if (role === Role.PARTNER_ADMIN) {
      // Check if user can access this tenant through partner relationship
      const membership = await db.membership.findFirst({
        where: {
          user_id: userId,
          role: Role.PARTNER_ADMIN,
        },
        include: {
          tenant: {
            include: {
              partner: {
                include: {
                  tenants: {
                    where: { id: tenantId },
                  },
                },
              },
            },
          },
        },
      })

      return membership?.tenant.partner.tenants.length > 0
    }

    if (role === Role.TENANT_ADMIN || role === Role.TENANT_USER) {
      // Check if user has membership in this specific tenant
      const membership = await db.membership.findFirst({
        where: {
          user_id: userId,
          tenant_id: tenantId,
          role: { in: [Role.TENANT_ADMIN, Role.TENANT_USER] },
        },
      })

      return !!membership
    }

    return false
  } catch (error) {
    logger.error('Error checking tenant access', { userId, tenantId, role }, error as Error)
    return false
  }
}

export const rbacMiddleware: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    // Skip RBAC for health checks, docs, and auth endpoints
    if (request.url.startsWith('/health') || 
        request.url.startsWith('/docs') || 
        request.url.startsWith('/auth') ||
        request.url === '/') {
      return
    }

    const { user, context } = request
    if (!user) {
      return reply.status(401).send({
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Authentication required',
          correlation_id: request.correlationId,
        },
      })
    }

    // Get required permission for this endpoint
    const requiredPermission = getRequiredPermission(request.method, request.url)
    if (!requiredPermission) {
      // No specific permission required, allow access
      return
    }

    // Find access rule for user's role
    const accessRule = accessRules.find(rule => rule.role === user.role)
    if (!accessRule) {
      logger.warn('No access rule found for role', {
        correlation_id: request.correlationId,
        user_id: user.sub,
        role: user.role,
      })

      return reply.status(403).send({
        success: false,
        error: {
          code: ErrorCode.FORBIDDEN,
          message: 'Access denied',
          correlation_id: request.correlationId,
        },
      })
    }

    // Check if user has required permission
    if (!accessRule.permissions.includes(requiredPermission)) {
      logger.warn('Permission denied', {
        correlation_id: request.correlationId,
        user_id: user.sub,
        role: user.role,
        required_permission: requiredPermission,
        user_permissions: accessRule.permissions,
      })

      return reply.status(403).send({
        success: false,
        error: {
          code: ErrorCode.FORBIDDEN,
          message: 'Insufficient permissions',
          correlation_id: request.correlationId,
        },
      })
    }

    // Check tenant-specific access for non-PlatformAdmin users
    if (user.role !== Role.PLATFORM_ADMIN && context.tenant_id) {
      const hasAccess = await checkTenantAccess(user.sub, context.tenant_id, user.role)
      if (!hasAccess) {
        logger.warn('Tenant access denied', {
          correlation_id: request.correlationId,
          user_id: user.sub,
          role: user.role,
          tenant_id: context.tenant_id,
        })

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

    logger.debug('RBAC check passed', {
      correlation_id: request.correlationId,
      user_id: user.sub,
      role: user.role,
      permission: requiredPermission,
      tenant_id: context.tenant_id,
    })
  })
}