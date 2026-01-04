import { test, beforeAll, afterAll, describe, expect } from 'vitest'
import { build } from '../app.js'
import { FastifyInstance } from 'fastify'
import { connectDatabase, getPrisma } from '../lib/database.js'
import bcrypt from 'bcryptjs'
import { Role, PartnerStatus, TenantStatus, TenantType, DomainStatus } from '../lib/prisma/index.js'

describe('Domain Routes', () => {
  let app: FastifyInstance
  let adminToken: string
  let testPartnerId: string
  let testTenantId: string
  let testDomainId: string

  beforeAll(async () => {
    app = build({ logger: false })
    await app.ready()
    
    await connectDatabase()
    const db = getPrisma()
    
    // Clean up test data
    await db.user.deleteMany({
      where: {
        email: 'admin@domain-test.com'
      }
    })
    
    await db.domain.deleteMany({
      where: {
        hostname: {
          in: ['test.example.com', 'updated.example.com']
        }
      }
    })

    // Create test admin user
    const adminUser = await db.user.create({
      data: {
        email: 'admin@domain-test.com',
        name: 'Domain Test Admin',
        status: 'ACTIVE',
      }
    })

    // Create test partner
    const testPartner = await db.partner.create({
      data: {
        name: 'Test Partner for Domains',
        billing_email: 'billing@domaintest.com',
        status: PartnerStatus.ACTIVE,
        created_by_user_id: adminUser.id,
      }
    })
    testPartnerId = testPartner.id

    // Create test tenant
    const testTenant = await db.tenant.create({
      data: {
        id: 'test-domain-tenant',
        partner_id: testPartnerId,
        name: 'Test Domain Tenant',
        tenant_type: TenantType.UI,
        status: TenantStatus.ACTIVE,
      }
    })
    testTenantId = testTenant.id

    // Get admin token
    const adminLoginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'admin@domain-test.com',
        password: 'adminpass123'
      }
    })
    const adminLoginBody = JSON.parse(adminLoginResponse.body)
    adminToken = adminLoginBody.data.access_token
  })

  afterAll(async () => {
    const db = getPrisma()
    
    // Clean up test data
    await db.domain.deleteMany({
      where: {
        hostname: {
          in: ['test.example.com', 'updated.example.com']
        }
      }
    })
    
    if (testTenantId) {
      await db.tenant.delete({
        where: { id: testTenantId }
      }).catch(() => {})
    }
    
    if (testPartnerId) {
      await db.partner.delete({
        where: { id: testPartnerId }
      }).catch(() => {})
    }
    
    await db.user.deleteMany({
      where: {
        email: 'admin@domain-test.com'
      }
    })
    
    await app.close()
  })

  test('POST /domains - create domain', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/domains',
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        tenant_id: testTenantId,
        hostname: 'test.example.com'
      }
    })

    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.hostname).toBe('test.example.com')
    expect(body.data.status).toBe(DomainStatus.PENDING)
    expect(body.data.tenant_id).toBe(testTenantId)
    
    testDomainId = body.data.id
  })

  test('GET /domains - list domains', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/domains',
      headers: {
        authorization: `Bearer ${adminToken}`
      }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeGreaterThan(0)
    expect(body.meta).toHaveProperty('pagination')
  })

  test('GET /domains - filter by tenant', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/domains?tenant_id=${testTenantId}`,
      headers: {
        authorization: `Bearer ${adminToken}`
      }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.every((domain: any) => domain.tenant.id === testTenantId)).toBe(true)
  })

  test('GET /domains - filter by status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/domains?status=${DomainStatus.PENDING}`,
      headers: {
        authorization: `Bearer ${adminToken}`
      }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.every((domain: any) => domain.status === DomainStatus.PENDING)).toBe(true)
  })

  test('POST /domains/:id/verify - verify domain', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/domains/${testDomainId}/verify`,
      headers: {
        authorization: `Bearer ${adminToken}`
      }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.status).toBe(DomainStatus.VERIFIED)
    expect(body.data.verified_at).toBeDefined()
    expect(body.data.dns_records).toBeDefined()
  })

  test('GET /domains/resolve - resolve domain', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/domains/resolve?hostname=test.example.com'
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.tenant_id).toBe(testTenantId)
    expect(body.data.tenant_name).toBe('Test Domain Tenant')
    expect(body.data.domain_status).toBe(DomainStatus.VERIFIED)
  })

  test('GET /domains/resolve - domain not found', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/domains/resolve?hostname=nonexistent.example.com'
    })

    expect(response.statusCode).toBe(404)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('RESOURCE_NOT_FOUND')
  })

  test('PUT /domains/:id - update domain', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/domains/${testDomainId}`,
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        redirect_rules: {
          'www.test.example.com': 'test.example.com'
        },
        ssl_config: {
          force_https: true
        }
      }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.redirect_rules).toEqual({
      'www.test.example.com': 'test.example.com'
    })
    expect(body.data.ssl_config).toEqual({
      force_https: true
    })
  })

  test('POST /domains - invalid hostname format', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/domains',
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        tenant_id: testTenantId,
        hostname: 'invalid..hostname'
      }
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('INVALID_FORMAT')
  })

  test('POST /domains - duplicate hostname should fail', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/domains',
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        tenant_id: testTenantId,
        hostname: 'test.example.com' // Same as existing
      }
    })

    expect(response.statusCode).toBe(500) // Database constraint error
  })

  test('POST /domains - nonexistent tenant should fail', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/domains',
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        tenant_id: 'nonexistent-tenant',
        hostname: 'newdomain.example.com'
      }
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('RESOURCE_NOT_FOUND')
  })

  test('POST /domains/:id/verify - domain not found', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/domains/nonexistent-domain/verify',
      headers: {
        authorization: `Bearer ${adminToken}`
      }
    })

    expect(response.statusCode).toBe(404)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('RESOURCE_NOT_FOUND')
  })
})