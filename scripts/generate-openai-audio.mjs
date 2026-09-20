import { mkdir, readFile, writeFile, rename, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { numberWord } from '../lib/numbers.ts';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error('Missing OPENAI_API_KEY. Add it to .env.local or the process environment; never commit it.');
  process.exit(1);
}
const options = {
  model: 'gpt-4o-mini-tts',
  voice: 'marin',
  response_format: 'mp3',
  instructions: 'Say only the supplied number, once, in natural American English. Sound like a warm, patient teacher helping a child learn numbers. Use a clear, gently unhurried conversational pace. Keep a consistent voice and volume. No introduction, extra words, music, or sound effects.',
};
const revision = createHash('sha256').update(JSON.stringify(options)).digest('hex').slice(0, 12);
const staging = `.audio-generation/${revision}`;
const destination = `public/audio/openai-marin-${revision}`;
await mkdir(staging, { recursive: true });

function validate(file) {
  const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], { encoding: 'utf8' }).trim());
  if (!Number.isFinite(duration) || duration < 0.15 || duration > 12) throw new Error(`Unexpected audio duration in ${file}`);
  execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-i', file, '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] });
  return duration;
}
// Resume completed clips after interruptions; never mistake existing Samantha clips for OpenAI output.
for (let n = 0; n <= 100; n++) {
  const file = `${staging}/${n}.mp3`;
  if (existsSync(file)) { validate(file); continue; }
  let success = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...options, input: numberWord(n) }),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      // Do not print server bodies or headers, which may contain credential details.
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 2000 * (2 ** attempt)));
        continue;
      }
      throw new Error(`Speech generation for ${n} failed (HTTP ${response.status}). Check API access, billing, and rate limits.`);
    }
    const temporary = `${file}.tmp`;
    await writeFile(temporary, Buffer.from(await response.arrayBuffer()));
    validate(temporary);
    await rename(temporary, file);
    console.log(`Generated ${n}: ${numberWord(n)} (${n + 1}/101)`);
    success = true;
    break;
  }
  if (!success) throw new Error(`Unable to generate ${n}`);
}
// Export only a complete set. A versioned URL prevents iPhone caches replaying the old voice.
await mkdir(destination, { recursive: true });
const clips = [];
for (let n = 0; n <= 100; n++) {
  const source = `${staging}/${n}.mp3`;
  const duration = validate(source);
  await copyFile(source, `${destination}/${n}.mp3`);
  const sha256 = createHash('sha256').update(await readFile(source)).digest('hex');
  clips.push({ number: n, text: numberWord(n), duration, sha256 });
}
await writeFile(`${destination}/manifest.json`, JSON.stringify({ ...options, revision, clips }, null, 2)+'\n');
console.log(`All 101 clips verified. Ready for listening review at /math/audio/openai-marin-${revision}/<number>.mp3`);
console.log('After review, update the audio src in app/page.tsx to this versioned directory before deployment.');
