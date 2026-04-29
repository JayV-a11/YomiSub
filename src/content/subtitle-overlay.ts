/**
 * subtitle-overlay.ts
 *
 * Responsibilities:
 *   - Render subtitle cues inside a Shadow DOM container
 *   - Sync with video.currentTime via requestAnimationFrame
 *   - Make each word a clickable <span> that fires onWordClick
 *
 * Rules:
 *   - NEVER knows about translation/dictionary logic
 *   - NEVER reads from external APIs
 */
import type { SubtitleCue, Word } from '@/shared/types'
import { logger } from '@/shared/utils'

export interface OverlayController {
  mount: (shadow: ShadowRoot) => void
  unmount: () => void
  sync: (video: HTMLVideoElement, cues: SubtitleCue[]) => void
  stopSync: () => void
  showWords: (words: Word[]) => void
  clearWords: () => void
  updateSettings: (fontSize: string, position: 'over' | 'below', furiganaEnabled?: boolean) => void
}

export function createOverlayController(
  onWordClick: (word: Word, rect: DOMRect) => void,
): OverlayController {
  let container: HTMLDivElement | null = null
  let rafId: number | null = null
  let lastRenderedText: string | null = null
  let furigana = false

  // ---- Mounting -------------------------------------------------------------

  function mount(shadow: ShadowRoot): void {
    const style = document.createElement('style')
    style.textContent = overlayStyles()
    shadow.appendChild(style)

    container = document.createElement('div')
    container.id = 'yomisub-overlay'
    container.setAttribute('role', 'region')
    container.setAttribute('aria-label', 'Japanese subtitles')
    shadow.appendChild(container)
  }

  function unmount(): void {
    stopSync()
    container?.remove()
    container = null
    lastRenderedText = null
  }

  // ---- Rendering ------------------------------------------------------------

  function renderCue(cue: SubtitleCue | null): void {
    if (container === null) return

    const text = cue?.text ?? null

    // Bail early — avoid unnecessary DOM writes on every animation frame
    if (text === lastRenderedText) return
    lastRenderedText = text

    container.innerHTML = ''

    if (cue === null) return

    if (!cue.words || cue.words.length === 0) {
      // Segmentation not yet available — display plain text
      container.textContent = cue.text
      return
    }

    const fragment = document.createDocumentFragment()

    for (const word of cue.words) {
      const span = createWordSpan(word)
      fragment.appendChild(span)
    }

    container.appendChild(fragment)
  }

  function createWordSpan(word: Word): HTMLSpanElement {
    const span = document.createElement('span')
    span.className = 'ys-word'
    span.setAttribute('role', 'button')
    span.setAttribute('tabindex', '0')
    span.setAttribute('aria-label', `${word.surface} — ${word.reading}`)

    if (furigana && word.reading && word.reading !== word.surface) {
      const ruby = document.createElement('ruby')
      ruby.appendChild(document.createTextNode(word.surface))
      const rt = document.createElement('rt')
      rt.textContent = word.reading
      ruby.appendChild(rt)
      span.appendChild(ruby)
    } else {
      span.textContent = word.surface
    }

    span.addEventListener('click', (e) => {
      e.stopPropagation()
      onWordClick(word, span.getBoundingClientRect())
    })

    span.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onWordClick(word, span.getBoundingClientRect())
      }
    })

    return span
  }

  // ---- Sync loop ------------------------------------------------------------

  function sync(video: HTMLVideoElement, cues: SubtitleCue[]): void {
    stopSync()
    logger(`Subtitle sync started — ${cues.length} cues`)

    function frame(): void {
      // Pause updates when tab is not visible — saves CPU
      if (document.visibilityState !== 'hidden') {
        const t = video.currentTime
        const active = cues.find((c) => t >= c.start && t < c.end) ?? null
        renderCue(active)
      }
      rafId = requestAnimationFrame(frame)
    }

    rafId = requestAnimationFrame(frame)
  }

  function stopSync(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    lastRenderedText = null
  }

  // ---- Direct word rendering (DOM-observer path) ---------------------------

  function showWords(words: Word[]): void {
    if (container === null) return
    container.innerHTML = ''
    lastRenderedText = null
    if (words.length === 0) return
    const fragment = document.createDocumentFragment()
    for (const word of words) fragment.appendChild(createWordSpan(word))
    container.appendChild(fragment)
  }

  function clearWords(): void {
    if (container === null) return
    container.innerHTML = ''
    lastRenderedText = null
  }

  // ---- Settings -------------------------------------------------------------

  function updateSettings(fontSize: string, position: 'over' | 'below', furiganaEnabled = false): void {
    furigana = furiganaEnabled
    if (container === null) return
    container.style.setProperty('--ys-font-size', fontSize)
    container.dataset['position'] = position
    container.dataset['furigana'] = furiganaEnabled ? 'true' : 'false'
  }

  return { mount, unmount, sync, stopSync, showWords, clearWords, updateSettings }
}

// ---- Styles ----------------------------------------------------------------

function overlayStyles(): string {
  return `
    #yomisub-overlay {
      position: absolute;
      bottom: 10%;
      left: 50%;
      transform: translateX(-50%);
      max-width: 90%;
      text-align: center;
      pointer-events: none;
      z-index: 2147483640;
      font-size: var(--ys-font-size, 18px);
      line-height: 1.4;
      user-select: none;
    }

    #yomisub-overlay[data-position="below"] {
      position: relative;
      bottom: auto;
      left: auto;
      transform: none;
      margin-top: 0.5em;
    }

    ruby { display: inline ruby; }
    rt {
      font-size: 0.55em;
      color: #ffd;
      font-family: 'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif;
    }

    .ys-word {
      display: inline-block;
      color: #fff;
      background: rgba(0, 0, 0, 0.72);
      border-radius: 2px;
      padding: 1px 2px;
      margin: 0 1px;
      cursor: pointer;
      pointer-events: auto;
      transition: background 0.12s;
      font-family: 'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif;
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
    }

    .ys-word:hover,
    .ys-word:focus-visible {
      background: rgba(0, 120, 215, 0.85);
      outline: 2px solid rgba(0, 120, 215, 0.5);
      outline-offset: 1px;
    }
  `
}
