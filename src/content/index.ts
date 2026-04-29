/**
 * content/index.ts — Entry point for the content script
 *
 * Wires together all modules:
 *   player-observer → subtitle-extractor → word-segmenter
 *                   → subtitle-overlay → word-tooltip → jmdict-lookup
 *
 * All display elements live inside a closed Shadow DOM to prevent
 * CSS conflicts with YouTube.
 */
import { getSettings } from '@/shared/storage'
import { OVERLAY_ROOT_ID, FONT_SIZE_MAP, TOOLTIP_DEBOUNCE_MS } from '@/shared/constants'
import { logger, debounce } from '@/shared/utils'
import { createPlayerObserver } from './player-observer'
import { extractSubtitles, hasJapaneseSubtitles } from './subtitle-extractor'
import { initTokenizer, segmentText } from './word-segmenter'
import { createOverlayController } from './subtitle-overlay'
import { createTooltipController } from './word-tooltip'
import { lookupWord } from './jmdict-lookup'
import type { Word } from '@/shared/types'

async function bootstrap(): Promise<void> {
  const settings = await getSettings()

  if (!settings.enabled) {
    logger('Extension disabled via settings')
    return
  }

  // ---- Shadow DOM host -------------------------------------------------------
  const host = document.createElement('div')
  host.id = OVERLAY_ROOT_ID
  // Cover the full viewport so the absolute-positioned overlay appears over the video
  host.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483640;'
  // Shadow DOM isolates YomiSub styles from YouTube — prevents conflicts
  const shadow = host.attachShadow({ mode: 'closed' })
  document.body.appendChild(host)

  // ---- Controllers ----------------------------------------------------------
  const overlay = createOverlayController(
    debounce((word: Word, rect: DOMRect) => void handleWordClick(word, rect), TOOLTIP_DEBOUNCE_MS),
  )
  const tooltip = createTooltipController()

  overlay.mount(shadow)
  tooltip.mount(shadow)
  overlay.updateSettings(FONT_SIZE_MAP[settings.fontSize], settings.overlayPosition)

  // ---- Kuromoji pre-warm (non-blocking) -------------------------------------
  initTokenizer().catch((err) => logger('Tokenizer init failed:', err))

  // ---- Handlers -------------------------------------------------------------

  async function handleWordClick(word: Word, rect: DOMRect): Promise<void> {
    const result = await lookupWord(word.dictionaryForm, settings)
    tooltip.show(word, rect, result)
  }

  async function onVideoFound(video: HTMLVideoElement): Promise<void> {
    // YouTube SPA: ytInitialPlayerResponse may not be ready immediately after navigation.
    // Retry up to 10 times with 300 ms intervals (3 s total) before giving up.
    let found = hasJapaneseSubtitles()
    if (!found) {
      for (let i = 0; i < 10 && !found; i++) {
        await new Promise<void>((r) => setTimeout(r, 300))
        found = hasJapaneseSubtitles()
      }
    }
    if (!found) {
      logger('No Japanese subtitle track found for this video')
      return
    }

    let cues = await extractSubtitles()
    if (cues.length === 0) {
      logger('Subtitle extraction returned no cues')
      return
    }

    // Segment text — may fail if tokenizer not yet ready; unsegmented fallback is fine
    try {
      await initTokenizer()
      cues = cues.map((cue) => ({ ...cue, words: segmentText(cue.text) }))
    } catch (err) {
      logger('Segmentation skipped (tokenizer not ready):', err)
    }

    overlay.sync(video, cues)
    logger(`Playing with ${cues.length} subtitle cues`)
  }

  function onVideoLost(): void {
    overlay.stopSync()
    tooltip.hide()
  }

  // ---- Player observation ---------------------------------------------------
  const observer = createPlayerObserver(
    (video) => void onVideoFound(video),
    onVideoLost,
  )
  observer.start()

  // ---- Cleanup on navigation away ------------------------------------------
  window.addEventListener('beforeunload', () => {
    observer.stop()
    overlay.unmount()
    host.remove()
  })
}

bootstrap().catch((err: unknown) => {
  console.error('[YomiSub] Bootstrap failed:', err)
})
