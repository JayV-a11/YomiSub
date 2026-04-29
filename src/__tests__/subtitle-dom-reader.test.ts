import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { watchYoutubeSubtitles } from '@/content/subtitle-dom-reader'

// ---- Helpers ---------------------------------------------------------------

function addCaptionSegment(text: string): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = 'ytp-caption-segment'
  span.textContent = text
  document.body.appendChild(span)
  return span
}

function clearCaptionSegments(): void {
  document.querySelectorAll('.ytp-caption-segment').forEach((el) => el.remove())
}

// ---- Tests -----------------------------------------------------------------

describe('watchYoutubeSubtitles', () => {
  let onText: ReturnType<typeof vi.fn>
  let onClear: ReturnType<typeof vi.fn>
  let stopWatch: (() => void) | null = null

  beforeEach(() => {
    onText = vi.fn()
    onClear = vi.fn()
    clearCaptionSegments()
  })

  afterEach(() => {
    stopWatch?.()
    stopWatch = null
    clearCaptionSegments()
  })

  it('returns a cleanup function', () => {
    stopWatch = watchYoutubeSubtitles(onText, onClear)
    expect(typeof stopWatch).toBe('function')
  })

  it('calls onText when a .ytp-caption-segment is added', async () => {
    stopWatch = watchYoutubeSubtitles(onText, onClear)

    addCaptionSegment('こんにちは')

    // MutationObserver callbacks fire asynchronously (microtask)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(onText).toHaveBeenCalledWith('こんにちは')
    expect(onClear).not.toHaveBeenCalled()
  })

  it('calls onClear when all segments are removed', async () => {
    stopWatch = watchYoutubeSubtitles(onText, onClear)

    // Add a segment so there's non-empty text, then remove it
    const span = addCaptionSegment('テスト')
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(onText).toHaveBeenCalledWith('テスト')

    span.remove()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(onClear).toHaveBeenCalled()
  })

  it('does not call onText again for identical text', async () => {
    stopWatch = watchYoutubeSubtitles(onText, onClear)

    addCaptionSegment('同じ')
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    // Trigger another mutation that leaves text the same
    const existing = document.querySelector('.ytp-caption-segment')!
    // Force a childList mutation without changing text
    const dummy = document.createElement('span')
    existing.appendChild(dummy)
    dummy.remove()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    // Should only have been called once, not twice
    expect(onText).toHaveBeenCalledTimes(1)
    expect(onText).toHaveBeenCalledWith('同じ')
  })

  it('concatenates text from multiple segments', async () => {
    stopWatch = watchYoutubeSubtitles(onText, onClear)

    addCaptionSegment('今日は')
    addCaptionSegment('いい天気')
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    const lastCall = onText.mock.calls.at(-1)?.[0] as string
    expect(lastCall).toBe('今日はいい天気')
  })

  it('cleanup function disconnects the observer', async () => {
    stopWatch = watchYoutubeSubtitles(onText, onClear)
    stopWatch()
    stopWatch = null

    addCaptionSegment('無視される')
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(onText).not.toHaveBeenCalled()
  })
})
