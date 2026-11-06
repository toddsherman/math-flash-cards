import { mkdir, readFile, writeFile, rename, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const key = process.env.OPENAI_API_KEY;
if (!key) throw new Error('Configure OPENAI_API_KEY in .env.local');
const { words } = JSON.parse(await readFile('lib/sight-words.json', 'utf8'));
const options = {
  model: 'gpt-4o-mini-tts', voice: 'marin', response_format: 'mp3',
  instructions: 'Say only the supplied English word once. Use clear natural American English, like a warm patient teacher helping a child learn to read. No spelling, definitions, introductions, extra words, music or sound effects. A gently unhurried conversational pace with consistent volume. Pronounce read in the present tense, rhyming with seed. Pronounce live as a verb if present. Pronounce contractions naturally, not as separate letters.',
};
// Homophones disambiguate read (present tense) and preserve the final L in you'll.
const pronunciationOverrides = {
 read: {input:'reed'},
 "you'll": {input:'yule'},
 thank: {instructions:`${options.instructions} The word is THANK, pronounced th-ank, rhyming with bank. Use the short A vowel as in cat, not the I vowel in think.`},
 than: {input:'More than enough.',speed:.8,instructions:'Read this phrase clearly in a warm natural American English teacher voice. Speak slowly and clearly, emphasizing the middle word slightly. No extra words.',extractWord:'than'},
};
const revision = createHash('sha256').update(JSON.stringify({options,pronunciationOverrides})).digest('hex').slice(0,12);
const staging = `.audio-generation/words-${revision}`;
const directory = `audio/words-marin-${revision}`;
await mkdir(staging, {recursive:true});
function validate(file) {
 const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file],{encoding:'utf8'}).trim());
 if(!Number.isFinite(duration)||duration<.15||duration>8) throw new Error('Invalid clip duration');
 const decoded=spawnSync('ffmpeg',['-nostdin','-hide_banner','-i',file,'-af','volumedetect','-f','null','-'],{encoding:'utf8'});
 if(decoded.status!==0) throw new Error('Clip failed decoding');
 const meanDb=Number(decoded.stderr.match(/mean_volume: ([\d.-]+) dB/)?.[1]);
 const peakDb=Number(decoded.stderr.match(/max_volume: ([\d.-]+) dB/)?.[1]);
 if(!Number.isFinite(meanDb)||!Number.isFinite(peakDb)||meanDb < -50||peakDb < -35) throw new Error('Clip is silent or too quiet');
 return {duration,meanDb,peakDb};
}
// Context helps the voice articulate "than". Keep only the timestamped target word.
async function extractWord(file, word) {
 const form=new FormData();
 form.append('model','whisper-1');form.append('language','en');
 form.append('response_format','verbose_json');form.append('timestamp_granularities[]','word');
 form.append('file',new Blob([await readFile(file)],{type:'audio/mpeg'}),'phrase.mp3');
 const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${key}`},body:form,signal:AbortSignal.timeout(60000)});
 if(!response.ok) throw new Error(`Word alignment failed: HTTP ${response.status}`);
 const aligned=await response.json();
 const matches=aligned.words?.filter(item=>item.word.toLowerCase().replace(/[^a-z]/g,'')===word) ?? [];
 if(matches.length!==1||!Number.isFinite(matches[0].start)||!Number.isFinite(matches[0].end)||matches[0].end<=matches[0].start) throw new Error('Target word alignment failed');
 execFileSync('ffmpeg',['-nostdin','-v','error','-y','-i',file,'-ss',String(matches[0].start),'-to',String(matches[0].end),'-af','adelay=100:all=1,apad=pad_dur=0.5','-c:a','libmp3lame','-b:a','128k','-f','mp3',`${file}.trimmed`],{stdio:['ignore','ignore','pipe']});
 await rename(`${file}.trimmed`,file);
}
let cursor=0,complete=0, failed=false;
async function worker(){
 while(!failed && cursor<words.length){
  const word=words[cursor++]; const file=`${staging}/${word}.mp3`;
  if(existsSync(file)){
   try{validate(file);complete++;continue;}
   catch{console.log(`Regenerating invalid clip: ${word}`);}
  }
  for(let attempt=0;attempt<4;attempt++){
   try{
    const {extractWord: targetWord,...override}=pronunciationOverrides[word] ?? {};
    const response=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({...options,input:word==='mr'?'mister':word==='i'?'I':word,...override}),signal:AbortSignal.timeout(60000)});
    if(!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.retryable = response.status === 429 || response.status >= 500;
      throw error;
    }
    await writeFile(`${file}.tmp`,Buffer.from(await response.arrayBuffer()));
    if(targetWord) await extractWord(`${file}.tmp`,targetWord);
    validate(`${file}.tmp`);await rename(`${file}.tmp`,file);break;
   }catch(error){
    if(error.retryable === false || attempt===3) { failed=true; throw new Error(`Generation failed for ${word}: ${error.retryable === false ? error.message : error.name}`); }
    await new Promise(r=>setTimeout(r,2000*2**attempt));
   }
  }
  complete++; if(complete%10===0)console.log(`${complete}/${words.length} word clips generated`);
 }
}
await Promise.all([worker(),worker(),worker()]);
await mkdir(`public/${directory}`,{recursive:true});
const clips=[];
for(const word of words){const file=`${staging}/${word}.mp3`; const levels=validate(file);await copyFile(file,`public/${directory}/${word}.mp3`);clips.push({word,...levels,sha256:createHash('sha256').update(await readFile(file)).digest('hex')});}
await writeFile(`public/${directory}/manifest.json`,JSON.stringify({...options,pronunciationOverrides,revision,clips},null,2)+'\n');
await writeFile('lib/word-audio.json',JSON.stringify({directory})+'\n');
console.log(`Exported ${clips.length} validated clips to public/${directory}`);
