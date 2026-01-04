import { test, beforeAll, afterAll, describe, expect } from 'vitest'
import { build } from '../app.js'
import { FastifyInstance } from 'fastify'
import { connectDatabase, getPrisma } from '../lib/database.js'
import bcrypt from 'bcryptjs'
import { Role, PartnerStatus } from '../lib/prisma/index.js'

describe('Partner Routes', () => {
  let app: FastifyInstance
  let adminToken: string
  let partnerAdminToken: string
  let testPartnerId: string

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
        name: 'Test Partner Company'
      }
    })

    // Create test admin user
    const adminPasswordHash = await bcrypt.hash('adminpass123', 12)
    const adminUser = await db.user.create({
      data: {
        email: 'admin@test.com',
        name: 'Test Admin',
        status: 'ACTIVE',
      }
    })

    // Create test partner admin user
    const partnerPasswordHash = await bcrypt.hash('partnerpass123', 12)
    const partnerUser = await db.user.create({
      data: {
        email: 'partner@test.com',
        name: 'Test Partner Admin',
        status: 'ACTIVE',
      }
    })

    // Login as admin to get token
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

    // Login as partner admin to get token  
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
    if (testPartnerId) {
      await db.partner.delete({
        where: { id: testPartnerId }
      }).catch(() => {}) // Ignore if already deleted
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

  test('POST /partners - create partner as admin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/partners',
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        name: 'Test Partner Company',
        billing_email: 'billing@testpartner.com'
      }
    })

    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.name).toBe('Test Partner Company')
    expect(body.data.billing_email).toBe('billing@testpartner.com')
    expect(body.data.status).toBe(PartnerStatus.PENDING)
    
    testPartnerId = body.data.id
  })

  test('POST /partners - unauthorized without admin role', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/partners',
      headers: {
        authorization: `Bearer ${partnerAdminToken}`
      },
      payload: {
        name: 'Unauthorized Partner',
        billing_email: 'unauthorized@example.com'
      }
    })

    expect(response.statusCode).toBe(403)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('FORBIDDEN')
  })

  test('GET /partners - list partners as admin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/partners',
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

  test('GET /partners/:id - get partner details', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/partners/${testPartnerId}`,
      headers: {
        authorization: `Bearer ${adminToken}`
      }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe(testPartnerId)
    expect(body.data.name).toBe('Test Partner Company')
  })

  test('GET /partners/999 - partner not found', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/partners/clnm3r4c8000008m17u1k3g5h',
      headers: {
        authorization: `Bearer ${adminToken}`
      }
    })

    expect(response.statusCode).toBe(404)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('RESOURCE_NOT_FOUND')
  })

  test('PUT /partners/:id - update partner', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/partners/${testPartnerId}`,
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        name: 'Updated Test Partner Company',
        status: PartnerStatus.ACTIVE
      }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.name).toBe('Updated Test Partner Company')
    expect(body.data.status).toBe(PartnerStatus.ACTIVE)
  })

  test('POST /partners - duplicate billing email should fail', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/partners',
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        name: 'Another Partner',
        billing_email: 'billing@testpartner.com' // Same as existing
      }
    })

    expect(response.statusCode).toBe(500) // Database constraint error
  })

  test('POST /partners - invalid data validation', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/partners',
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        name: '', // Empty name should fail validation
        billing_email: 'invalid-email' // Invalid email format
      }
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
  })
})