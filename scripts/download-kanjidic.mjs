/**
 * scripts/download-kanjidic.mjs
 *
 * Downloads the KANJIDIC2 simplified English JSON from the official GitHub
 * release of scriptin/kanjidic-simplified and saves it to
 * src/assets/kanjidic/kanjidic2-en.json.
 *
 * Run once after cloning the repo. Same pattern as download-jmdict.mjs.
 *
 * Usage:
 *   node scripts/download-kanjidic.mjs
 */
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { gunzipSync } from 'zlib'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const destDir = join(__dirname, '..', 'src', 'assets', 'kanjidic')
const dest = join(destDir, 'kanjidic2-en.json')

mkdirSync(destDir, { recursive: true })

console.log('🔍  Fetching latest kanjidic release info…')
const apiRes = await fetch(
  'https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest',
  { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'YomiSub/1.0' } },
)
if (!apiRes.ok) throw new Error(`GitHub API error: HTTP ${apiRes.status}`)

const release = await apiRes.json()
// kanjidic2-en-{version}.json.tgz
const asset = release.assets.find(
  (a) => /^kanjidic2-en-[^/]+\.json\.tgz$/.test(a.name),
)
if (!asset) throw new Error('Could not find kanjidic2-en asset in latest release')

console.log(`⬇  Downloading ${asset.name} (${Math.round(asset.size / 1024 / 1024)} MB)…`)
const res = await fetch(asset.browser_download_url)
if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
const compressed = Buffer.from(await res.arrayBuffer())

console.log('📦  Decompressing…')
const tarData = gunzipSync(compressed)

let offset = 0
let saved = false
while (offset + 512 <= tarData.length) {
  const header = tarData.subarray(offset, offset + 512)
  if (header.every((b) => b === 0)) break

  const typeflag = String.fromCharCode(header[156])
  const sizeOctal = header.subarray(124, 136).toString('ascii').replace(/\0/g, '').trim()
  const fileSize = parseInt(sizeOctal, 8) || 0
  const paddedSize = Math.ceil(fileSize / 512) * 512
  offset += 512

  if (typeflag === '0' || typeflag === '\0') {
    writeFileSync(dest, tarData.subarray(offset, offset + fileSize))
    saved = true
    break
  }
  offset += paddedSize
}

if (!saved) throw new Error('No regular file found in tar archive')
console.log('✓  KANJIDIC2 saved →', dest)
