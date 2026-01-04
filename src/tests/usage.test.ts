import { test, beforeAll, afterAll, describe, expect } from 'vitest'
import { build } from '../app.js'
import { FastifyInstance } from 'fastify'
import { connectDatabase, getPrisma } from '../lib/database.js'
import bcrypt from 'bcryptjs'
import { Role, PartnerStatus, TenantStatus, TenantType, Environment } from '../lib/prisma/index.js'

describe('Usage Routes', () => {
  let app: FastifyInstance
  let adminToken: string
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
        email: 'admin@usage-test.com'
      }
    })

    // Create test admin user
    const adminUser = await db.user.create({
      data: {
        email: 'admin@usage-test.com',
        name: 'Usage Test Admin',
        status: 'ACTIVE',
      }
    })

    // Create test partner
    const testPartner = await db.partner.create({
      data: {
        name: 'Test Partner for Usage',
        billing_email: 'billing@usagetest.com',
        status: PartnerStatus.ACTIVE,
        created_by_user_id: adminUser.id,
      }
    })
    testPartnerId = testPartner.id

    // Create test tenant
    const testTenant = await db.tenant.create({
      data: {
        id: 'test-usage-tenant',
        partner_id: testPartnerId,
        name: 'Test Usage Tenant',
        tenant_type: TenantType.UI,
        status: TenantStatus.ACTIVE,
      }
    })
    testTenantId = testTenant.id

    // Create test plan
    const testPlan = await db.plan.create({
      data: {
        key: 'test-plan',
        name: 'Test Plan',
        limits: {
          dpia_sandbox_assessments: 10,
          dpia_production_assessments: 5,
          notes_sandbox_documents: 50,
          storage_mb: 500,
        },
      }
    })

    // Assign plan to tenant
    await db.tenantPlan.create({
      data: {
        tenant_id: testTenantId,
        plan_id: testPlan.id,
        effective_from: new Date(),
      }
    })

    // Get admin token
    const adminLoginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'admin@usage-test.com',
        password: 'adminpass123'
      }
    })
    const adminLoginBody = JSON.parse(adminLoginResponse.body)
    adminToken = adminLoginBody.data.access_token
  })

  afterAll(async () => {
    const db = getPrisma()
    
    // Clean up test data
    await db.usageCounter.deleteMany({
      where: {
        tenant_id: testTenantId
      }
    })
    
    await db.tenantPlan.deleteMany({
      where: {
        tenant_id: testTenantId
      }
    })
    
    await db.plan.deleteMany({
      where: {
        key: 'test-plan'
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
        email: 'admin@usage-test.com'
      }
    })
    
    await app.close()
  })

  test('POST /usage/record - record usage metric', async () => {
    const now = new Date()
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const response = await app.inject({
      method: 'POST',
      url: '/usage/record',
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        tenant_id: testTenantId,
        product_key: 'dpia',
        environment: Environment.SANDBOX,
        metric_key: 'assessments',
        value: 3,
        period_start: periodStart.toISOString()
      }
    })

    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.tenant_id).toBe(testTenantId)
    expect(body.data.product_key).toBe('dpia')
    expect(body.data.metric_key).toBe('assessments')
    expect(body.data.value).toBe(3)
  })

  test('POST /usage/record - increment existing usage', async () => {
    const now = new Date()
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)

    // Record additional usage for same metric
    const response = await app.inject({
      method: 'POST',
      url: '/usage/record',
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        tenant_id: testTenantId,
        product_key: 'dpia',
        environment: Environment.SANDBOX,
        metric_key: 'assessments',
        value: 2,
        period_start: periodStart.toISOString()
      }
    })

    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.value).toBe(5) // 3 + 2 = 5
  })

  test('GET /usage/tenant/:tenant_id - get usage summary', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/usage/tenant/${testTenantId}`,
      headers: {
        authorization: `Bearer ${adminToken}`
      }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.tenant_id).toBe(testTenantId)
    expect(body.data.metrics).toBeDefined()
    expect(Array.isArray(body.data.metrics)).toBe(true)
    expect(body.data.plan_limits).toBeDefined()
    
    // Find the DPIA metric
    const dpiaMetric = body.data.metrics.find((m: any) => 
      m.product_key === 'dpia' && 
      m.environment === Environment.SANDBOX && 
      m.metric_key === 'assessments'
    )
    expect(dpiaMetric).toBeDefined()
    expect(dpiaMetric.value).toBe(5)
    expect(dpiaMetric.percentage_used).toBe(50) // 5/10 * 100 = 50%
  })

  test('GET /usage/tenant/:tenant_id - filter by product', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/usage/tenant/${testTenantId}?product_key=dpia`,
      headers: {
        authorization: `Bearer ${adminToken}`
      }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.metrics.every((m: any) => m.product_key === 'dpia')).toBe(true)
  })

  test('GET /usage/tenant/:tenant_id - filter by environment', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/usage/tenant/${testTenantId}?environment=${Environment.SANDBOX}`,
      headers: {
        authorization: `Bearer ${adminToken}`
      }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.metrics.every((m: any) => m.environment === Environment.SANDBOX)).toBe(true)
  })

  test('GET /usage/global - get global usage statistics (admin only)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/usage/global',
      headers: {
        authorization: `Bearer ${adminToken}`
      }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.group_by).toBe('product_key')
    expect(body.data.results).toBeDefined()
    expect(Array.isArray(body.data.results)).toBe(true)
    expect(body.data.summary).toBeDefined()
    expect(body.data.summary.total_usage).toBeGreaterThan(0)
  })

  test('GET /usage/global - group by environment', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/usage/global?group_by=environment',
      headers: {
        authorization: `Bearer ${adminToken}`
      }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.group_by).toBe('environment')
  })

  test('GET /usage/global - group by tenant', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/usage/global?group_by=tenant_id',
      headers: {
        authorization: `Bearer ${adminToken}`
      }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.group_by).toBe('tenant_id')
  })

  test('POST /usage/record - invalid product key format', async () => {
    const now = new Date()
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const response = await app.inject({
      method: 'POST',
      url: '/usage/record',
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        tenant_id: testTenantId,
        product_key: 'INVALID_KEY!', // Invalid format
        environment: Environment.SANDBOX,
        metric_key: 'assessments',
        value: 1,
        period_start: periodStart.toISOString()
      }
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('INVALID_FORMAT')
  })

  test('POST /usage/record - negative value should fail', async () => {
    const now = new Date()
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const response = await app.inject({
      method: 'POST',
      url: '/usage/record',
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        tenant_id: testTenantId,
        product_key: 'dpia',
        environment: Environment.SANDBOX,
        metric_key: 'assessments',
        value: -1, // Negative value
        period_start: periodStart.toISOString()
      }
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
  })

  test('GET /usage/tenant/nonexistent - tenant not found', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/usage/tenant/nonexistent-tenant',
      headers: {
        authorization: `Bearer ${adminToken}`
      }
    })

    expect(response.statusCode).toBe(403)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('FORBIDDEN')
  })
})