/**
 * pitch-accent.ts
 *
 * Looks up Japanese pitch-accent patterns from a compact kanjium-derived
 * dictionary. The dictionary is keyed by reading (hiragana) — multiple
 * homophones can share a reading, so we also filter by surface form when
 * possible.
 *
 * Pitch notation (NHK):
 *   0  = heiban (平板) — no drop
 *   1  = atamadaka (頭高) — drop after mora 1
 *   N  = nakadaka / odaka — drop after mora N
 */
import { logger } from '@/shared/utils'
import type { PitchAccentInfo } from '@/shared/types'

interface CompactEntry {
  w: string   // surface
  p: number[] // pitch positions; multiple = multiple acceptable patterns
}

let pitchMap: Map<string, CompactEntry[]> | null = null
let loadPromise: Promise<Map<string, CompactEntry[]>> | null = null

async function loadDict(): Promise<Map<string, CompactEntry[]>> {
  if (pitchMap !== null) return pitchMap
  if (loadPromise !== null) return loadPromise

  loadPromise = fetch(chrome.runtime.getURL('assets/pitch-accent/pitch-accent.json'))
    .then((res) => {
      if (!res.ok) throw new Error(`Pitch accent fetch HTTP ${res.status}`)
      return res.json() as Promise<Record<string, CompactEntry[]>>
    })
    .then((data) => {
      const map = new Map<string, CompactEntry[]>()
      for (const [reading, entries] of Object.entries(data)) map.set(reading, entries)
      pitchMap = map
      logger(`Pitch accent loaded — ${map.size} readings`)
      return map
    })
    .catch((err: unknown) => {
      loadPromise = null
      throw err
    })

  return loadPromise
}

/**
 * Counts moras in a hiragana string. Small-kana (ゃゅょっ) attach to the
 * preceding mora and don't count separately. ー extends the preceding mora.
 */
export function countMoras(reading: string): number {
  let count = 0
  for (const c of reading) {
    if ('ゃゅょぁぃぅぇぉャュョァィゥェォ'.includes(c)) continue
    count++
  }
  return count
}

/**
 * Looks up the pitch accent for a word + reading.
 * Returns null if the dictionary is unavailable or no entry matches.
 */
export async function getPitchAccent(
  word: string,
  reading: string,
): Promise<PitchAccentInfo | null> {
  let map: Map<string, CompactEntry[]>
  try {
    map = await loadDict()
  } catch {
    return null
  }

  const entries = map.get(reading)
  if (!entries || entries.length === 0) return null

  // Prefer exact surface match; fall back to first entry with matching reading.
  const exact = entries.find((e) => e.w === word)
  const chosen = exact ?? entries[0]
  if (!chosen) return null

  return {
    reading,
    moraCount: countMoras(reading),
    patterns: chosen.p,
  }
}

/** Exposed for testing — resets the in-memory cache */
export function _resetPitchCache(): void {
  pitchMap = null
  loadPromise = null
}
