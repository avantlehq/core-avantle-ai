import { VercelRequest, VercelResponse } from '@vercel/node'
import { buildServer } from '../src/server.js'
import { connectDatabase } from '../src/lib/database.js'

let cachedServer: any = null

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Initialize database connection
    if (!cachedServer) {
      await connectDatabase()
      cachedServer = await buildServer()
      await cachedServer.ready()
    }

    // Handle the request
    await cachedServer.inject({
      method: req.method as any,
      url: req.url!,
      headers: req.headers as any,
      payload: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
      query: req.query as any,
    }).then((response: any) => {
      res.status(response.statusCode)
      
      // Set headers
      Object.entries(response.headers).forEach(([key, value]) => {
        res.setHeader(key, value as string)
      })

      // Send response
      const contentType = response.headers['content-type'] || ''
      if (contentType.includes('application/json')) {
        res.json(JSON.parse(response.payload))
      } else {
        res.send(response.payload)
      }
    })
  } catch (error) {
    console.error('Vercel handler error:', error)
    res.status(500).json({ 
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
        correlation_id: req.headers['x-correlation-id'] as string || 'unknown'
      }
    })
  }
}