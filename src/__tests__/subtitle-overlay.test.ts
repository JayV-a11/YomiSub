import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createOverlayController } from '@/content/subtitle-overlay'
import type { SubtitleCue, Word } from '@/shared/types'

// ---- Helpers ---------------------------------------------------------------

function makeWord(surface: string, pos = '名詞'): Word {
  return {
    surface,
    reading: surface,
    dictionaryForm: surface,
    partOfSpeech: pos,
    startIndex: 0,
    endIndex: surface.length,
  }
}

function makeCue(start: number, end: number, text: string, words?: Word[]): SubtitleCue {
  return { start, end, text, words }
}

function makeShadow(): ShadowRoot {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return host.attachShadow({ mode: 'open' })
}

// ---- Mount -----------------------------------------------------------------

describe('createOverlayController — mount', () => {
  it('injects a #yomisub-overlay div and a <style> into the shadow root', () => {
    const shadow = makeShadow()
    const controller = createOverlayController(vi.fn())
    controller.mount(shadow)

    expect(shadow.querySelector('#yomisub-overlay')).not.toBeNull()
    expect(shadow.querySelector('style')).not.toBeNull()
  })
})

// ---- Cue sync (time matching) ----------------------------------------------

describe('subtitle sync — cue selection', () => {
  it('activates the cue whose range contains currentTime', () => {
    const cues: SubtitleCue[] = [
      makeCue(0, 2, 'first'),
      makeCue(2, 4, 'second'),
      makeCue(5, 7, 'third'),
    ]

    // Test boundary logic directly via the time-matching expression
    const find = (t: number) => cues.find((c) => t >= c.start && t < c.end) ?? null

    expect(find(0)).toEqual(cues[0])
    expect(find(1.99)).toEqual(cues[0])
    expect(find(2)).toEqual(cues[1])      // start is inclusive
    expect(find(3.99)).toEqual(cues[1])
    expect(find(4)).toBeNull()            // gap between 4 and 5
    expect(find(5)).toEqual(cues[2])
    expect(find(6.99)).toEqual(cues[2])
    expect(find(7)).toBeNull()            // end is exclusive
  })

  it('returns null when currentTime is before all cues', () => {
    const cues = [makeCue(5, 10, 'test')]
    const find = (t: number) => cues.find((c) => t >= c.start && t < c.end) ?? null
    expect(find(0)).toBeNull()
  })

  it('returns null when currentTime is after all cues', () => {
    const cues = [makeCue(0, 2, 'test')]
    const find = (t: number) => cues.find((c) => t >= c.start && t < c.end) ?? null
    expect(find(10)).toBeNull()
  })
})

// ---- Render ----------------------------------------------------------------

describe('createOverlayController — rendering', () => {
  it('renders word spans when words are present', () => {
    const shadow = makeShadow()
    const onWordClick = vi.fn()
    const controller = createOverlayController(onWordClick)
    controller.mount(shadow)

    const video = document.createElement('video')
    Object.defineProperty(video, 'currentTime', { value: 1, writable: false })

    const cues: SubtitleCue[] = [
      makeCue(0, 3, '学生です', [makeWord('学生'), makeWord('です', '助動詞')]),
    ]

    // Mock RAF to fire exactly once so the render loop doesn't spin infinitely
    let pendingCb: ((time: number) => void) | null = null
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      pendingCb = cb as (time: number) => void
      return 1
    })
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => { pendingCb = null })

    controller.sync(video, cues)
    if (pendingCb !== null) (pendingCb as (time: number) => void)(performance.now())

    const overlay = shadow.querySelector('#yomisub-overlay')
    const spans = overlay?.querySelectorAll('.ys-word')
    expect(spans?.length).toBeGreaterThan(0)

    controller.stopSync()
    vi.restoreAllMocks()
  })

  it('clicking a word span fires onWordClick with the word and DOMRect', () => {
    const shadow = makeShadow()
    const onWordClick = vi.fn()
    const controller = createOverlayController(onWordClick)
    controller.mount(shadow)

    const word = makeWord('日本語')
    const cues: SubtitleCue[] = [makeCue(0, 10, '日本語', [word])]

    const video = document.createElement('video')
    Object.defineProperty(video, 'currentTime', { value: 1, writable: false })

    // Mock RAF to fire exactly once
    let pendingCb: ((time: number) => void) | null = null
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      pendingCb = cb as (time: number) => void
      return 1
    })
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => { pendingCb = null })

    controller.sync(video, cues)
    if (pendingCb !== null) (pendingCb as (time: number) => void)(performance.now())

    const span = shadow.querySelector('.ys-word') as HTMLElement | null
    span?.click()

    expect(onWordClick).toHaveBeenCalledWith(
      word,
      expect.objectContaining({ top: expect.any(Number), left: expect.any(Number) }),
    )

    controller.stopSync()
    vi.restoreAllMocks()
  })
})

// ---- stopSync / unmount ---------------------------------------------------

describe('createOverlayController — lifecycle', () => {
  it('stopSync cancels the animation frame (no errors on call)', () => {
    const shadow = makeShadow()
    const controller = createOverlayController(vi.fn())
    controller.mount(shadow)

    const video = document.createElement('video')
    Object.defineProperty(video, 'currentTime', { value: 0, writable: false })
    controller.sync(video, [])
    expect(() => controller.stopSync()).not.toThrow()
  })

  it('calling stopSync twice is safe', () => {
    const shadow = makeShadow()
    const controller = createOverlayController(vi.fn())
    controller.mount(shadow)
    controller.stopSync()
    expect(() => controller.stopSync()).not.toThrow()
  })

  it('unmount removes the container from the shadow root', () => {
    const shadow = makeShadow()
    const controller = createOverlayController(vi.fn())
    controller.mount(shadow)
    controller.unmount()
    expect(shadow.querySelector('#yomisub-overlay')).toBeNull()
  })

  it('updateSettings sets font-size CSS variable on container', () => {
    const shadow = makeShadow()
    const controller = createOverlayController(vi.fn())
    controller.mount(shadow)
    controller.updateSettings('24px', 'over')
    const overlay = shadow.querySelector<HTMLElement>('#yomisub-overlay')
    expect(overlay?.style.getPropertyValue('--ys-font-size')).toBe('24px')
  })

  it('updateSettings stores furigana flag on data attribute', () => {
    const shadow = makeShadow()
    const controller = createOverlayController(vi.fn())
    controller.mount(shadow)
    controller.updateSettings('18px', 'over', true)
    const overlay = shadow.querySelector<HTMLElement>('#yomisub-overlay')
    expect(overlay?.dataset['furigana']).toBe('true')
  })
})

// ---- showWords / clearWords -----------------------------------------------

describe('createOverlayController — showWords / clearWords', () => {
  it('showWords renders one span per word', () => {
    const shadow = makeShadow()
    const controller = createOverlayController(vi.fn())
    controller.mount(shadow)

    const words = [makeWord('日本'), makeWord('語')]
    controller.showWords(words)

    const spans = shadow.querySelectorAll('.ys-word')
    expect(spans).toHaveLength(2)
    expect(spans[0]?.textContent).toBe('日本')
    expect(spans[1]?.textContent).toBe('語')
  })

  it('showWords replaces previous words', () => {
    const shadow = makeShadow()
    const controller = createOverlayController(vi.fn())
    controller.mount(shadow)

    controller.showWords([makeWord('最初')])
    controller.showWords([makeWord('次'), makeWord('の')])

    const spans = shadow.querySelectorAll('.ys-word')
    expect(spans).toHaveLength(2)
    expect(spans[0]?.textContent).toBe('次')
  })

  it('clearWords empties the overlay', () => {
    const shadow = makeShadow()
    const controller = createOverlayController(vi.fn())
    controller.mount(shadow)

    controller.showWords([makeWord('テスト')])
    controller.clearWords()

    expect(shadow.querySelectorAll('.ys-word')).toHaveLength(0)
  })

  it('showWords with furigana enabled renders <ruby> for words with different reading', () => {
    const shadow = makeShadow()
    const controller = createOverlayController(vi.fn())
    controller.mount(shadow)
    controller.updateSettings('18px', 'over', true)

    const word: Word = {
      surface: '日本語',
      reading: 'にほんご',
      dictionaryForm: '日本語',
      partOfSpeech: '名詞',
      startIndex: 0,
      endIndex: 3,
    }
    controller.showWords([word])

    const span = shadow.querySelector('.ys-word')!
    const ruby = span.querySelector('ruby')
    expect(ruby).not.toBeNull()
    expect(ruby?.querySelector('rt')?.textContent).toBe('にほんご')
  })

  it('showWords with furigana enabled does NOT add ruby when reading equals surface', () => {
    const shadow = makeShadow()
    const controller = createOverlayController(vi.fn())
    controller.mount(shadow)
    controller.updateSettings('18px', 'over', true)

    controller.showWords([makeWord('か')]) // reading === surface
    const ruby = shadow.querySelector('ruby')
    expect(ruby).toBeNull()
  })

  it('word span fires onWordClick callback when clicked', () => {
    const onWordClick = vi.fn()
    const shadow = makeShadow()
    const controller = createOverlayController(onWordClick)
    controller.mount(shadow)

    const word = makeWord('語')
    controller.showWords([word])

    const span = shadow.querySelector<HTMLElement>('.ys-word')!
    span.click()

    expect(onWordClick).toHaveBeenCalledWith(
      word,
      expect.objectContaining({ top: expect.any(Number), left: expect.any(Number) }),
    )
  })
})
