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

export async function fetchSubtitleCues(track: CaptionTrack): Promise<SubtitleCue[]> {
  // Always request XML format — fmt=json3 has a different schema
  const url = new URL(track.baseUrl)
  url.searchParams.set('fmt', 'xml')

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(`Subtitle fetch failed — HTTP ${response.status}`)
  }

  const xml = await response.text()
  return parseXmlCues(xml)
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
