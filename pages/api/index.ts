import { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    service: 'Avantle Core API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    message: 'API is running on Vercel!',
    docs: '/api/docs',
    path: req.url,
    method: req.method,
    query: req.query
  })
}