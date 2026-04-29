/**
 * player-observer.ts
 *
 * Responsibilities:
 *   - Detect the YouTube <video> element via querySelector
 *   - Re-attach when the player is recreated (SPA navigation)
 *   - Intercept YouTube's History API pushState for URL changes
 *   - Fire callbacks on video found / video lost
 */
import { logger } from '@/shared/utils'
import { NAVIGATION_DEBOUNCE_MS } from '@/shared/constants'

export type VideoFoundCallback = (video: HTMLVideoElement) => void
export type VideoLostCallback = () => void

export interface PlayerObserver {
  start: () => void
  stop: () => void
}

export function createPlayerObserver(
  onVideoFound: VideoFoundCallback,
  onVideoLost: VideoLostCallback,
): PlayerObserver {
  let currentVideo: HTMLVideoElement | null = null
  let domObserver: MutationObserver | null = null
  let navigationTimer: ReturnType<typeof setTimeout> | null = null
  let originalPushState: typeof history.pushState | null = null
  let popStateHandler: (() => void) | null = null

  function findVideo(): HTMLVideoElement | null {
    return (
      document.querySelector<HTMLVideoElement>('video.html5-main-video') ??
      document.querySelector<HTMLVideoElement>('video')
    )
  }

  function attachVideo(video: HTMLVideoElement): void {
    if (currentVideo === video) return
    currentVideo = video
    logger('Video element found')
    onVideoFound(video)
  }

  function detachVideo(): void {
    if (currentVideo === null) return
    currentVideo = null
    logger('Video element lost')
    onVideoLost()
  }

  function checkForVideo(): void {
    const video = findVideo()
    if (video !== null && document.contains(video)) {
      attachVideo(video)
    } else if (video === null && currentVideo !== null) {
      detachVideo()
    }
  }

  function scheduleRecheck(): void {
    if (navigationTimer !== null) clearTimeout(navigationTimer)
    navigationTimer = setTimeout(() => {
      navigationTimer = null
      detachVideo()
      checkForVideo()
    }, NAVIGATION_DEBOUNCE_MS)
  }

  function start(): void {
    // Watch DOM for player recreation
    domObserver = new MutationObserver(checkForVideo)
    domObserver.observe(document.body, { childList: true, subtree: true })

    // Intercept YouTube SPA navigation via History API
    originalPushState = history.pushState.bind(history)
    history.pushState = function (
      ...args: Parameters<typeof history.pushState>
    ): void {
      originalPushState!(...args)
      scheduleRecheck()
    }

    popStateHandler = scheduleRecheck
    window.addEventListener('popstate', popStateHandler)

    // Initial probe
    checkForVideo()
  }

  function stop(): void {
    domObserver?.disconnect()
    domObserver = null

    if (navigationTimer !== null) {
      clearTimeout(navigationTimer)
      navigationTimer = null
    }

    if (originalPushState !== null) {
      history.pushState = originalPushState
      originalPushState = null
    }

    if (popStateHandler !== null) {
      window.removeEventListener('popstate', popStateHandler)
      popStateHandler = null
    }

    detachVideo()
  }

  return { start, stop }
}
