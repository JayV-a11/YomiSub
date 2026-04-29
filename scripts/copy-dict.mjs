/**
 * scripts/copy-dict.mjs
 *
 * Copies kuromoji dictionary files from node_modules to public/dict/
 * so they are served as web-accessible resources in the Chrome extension.
 *
 * Also copies jmdict-en.json from src/assets/ to public/assets/jmdict/
 * so Vite includes it in the dist output.
 *
 * Run automatically via the "predev" and "prebuild" npm scripts.
 */
import { cpSync, mkdirSync, existsSync, copyFileSync } from 'fs'
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
