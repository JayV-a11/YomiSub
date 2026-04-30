import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTooltipController } from '@/content/word-tooltip'
import type { LookupResult, Word } from '@/shared/types'

// ---- Helpers ---------------------------------------------------------------

function makeWord(surface = '学生'): Word {
  return {
    surface,
    reading: 'がくせい',
    dictionaryForm: surface,
    partOfSpeech: '名詞',
    startIndex: 0,
    endIndex: surface.length,
  }
}

function makeResult(overrides: Partial<LookupResult> = {}): LookupResult {
  return {
    word: '学生',
    reading: 'がくせい',
    partOfSpeech: '名詞',
    definitions: ['student', 'pupil'],
    source: 'jmdict',
    ...overrides,
  }
}

function makeAnchorRect(): DOMRect {
  return DOMRect.fromRect({ x: 100, y: 300, width: 40, height: 20 })
}

function makeShadow(): ShadowRoot {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return host.attachShadow({ mode: 'open' })
}

// ---- Mount -----------------------------------------------------------------

describe('createTooltipController — mount', () => {
  it('injects #ys-tooltip and a <style> into the shadow root', () => {
    const shadow = makeShadow()
    const controller = createTooltipController()
    controller.mount(shadow)

    expect(shadow.querySelector('#ys-tooltip')).not.toBeNull()
    expect(shadow.querySelector('style')).not.toBeNull()
  })

  it('tooltip starts hidden (aria-hidden=true)', () => {
    const shadow = makeShadow()
    const controller = createTooltipController()
    controller.mount(shadow)

    const tooltip = shadow.querySelector('#ys-tooltip')
    expect(tooltip?.getAttribute('aria-hidden')).toBe('true')
  })
})

// ---- Show ------------------------------------------------------------------

describe('createTooltipController — show', () => {
  it('sets aria-hidden to false when shown', () => {
    const shadow = makeShadow()
    const controller = createTooltipController()
    controller.mount(shadow)

    controller.show(makeWord(), makeAnchorRect(), makeResult())

    const tooltip = shadow.querySelector('#ys-tooltip')
    expect(tooltip?.getAttribute('aria-hidden')).toBe('false')
    expect(controller.isVisible()).toBe(true)
  })

  it('renders the word surface in the tooltip', () => {
    const shadow = makeShadow()
    const controller = createTooltipController()
    controller.mount(shadow)

    controller.show(makeWord('学生'), makeAnchorRect(), makeResult({ word: '学生' }))

    const tooltip = shadow.querySelector('#ys-tooltip')
    expect(tooltip?.innerHTML).toContain('学生')
  })

  it('renders the reading when it differs from the word', () => {
    const shadow = makeShadow()
    const controller = createTooltipController()
    controller.mount(shadow)

    controller.show(makeWord(), makeAnchorRect(), makeResult({ word: '学生', reading: 'がくせい' }))

    expect(shadow.querySelector('#ys-tooltip')?.innerHTML).toContain('がくせい')
  })

  it('does not render reading when it equals the word', () => {
    const shadow = makeShadow()
    const controller = createTooltipController()
    controller.mount(shadow)

    controller.show(makeWord('テスト'), makeAnchorRect(), makeResult({ word: 'テスト', reading: 'テスト' }))

    const readingEl = shadow.querySelector('.ys-reading')
    expect(readingEl).toBeNull()
  })

  it('renders definitions as a list', () => {
    const shadow = makeShadow()
    const controller = createTooltipController()
    controller.mount(shadow)

    controller.show(makeWord(), makeAnchorRect(), makeResult({ definitions: ['student', 'pupil', 'learner'] }))

    const items = shadow.querySelectorAll('.ys-defs li')
    expect(items.length).toBe(3)
  })

  it('shows "not-found" indicator when source is not-found', () => {
    const shadow = makeShadow()
    const controller = createTooltipController()
    controller.mount(shadow)

    controller.show(makeWord(), makeAnchorRect(), makeResult({ source: 'not-found', definitions: [] }))

    expect(shadow.querySelector('.ys-nf')).not.toBeNull()
  })

  it('caps definitions at 5 items even if result has more', () => {
    const shadow = makeShadow()
    const controller = createTooltipController()
    controller.mount(shadow)

    const defs = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    controller.show(makeWord(), makeAnchorRect(), makeResult({ definitions: defs }))

    const items = shadow.querySelectorAll('.ys-defs li')
    expect(items.length).toBe(5)
  })

  it('escapes HTML in word surface to prevent XSS', () => {
    const shadow = makeShadow()
    const controller = createTooltipController()
    controller.mount(shadow)

    controller.show(
      makeWord('<script>'),
      makeAnchorRect(),
      makeResult({ word: '<script>alert(1)</script>' }),
    )

    const html = shadow.querySelector('#ys-tooltip')?.innerHTML ?? ''
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

// ---- Hide ------------------------------------------------------------------

describe('createTooltipController — hide', () => {
  it('sets aria-hidden to true and clears content', () => {
    const shadow = makeShadow()
    const controller = createTooltipController()
    controller.mount(shadow)

    controller.show(makeWord(), makeAnchorRect(), makeResult())
    controller.hide()

    const tooltip = shadow.querySelector('#ys-tooltip')
    expect(tooltip?.getAttribute('aria-hidden')).toBe('true')
    expect(tooltip?.innerHTML).toBe('')
    expect(controller.isVisible()).toBe(false)
  })

  it('calling hide when not visible is safe', () => {
    const shadow = makeShadow()
    const controller = createTooltipController()
    controller.mount(shadow)
    expect(() => controller.hide()).not.toThrow()
  })
})

// ---- Outside click ---------------------------------------------------------

describe('createTooltipController — outside click', () => {
  it('hides the tooltip when clicking outside', () => {
    const shadow = makeShadow()
    const controller = createTooltipController()
    controller.mount(shadow)

    controller.show(makeWord(), makeAnchorRect(), makeResult())
    expect(controller.isVisible()).toBe(true)

    // Click on document body (outside tooltip)
    document.body.click()

    expect(controller.isVisible()).toBe(false)
  })
})

// ---- Save button -----------------------------------------------------------

describe('createTooltipController — save button', () => {
  it('renders save button when onSave callback is provided', () => {
    const shadow = makeShadow()
    const controller = createTooltipController({ onSave: vi.fn().mockResolvedValue({ isNew: true }) })
    controller.mount(shadow)

    controller.show(makeWord(), makeAnchorRect(), makeResult())

    const btn = shadow.querySelector('.ys-save-btn')
    expect(btn).not.toBeNull()
    expect(btn?.textContent).toContain('Add to deck')
  })

  it('does not render save button when no onSave callback', () => {
    const shadow = makeShadow()
    const controller = createTooltipController()
    controller.mount(shadow)

    controller.show(makeWord(), makeAnchorRect(), makeResult())

    expect(shadow.querySelector('.ys-save-btn')).toBeNull()
  })

  it('calls onSave with current word and result when save button is clicked', async () => {
    const onSave = vi.fn().mockResolvedValue({ isNew: true })
    const shadow = makeShadow()
    const controller = createTooltipController({ onSave })
    controller.mount(shadow)

    const word = makeWord('学生')
    const result = makeResult({ word: '学生' })
    controller.show(word, makeAnchorRect(), result)

    const btn = shadow.querySelector<HTMLButtonElement>('.ys-save-btn')!
    btn.click()

    // Allow microtask queue to flush
    await Promise.resolve()

    expect(onSave).toHaveBeenCalledWith(word, result, null)
  })

  it('shows "✓ Saved" feedback when onSave resolves with isNew=true', async () => {
    const onSave = vi.fn().mockResolvedValue({ isNew: true })
    const shadow = makeShadow()
    const controller = createTooltipController({ onSave })
    controller.mount(shadow)

    controller.show(makeWord(), makeAnchorRect(), makeResult())

    const btn = shadow.querySelector<HTMLButtonElement>('.ys-save-btn')!
    btn.click()

    await vi.waitFor(() => {
      expect(btn.textContent).toContain('Saved')
    })
  })

  it('shows "Already in deck" when onSave resolves with isNew=false', async () => {
    const onSave = vi.fn().mockResolvedValue({ isNew: false })
    const shadow = makeShadow()
    const controller = createTooltipController({ onSave })
    controller.mount(shadow)

    controller.show(makeWord(), makeAnchorRect(), makeResult())

    const btn = shadow.querySelector<HTMLButtonElement>('.ys-save-btn')!
    btn.click()

    await vi.waitFor(() => {
      expect(btn.textContent).toContain('Already in deck')
    })
  })

  it('disables the button after clicking', async () => {
    const onSave = vi.fn().mockResolvedValue({ isNew: true })
    const shadow = makeShadow()
    const controller = createTooltipController({ onSave })
    controller.mount(shadow)

    controller.show(makeWord(), makeAnchorRect(), makeResult())

    const btn = shadow.querySelector<HTMLButtonElement>('.ys-save-btn')!
    btn.click()

    await vi.waitFor(() => {
      expect(btn.disabled).toBe(true)
    })
  })
})
