// VERSION MANAGEMENT SYSTEM FOR CORE-AVANTLE-AI
// This file tracks the current version and changelog for the Core API

export const VERSION = '1.0.2'
export const VERSION_NAME = 'GitHub Integration & Production Deployment'

export const CHANGELOG = [
  {
    version: '1.0.2',
    name: 'GitHub Integration & Production Deployment',
    date: '2026-01-04',
    changes: [
      '🔧 **GITHUB INTEGRATION**: Repository created and connected to avantlehq/core-avantle-ai',
      '📋 **VERSION MANAGEMENT**: Added comprehensive version tracking system',
      '🚀 **DEPLOYMENT READY**: Configured for stable Vercel production deployment',
      '🔗 **GIT WORKFLOW**: Established proper Git workflow with remote origin',
      '📊 **CHANGELOG SYSTEM**: Complete version history tracking implemented',
      '🎯 **CONSISTENCY**: Aligned with avantle.ai and dpia.avantle.ai version standards'
    ]
  },
  {
    version: '1.0.1',
    name: 'Production Deployment Documentation',
    date: '2026-01-04',
    changes: [
      '📚 **DOCUMENTATION**: Added production deployment documentation',
      '🚀 **VERCEL DEPLOYMENT**: Core API deployed to Vercel platform',
      '🔧 **SERVERLESS CONFIG**: Configured for serverless deployment',
      '⚙️ **DEPLOYMENT FIX**: Fixed Vercel deployment configuration issues'
    ]
  },
  {
    version: '1.0.0',
    name: 'Core API Foundation',
    date: '2026-01-04', 
    changes: [
      '🚀 **INITIAL RELEASE**: Core API with multi-tenant architecture',
      '🏢 **PARTNER MANAGEMENT**: Full CRUD operations for partner organizations',
      '🏗️ **TENANT MANAGEMENT**: Complete tenant lifecycle management',
      '🔐 **AUTHENTICATION**: JWT-based auth with role-based access control',
      '🎯 **API ENDPOINTS**: RESTful API with comprehensive endpoint coverage',
      '📊 **ADMIN DASHBOARD**: Admin statistics and monitoring endpoints',
      '🛡️ **SECURITY**: RBAC with 4-tier permission system',
      '🔧 **FASTIFY FRAMEWORK**: High-performance API server with TypeScript',
      '💾 **DATABASE**: Prisma ORM with SQLite for development'
    ]
  }
]

export const BUILD_DATE = new Date().toISOString().split('T')[0]
export const GIT_BRANCH = process.env.VERCEL_GIT_COMMIT_REF || 'main'
export const GIT_COMMIT = process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'unknown'

// Helper function to get formatted version string
export function getVersionString(): string {
  return `v${VERSION}`
}

// Helper function to get full version info
export function getVersionInfo() {
  return {
    version: VERSION,
    name: VERSION_NAME,
    buildDate: BUILD_DATE,
    gitBranch: GIT_BRANCH,
    gitCommit: GIT_COMMIT,
    changelog: CHANGELOG
  }
}