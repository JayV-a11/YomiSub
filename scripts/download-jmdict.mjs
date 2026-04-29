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
 * Run this once after cloning the repo. Requires Node.js ≥ 18.
 * Uses only Node.js built-ins — no extra dependencies, no external tools.
 */
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { gunzipSync } from 'zlib'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const destDir = join(__dirname, '..', 'src', 'assets', 'jmdict')
const dest = join(destDir, 'jmdict-en.json')

mkdirSync(destDir, { recursive: true })

// Step 1: Resolve the versioned asset URL from the GitHub API
console.log('🔍  Fetching latest release info…')
const apiRes = await fetch(
  'https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest',
  { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'YomiSub/1.0' } },
)
if (!apiRes.ok) throw new Error(`GitHub API error: HTTP ${apiRes.status}`)

const release = await apiRes.json()
// Match jmdict-eng-{version}.json.tgz — exclude "common" and "examples" variants
const asset = release.assets.find(
  (a) =>
    /^jmdict-eng-[^/]+\.json\.tgz$/.test(a.name) &&
    !a.name.includes('common') &&
    !a.name.includes('examples'),
)
if (!asset) throw new Error('Could not find jmdict-eng asset in latest release')

// Step 2: Download the tgz entirely into memory (11 MB compressed → 114 MB JSON)
console.log(`⬇  Downloading ${asset.name} (${Math.round(asset.size / 1024 / 1024)} MB)…`)
const res = await fetch(asset.browser_download_url)
if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
const compressed = Buffer.from(await res.arrayBuffer())

// Step 3: Decompress gzip → raw tar data
console.log('📦  Decompressing…')
const tarData = gunzipSync(compressed)

// Step 4: Parse tar in-memory — find and extract the first regular file
// Tar format: 512-byte header blocks, file data padded to 512-byte boundaries
let offset = 0
let saved = false
while (offset + 512 <= tarData.length) {
  const header = tarData.subarray(offset, offset + 512)
  if (header.every((b) => b === 0)) break // end-of-archive sentinel

  const typeflag = String.fromCharCode(header[156])
  const sizeOctal = header.subarray(124, 136).toString('ascii').replace(/\0/g, '').trim()
  const fileSize = parseInt(sizeOctal, 8) || 0
  const paddedSize = Math.ceil(fileSize / 512) * 512
  offset += 512 // consume header block

  if (typeflag === '0' || typeflag === '\0') {
    // Regular file — extract it
    writeFileSync(dest, tarData.subarray(offset, offset + fileSize))
    saved = true
    break
  }
  offset += paddedSize // skip data blocks for non-regular entries (e.g. PAX headers)
}

if (!saved) throw new Error('No regular file found in tar archive')
console.log('✓  JMdict saved →', dest)
