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
import { lookupWord, findRelatedWords } from './jmdict-lookup'
import { getKanjiBreakdown } from './kanji-info'
import { getPitchAccent } from './pitch-accent'
import type {
  Word,
  LookupResult,
  Message,
  CardContext,
  KanjiInfo,
  RelatedWord,
  PitchAccentInfo,
} from '@/shared/types'

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

  // ---- Capture state --------------------------------------------------------
  // Latest subtitle line and video element are tracked here so we can build a
  // CardContext at the exact moment the user clicks "Add to deck".
  let currentSentence = ''
  let currentVideo: HTMLVideoElement | null = null

  function buildCurrentContext(word: Word): CardContext | null {
    if (currentSentence.length === 0) return null
    const t = currentVideo?.currentTime ?? 0
    return {
      sentence: currentSentence,
      wordSurface: word.surface,
      videoUrl: buildVideoUrlWithTimestamp(t),
      videoTitle: document.title,
      timestampSeconds: t,
      capturedAt: Date.now(),
    }
  }

  // ---- Controllers ----------------------------------------------------------
  const overlay = createOverlayController(
    debounce((word: Word, rect: DOMRect) => void handleWordClick(word, rect), TOOLTIP_DEBOUNCE_MS),
  )
  // Context for the next save is captured eagerly when the tooltip opens
  // (handleWordClick) so it survives the click → tooltip mount → button click
  // round-trip even if the subtitle changes meanwhile.
  let pendingContext: CardContext | null = null
  let pendingKanjiBreakdown: KanjiInfo[] = []
  let pendingRelatedWords: RelatedWord[] = []
  let pendingPitchAccent: PitchAccentInfo | null = null
  const tooltip = createTooltipController({
    getContext: () => pendingContext,
    onSave: (word: Word, result: LookupResult, context: CardContext | null) =>
      new Promise((resolve, reject) => {
        const msg: Message = {
          type: 'ADD_FLASHCARD',
          payload: {
            word,
            result,
            context,
            kanjiBreakdown: pendingKanjiBreakdown,
            relatedWords: pendingRelatedWords,
            pitchAccent: pendingPitchAccent,
          },
        }
        chrome.runtime.sendMessage(msg, (response: Message) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          if (response.type === 'ADD_FLASHCARD_RESULT' && response.success) {
            resolve({ isNew: response.isNew })
          } else if (response.type === 'ADD_FLASHCARD_RESULT') {
            reject(new Error(response.error ?? 'Failed to save flashcard'))
          }
        })
      }),
  })

  overlay.mount(shadow)
  tooltip.mount(shadow)
  overlay.updateSettings(FONT_SIZE_MAP[settings.fontSize], settings.overlayPosition, settings.furiganaEnabled)

  // ---- Kuromoji pre-warm (non-blocking) -------------------------------------
  initTokenizer().catch((err) => logger('Tokenizer init failed:', err))

  // ---- Handlers -------------------------------------------------------------

  let stopCaptionWatch: (() => void) | null = null

  async function handleWordClick(word: Word, rect: DOMRect): Promise<void> {
    // Snapshot context at click time — subtitle may change while the
    // dictionary lookup is still pending.
    pendingContext = buildCurrentContext(word)
    // Run dictionary + kanji + related + pitch lookups in parallel — independent.
    const [result, kanjiBreakdown, relatedWords] = await Promise.all([
      lookupWord(word.dictionaryForm, settings),
      getKanjiBreakdown(word.dictionaryForm).catch(() => [] as KanjiInfo[]),
      findRelatedWords(word.dictionaryForm).catch(() => [] as RelatedWord[]),
    ])
    // Pitch accent depends on the reading from the lookup, so it runs after.
    const pitchAccent = await getPitchAccent(
      word.dictionaryForm,
      result.reading || word.reading,
    ).catch(() => null)

    pendingKanjiBreakdown = kanjiBreakdown
    pendingRelatedWords = relatedWords
    pendingPitchAccent = pitchAccent
    tooltip.show(word, rect, result)
  }

  function onVideoFound(video: HTMLVideoElement): void {
    console.log('[YomiSub] onVideoFound — starting DOM caption observer')
    currentVideo = video

    // Stop any previous observer
    stopCaptionWatch?.()
    overlay.clearWords()

    stopCaptionWatch = watchYoutubeSubtitles(
      (text) => {
        currentSentence = text
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
      () => {
        currentSentence = ''
        overlay.clearWords()
      },
    )
  }

  function onVideoLost(): void {
    stopCaptionWatch?.()
    stopCaptionWatch = null
    currentVideo = null
    currentSentence = ''
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

/**
 * Builds a deep-link URL that opens the current page at a specific timestamp.
 * Works for YouTube (?t=N) and degrades gracefully on other sites — the param
 * is harmless even if the host doesn't honour it.
 */
function buildVideoUrlWithTimestamp(seconds: number): string {
  try {
    const url = new URL(location.href)
    const t = Math.max(0, Math.floor(seconds))
    url.searchParams.set('t', `${t}`)
    return url.toString()
  } catch {
    return location.href
  }
}

bootstrap().catch((err: unknown) => {
  console.error('[YomiSub] Bootstrap failed:', err)
})
