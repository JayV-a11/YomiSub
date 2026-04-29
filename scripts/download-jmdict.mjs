/**
 * scripts/download-jmdict.mjs
 *
 * Downloads the JMdict-simplified English JSON from the official GitHub release
 * and saves it to src/assets/jmdict/jmdict-en.json.
 *
 * Source: https://github.com/scriptin/jmdict-simplified
 *
 * Usage:
 *   node scripts/download-jmdict.mjs
 *
 * The file is ~10 MB compressed. Run this once after cloning the repo.
 */
import { createWriteStream, mkdirSync } from 'fs'
import { pipeline } from 'stream/promises'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { createGunzip } from 'zlib'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const dest = join(__dirname, '..', 'src', 'assets', 'jmdict', 'jmdict-en.json')
const url =
  'https://github.com/scriptin/jmdict-simplified/releases/latest/download/jmdict-eng.json.gz'

mkdirSync(join(__dirname, '..', 'src', 'assets', 'jmdict'), { recursive: true })

console.log('⬇  Downloading JMdict-simplified…')
const res = await fetch(url)
if (!res.ok) {
  throw new Error(`Download failed: HTTP ${res.status}`)
}

await pipeline(
  // @ts-ignore — Response.body is a ReadableStream; Node 18+ supports this
  res.body,
  createGunzip(),
  createWriteStream(dest),
)

console.log('✓  JMdict saved →', dest)
