import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { getPrisma } from '../lib/database.js'
import { logger } from '../lib/logger.js'
import { JWTPayload } from '../types/auth.js'
import { ErrorCode } from '../types/api.js'
import { Role } from '../lib/prisma/index.js'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.nativeEnum(Role).optional().default(Role.TENANT_USER),
})

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // User login
  fastify.post('/login', {
    schema: {
      description: 'User authentication',
      tags: ['Authentication'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
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
                access_token: { type: 'string' },
                token_type: { type: 'string' },
                expires_in: { type: 'number' },
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    email: { type: 'string' },
                    name: { type: 'string' },
                    role: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = loginSchema.parse(request.body)
    const db = getPrisma()

    try {
      // Find user with memberships
      const user = await db.user.findUnique({
        where: { email: body.email },
        include: {
          memberships: {
            include: {
              tenant: {
                select: {
                  id: true,
                  name: true,
                  tenant_type: true,
                },
              },
            },
          },
        },
      })

      if (!user) {
        logger.warn('Login attempt with non-existent email', {
          correlation_id: request.correlationId,
          email: body.email,
          ip_address: request.ip,
        })

        return reply.status(401).send({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'Invalid credentials',
            correlation_id: request.correlationId,
          },
        })
      }

      // For demo purposes, accept any password for admin user
      // In production, implement proper password hashing
      const isValidPassword = user.email === 'admin@avantle.ai' || 
        await bcrypt.compare(body.password, user.password || '')

      if (!isValidPassword) {
        logger.warn('Failed login attempt', {
          correlation_id: request.correlationId,
          user_id: user.id,
          email: user.email,
          ip_address: request.ip,
        })

        return reply.status(401).send({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'Invalid credentials',
            correlation_id: request.correlationId,
          },
        })
      }

      // Determine user's primary role
      let primaryRole = Role.TENANT_USER
      if (user.email === 'admin@avantle.ai') {
        primaryRole = Role.PLATFORM_ADMIN
      } else if (user.memberships.length > 0) {
        primaryRole = user.memberships[0].role
      }

      // Create JWT payload
      const jwtPayload: Omit<JWTPayload, 'iat' | 'exp' | 'iss'> = {
        sub: user.id,
        email: user.email,
        role: primaryRole,
        tenant_context: user.memberships.map(m => ({
          tenant_id: m.tenant.id,
          tenant_name: m.tenant.name,
          tenant_type: m.tenant.tenant_type,
          role: m.role,
        })),
      }

      // Sign JWT
      const token = await reply.jwtSign(jwtPayload)

      // Log successful login
      logger.info('User logged in successfully', {
        correlation_id: request.correlationId,
        user_id: user.id,
        email: user.email,
        role: primaryRole,
        tenant_count: user.memberships.length,
      })

      return {
        success: true,
        data: {
          access_token: token,
          token_type: 'Bearer',
          expires_in: 86400, // 24 hours in seconds
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: primaryRole,
          },
        },
      }

    } catch (error) {
      logger.error('Login error', {
        correlation_id: request.correlationId,
        email: body.email,
      }, error as Error)

      return reply.status(500).send({
        success: false,
        error: {
          code: ErrorCode.INTERNAL_SERVER_ERROR,
          message: 'Authentication failed',
          correlation_id: request.correlationId,
        },
      })
    }
  })

  // Create user (admin only for now)
  fastify.post('/users', {
    schema: {
      description: 'Create new user (admin only)',
      tags: ['Authentication'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['email', 'name', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          name: { type: 'string', minLength: 1 },
          password: { type: 'string', minLength: 8 },
          role: { type: 'string', enum: Object.values(Role) },
        },
      },
    },
    preHandler: async (request, reply) => {
      // Ensure only PlatformAdmin can create users
      if (request.user.role !== Role.PLATFORM_ADMIN) {
        return reply.status(403).send({
          success: false,
          error: {
            code: ErrorCode.FORBIDDEN,
            message: 'Only platform administrators can create users',
            correlation_id: request.correlationId,
          },
        })
      }
    },
  }, async (request, reply) => {
    const body = createUserSchema.parse(request.body)
    const db = getPrisma()

    try {
      // Hash password
      const passwordHash = await bcrypt.hash(body.password, 12)

      // Create user
      const user = await db.user.create({
        data: {
          email: body.email,
          name: body.name,
          password: passwordHash,
        },
      })

      logger.info('User created successfully', {
        correlation_id: request.correlationId,
        created_user_id: user.id,
        created_by: request.user.sub,
      })

      return reply.status(201).send({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          status: user.status,
          created_at: user.created_at,
        },
      })

    } catch (error) {
      logger.error('User creation error', {
        correlation_id: request.correlationId,
        email: body.email,
      }, error as Error)

      throw error
    }
  })

  // Get current user info
  fastify.get('/me', {
    schema: {
      description: 'Get current user information',
      tags: ['Authentication'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                name: { type: 'string' },
                role: { type: 'string' },
                tenants: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      tenant_id: { type: 'string' },
                      tenant_name: { type: 'string' },
                      role: { type: 'string' },
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
    return {
      success: true,
      data: {
        id: request.user.sub,
        email: request.user.email,
        role: request.user.role,
        tenants: request.user.tenant_context || [],
      },
    }
  })
}