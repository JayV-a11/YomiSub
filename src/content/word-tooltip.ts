/**
 * word-tooltip.ts
 *
 * Responsibilities:
 *   - Render the translation tooltip inside the Shadow DOM
 *   - Position it intelligently relative to the clicked word
 *   - Close when clicking outside or when hide() is called
 *
 * Rules:
 *   - NEVER blocks YouTube's player controls
 *   - NEVER knows about subtitle sync or segmentation
 */
import type { LookupResult, Word } from '@/shared/types'
import { clamp, escapeHtml } from '@/shared/utils'

export interface TooltipController {
  mount: (shadow: ShadowRoot) => void
  show: (word: Word, anchorRect: DOMRect, result: LookupResult) => void
  hide: () => void
  isVisible: () => boolean
}

export function createTooltipController(): TooltipController {
  let tooltip: HTMLDivElement | null = null
  let visible = false
  let outsideClickHandler: ((e: MouseEvent) => void) | null = null

  // ---- Mounting -------------------------------------------------------------

  function mount(shadow: ShadowRoot): void {
    const style = document.createElement('style')
    style.textContent = tooltipStyles()
    shadow.appendChild(style)

    tooltip = document.createElement('div')
    tooltip.id = 'ys-tooltip'
    tooltip.setAttribute('role', 'tooltip')
    tooltip.setAttribute('aria-hidden', 'true')
    shadow.appendChild(tooltip)

    // Close on click outside (uses composedPath to pierce Shadow DOM boundary)
    outsideClickHandler = (e: MouseEvent): void => {
      if (!visible || tooltip === null) return
      if (!e.composedPath().includes(tooltip)) {
        hide()
      }
    }
    document.addEventListener('click', outsideClickHandler, { capture: true })
  }

  // ---- Show/hide ------------------------------------------------------------

  function show(word: Word, anchorRect: DOMRect, result: LookupResult): void {
    if (tooltip === null) return

    tooltip.innerHTML = buildContent(word, result)
    tooltip.setAttribute('aria-hidden', 'false')
    visible = true

    // Position after paint — we need the rendered dimensions
    requestAnimationFrame(() => {
      if (tooltip !== null) positionTooltip(tooltip, anchorRect)
    })
  }

  function hide(): void {
    if (tooltip === null) return
    tooltip.setAttribute('aria-hidden', 'true')
    tooltip.innerHTML = ''
    visible = false
  }

  function isVisible(): boolean {
    return visible
  }

  return { mount, show, hide, isVisible }
}

// ---- Positioning -----------------------------------------------------------

function positionTooltip(tooltip: HTMLDivElement, anchor: DOMRect): void {
  const margin = 8
  const tw = tooltip.offsetWidth
  const th = tooltip.offsetHeight
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Prefer above the word; fall back to below
  let top = anchor.top - th - margin
  if (top < margin) top = anchor.bottom + margin

  let left = anchor.left + anchor.width / 2 - tw / 2
  left = clamp(left, margin, vw - tw - margin)
  top = clamp(top, margin, vh - th - margin)

  tooltip.style.transform = `translate(${left}px, ${top}px)`
  tooltip.style.opacity = '1'
}

// ---- Content ---------------------------------------------------------------

function buildContent(word: Word, result: LookupResult): string {
  const posLabel = posToEnglish(result.partOfSpeech || word.partOfSpeech)
  const showReading = result.reading && result.reading !== result.word
  const defs = result.definitions.slice(0, 5)

  return `
    <div class="ys-header">
      <span class="ys-surface">${escapeHtml(result.word || word.surface)}</span>
      ${showReading ? `<span class="ys-reading">【${escapeHtml(result.reading)}】</span>` : ''}
      ${posLabel ? `<span class="ys-pos">${escapeHtml(posLabel)}</span>` : ''}
    </div>
    ${
      defs.length > 0
        ? `<ol class="ys-defs">${defs.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ol>`
        : ''
    }
    ${result.source === 'not-found' ? '<p class="ys-nf">Not found in dictionary</p>' : ''}
    ${result.source === 'api' ? '<p class="ys-src">via translation API</p>' : ''}
  `
}

function posToEnglish(pos: string): string {
  const map: Record<string, string> = {
    名詞: 'Noun',
    動詞: 'Verb',
    形容詞: 'Adjective',
    形容動詞: 'Na-Adjective',
    副詞: 'Adverb',
    助詞: 'Particle',
    助動詞: 'Auxiliary verb',
    接続詞: 'Conjunction',
    感動詞: 'Interjection',
    接頭辞: 'Prefix',
    接尾辞: 'Suffix',
    記号: 'Symbol',
  }
  return map[pos] ?? pos
}

// ---- Styles ----------------------------------------------------------------

function tooltipStyles(): string {
  return `
    #ys-tooltip {
      position: fixed;
      top: 0;
      left: 0;
      z-index: 2147483647;
      background: #1a1a2e;
      color: #e0e0e0;
      border: 1px solid #3a3a5a;
      border-radius: 8px;
      padding: 10px 14px;
      max-width: 320px;
      min-width: 160px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.6);
      font-family: 'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Segoe UI', sans-serif;
      font-size: 14px;
      line-height: 1.5;
      opacity: 0;
      transition: opacity 0.15s ease;
      pointer-events: auto;
    }

    #ys-tooltip[aria-hidden="true"] {
      display: none;
    }

    .ys-header {
      display: flex;
      align-items: baseline;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 6px;
    }

    .ys-surface {
      font-size: 22px;
      font-weight: 700;
      color: #fff;
    }

    .ys-reading {
      font-size: 13px;
      color: #aaa;
    }

    .ys-pos {
      font-size: 11px;
      background: #2a4080;
      color: #90b0ff;
      border-radius: 3px;
      padding: 1px 6px;
    }

    .ys-defs {
      margin: 0;
      padding-left: 18px;
      color: #d0d0d0;
    }

    .ys-defs li {
      margin-bottom: 2px;
    }

    .ys-nf {
      color: #888;
      font-style: italic;
      font-size: 12px;
      margin: 4px 0 0;
    }

    .ys-src {
      color: #666;
      font-size: 11px;
      margin: 4px 0 0;
      text-align: right;
    }
  `
}
