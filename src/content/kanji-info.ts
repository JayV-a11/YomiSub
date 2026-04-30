/**
 * kanji-info.ts
 *
 * Lazy-loads a compact KANJIDIC2 derivative (literal + readings + meanings)
 * and exposes lookup-by-character + word-decomposition helpers.
 *
 * The full KANJIDIC2 is 15 MB; the compact form shipped under
 * public/assets/kanjidic/kanjidic2-compact.json is ~1 MB.
 */
import { logger } from '@/shared/utils'
import type { KanjiInfo } from '@/shared/types'

interface CompactKanjiEntry {
  l: string      // literal (the character)
  on: string[]   // ja_on readings
  kun: string[]  // ja_kun readings
  m: string[]    // English meanings
}

let kanjiMap: Map<string, KanjiInfo> | null = null
let loadPromise: Promise<Map<string, KanjiInfo>> | null = null

async function loadKanjiDict(): Promise<Map<string, KanjiInfo>> {
  if (kanjiMap !== null) return kanjiMap
  if (loadPromise !== null) return loadPromise

  loadPromise = fetch(chrome.runtime.getURL('assets/kanjidic/kanjidic2-compact.json'))
    .then((res) => {
      if (!res.ok) throw new Error(`KANJIDIC fetch HTTP ${res.status}`)
      return res.json() as Promise<CompactKanjiEntry[]>
    })
    .then((entries) => {
      const map = new Map<string, KanjiInfo>()
      for (const e of entries) {
        map.set(e.l, {
          char: e.l,
          meanings: e.m,
          onyomi: e.on,
          kunyomi: e.kun,
        })
      }
      kanjiMap = map
      logger(`KANJIDIC loaded — ${map.size} entries`)
      return map
    })
    .catch((err: unknown) => {
      loadPromise = null
      throw err
    })

  return loadPromise
}

// CJK Unified Ideographs — the kanji range in JIS/Joyo. Hiragana/katakana
// fall outside this and are correctly excluded.
const KANJI_REGEX = /[一-鿿㐀-䶿]/u

export function isKanji(char: string): boolean {
  return KANJI_REGEX.test(char)
}

/**
 * Returns one KanjiInfo per kanji character in the word, in order.
 * Non-kanji characters (kana, punctuation) are skipped silently.
 * Unknown kanji (not in dict) are skipped — they're rare and we'd rather
 * show partial info than a misleading "unknown" entry.
 */
export async function getKanjiBreakdown(word: string): Promise<KanjiInfo[]> {
  const chars = Array.from(word).filter(isKanji)
  if (chars.length === 0) return []

  const map = await loadKanjiDict()
  const seen = new Set<string>()
  const out: KanjiInfo[] = []
  for (const c of chars) {
    if (seen.has(c)) continue
    seen.add(c)
    const info = map.get(c)
    if (info) {
      // Trim long lists for storage — most users only need top 3 of each.
      out.push({
        char: info.char,
        meanings: info.meanings.slice(0, 4),
        onyomi: info.onyomi.slice(0, 4),
        kunyomi: info.kunyomi.slice(0, 4),
      })
    }
  }
  return out
}

/** Exposed for testing — resets the in-memory cache */
export function _resetKanjiCache(): void {
  kanjiMap = null
  loadPromise = null
}
