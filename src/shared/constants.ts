import type { UserSettings } from './types/index.js'

export const EXTENSION_NAME = 'YomiSub'

export const DEFAULT_SETTINGS: UserSettings = {
  enabled: true,
  apiKey: '',
  apiProvider: 'none',
  targetLanguage: 'pt-BR',
  fontSize: 'medium',
  overlayPosition: 'over',
  furiganaEnabled: true,
}

export const OVERLAY_ROOT_ID = 'yomisub-root'

export const TOOLTIP_DEBOUNCE_MS = 150

export const FONT_SIZE_MAP: Record<UserSettings['fontSize'], string> = {
  small: '14px',
  medium: '18px',
  large: '24px',
}

/** YouTube SPA re-navigation debounce — wait this long after a URL change before reloading subs */
export const NAVIGATION_DEBOUNCE_MS = 600

/** Particles and punctuation that get a simplified tooltip */
export const SIMPLE_POS = new Set(['助詞', '助動詞', '記号', '特殊'])
