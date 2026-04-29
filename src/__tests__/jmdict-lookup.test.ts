import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchJMdict, lookupWord, _resetCache } from '@/content/jmdict-lookup'
import type { JMdictEntry, UserSettings } from '@/shared/types'
import { DEFAULT_SETTINGS } from '@/shared/constants'

// ---- Helpers ---------------------------------------------------------------

function makeEntry(
  kanji: string[],
  kana: string[],
  defs: string[],
): JMdictEntry {
  return {
    id: `${kanji[0] ?? kana[0]}`,
    kanji: kanji.map((t) => ({ text: t, tags: [] })),
    kana: kana.map((t) => ({ text: t, tags: [], appliesToKanji: ['*'] })),
    sense: [
      {
        partOfSpeech: ['n'],
        gloss: defs.map((d) => ({ text: d, lang: 'eng', type: null })),
        misc: [],
        info: [],
      },
    ],
  }
}

const SAMPLE_DICT: JMdictEntry[] = [
  makeEntry(['学生'], ['がくせい'], ['student', 'scholar']),
  makeEntry(['先生'], ['せんせい'], ['teacher', 'instructor']),
  makeEntry([], ['はい'], ['yes', 'that is so']),
  makeEntry(['食べる'], ['たべる'], ['to eat']),
]

const SETTINGS_NO_API: UserSettings = {
  ...DEFAULT_SETTINGS,
  apiProvider: 'none',
  apiKey: '',
}

// ---- searchJMdict ----------------------------------------------------------

describe('searchJMdict', () => {
  it('finds entry by kanji form', () => {
    const entry = searchJMdict(SAMPLE_DICT, '学生')
    expect(entry).toBeDefined()
    expect(entry?.kana[0]?.text).toBe('がくせい')
  })

  it('finds entry by kana form', () => {
    const entry = searchJMdict(SAMPLE_DICT, 'がくせい')
    expect(entry).toBeDefined()
  })

  it('finds entry that has kana only (no kanji)', () => {
    const entry = searchJMdict(SAMPLE_DICT, 'はい')
    expect(entry).toBeDefined()
    expect(entry?.sense[0]?.gloss[0]?.text).toBe('yes')
  })

  it('returns undefined for a word not in the dictionary', () => {
    expect(searchJMdict(SAMPLE_DICT, '存在しない語')).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(searchJMdict(SAMPLE_DICT, '')).toBeUndefined()
  })

  it('is case-sensitive (kanji exact match)', () => {
    // Kanji search should not match partial strings
    expect(searchJMdict(SAMPLE_DICT, '学')).toBeUndefined()
  })
})

// ---- lookupWord — JMdict hit -----------------------------------------------

describe('lookupWord — JMdict hit', () => {
  beforeEach(() => {
    _resetCache()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '3', languages: ['eng'], commonOnly: false, dictDate: '', dictRevisions: [], tags: {}, words: SAMPLE_DICT }),
    } as Response))
  })

  it('returns jmdict result with reading and definitions', async () => {
    const result = await lookupWord('学生', SETTINGS_NO_API)
    expect(result.source).toBe('jmdict')
    expect(result.reading).toBe('がくせい')
    expect(result.definitions).toContain('student')
  })

  it('returns correct definitions for verb entry', async () => {
    const result = await lookupWord('食べる', SETTINGS_NO_API)
    expect(result.source).toBe('jmdict')
    expect(result.definitions).toContain('to eat')
  })

  it('caches JMdict after first fetch — only calls fetch once for two lookups', async () => {
    await lookupWord('学生', SETTINGS_NO_API)
    await lookupWord('先生', SETTINGS_NO_API)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

// ---- lookupWord — not found ------------------------------------------------

describe('lookupWord — not found, no API', () => {
  beforeEach(() => {
    _resetCache()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '3', languages: ['eng'], commonOnly: false, dictDate: '', dictRevisions: [], tags: {}, words: SAMPLE_DICT }),
    } as Response))
  })

  it('returns source=not-found when word is absent and no API configured', async () => {
    const result = await lookupWord('存在しない語', SETTINGS_NO_API)
    expect(result.source).toBe('not-found')
    expect(result.definitions).toHaveLength(0)
  })

  it('returns not-found for empty word without fetching', async () => {
    _resetCache()
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    const result = await lookupWord('', SETTINGS_NO_API)
    expect(result.source).toBe('not-found')
    // Empty word short-circuits before loading JMdict
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

// ---- lookupWord — API fallback (DeepL) ------------------------------------

describe('lookupWord — DeepL fallback', () => {
  beforeEach(() => {
    _resetCache()
  })

  it('calls DeepL and returns api source when JMdict has no match', async () => {
    // fetch is called first for JMdict load, then for DeepL translation
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            version: '3',
            languages: ['eng'],
            commonOnly: false,
            dictDate: '',
            dictRevisions: [],
            tags: {},
            words: [],
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ translations: [{ text: 'translated text' }] }),
        } as Response),
    )

    const settings: UserSettings = { ...DEFAULT_SETTINGS, apiProvider: 'deepl', apiKey: 'test-key' }
    const result = await lookupWord('存在しない語', settings)

    expect(result.source).toBe('api')
    expect(result.definitions[0]).toBe('translated text')
  })
})

// ---- lookupWord — JMdict fetch failure -------------------------------------

describe('lookupWord — JMdict fetch failure', () => {
  beforeEach(() => _resetCache())

  it('falls back gracefully when JMdict fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const result = await lookupWord('学生', SETTINGS_NO_API)
    // With no API configured, should return not-found (not throw)
    expect(result.source).toBe('not-found')
  })
})
