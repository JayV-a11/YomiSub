/**
 * scripts/copy-dict.mjs
 *
 * Copies kuromoji dictionary files from node_modules to public/dict/
 * so they are served as web-accessible resources in the Chrome extension.
 *
 * Also copies jmdict-en.json from src/assets/ to public/assets/jmdict/
 * so Vite includes it in the dist output.
 *
 * For KANJIDIC2, the source file is 15 MB but only a tiny subset of fields is
 * needed at runtime (literal, on/kun readings, English meanings). We compact
 * it down to ~1 MB before copying to public/.
 *
 * Run automatically via the "predev" and "prebuild" npm scripts.
 */
import { cpSync, mkdirSync, existsSync, copyFileSync, readFileSync, writeFileSync, statSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root = join(__dirname, '..')

// ---- kuromoji dict ---------------------------------------------------------
const kuromojiSrc = join(root, 'node_modules', 'kuromoji', 'dict')
const kuromojiDest = join(root, 'public', 'dict')

if (!existsSync(kuromojiSrc)) {
  console.error('❌  kuromoji dict not found — run: npm install')
  process.exit(1)
}

mkdirSync(kuromojiDest, { recursive: true })
cpSync(kuromojiSrc, kuromojiDest, { recursive: true })
console.log('✓  Kuromoji dict copied →', kuromojiDest)

// ---- JMdict JSON -----------------------------------------------------------
const jmdictSrc = join(root, 'src', 'assets', 'jmdict', 'jmdict-en.json')
const jmdictDestDir = join(root, 'public', 'assets', 'jmdict')
const jmdictDest = join(jmdictDestDir, 'jmdict-en.json')

if (!existsSync(jmdictSrc)) {
  console.warn('⚠   JMdict not found — run: node scripts/download-jmdict.mjs')
} else {
  mkdirSync(jmdictDestDir, { recursive: true })
  copyFileSync(jmdictSrc, jmdictDest)
  console.log('✓  JMdict copied →', jmdictDest)
}

// ---- KANJIDIC2 compact -----------------------------------------------------
// Strips out codepoints, radicals, references, etc — keeps only the fields
// the extension actually consults (literal + readings + meanings).
const kanjidicSrc = join(root, 'src', 'assets', 'kanjidic', 'kanjidic2-en.json')
const kanjidicDestDir = join(root, 'public', 'assets', 'kanjidic')
const kanjidicDest = join(kanjidicDestDir, 'kanjidic2-compact.json')

if (!existsSync(kanjidicSrc)) {
  console.warn('⚠   KANJIDIC2 not found — run: node scripts/download-kanjidic.mjs')
} else {
  mkdirSync(kanjidicDestDir, { recursive: true })
  // Skip the compact step if the output is fresher than the source.
  const srcStat = statSync(kanjidicSrc)
  const needsRebuild = !existsSync(kanjidicDest) || statSync(kanjidicDest).mtimeMs < srcStat.mtimeMs
  if (needsRebuild) {
    const raw = JSON.parse(readFileSync(kanjidicSrc, 'utf8'))
    const compact = raw.characters.map((c) => {
      const groups = c.readingMeaning?.groups ?? []
      const onyomi = []
      const kunyomi = []
      const meanings = []
      for (const g of groups) {
        for (const r of g.readings ?? []) {
          if (r.type === 'ja_on') onyomi.push(r.value)
          else if (r.type === 'ja_kun') kunyomi.push(r.value)
        }
        for (const m of g.meanings ?? []) {
          if (m.lang === 'en') meanings.push(m.value)
        }
      }
      return { l: c.literal, on: onyomi, kun: kunyomi, m: meanings }
    })
    writeFileSync(kanjidicDest, JSON.stringify(compact))
    console.log(`✓  KANJIDIC2 compacted → ${kanjidicDest} (${Math.round(statSync(kanjidicDest).size / 1024)} KB)`)
  } else {
    console.log('✓  KANJIDIC2 compact up-to-date →', kanjidicDest)
  }
}

// ---- Pitch accent ----------------------------------------------------------
const pitchSrc = join(root, 'src', 'assets', 'pitch-accent', 'pitch-accent.json')
const pitchDestDir = join(root, 'public', 'assets', 'pitch-accent')
const pitchDest = join(pitchDestDir, 'pitch-accent.json')

if (!existsSync(pitchSrc)) {
  console.warn('⚠   Pitch accent dict not found — run: node scripts/download-pitch-accent.mjs')
} else {
  mkdirSync(pitchDestDir, { recursive: true })
  copyFileSync(pitchSrc, pitchDest)
  console.log('✓  Pitch accent copied →', pitchDest)
}
