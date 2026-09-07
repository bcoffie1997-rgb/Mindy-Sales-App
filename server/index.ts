import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import apiHandler from '../api/[...route]'

const app = express()
const port = Number(process.env.PORT) || 3007
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')

app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))

app.use('/api', async (req, res) => {
  try {
    await apiHandler(req as any, res as any)
  } catch (error) {
    console.error(error)
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' })
  }
})

app.use(express.static(dist, { index: false }))
app.use((_req, res) => res.sendFile(path.join(dist, 'index.html')))

app.listen(port, () => {
  console.log(`GovCon Sales Dashboard running at http://localhost:${port}`)
})
