import { FastifyPluginAsync } from 'fastify'
import { getVersionInfo, getVersionString } from '../lib/version.js'

export const versionRoutes: FastifyPluginAsync = async (fastify) => {
  // Basic version endpoint
  fastify.get('/', {
    schema: {
      description: 'Get current API version',
      tags: ['System'],
      response: {
        200: {
          type: 'object',
          properties: {
            version: { type: 'string' },
            name: { type: 'string' },
            buildDate: { type: 'string' },
            gitBranch: { type: 'string' },
            gitCommit: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const versionInfo = getVersionInfo()
    return {
      version: getVersionString(),
      name: versionInfo.name,
      buildDate: versionInfo.buildDate,
      gitBranch: versionInfo.gitBranch,
      gitCommit: versionInfo.gitCommit,
    }
  })

  // Detailed version with changelog
  fastify.get('/detailed', {
    schema: {
      description: 'Get detailed version information including changelog',
      tags: ['System'],
      response: {
        200: {
          type: 'object',
          properties: {
            version: { type: 'string' },
            name: { type: 'string' },
            buildDate: { type: 'string' },
            gitBranch: { type: 'string' },
            gitCommit: { type: 'string' },
            changelog: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  version: { type: 'string' },
                  name: { type: 'string' },
                  date: { type: 'string' },
                  changes: {
                    type: 'array',
                    items: { type: 'string' }
                  }
                }
              }
            }
          },
        },
      },
    },
  }, async (request, reply) => {
    return getVersionInfo()
  })
}