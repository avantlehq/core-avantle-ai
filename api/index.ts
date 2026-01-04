import { VercelRequest, VercelResponse } from '@vercel/node'
import { build } from '../src/app.js'

let app: any = null

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!app) {
    try {
      // Build Fastify app
      app = build({ logger: false })
      await app.ready()
    } catch (error) {
      console.error('Failed to initialize app:', error)
      return res.status(500).json({
        success: false,
        error: {
          code: 'INITIALIZATION_ERROR',
          message: 'Failed to initialize application'
        }
      })
    }
  }

  try {
    await app.ready()
    app.server.emit('request', req, res)
  } catch (error) {
    console.error('Request handling error:', error)
    res.status(500).json({
      success: false,
      error: {
        code: 'REQUEST_ERROR',
        message: 'Internal server error'
      }
    })
  }
}