import { vi } from 'vitest'
import { config } from 'dotenv'

// Load test environment variables
config({ path: '.env.test' })

// Mock bcryptjs for faster tests
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockImplementation(async (password: string) => `hashed_${password}`),
    compare: vi.fn().mockImplementation(async (password: string, hash: string) => {
      return hash === `hashed_${password}`
    })
  }
}))

// Set test environment
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres:password@localhost:5432/avantle_core_test'
process.env.JWT_SECRET = 'test-jwt-secret-key'
process.env.ADMIN_EMAIL = 'admin@test.com'
process.env.ADMIN_PASSWORD = 'adminpass123'