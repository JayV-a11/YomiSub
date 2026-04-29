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
import { watchYoutubeSubtitles } from './subtitle-dom-reader'
import { initTokenizer, segmentText } from './word-segmenter'
import { createOverlayController } from './subtitle-overlay'
import { createTooltipController } from './word-tooltip'
import { lookupWord } from './jmdict-lookup'
import type { Word } from '@/shared/types'

async function bootstrap(): Promise<void> {
  console.log('[YomiSub] bootstrap() starting on', location.href)
  const settings = await getSettings()
  console.log('[YomiSub] settings loaded:', JSON.stringify(settings))

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
  overlay.updateSettings(FONT_SIZE_MAP[settings.fontSize], settings.overlayPosition, settings.furiganaEnabled)

  // ---- Kuromoji pre-warm (non-blocking) -------------------------------------
  initTokenizer().catch((err) => logger('Tokenizer init failed:', err))

  // ---- Handlers -------------------------------------------------------------

  let stopCaptionWatch: (() => void) | null = null

  async function handleWordClick(word: Word, rect: DOMRect): Promise<void> {
    const result = await lookupWord(word.dictionaryForm, settings)
    tooltip.show(word, rect, result)
  }

  function onVideoFound(_video: HTMLVideoElement): void {
    console.log('[YomiSub] onVideoFound — starting DOM caption observer')

    // Stop any previous observer
    stopCaptionWatch?.()
    overlay.clearWords()

    stopCaptionWatch = watchYoutubeSubtitles(
      (text) => {
        let words: Word[]
        try {
          words = segmentText(text)
        } catch {
          // Tokenizer not yet ready — show as single clickable block
          words = [{
            surface: text,
            reading: text,
            dictionaryForm: text,
            partOfSpeech: '名詞',
            startIndex: 0,
            endIndex: text.length,
          }]
        }
        overlay.showWords(words)
      },
      () => overlay.clearWords(),
    )
  }

  function onVideoLost(): void {
    stopCaptionWatch?.()
    stopCaptionWatch = null
    overlay.clearWords()
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
    stopCaptionWatch?.()
    observer.stop()
    overlay.unmount()
    host.remove()
  })
}

bootstrap().catch((err: unknown) => {
  console.error('[YomiSub] Bootstrap failed:', err)
})
