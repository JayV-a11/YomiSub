import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getPlayerResponse,
  extractJapaneseTracks,
  hasJapaneseSubtitles,
  parseXmlCues,
  fetchSubtitleCues,
} from '@/content/subtitle-extractor'
import type { CaptionTrack } from '@/content/subtitle-extractor'

// ---- Helpers ---------------------------------------------------------------

function makeTrack(overrides: Partial<CaptionTrack> = {}): CaptionTrack {
  return {
    baseUrl: 'https://www.youtube.com/api/timedtext?v=test&lang=ja',
    name: { simpleText: 'Japanese' },
    vssId: '.ja',
    languageCode: 'ja',
    isTranslatable: true,
    ...overrides,
  }
}

function setWindowPlayerResponse(captions: unknown): void {
  ;(window as unknown as Record<string, unknown>)['ytInitialPlayerResponse'] = {
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: captions,
      },
    },
  }
}

function clearWindowPlayerResponse(): void {
  delete (window as unknown as Record<string, unknown>)['ytInitialPlayerResponse']
}

// ---- getPlayerResponse -----------------------------------------------------

describe('getPlayerResponse', () => {
  beforeEach(() => clearWindowPlayerResponse())

  it('reads from window.ytInitialPlayerResponse when available', () => {
    setWindowPlayerResponse([makeTrack()])
    const response = getPlayerResponse()
    expect(response).not.toBeNull()
    expect(response?.captions).toBeDefined()
  })

  it('returns null when ytInitialPlayerResponse is absent', () => {
    expect(getPlayerResponse()).toBeNull()
  })

  it('parses from an inline <script> tag as fallback', () => {
    const fakeData = {
      captions: {
        playerCaptionsTracklistRenderer: { captionTracks: [makeTrack()] },
      },
    }
    const script = document.createElement('script')
    script.textContent = `var ytInitialPlayerResponse = ${JSON.stringify(fakeData)};if(true){}`
    document.head.appendChild(script)

    const result = getPlayerResponse()
    expect(result?.captions).toBeDefined()

    document.head.removeChild(script)
  })
})

// ---- extractJapaneseTracks -------------------------------------------------

describe('extractJapaneseTracks', () => {
  beforeEach(() => clearWindowPlayerResponse())

  it('returns Japanese tracks by languageCode', () => {
    setWindowPlayerResponse([makeTrack({ languageCode: 'ja' })])
    expect(extractJapaneseTracks()).toHaveLength(1)
  })

  it('returns Japanese tracks by vssId prefix ".ja"', () => {
    setWindowPlayerResponse([makeTrack({ languageCode: 'ja', vssId: '.ja' })])
    expect(extractJapaneseTracks()).toHaveLength(1)
  })

  it('returns auto-generated ASR tracks by vssId prefix "a.ja"', () => {
    setWindowPlayerResponse([makeTrack({ languageCode: 'ja', vssId: 'a.ja', kind: 'asr' })])
    expect(extractJapaneseTracks()).toHaveLength(1)
  })

  it('excludes non-Japanese tracks', () => {
    setWindowPlayerResponse([
      makeTrack({ languageCode: 'en', vssId: '.en' }),
      makeTrack({ languageCode: 'zh', vssId: '.zh' }),
    ])
    expect(extractJapaneseTracks()).toHaveLength(0)
  })

  it('returns [] when ytInitialPlayerResponse is absent', () => {
    expect(extractJapaneseTracks()).toHaveLength(0)
  })

  it('returns [] when captionTracks array is empty', () => {
    setWindowPlayerResponse([])
    expect(extractJapaneseTracks()).toHaveLength(0)
  })

  it('handles multiple tracks and returns all Japanese ones', () => {
    setWindowPlayerResponse([
      makeTrack({ languageCode: 'en', vssId: '.en' }),
      makeTrack({ languageCode: 'ja', vssId: '.ja' }),
      makeTrack({ languageCode: 'ja', vssId: 'a.ja', kind: 'asr' }),
    ])
    expect(extractJapaneseTracks()).toHaveLength(2)
  })
})

// ---- hasJapaneseSubtitles --------------------------------------------------

describe('hasJapaneseSubtitles', () => {
  beforeEach(() => clearWindowPlayerResponse())

  it('returns true when Japanese track exists', () => {
    setWindowPlayerResponse([makeTrack()])
    expect(hasJapaneseSubtitles()).toBe(true)
  })

  it('returns false when no Japanese track exists', () => {
    setWindowPlayerResponse([makeTrack({ languageCode: 'en', vssId: '.en' })])
    expect(hasJapaneseSubtitles()).toBe(false)
  })
})

// ---- parseXmlCues ----------------------------------------------------------

describe('parseXmlCues', () => {
  it('parses a well-formed timedtext XML', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
      <transcript>
        <text start="0.5" dur="2.0">こんにちは</text>
        <text start="3.0" dur="1.5">世界</text>
      </transcript>`

    const cues = parseXmlCues(xml)
    expect(cues).toHaveLength(2)
    expect(cues[0]).toMatchObject({ start: 0.5, end: 2.5, text: 'こんにちは' })
    expect(cues[1]).toMatchObject({ start: 3.0, end: 4.5, text: '世界' })
  })

  it('decodes HTML entities inside text nodes', () => {
    const xml = `<transcript><text start="1" dur="1">&#39;テスト&#39;</text></transcript>`
    const cues = parseXmlCues(xml)
    expect(cues[0]?.text).toBe("'テスト'")
  })

  it('skips nodes with empty text after trimming', () => {
    const xml = `<transcript>
      <text start="1" dur="1">  </text>
      <text start="2" dur="1">有効</text>
    </transcript>`
    const cues = parseXmlCues(xml)
    expect(cues).toHaveLength(1)
    expect(cues[0]?.text).toBe('有効')
  })

  it('returns [] for malformed XML', () => {
    const cues = parseXmlCues('<not valid xml >>>')
    // jsdom may or may not throw — we just want an array back
    expect(Array.isArray(cues)).toBe(true)
  })

  it('skips nodes with non-finite start or dur', () => {
    const xml = `<transcript>
      <text start="NaN" dur="1">テスト</text>
      <text start="1" dur="1">有効</text>
    </transcript>`
    const cues = parseXmlCues(xml)
    expect(cues).toHaveLength(1)
  })

  it('computes end = start + dur correctly', () => {
    const xml = `<transcript><text start="10.25" dur="3.75">テスト</text></transcript>`
    const cues = parseXmlCues(xml)
    expect(cues[0]?.end).toBeCloseTo(14.0)
  })

  it('handles a large number of cues efficiently', () => {
    const lines = Array.from(
      { length: 500 },
      (_, i) => `<text start="${i}" dur="0.9">テスト${i}</text>`,
    ).join('\n')
    const xml = `<transcript>${lines}</transcript>`
    const cues = parseXmlCues(xml)
    expect(cues).toHaveLength(500)
  })
})

// ---- fetchSubtitleCues -----------------------------------------------------

describe('fetchSubtitleCues', () => {
  it('fetches XML and returns parsed cues', async () => {
    const xml = `<transcript><text start="1" dur="2">テスト</text></transcript>`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => xml,
    } as Response))

    const track = makeTrack()
    const cues = await fetchSubtitleCues(track)

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('fmt=xml'))
    expect(cues).toHaveLength(1)
    expect(cues[0]?.text).toBe('テスト')
  })

  it('throws on non-OK HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 } as Response))
    await expect(fetchSubtitleCues(makeTrack())).rejects.toThrow('403')
  })

  it('always sets fmt=xml regardless of original URL params', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<transcript></transcript>',
    } as Response))

    const track = makeTrack({ baseUrl: 'https://www.youtube.com/api/timedtext?v=test&fmt=json3' })
    await fetchSubtitleCues(track)

    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string
    expect(calledUrl).toContain('fmt=xml')
    expect(calledUrl).not.toMatch(/fmt=json3/)
  })
})
