import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config()

const app = express()
const PORT = process.env.FRONTEND_PORT || 3000

app.use(express.static(path.join(__dirname)))
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Frontend served at http://localhost:${PORT}`)
})
