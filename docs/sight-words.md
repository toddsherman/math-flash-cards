# Sight-word collection and progression

## Word source

The word bank is the first 300 entries, in prevalence order, from Green, Keogh & Prout (2024), *The CPB Sight Words: A New Research-Based High-Frequency Wordlist for Early Reading Instruction*: https://doi.org/10.1002/trtr.2309

The published collection was built from 2,146 children's picture books. The source is a vocabulary-selection resource, not evidence that frequency order is an optimal teaching order.

The CSV used for this implementation was obtained from the university Word List Repository:
https://wordlists.projects.unibz.it/word-lists/children/english/childrens-picture-book-sight-words/

`lib/sight-words.json` preserves all 300 source entries in their original rank order. The 32 practice sets cover those entries exactly once. The sets contain 7–12 words each; this size and their ordering are app-design decisions, not research-established optima. No curriculum worksheets or lesson text are reproduced.

## Grouping

We begin with familiar short-vowel words and interleave useful irregular words. Subsequent sets address consonant blends, digraphs, simple long vowels, silent e, vowel teams, other vowel patterns, r-influenced vowels, contractions, endings, and longer words. Several groups necessarily include alternative or exceptional pronunciations; their menu notes call for explicit explanation. A parent should select sets that match the child's current letter–sound knowledge and instruction, rather than treating a numbered list as a required age-based timetable.

Principles informing the adaptation:
- Letter–sound knowledge, blending, spelling, and meaning support automatic word recognition: https://ila.onlinelibrary.wiley.com/doi/10.1002/trtr.2095
- Explicit decoding instruction and daily connected-text reading: https://ies.ed.gov/ncee/wwc/practiceguide/21
- A reference for systematic progression and irregular-word instruction, not a claim that this app implements UFLI: https://ufli.education.ufl.edu/foundations/
- No single universally established best list or order: https://ila.onlinelibrary.wiley.com/doi/10.1002/rrq.70077
- Distributed practice and retrieval: https://ies.ed.gov/ncee/wwc/Docs/PracticeGuide/20072004.pdf

The app is supplemental reading practice. It does not teach a complete phonics curriculum, assess reading ability, or enforce mastery. Feedback buttons remain parent/child controls and do not change the random order. Each selected pool shuffles in complete batches without immediate repeats at batch boundaries. All 300 words are available; the first eight-word set is the default for ABC.

## Display and speech

Source IDs stay lowercase for stable filenames. The display capitalizes I and its contractions and renders `mr` as `Mr.`. Its recording says "mister". `read` is recorded in the present tense (rhyming with "seed"). Pronunciation overrides use the homophones "reed" and "yule" for `read` and `you'll`, plus explicit vowel guidance for `thank`. For `than`, a short phrase produces clearer pronunciation; Whisper word timestamps isolate the target word with brief silence padding. These overrides are recorded in the manifest. The speaker is on demand, allowing a reading attempt before hearing the answer.

Generate recordings with `node scripts/generate-word-audio.mjs`. The script reads the ignored `.env.local`, uses the existing OpenAI Marin voice, retries transient failures, resumes valid staging clips, and regenerates invalid clips. It exports only after every file passes duration, decoding, and audible-level checks (mean at least −50 dBFS and peak at least −35 dBFS). It writes a versioned directory plus checksums, measured audio levels, and a public, credential-free manifest. The build verifies these measurements and checksums. Never publish an app revision before all referenced recordings exist and have been checked.

`npm test` checks full word coverage, duplicates, group sizes, and safe IDs. Browser verification should cover both feeds, repeat-tap menus, multi-group selection, persistence, shuffle batches, backward navigation, responsive word sizing, feedback, speech, and the existing audio-recovery cases.
