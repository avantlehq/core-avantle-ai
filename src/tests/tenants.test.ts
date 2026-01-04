import { test, beforeAll, afterAll, describe, expect } from 'vitest'
import { build } from '../app.js'
import { FastifyInstance } from 'fastify'
import { connectDatabase, getPrisma } from '../lib/database.js'
import bcrypt from 'bcryptjs'
import { Role, PartnerStatus, TenantStatus, TenantType } from '../lib/prisma/index.js'

describe('Tenant Routes', () => {
  let app: FastifyInstance
  let adminToken: string
  let partnerAdminToken: string
  let testPartnerId: string
  let testTenantId: string

  beforeAll(async () => {
    app = build({ logger: false })
    await app.ready()
    
    await connectDatabase()
    const db = getPrisma()
    
    // Clean up test data
    await db.user.deleteMany({
      where: {
        email: {
          in: ['admin@test.com', 'partner@test.com']
        }
      }
    })
    
    await db.partner.deleteMany({
      where: {
        name: 'Test Partner for Tenants'
      }
    })

    // Create test admin user
    const adminUser = await db.user.create({
      data: {
        email: 'admin@test.com',
        name: 'Test Admin',
        status: 'ACTIVE',
      }
    })

    // Create test partner
    const testPartner = await db.partner.create({
      data: {
        name: 'Test Partner for Tenants',
        billing_email: 'billing@testpartner.com',
        status: PartnerStatus.ACTIVE,
        created_by_user_id: adminUser.id,
      }
    })
    testPartnerId = testPartner.id

    // Create test partner admin user
    const partnerUser = await db.user.create({
      data: {
        email: 'partner@test.com',
        name: 'Test Partner Admin',
        status: 'ACTIVE',
      }
    })

    // Get admin token
    const adminLoginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'admin@test.com',
        password: 'adminpass123'
      }
    })
    const adminLoginBody = JSON.parse(adminLoginResponse.body)
    adminToken = adminLoginBody.data.access_token

    // Get partner admin token
    const partnerLoginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'partner@test.com',
        password: 'partnerpass123'
      }
    })
    const partnerLoginBody = JSON.parse(partnerLoginResponse.body)
    partnerAdminToken = partnerLoginBody.data.access_token
  })

  afterAll(async () => {
    const db = getPrisma()
    
    // Clean up test data
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
        email: {
          in: ['admin@test.com', 'partner@test.com']
        }
      }
    })
    
    await app.close()
  })

  test('POST /tenants - create UI tenant as admin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants',
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        id: 'test-ui-tenant',
        partner_id: testPartnerId,
        name: 'Test UI Tenant',
        tenant_type: TenantType.UI
      }
    })

    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('test-ui-tenant')
    expect(body.data.name).toBe('Test UI Tenant')
    expect(body.data.tenant_type).toBe(TenantType.UI)
    expect(body.data.status).toBe(TenantStatus.ACTIVE)
    
    testTenantId = body.data.id
  })

  test('POST /tenants - create API tenant with client', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants',
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        id: 'test-api-tenant',
        partner_id: testPartnerId,
        name: 'Test API Tenant',
        tenant_type: TenantType.API,
        api_client: {
          name: 'Test API Client',
          client_id: 'test-client-id'
        }
      }
    })

    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.tenant_type).toBe(TenantType.API)
    expect(body.data.api_client).toBeDefined()
    expect(body.data.api_client.client_id).toBe('test-client-id')

    // Clean up this tenant
    await app.inject({
      method: 'DELETE',
      url: `/tenants/${body.data.id}`,
      headers: {
        authorization: `Bearer ${adminToken}`
      }
    })
  })

  test('POST /tenants - missing API client for API tenant should fail', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants',
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        id: 'test-api-tenant-fail',
        partner_id: testPartnerId,
        name: 'Test API Tenant Without Client',
        tenant_type: TenantType.API
        // Missing api_client
      }
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
  })

  test('GET /tenants - list tenants as admin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/tenants',
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

  test('GET /tenants/:id - get tenant details', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/tenants/${testTenantId}`,
      headers: {
        authorization: `Bearer ${adminToken}`
      }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe(testTenantId)
    expect(body.data.name).toBe('Test UI Tenant')
    expect(body.data.partner).toBeDefined()
  })

  test('PUT /tenants/:id - update tenant', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/tenants/${testTenantId}`,
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        name: 'Updated Test UI Tenant',
        status: TenantStatus.SUSPENDED
      }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.name).toBe('Updated Test UI Tenant')
    expect(body.data.status).toBe(TenantStatus.SUSPENDED)
  })

  test('GET /tenants/999 - tenant not found', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/tenants/nonexistent-tenant',
      headers: {
        authorization: `Bearer ${adminToken}`
      }
    })

    expect(response.statusCode).toBe(404)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('RESOURCE_NOT_FOUND')
  })

  test('POST /tenants - duplicate tenant ID should fail', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants',
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        id: testTenantId, // Same ID as existing tenant
        partner_id: testPartnerId,
        name: 'Duplicate Tenant',
        tenant_type: TenantType.UI
      }
    })

    expect(response.statusCode).toBe(500) // Database constraint error
  })

  test('POST /tenants - invalid tenant type should fail', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants',
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        id: 'test-invalid-tenant',
        partner_id: testPartnerId,
        name: 'Invalid Tenant',
        tenant_type: 'INVALID_TYPE'
      }
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
  })

  test('POST /tenants - unauthorized without admin role', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants',
      headers: {
        authorization: `Bearer ${partnerAdminToken}`
      },
      payload: {
        id: 'unauthorized-tenant',
        partner_id: testPartnerId,
        name: 'Unauthorized Tenant',
        tenant_type: TenantType.UI
      }
    })

    expect(response.statusCode).toBe(403)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('FORBIDDEN')
  })
})