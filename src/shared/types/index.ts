// ---------- Subtitle ----------

export interface SubtitleCue {
  start: number // seconds
  end: number // seconds
  text: string // raw Japanese text
  words?: Word[] // populated after morphological segmentation
}

// ---------- Words ----------

export interface Word {
  surface: string // displayed form e.g. "学生"
  reading: string // hiragana reading e.g. "がくせい"
  dictionaryForm: string // base/lemma form e.g. "学生"
  partOfSpeech: string // "名詞", "動詞", etc.
  startIndex: number // char offset in the original text
  endIndex: number
}

// ---------- Dictionary ----------

export interface JMdictKanjiEntry {
  text: string
  tags: string[]
}

export interface JMdictKanaEntry {
  text: string
  tags: string[]
  appliesToKanji: string[]
}

export interface JMdictGloss {
  text: string
  lang: string
  type: string | null
}

export interface JMdictSense {
  partOfSpeech: string[]
  gloss: JMdictGloss[]
  misc: string[]
  info: string[]
}

export interface JMdictEntry {
  id: string
  kanji: JMdictKanjiEntry[]
  kana: JMdictKanaEntry[]
  sense: JMdictSense[]
}

export interface JMdictFile {
  version: string
  languages: string[]
  commonOnly: boolean
  dictDate: string
  dictRevisions: string[]
  tags: Record<string, string>
  words: JMdictEntry[]
}

// ---------- Lookup ----------

export interface LookupResult {
  word: string
  reading: string
  partOfSpeech: string
  definitions: string[]
  source: 'jmdict' | 'api' | 'not-found'
}

// ---------- Settings ----------

export interface UserSettings {
  enabled: boolean
  apiKey: string
  apiProvider: 'deepl' | 'google' | 'none'
  targetLanguage: string
  fontSize: 'small' | 'medium' | 'large'
  overlayPosition: 'over' | 'below'
  furiganaEnabled: boolean
}

// ---------- Flashcards / SRS ----------

export interface FlashCard {
  id: string              // = dictionaryForm (unique key per lemma)
  word: string            // surface form e.g. "学生"
  reading: string         // hiragana reading e.g. "がくせい"
  dictionaryForm: string  // base/lemma form e.g. "学生"
  partOfSpeech: string
  definitions: string[]
  source: 'jmdict' | 'api' | 'not-found'
  // SM-2 SRS fields
  interval: number        // days until next review
  repetitions: number     // successful review streak
  easeFactor: number      // SM-2 ease factor (default 2.5)
  dueDate: number         // ms timestamp when next review is due
  addedAt: number         // ms timestamp when card was created
  lastReviewedAt: number | null
}

// ---------- Messages (content ↔ service worker) ----------

export type Message =
  | { type: 'PING' }
  | { type: 'PONG' }
  | { type: 'GET_SETTINGS' }
  | { type: 'SAVE_SETTINGS'; payload: Partial<UserSettings> }
  | { type: 'SAVE_SETTINGS_RESULT'; success: boolean; error?: string }
  | { type: 'TRANSLATE_WORD'; payload: { word: string; context?: string } }
  | { type: 'TRANSLATE_WORD_RESULT'; payload: LookupResult }
  | { type: 'ADD_FLASHCARD'; payload: { word: Word; result: LookupResult } }
  | { type: 'ADD_FLASHCARD_RESULT'; success: boolean; isNew: boolean; error?: string }
  | { type: 'GET_FLASHCARDS' }
  | { type: 'GET_FLASHCARDS_RESULT'; payload: FlashCard[] }
  | { type: 'REVIEW_FLASHCARD'; payload: { id: string; quality: number } }
  | { type: 'REVIEW_FLASHCARD_RESULT'; success: boolean; card?: FlashCard; error?: string }
  | { type: 'DELETE_FLASHCARD'; payload: { id: string } }
  | { type: 'DELETE_FLASHCARD_RESULT'; success: boolean; error?: string }
