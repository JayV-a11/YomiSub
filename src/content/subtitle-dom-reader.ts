/**
 * subtitle-dom-reader.ts
 *
 * Instead of fetching subtitle files (which YouTube blocks from extension context),
 * this module watches YouTube's native caption DOM using MutationObserver.
 *
 * When the user has captions enabled, YouTube renders them in .ytp-caption-segment
 * spans. We mirror those text changes and pass them to the segmenter.
 *
 * Advantages over fetch approach:
 *  - No auth/cookie issues — reads from the DOM already in the page
 *  - Works for both manual and auto-generated subtitles
 *  - Naturally synced with what the user actually sees
 *  - No URL expiry issues
 */
import { logger } from '@/shared/utils'

/**
 * Starts watching for YouTube subtitle text changes.
 * Returns a cleanup function to stop observing.
 *
 * @param onText  Called with new subtitle text when a cue appears/changes
 * @param onClear Called when the current cue disappears (screen clear)
 */
export function watchYoutubeSubtitles(
  onText: (text: string) => void,
  onClear: () => void,
): () => void {
  let lastText = ''
  let observer: MutationObserver | null = null

  function readCurrentText(): string {
    // YouTube renders subtitle text inside .ytp-caption-segment spans.
    // Multiple spans may exist (e.g. line breaks) — join them all.
    return Array.from(document.querySelectorAll('.ytp-caption-segment'))
      .map((el) => el.textContent ?? '')
      .join('')
      .trim()
  }

  function handleMutation(): void {
    const text = readCurrentText()
    if (text === lastText) return
    lastText = text
    if (text.length > 0) {
      logger('Caption text:', text)
      onText(text)
    } else {
      onClear()
    }
  }

  // Attach to the player container — subtitles are added/removed inside it.
  // Fall back to body if the player isn't mounted yet.
  const target =
    document.querySelector('#movie_player') ??
    document.querySelector('.html5-video-container') ??
    document.body

  observer = new MutationObserver(handleMutation)
  observer.observe(target, { childList: true, subtree: true, characterData: true })
  logger('DOM caption observer attached to', (target as HTMLElement).id || target.tagName)

  return () => {
    observer?.disconnect()
    observer = null
    lastText = ''
  }
}
