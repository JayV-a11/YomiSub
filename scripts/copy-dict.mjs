/**
 * scripts/copy-dict.mjs
 *
 * Copies kuromoji dictionary files from node_modules to public/dict/
 * so they are served as web-accessible resources in the Chrome extension.
 *
 * Run automatically via the "predev" and "prebuild" npm scripts.
 */
import { cpSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root = join(__dirname, '..')
const src = join(root, 'node_modules', 'kuromoji', 'dict')
const dest = join(root, 'public', 'dict')

if (!existsSync(src)) {
  console.error('❌  kuromoji dict not found — run: npm install')
  process.exit(1)
}

mkdirSync(dest, { recursive: true })
cpSync(src, dest, { recursive: true })
console.log('✓  Kuromoji dict copied →', dest)
