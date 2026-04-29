/**
 * word-segmenter.ts
 *
 * Responsibilities:
 *   - Initialise the kuromoji tokenizer (once, async, non-blocking)
 *   - Segment Japanese text into Word[] via morphological analysis
 *
 * Rules:
 *   - NEVER accesses external APIs — local processing only
 *   - NEVER blocks the UI thread during initialisation
 *   - NEVER segements null/empty input
 */
import kuromoji from 'kuromoji'
import type { Word } from '@/shared/types'
import { logger } from '@/shared/utils'

type KuromojiTokenizer = kuromoji.Tokenizer<kuromoji.IpadicFeatures>

let tokenizerInstance: KuromojiTokenizer | null = null
let initPromise: Promise<KuromojiTokenizer> | null = null

// ---- Initialisation --------------------------------------------------------

/**
 * Initialises the kuromoji tokenizer using dict files served as web-accessible
 * resources from the extension's public/dict/ folder.
 *
 * Safe to call multiple times — resolves immediately if already initialised.
 */
export function initTokenizer(): Promise<KuromojiTokenizer> {
  if (tokenizerInstance !== null) return Promise.resolve(tokenizerInstance)
  if (initPromise !== null) return initPromise

  initPromise = new Promise<KuromojiTokenizer>((resolve, reject) => {
    const dicPath = chrome.runtime.getURL('dict/')
    kuromoji.builder({ dicPath }).build((err, tokenizer) => {
      if (err) {
        initPromise = null
        reject(err)
        return
      }
      tokenizerInstance = tokenizer
      logger('Kuromoji tokenizer ready')
      resolve(tokenizer)
    })
  })

  return initPromise
}

/** Returns the tokenizer only if already initialised — no side effects. */
export function getTokenizer(): KuromojiTokenizer | null {
  return tokenizerInstance
}

// ---- Segmentation ----------------------------------------------------------

/**
 * Converts a katakana string to hiragana.
 * Kuromoji returns `reading` in katakana — we display furigana in hiragana.
 */
export function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  )
}

function tokenToWord(token: kuromoji.IpadicFeatures, offset: number): Word {
  const surface = token.surface_form

  const reading =
    token.reading !== undefined && token.reading !== '*'
      ? katakanaToHiragana(token.reading)
      : surface

  const dictionaryForm =
    token.basic_form !== undefined && token.basic_form !== '*'
      ? token.basic_form
      : surface

  return {
    surface,
    reading,
    dictionaryForm,
    partOfSpeech: token.pos ?? 'unknown',
    startIndex: offset,
    endIndex: offset + surface.length,
  }
}

/**
 * Segments a Japanese string into Word[].
 *
 * @throws {Error} if the tokenizer has not been initialised yet.
 *                 Always call initTokenizer() before calling this.
 */
export function segmentText(text: string): Word[] {
  if (!text || text.trim().length === 0) return []

  if (tokenizerInstance === null) {
    throw new Error(
      'Tokenizer not initialised — await initTokenizer() before calling segmentText()',
    )
  }

  const tokens = tokenizerInstance.tokenize(text)
  let offset = 0
  const words: Word[] = []

  for (const token of tokens) {
    words.push(tokenToWord(token, offset))
    offset += token.surface_form.length
  }

  return words
}
