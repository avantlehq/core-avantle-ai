// Mock Prisma client for deployment without database connection

export const mockPrismaClient = {
  user: {
    findUnique: async () => null,
    findMany: async () => [],
    create: async () => null,
    update: async () => null,
  },
  partner: {
    findUnique: async () => null,
    findMany: async () => [],
    create: async () => null,
  },
  tenant: {
    findUnique: async () => null,
    findMany: async () => [],
    create: async () => null,
  },
  $connect: async () => {},
  $disconnect: async () => {},
  $queryRaw: async () => [],
}

export type MockPrismaClient = typeof mockPrismaClient