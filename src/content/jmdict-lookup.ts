/**
 * jmdict-lookup.ts
 *
 * Responsibilities:
 *   - Lazy-load the JMdict JSON from extension assets
 *   - Search for a Japanese word (kanji or kana form)
 *   - Fall back to a configured translation API if not found locally
 *
 * Rules:
 *   - External API calls only happen when explicitly configured by the user
 *   - No user data is ever sent to a first-party server
 *   - API keys are read from UserSettings — never hardcoded
 */
import type { JMdictEntry, JMdictFile, LookupResult, UserSettings } from '@/shared/types'
import { logger } from '@/shared/utils'

// ---- Dictionary cache ------------------------------------------------------

let jmdictEntries: JMdictEntry[] | null = null
let loadPromise: Promise<JMdictEntry[]> | null = null

async function loadJMdict(): Promise<JMdictEntry[]> {
  if (jmdictEntries !== null) return jmdictEntries
  if (loadPromise !== null) return loadPromise

  loadPromise = fetch(chrome.runtime.getURL('assets/jmdict/jmdict-en.json'))
    .then((res) => {
      if (!res.ok) throw new Error(`JMdict fetch HTTP ${res.status}`)
      return res.json() as Promise<JMdictFile>
    })
    .then((data) => {
      jmdictEntries = data.words
      logger(`JMdict loaded — ${jmdictEntries.length} entries`)
      return jmdictEntries
    })
    .catch((err: unknown) => {
      loadPromise = null // allow retry
      throw err
    })

  return loadPromise
}

// ---- Search ----------------------------------------------------------------

/**
 * Finds the first JMdict entry matching the given term (kanji or kana).
 * Exported for unit testing.
 */
export function searchJMdict(entries: JMdictEntry[], term: string): JMdictEntry | undefined {
  return entries.find((entry) => {
    const kanjiMatch = entry.kanji.some((k) => k.text === term)
    const kanaMatch = entry.kana.some((k) => k.text === term)
    return kanjiMatch || kanaMatch
  })
}

function entryToResult(entry: JMdictEntry, originalTerm: string): LookupResult {
  const reading = entry.kana[0]?.text ?? originalTerm
  const partOfSpeech = entry.sense[0]?.partOfSpeech[0] ?? ''
  const definitions = entry.sense
    .flatMap((s) => s.gloss.filter((g) => g.lang === 'eng').map((g) => g.text))
    .slice(0, 6)

  return {
    word: originalTerm,
    reading,
    partOfSpeech,
    definitions,
    source: 'jmdict',
  }
}

// ---- External API fallback -------------------------------------------------

async function translateViaApi(word: string, settings: UserSettings): Promise<LookupResult> {
  if (settings.apiProvider === 'none' || settings.apiKey === '') {
    return notFound(word)
  }

  try {
    if (settings.apiProvider === 'deepl') {
      return await callDeepL(word, settings.apiKey, settings.targetLanguage)
    }
    if (settings.apiProvider === 'google') {
      return await callGoogleTranslate(word, settings.apiKey, settings.targetLanguage)
    }
  } catch (err) {
    logger('Translation API error:', err)
  }

  return notFound(word)
}

async function callDeepL(
  word: string,
  apiKey: string,
  targetLang: string,
): Promise<LookupResult> {
  const body = new URLSearchParams({
    auth_key: apiKey,
    text: word,
    source_lang: 'JA',
    target_lang: targetLang.replace('-', '_').toUpperCase(),
  })

  const res = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) throw new Error(`DeepL HTTP ${res.status}`)

  const data = (await res.json()) as { translations: Array<{ text: string }> }
  const translation = data.translations[0]?.text ?? ''

  return {
    word,
    reading: word,
    partOfSpeech: '',
    definitions: translation ? [translation] : [],
    source: 'api',
  }
}

async function callGoogleTranslate(
  word: string,
  apiKey: string,
  targetLang: string,
): Promise<LookupResult> {
  const lang = targetLang.split('-')[0] ?? 'en'
  const params = new URLSearchParams({ key: apiKey, q: word, source: 'ja', target: lang })

  const res = await fetch(
    `https://translation.googleapis.com/language/translate/v2?${params.toString()}`,
  )

  if (!res.ok) throw new Error(`Google Translate HTTP ${res.status}`)

  const data = (await res.json()) as {
    data: { translations: Array<{ translatedText: string }> }
  }
  const translation = data.data.translations[0]?.translatedText ?? ''

  return {
    word,
    reading: word,
    partOfSpeech: '',
    definitions: translation ? [translation] : [],
    source: 'api',
  }
}

function notFound(word: string): LookupResult {
  return { word, reading: word, partOfSpeech: '', definitions: [], source: 'not-found' }
}

// ---- Public API ------------------------------------------------------------

export async function lookupWord(word: string, settings: UserSettings): Promise<LookupResult> {
  if (!word || word.trim().length === 0) return notFound(word)

  try {
    const entries = await loadJMdict()
    const entry = searchJMdict(entries, word)
    if (entry !== undefined) return entryToResult(entry, word)
  } catch (err) {
    logger('JMdict unavailable, trying API fallback:', err)
  }

  return translateViaApi(word, settings)
}

/** Exposed for testing — resets the in-memory cache */
export function _resetCache(): void {
  jmdictEntries = null
  loadPromise = null
}
