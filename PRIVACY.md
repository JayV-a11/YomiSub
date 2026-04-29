# Privacy Policy — YomiSub

**Last updated:** 2026-04-28

## What YomiSub collects

YomiSub collects **nothing**. The extension does not track, store, or transmit any information about your browsing activity, watch history, or vocabulary.

## What is stored locally

The following data is stored in `chrome.storage.sync` (synced between your Chrome profiles via Google's infrastructure — not YomiSub's):

| Key | Content | Purpose |
|---|---|---|
| `settings` | Your preferences (font size, position, language, API provider) | Restore settings across sessions |
| `settings.apiKey` | Your API key for DeepL or Google Translate | Authenticate requests you initiate |

No subtitle content, no clicked words, no watch history is ever stored.

## External network requests

YomiSub makes external requests **only** in these two cases:

1. **Subtitle fetch** — YouTube's own subtitle endpoint (`youtube.com/api/timedtext`). This is the same request the native YouTube player makes. No additional data is sent.

2. **Translation API** — Only when you have configured a DeepL or Google Translate API key **and** the word is not found in the local JMdict dictionary. The single word is sent to the API endpoint you configured. No context, no history, no identifiers.

## API keys

- Stored in `chrome.storage.sync` using Chrome's encrypted storage
- Never logged, printed, or transmitted to any YomiSub-owned server
- Validated client-side with a single test request before saving
- The input field uses `type="password"` — masked at all times

## No telemetry

YomiSub contains **no analytics, no crash reporting, no usage beacons, no A/B testing infrastructure**. There is no backend server.

## Chrome Web Store compliance

This policy complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/user_data/).

## Contact

For questions, open an issue on the project's GitHub repository.
