import { test, beforeAll, afterAll, describe, expect } from 'vitest'
import { build } from '../app.js'
import { FastifyInstance } from 'fastify'
import { connectDatabase, getPrisma } from '../lib/database.js'
import bcrypt from 'bcryptjs'
import { Role } from '../lib/prisma/index.js'

describe('Authentication Routes', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = build({ logger: false })
    await app.ready()
    
    // Set up test database connection
    await connectDatabase()
    const db = getPrisma()
    
    // Clean up test data
    await db.user.deleteMany({
      where: {
        email: {
          in: ['test@example.com', 'admin@test.com']
        }
      }
    })
    
    // Create test user
    const passwordHash = await bcrypt.hash('testpassword123', 12)
    await db.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
        status: 'ACTIVE',
      }
    })

    // Create test admin user
    const adminPasswordHash = await bcrypt.hash('adminpassword123', 12)
    await db.user.create({
      data: {
        email: 'admin@test.com',
        name: 'Admin User',
        status: 'ACTIVE',
      }
    })
  })

  afterAll(async () => {
    // Clean up test data
    const db = getPrisma()
    await db.user.deleteMany({
      where: {
        email: {
          in: ['test@example.com', 'admin@test.com']
        }
      }
    })
    
    await app.close()
  })

  test('POST /auth/login - valid credentials', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'test@example.com',
        password: 'testpassword123'
      }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data).toHaveProperty('access_token')
    expect(body.data).toHaveProperty('token_type', 'Bearer')
    expect(body.data).toHaveProperty('expires_in')
  })

  test('POST /auth/login - invalid credentials', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'test@example.com',
        password: 'wrongpassword'
      }
    })

    expect(response.statusCode).toBe(401)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('INVALID_CREDENTIALS')
  })

  test('POST /auth/login - non-existent user', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'nonexistent@example.com',
        password: 'password123'
      }
    })

    expect(response.statusCode).toBe(401)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('INVALID_CREDENTIALS')
  })

  test('POST /auth/login - missing required fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'test@example.com'
        // missing password
      }
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
  })

  test('GET /auth/me - with valid token', async () => {
    // First login to get token
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'test@example.com',
        password: 'testpassword123'
      }
    })

    const loginBody = JSON.parse(loginResponse.body)
    const token = loginBody.data.access_token

    // Then test /me endpoint
    const meResponse = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        authorization: `Bearer ${token}`
      }
    })

    expect(meResponse.statusCode).toBe(200)
    const body = JSON.parse(meResponse.body)
    expect(body.success).toBe(true)
    expect(body.data.email).toBe('test@example.com')
    expect(body.data.name).toBe('Test User')
  })

  test('GET /auth/me - without token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me'
    })

    expect(response.statusCode).toBe(401)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  test('GET /auth/me - with invalid token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        authorization: 'Bearer invalid-token'
      }
    })

    expect(response.statusCode).toBe(401)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('UNAUTHORIZED')
  })
})