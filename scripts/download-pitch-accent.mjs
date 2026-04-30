/**
 * scripts/download-pitch-accent.mjs
 *
 * Downloads the kanjium accents.txt dataset and converts it to a compact JSON
 * dictionary keyed by reading. Each value is an array of { word, pitch }
 * entries, since the same reading can map to several words with different
 * accent patterns.
 *
 * Source: github.com/mifunetoshiro/kanjium (MIT-licensed open data)
 *
 * Output: src/assets/pitch-accent/pitch-accent.json
 *
 * Format of accents.txt (tab-separated):
 *   WORD<tab>READING<tab>(N)
 *   WORD<tab>READING<tab>(N,M)         (multiple acceptable patterns)
 *
 * N is the drop-after-mora index in NHK notation:
 *   0  = heiban (no drop)
 *   1  = atamadaka (drop after mora 1)
 *   N  = nakadaka / odaka (drop after mora N)
 *
 * Usage:
 *   node scripts/download-pitch-accent.mjs
 */
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const destDir = join(__dirname, '..', 'src', 'assets', 'pitch-accent')
const dest = join(destDir, 'pitch-accent.json')

mkdirSync(destDir, { recursive: true })

const SOURCE_URL =
  'https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/data/source_files/raw/accents.txt'

console.log('⬇  Downloading kanjium accents.txt…')
const res = await fetch(SOURCE_URL)
if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
const text = await res.text()

console.log('🔧  Parsing & compacting…')

// Map: reading → array of { word, pitch[] }
// Multiple words can share a reading (homophones), and one entry can have
// multiple pitches when both patterns are accepted in standard speech.
const dict = {}

let parsed = 0
let skipped = 0
for (const rawLine of text.split('\n')) {
  const line = rawLine.trim()
  if (line.length === 0) continue
  const parts = line.split('\t')
  if (parts.length < 3) {
    skipped++
    continue
  }
  const word = parts[0]
  const reading = parts[1]
  const pitchRaw = parts[2]
  if (!word || !reading || !pitchRaw) {
    skipped++
    continue
  }
  // pitchRaw looks like "(0)" or "(0,1)" or sometimes plain "0"
  const inside = pitchRaw.replace(/[()]/g, '')
  const pitches = inside
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 20)
  if (pitches.length === 0) {
    skipped++
    continue
  }
  if (!dict[reading]) dict[reading] = []
  dict[reading].push({ w: word, p: pitches })
  parsed++
}

writeFileSync(dest, JSON.stringify(dict))
console.log(
  `✓  Pitch accent saved → ${dest} (${parsed} entries · ${skipped} skipped · ${Object.keys(dict).length} unique readings)`,
)
