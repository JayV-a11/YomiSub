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

// ---------- Kanji ----------

export interface KanjiInfo {
  char: string
  meanings: string[]   // English meanings, max ~4
  onyomi: string[]     // Sino-Japanese readings (e.g. セイ, ショウ)
  kunyomi: string[]    // Native Japanese readings (e.g. ただ.しい)
}

// ---------- Related words ----------

export interface RelatedWord {
  word: string     // surface (kanji form if present)
  reading: string  // hiragana reading
  gloss: string    // first English definition (truncated)
}

// ---------- Pitch accent ----------

export interface PitchAccentInfo {
  reading: string    // the hiragana reading the pattern applies to
  moraCount: number  // number of moras in the reading
  patterns: number[] // NHK drop positions; 0=heiban, N=drop after mora N
}

// ---------- Flashcards / SRS ----------

/**
 * Captured at the moment a card is added: lets us show the source sentence
 * (with cloze-deletion), link back to the exact video timestamp, and surface
 * "Watch scene" actions during review.
 */
export interface CardContext {
  sentence: string         // full subtitle line as shown when clicked
  wordSurface: string      // exact surface clicked (for cloze masking)
  videoUrl: string         // page URL with timestamp param e.g. ?t=72
  videoTitle: string       // <title> of the page at capture time
  timestampSeconds: number // video.currentTime at click
  capturedAt: number       // ms timestamp
}

/**
 * Serialised ts-fsrs Card. Stored on the FlashCard so we can deserialise into
 * a real ts-fsrs Card on review without losing FSRS-internal state.
 *
 * Date fields are kept as ms timestamps for IndexedDB/JSON friendliness.
 */
export interface FsrsState {
  due: number              // ms — when the card is next due
  stability: number        // memory stability (days)
  difficulty: number       // 1..10 — FSRS difficulty
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number             // total reviews
  lapses: number           // times forgotten
  state: 0 | 1 | 2 | 3     // 0=New, 1=Learning, 2=Review, 3=Relearning
  last_review: number | null
}

export interface FlashCard {
  id: string              // = dictionaryForm (unique key per lemma)
  word: string            // surface form e.g. "学生"
  reading: string         // hiragana reading e.g. "がくせい"
  dictionaryForm: string  // base/lemma form e.g. "学生"
  partOfSpeech: string
  definitions: string[]
  source: 'jmdict' | 'api' | 'not-found'
  context: CardContext | null // null for cards added without video context (e.g. legacy)
  kanjiBreakdown: KanjiInfo[] // empty if word is kana-only or kanji not in dict
  relatedWords: RelatedWord[] // entries sharing kanji with this word
  pitchAccent: PitchAccentInfo | null // null if not in pitch dict
  // SRS state — FSRS is canonical; legacy fields below are mirrors for display.
  fsrs: FsrsState
  dueDate: number         // mirror of fsrs.due — kept for cheap filtering
  addedAt: number         // ms timestamp when card was created
  lastReviewedAt: number | null
  // Legacy SM-2 fields kept for migration / read-only display compatibility.
  interval: number
  repetitions: number
  easeFactor: number
  stability: number
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
  | {
      type: 'ADD_FLASHCARD'
      payload: {
        word: Word
        result: LookupResult
        context: CardContext | null
        kanjiBreakdown: KanjiInfo[]
        relatedWords: RelatedWord[]
        pitchAccent: PitchAccentInfo | null
      }
    }
  | { type: 'ADD_FLASHCARD_RESULT'; success: boolean; isNew: boolean; error?: string }
  | { type: 'GET_FLASHCARDS' }
  | { type: 'GET_FLASHCARDS_RESULT'; payload: FlashCard[] }
  | { type: 'REVIEW_FLASHCARD'; payload: { id: string; quality: number } }
  | { type: 'REVIEW_FLASHCARD_RESULT'; success: boolean; card?: FlashCard; error?: string }
  | { type: 'DELETE_FLASHCARD'; payload: { id: string } }
  | { type: 'DELETE_FLASHCARD_RESULT'; success: boolean; error?: string }
