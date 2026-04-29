# YomiSub

YomiSub is a Chrome extension that overlays interactive Japanese subtitles on YouTube videos. Click any word to instantly see its reading (furigana), part of speech, and definitions from the JMdict dictionary — no server required.

## Features (MVP 0.1)

- Detects and displays Japanese subtitle tracks (manual and auto-generated)
- Morphological segmentation via kuromoji.js — every word is independently clickable
- Furigana (hiragana readings) on hover/click
- Offline dictionary lookup via JMdict-simplified
- Optional fallback to DeepL Free or Google Translate API (user-configured)
- Shadow DOM isolation — zero CSS conflict with YouTube
- Settings popup: font size, overlay position, language, API key

## Architecture

```
src/
├── background/
│   └── service-worker.ts       # MV3 lifecycle + message routing
├── content/
│   ├── index.ts                # Bootstrap — wires all modules
│   ├── subtitle-extractor.ts   # Reads ytInitialPlayerResponse, fetches XML
│   ├── subtitle-overlay.ts     # rAF sync loop, Shadow DOM rendering
│   ├── word-segmenter.ts       # kuromoji tokenization (local, no API)
│   ├── word-tooltip.ts         # Tooltip UI + smart positioning
│   ├── jmdict-lookup.ts        # JMdict search + API fallback
│   └── player-observer.ts      # Video element tracking + SPA navigation
├── popup/
│   ├── index.html
│   ├── popup.ts
│   ├── popup.css
│   └── settings-form.ts        # UI only — no business logic
└── shared/
    ├── types/index.ts
    ├── constants.ts
    ├── storage.ts               # Typed chrome.storage.sync wrapper
    └── utils/index.ts
```

**Key constraints:**
- `subtitle-extractor` never touches the DOM for display
- `word-segmenter` never calls external APIs
- `service-worker` never accesses the DOM
- All user-visible elements live in a closed Shadow DOM

## Prerequisites

- Node.js ≥ 20
- npm ≥ 9
- Google Chrome ≥ 109 (MV3 support)

## Setup

```bash
git clone <repo-url>
cd YomiSub

# Install dependencies
npm install

# Copy kuromoji dictionary files to public/dict/
node scripts/copy-dict.mjs

# Download JMdict (~40 MB, run once)
node scripts/download-jmdict.mjs
```

## Development

```bash
npm run dev
```

Then load the extension in Chrome:
1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `dist/` folder

Hot reload is provided by `@crxjs/vite-plugin`.

> **Note:** `@crxjs/vite-plugin@2.0.0-beta.23` targets Vite 4. If you encounter build errors with Vite 5, run:
> `npm install vite@4`

## Production build

```bash
npm run build
```

The `dist/` folder is ready to be zipped and submitted to the Chrome Web Store:
```bash
cd dist && zip -r ../yomisub.zip . && cd ..
```

## Configuring the API key

Open the YomiSub popup (click the extension icon) and:
1. Select your API provider (DeepL Free or Google Translate)
2. Paste your API key in the password field
3. Click **Test** to verify connectivity
4. Click **Save settings**

Keys are stored in `chrome.storage.sync` — synced between your Chrome profiles, never sent to any server.

## Running tests

```bash
# Unit tests
npm test

# With coverage report (opens in browser)
npm run test:coverage

# Mutation testing (Stryker)
npm run test:mutation

# Everything at once
npm run test:all
```

Coverage thresholds: 80% lines/functions, 75% branches.  
Mutation score threshold: 60% (build breaks below this).

## Architectural decisions

| Decision | Rationale |
|---|---|
| kuromoji.js over TinySegmenter | kuromoji provides full morphological analysis (POS, readings, lemmas) needed for furigana and dictionary lookup. TinySegmenter only splits words. |
| Shadow DOM (closed) | YouTube's CSS is extremely aggressive. Shadow DOM is the only reliable isolation mechanism. |
| MV3 service worker | Required by Chrome Web Store since Jan 2023. No persistent background pages. |
| JMdict-simplified | Open-source, offline, JSON format. No API key needed for basic lookups. |
| requestAnimationFrame for sync | More accurate than `setInterval` for subtitle timing; respects browser frame budget. |
| `ytInitialPlayerResponse` | Official YouTube player API is not public. This is the most stable undocumented interface, used by many tools (yt-dlp, etc.). |
