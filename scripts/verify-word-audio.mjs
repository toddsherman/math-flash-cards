import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const { words } = JSON.parse(await readFile('lib/sight-words.json', 'utf8'));
const { directory } = JSON.parse(await readFile('lib/word-audio.json', 'utf8'));
if (!/^audio\/words-marin-[a-f0-9]{12}$/.test(directory)) throw new Error('Invalid word audio directory');
let manifest;
try { manifest = JSON.parse(await readFile(`public/${directory}/manifest.json`, 'utf8')); }
catch { throw new Error('Word recordings are incomplete. Run npm run audio:words with a valid OPENAI_API_KEY before building or publishing.'); }
if (manifest.clips.length !== words.length) throw new Error('Wrong number of word recordings');
for (const word of words) {
  const clip = manifest.clips.find(clip => clip.word === word);
  if (!clip || !(clip.duration >= .15 && clip.duration <= 8)) throw new Error(`Missing or invalid recording for ${word}`);
  if (!Number.isFinite(clip.meanDb) || !Number.isFinite(clip.peakDb) || clip.meanDb < -50 || clip.peakDb < -35) throw new Error(`Silent or unverified recording for ${word}`);
  const bytes = await readFile(`public/${directory}/${word}.mp3`);
  if (createHash('sha256').update(bytes).digest('hex') !== clip.sha256) throw new Error(`Recording checksum mismatch for ${word}`);
}
console.log(`Verified ${words.length} word recordings and checksums`);
