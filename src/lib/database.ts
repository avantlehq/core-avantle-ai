import { PrismaClient } from './prisma/index.js'
import { logger } from './logger.js'

let prisma: PrismaClient | null = null

export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: [
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
      ],
    })

    // Log database events
    prisma.$on('warn', (e) => {
      logger.warn('Database warning', { 
        target: e.target, 
        message: e.message,
        timestamp: e.timestamp 
      })
    })

    prisma.$on('error', (e) => {
      logger.error('Database error', { 
        target: e.target, 
        message: e.message,
        timestamp: e.timestamp 
      })
    })
  }

  return prisma
}

export async function connectDatabase(): Promise<void> {
  try {
    const db = getPrisma()
    await db.$connect()
    logger.info('Database connected successfully')
  } catch (error) {
    logger.error('Failed to connect to database', {}, error as Error)
    throw error
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect()
    prisma = null
    logger.info('Database disconnected')
  }
}

// Health check for database
export async function checkDatabaseHealth(): Promise<{
  status: 'healthy' | 'unhealthy'
  response_time_ms: number
  error?: string
}> {
  const start = Date.now()
  
  try {
    const db = getPrisma()
    await db.$queryRaw`SELECT 1`
    
    return {
      status: 'healthy',
      response_time_ms: Date.now() - start,
    }
  } catch (error) {
    logger.error('Database health check failed', {}, error as Error)
    
    return {
      status: 'unhealthy',
      response_time_ms: Date.now() - start,
      error: (error as Error).message,
    }
  }
}