/**
 * settings-form.ts — Popup UI only. No business logic here.
 *
 * Reads settings from chrome.storage via the shared storage module,
 * renders the form, and saves on submit. Validates API key with a
 * test request before saving.
 */
import { getSettings, saveSettings } from '@/shared/storage'
import { DEFAULT_SETTINGS, FONT_SIZE_MAP } from '@/shared/constants'
import type { UserSettings } from '@/shared/types'

type FontSize = UserSettings['fontSize']
const FONT_SIZES: FontSize[] = ['small', 'medium', 'large']
const FONT_SIZE_INDEX: Record<FontSize, number> = { small: 0, medium: 1, large: 2 }

export function renderSettingsForm(container: HTMLElement): void {
  container.innerHTML = buildSkeleton()

  const form = container.querySelector<HTMLFormElement>('#ys-form')!
  const statusEl = container.querySelector<HTMLParagraphElement>('#ys-status')!

  // Load and populate
  getSettings().then((settings) => populate(form, settings)).catch(() => {
    showStatus(statusEl, 'Failed to load settings', 'error')
  })

  // Save on submit
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    void handleSave(form, statusEl)
  })

  // Test API connection
  const testBtn = form.querySelector<HTMLButtonElement>('#ys-test-btn')
  testBtn?.addEventListener('click', () => void handleTestApi(form, statusEl))

  // Enable field toggles based on provider selection
  const providerSelect = form.querySelector<HTMLSelectElement>('#ys-provider')
  providerSelect?.addEventListener('change', () => toggleApiKeyField(form))
}

// ---- Population ------------------------------------------------------------

function populate(form: HTMLFormElement, settings: UserSettings): void {
  setChecked(form, '#ys-enabled', settings.enabled)
  setChecked(form, '#ys-furigana', settings.furiganaEnabled)
  setValue(form, '#ys-provider', settings.apiProvider)
  setValue(form, '#ys-api-key', settings.apiKey)
  setValue(form, '#ys-target-lang', settings.targetLanguage)
  setValue(form, '#ys-position', settings.overlayPosition)

  const fontIndex = FONT_SIZE_INDEX[settings.fontSize]
  const slider = form.querySelector<HTMLInputElement>('#ys-font-size')
  if (slider !== null) {
    slider.value = String(fontIndex)
    updateSliderLabel(form, fontIndex)
  }

  toggleApiKeyField(form)
}

// ---- Save ------------------------------------------------------------------

async function handleSave(form: HTMLFormElement, statusEl: HTMLParagraphElement): Promise<void> {
  showStatus(statusEl, 'Saving…', 'loading')

  const fontIndex = parseInt(form.querySelector<HTMLInputElement>('#ys-font-size')?.value ?? '1')
  const fontSize: FontSize = FONT_SIZES[fontIndex] ?? DEFAULT_SETTINGS.fontSize

  const updated: UserSettings = {
    enabled: isChecked(form, '#ys-enabled'),
    furiganaEnabled: isChecked(form, '#ys-furigana'),
    apiProvider: (getValue(form, '#ys-provider') as UserSettings['apiProvider']) || 'none',
    apiKey: getValue(form, '#ys-api-key'),
    targetLanguage: getValue(form, '#ys-target-lang') || 'pt-BR',
    overlayPosition: (getValue(form, '#ys-position') as UserSettings['overlayPosition']) || 'over',
    fontSize,
  }

  try {
    await saveSettings(updated)
    showStatus(statusEl, 'Settings saved ✓', 'ok')
  } catch {
    showStatus(statusEl, 'Failed to save settings', 'error')
  }
}

// ---- API key test ----------------------------------------------------------

async function handleTestApi(form: HTMLFormElement, statusEl: HTMLParagraphElement): Promise<void> {
  const provider = getValue(form, '#ys-provider') as UserSettings['apiProvider']
  const apiKey = getValue(form, '#ys-api-key')

  if (!apiKey) {
    showStatus(statusEl, 'Enter an API key first', 'error')
    return
  }

  showStatus(statusEl, 'Testing connection…', 'loading')

  try {
    const ok = await testApiConnection(provider, apiKey)
    if (ok) {
      showStatus(statusEl, 'Connection successful ✓', 'ok')
    } else {
      showStatus(statusEl, 'Connection failed — check your key', 'error')
    }
  } catch {
    showStatus(statusEl, 'Connection error', 'error')
  }
}

async function testApiConnection(
  provider: UserSettings['apiProvider'],
  apiKey: string,
): Promise<boolean> {
  if (provider === 'deepl') {
    const res = await fetch(
      `https://api-free.deepl.com/v2/usage?auth_key=${encodeURIComponent(apiKey)}`,
    )
    return res.ok
  }
  if (provider === 'google') {
    const params = new URLSearchParams({ key: apiKey, q: 'テスト', source: 'ja', target: 'en' })
    const res = await fetch(
      `https://translation.googleapis.com/language/translate/v2?${params.toString()}`,
    )
    return res.ok
  }
  return false
}

// ---- UI helpers ------------------------------------------------------------

function toggleApiKeyField(form: HTMLFormElement): void {
  const provider = getValue(form, '#ys-provider')
  const apiSection = form.querySelector<HTMLElement>('#ys-api-section')
  if (apiSection !== null) {
    apiSection.style.display = provider === 'none' ? 'none' : 'block'
  }
}

function showStatus(el: HTMLParagraphElement, msg: string, type: 'ok' | 'error' | 'loading'): void {
  el.textContent = msg
  el.className = `ys-status ${type}`
}

function setValue(form: HTMLFormElement, selector: string, value: string): void {
  const el = form.querySelector<HTMLInputElement | HTMLSelectElement>(selector)
  if (el !== null) el.value = value
}

function getValue(form: HTMLFormElement, selector: string): string {
  return form.querySelector<HTMLInputElement | HTMLSelectElement>(selector)?.value ?? ''
}

function setChecked(form: HTMLFormElement, selector: string, checked: boolean): void {
  const el = form.querySelector<HTMLInputElement>(selector)
  if (el !== null) el.checked = checked
}

function isChecked(form: HTMLFormElement, selector: string): boolean {
  return form.querySelector<HTMLInputElement>(selector)?.checked ?? false
}

function updateSliderLabel(form: HTMLFormElement, index: number): void {
  const labelEl = form.querySelector<HTMLSpanElement>('#ys-font-label')
  const size = FONT_SIZES[index] ?? 'medium'
  if (labelEl !== null) {
    labelEl.textContent = `${FONT_SIZE_MAP[size]} (${size})`
  }
}

// ---- HTML skeleton ---------------------------------------------------------

function buildSkeleton(): string {
  return `
    <div class="ys-header">
      <h1>YomiSub</h1>
      <span class="ys-badge">MVP 0.1</span>
    </div>

    <form id="ys-form" autocomplete="off">

      <div class="ys-toggle-row">
        <span>Enable extension</span>
        <label class="ys-toggle">
          <input type="checkbox" id="ys-enabled" />
          <span class="ys-toggle-thumb"></span>
        </label>
      </div>

      <div class="ys-toggle-row">
        <span>Show furigana</span>
        <label class="ys-toggle">
          <input type="checkbox" id="ys-furigana" />
          <span class="ys-toggle-thumb"></span>
        </label>
      </div>

      <hr class="ys-divider" />

      <div class="ys-row">
        <label for="ys-font-size">Subtitle font size</label>
        <div class="ys-slider">
          <input type="range" id="ys-font-size" min="0" max="2" step="1" value="1"
            oninput="document.getElementById('ys-font-label').textContent = ['14px (small)','18px (medium)','24px (large)'][this.value]" />
          <span class="ys-slider-label" id="ys-font-label">18px (medium)</span>
        </div>
      </div>

      <div class="ys-row">
        <label for="ys-position">Overlay position</label>
        <select id="ys-position">
          <option value="over">Over video</option>
          <option value="below">Below video</option>
        </select>
      </div>

      <div class="ys-row">
        <label for="ys-target-lang">Translation language</label>
        <select id="ys-target-lang">
          <option value="pt-BR">Português (BR)</option>
          <option value="en">English</option>
          <option value="es">Español</option>
          <option value="fr">Français</option>
          <option value="de">Deutsch</option>
        </select>
      </div>

      <hr class="ys-divider" />

      <div class="ys-row">
        <label for="ys-provider">Translation API (fallback)</label>
        <select id="ys-provider">
          <option value="none">None — use JMdict only</option>
          <option value="deepl">DeepL Free</option>
          <option value="google">Google Translate</option>
        </select>
      </div>

      <div id="ys-api-section" style="display:none">
        <div class="ys-row">
          <label for="ys-api-key">API Key</label>
          <div class="ys-api-row">
            <input type="password" id="ys-api-key" placeholder="Paste your key here" />
            <button type="button" class="ys-btn" id="ys-test-btn">Test</button>
          </div>
        </div>
      </div>

      <button type="submit" class="ys-btn ys-btn-save">Save settings</button>

      <p class="ys-status" id="ys-status"></p>
    </form>
  `
}
