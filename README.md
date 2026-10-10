# Math Flash Cards

An ultra-minimal, iPhone-friendly number practice app built for a five-year-old. Each full-screen card shows a number, its written name, and a button to hear it spoken aloud.

[Try the app](https://www.todd.sh/math) · [The story behind it](https://www.todd.sh/mathcards)

## Features

- Nine ranges: 0–10, 10–20 (default), 10–30, 20–30, 0–100, 10–100, 5–100 by fives, 10–100 by tens, and Teens & tens (13, 30, 31, 14, 40, 41, 15, 50, 51, 16, 60, 61, 17, 70, 71, 18, 80, 81, 19, 90, 91).
- Remembers the selected range on the device.
- Teens & tens runs in a fixed sequence of confusing groups: 13, 30, 31; 14, 40, 41; and so on through 19, 90, 91, then repeats. All other ranges use shuffled batches with every number once and no repeated number at the batch boundary.
- Full-screen vertical swiping moves the number, name, and speaker together. Swipe up for the next card and down for the previous one.
- Short deliberate swipes advance; tiny nudges settle back. Three neighboring cards remain mounted to keep the deck endless without growing the DOM.
- 101 bundled audio clips, generated with OpenAI's `gpt-4o-mini-tts` model and Marin voice. Playback requires no API key and makes no request to OpenAI.
- Three equal-sized buttons sit at the bottom right of each card: check on top, X in the middle, and speaker at the bottom. The check plays a two-second cheer; the X plays a short, sharp buzzer. Feedback keeps the current card in place. Feedback starts on press using prebuilt Web Audio buffers, avoiding file decoding and media seeking on each tap. The check uses the first two seconds of [this supplied cheer](https://www.youtube.com/shorts/wAYWuzOGXSU), with a linear fade out from 1.5 to 2 seconds. Its WAV is stored at `public/audio/feedback/correct-cheer-v1.wav`; `python3 scripts/embed-cheer.py` embeds the PCM samples in `lib/correct-sound.json`. The X uses [this supplied buzzer clip](https://www.youtube.com/watch?v=FRpq7o1mKXY), with 0.609 seconds trimmed from the beginning. Its trimmed WAV is stored at `public/audio/feedback/incorrect-youtube-v1.wav`; `python3 scripts/embed-buzzer.py` embeds the PCM samples in `lib/incorrect-sound.json` for immediate playback. The older WAV files and Python generator preserve the original sound design.
- Keyboard navigation, screen-reader labels, and reduced-motion support.

## Run locally

Use Node.js 24 or newer.

```sh
npm ci
npm run dev
```

Open [localhost:3000/math](http://localhost:3000/math). The `/math` base path is configured in `next.config.ts`.

```sh
npm run typecheck
npm run build
```

## Audio generation (optional)

All audio is already included. You only need a key to regenerate it.

1. Install `ffmpeg` and `ffprobe`.
2. Copy `.env.example` to `.env.local` and set your own `OPENAI_API_KEY` locally.
3. Run `npm run audio:openai`. OpenAI API usage may incur charges.

The generator resumes completed clips, validates each recording, and exports a versioned directory with a manifest. Review the results, then update the audio URL in `app/page.tsx` if the directory changes.

Never commit `.env.local`, API keys, or generated staging files. Environment files, local Vercel settings, and `.audio-generation/` are excluded from Git; environment files and staging are also excluded from deployments. The public `.env.example` contains no credential.

## Swipe diagnostics

Open `/math?debugSwipe=1` for local browser diagnostics. The console logs gesture distance, direction, duration, destination, and completed card changes. `window.__mathSwipeLog` retains the latest 100 entries. Logging is off by default and sends nothing to a server.

## Extend the numbers

Edit `RANGES` in `lib/numbers.ts` and add matching audio files. Written English names support 0–999; the audio generator currently covers 0–100.

## Deploy

The app can be deployed to Vercel as a Next.js project. It serves under `/math`; adjust `basePath` and the audio URL prefix together if hosting at another path. No OpenAI key is needed in the deployed app.

## Audio diagnostics

Turn on **Diagnostics** under the gear, or open `/math?debugAudio=1`. The on-screen panel shows the latest event and an expandable, copyable log of the last 100 events: button triggers, audio-engine state, scheduled feedback playback, completion, interruption, speech buffering/failures, range changes, and swipes. The visibility preference is remembered locally. Logs remain in memory and in the browser console; they are never uploaded. Playback events confirm browser activity, not the phone's audible output or volume setting.

The correct cheer retains the source volume before its final half-second fade. Other sounds retain their existing levels.

### Audio recovery

Sound controls capture touch gestures so small finger movements do not scroll the card or cancel playback. Swipe on the rest of the card. Warm feedback starts on press; cold or interrupted feedback starts on click to preserve mobile user activation.

Where supported, the Audio Session API selects media playback for consistent voice and feedback behavior in iPhone silent mode. Background/foreground transitions stop pending playback and mark the engine for replacement on the next tap. Feedback detects a stalled resume (1.8 seconds) or frozen audio clock (1.2 seconds), reports a retry message, and rebuilds on the next tap. Number playback detects four seconds without progress and reloads on retry. Old requests are cancelled so a delayed resume cannot play a stale sound.

Diagnostics include page lifecycle, engine reconstruction, and playback failure details. Browser events cannot confirm physical speaker output; silent-mode and interruption behavior still require testing on an actual iPhone.
