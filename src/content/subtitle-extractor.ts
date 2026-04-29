/**
 * subtitle-extractor.ts
 *
 * Responsibilities:
 *   - Read ytInitialPlayerResponse to discover Japanese caption tracks
 *   - Fetch the subtitle XML and parse it into SubtitleCue[]
 *
 * Rules:
 *   - NEVER manipulates the DOM for display purposes — returns data only
 *   - NEVER returns invented/placeholder cues — returns [] on failure
 */
import type { SubtitleCue } from '@/shared/types'
import { logger } from '@/shared/utils'

// ---- Internal types --------------------------------------------------------

export interface CaptionTrack {
  baseUrl: string
  name: { simpleText: string }
  vssId: string
  languageCode: string
  kind?: string // "asr" = auto-generated; absent = manual
  isTranslatable: boolean
}

interface PlayerCaptionsTracklistRenderer {
  captionTracks?: CaptionTrack[]
}

interface YtCaptions {
  playerCaptionsTracklistRenderer?: PlayerCaptionsTracklistRenderer
}

interface YtPlayerResponse {
  captions?: YtCaptions
}

// ---- Player response discovery ---------------------------------------------

/**
 * Tries to read ytInitialPlayerResponse from the window object first,
 * then falls back to parsing script tags.
 *
 * YouTube injects ytInitialPlayerResponse as a JS assignment inside a <script>
 * tag. The regex is intentionally conservative to avoid false positives.
 */
export function getPlayerResponse(): YtPlayerResponse | null {
  // Strategy 1 — live window object (most reliable, available after page load)
  const win = window as Window & { ytInitialPlayerResponse?: YtPlayerResponse }
  if (win.ytInitialPlayerResponse?.captions) {
    return win.ytInitialPlayerResponse
  }

  // Strategy 2 — parse from inline script tags (fallback for cached pages)
  const scripts = Array.from(document.querySelectorAll('script'))
  for (const script of scripts) {
    const text = script.textContent ?? ''
    if (!text.includes('ytInitialPlayerResponse')) continue

    // Match the JSON object assigned to ytInitialPlayerResponse.
    // The regex stops at the first top-level "};" to avoid runaway matches.
    const match = text.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\});\s*(?:var|let|const|window|if)/)
    if (match?.[1]) {
      try {
        const parsed = JSON.parse(match[1]) as YtPlayerResponse
        if (parsed.captions) return parsed
      } catch {
        // Not valid JSON at this cut-off point — try next script
      }
    }
  }

  return null
}

// ---- Track filtering -------------------------------------------------------

/**
 * Returns all caption tracks whose language is Japanese.
 * Handles both manual ("ja") and ASR auto-generated ("a.ja") tracks.
 */
export function extractJapaneseTracks(): CaptionTrack[] {
  const playerResponse = getPlayerResponse()
  if (!playerResponse) {
    logger('ytInitialPlayerResponse not found or has no captions')
    return []
  }

  const tracks =
    playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []

  return tracks.filter(
    (track) =>
      track.languageCode === 'ja' ||
      track.vssId?.startsWith('.ja') ||
      track.vssId?.startsWith('a.ja'),
  )
}

export function hasJapaneseSubtitles(): boolean {
  return extractJapaneseTracks().length > 0
}

// ---- XML parsing -----------------------------------------------------------

/**
 * Parses YouTube's timedtext XML format:
 * <text start="1.23" dur="2.00">テキスト</text>
 *
 * YouTube sometimes nests HTML entities inside the XML text nodes.
 */
export function parseXmlCues(xml: string): SubtitleCue[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    logger('XML parse error in subtitle response')
    return []
  }

  const nodes = doc.querySelectorAll('text')
  const cues: SubtitleCue[] = []

  for (const node of nodes) {
    const start = parseFloat(node.getAttribute('start') ?? '0')
    const dur = parseFloat(node.getAttribute('dur') ?? '0')

    if (!isFinite(start) || !isFinite(dur)) continue

    const rawText = node.textContent ?? ''
    const text = decodeHtmlEntities(rawText.trim())
    if (text.length === 0) continue

    cues.push({ start, end: start + dur, text })
  }

  return cues
}

/**
 * Decodes HTML entities that YouTube embeds inside XML text nodes
 * (e.g. &amp;#39; → ').
 * Uses a textarea to leverage the browser's own HTML parser — no regex hacks.
 */
function decodeHtmlEntities(text: string): string {
  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  return textarea.value
}

// ---- Fetch -----------------------------------------------------------------

// ---- JSON3 parsing -------------------------------------------------------

interface Json3Event {
  tStartMs?: number
  dDurationMs?: number
  segs?: Array<{ utf8?: string }>
}

interface Json3Response {
  events?: Json3Event[]
}

export function parseJson3Cues(json: Json3Response): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  for (const ev of json.events ?? []) {
    if (ev.tStartMs === undefined) continue
    const start = ev.tStartMs / 1000
    const dur = (ev.dDurationMs ?? 0) / 1000
    const text = (ev.segs ?? []).map((s) => s.utf8 ?? '').join('').trim()
    if (text.length === 0 || text === '\n') continue
    cues.push({ start, end: start + dur, text, words: [] })
  }
  return cues
}

// ---- Fetch -----------------------------------------------------------------

export async function fetchSubtitleCues(track: CaptionTrack): Promise<SubtitleCue[]> {
  logger('baseUrl:', track.baseUrl.slice(0, 150))

  // Try the URL as-is first (YouTube already includes fmt in baseUrl sometimes)
  const tryFetch = async (url: string): Promise<string> => {
    const r = await fetch(url)
    logger(`fetch ${url.slice(0, 80)} → HTTP ${r.status}, content-type: ${r.headers.get('content-type')}`)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const text = await r.text()
    logger(`response length: ${text.length}, first 300:`, text.slice(0, 300))
    return text
  }

  // Build URL variants to try in order
  const base = new URL(track.baseUrl)
  const urlJson3 = new URL(track.baseUrl)
  urlJson3.searchParams.set('fmt', 'json3')
  const urlXml = new URL(track.baseUrl)
  urlXml.searchParams.set('fmt', 'xml')

  const attempts = [
    urlJson3.toString(),
    base.toString(),
    urlXml.toString(),
  ]

  for (const url of attempts) {
    try {
      const text = await tryFetch(url)
      if (text.length === 0) continue

      // Try JSON3
      try {
        const json = JSON.parse(text) as Json3Response
        if (json.events) {
          const cues = parseJson3Cues(json)
          logger(`Parsed ${cues.length} cues from JSON3`)
          return cues
        }
      } catch { /* not json */ }

      // Try XML
      const cues = parseXmlCues(text)
      if (cues.length > 0) {
        logger(`Parsed ${cues.length} cues from XML`)
        return cues
      }
    } catch (e) {
      logger('fetch attempt failed:', e)
    }
  }

  logger('All fetch attempts failed or returned 0 cues')
  return []
}

// ---- Public API ------------------------------------------------------------

/**
 * Main entry point.
 * Returns [] (never throws) if no Japanese tracks are found.
 * Prefers manual subtitles over auto-generated (ASR) ones.
 */
export async function extractSubtitles(): Promise<SubtitleCue[]> {
  const tracks = extractJapaneseTracks()
  if (tracks.length === 0) return []

  // Prefer manual (no `kind`) over ASR (`kind: "asr"`)
  const preferred = tracks.find((t) => !t.kind) ?? tracks[0]
  if (!preferred) return []

  return fetchSubtitleCues(preferred)
}
