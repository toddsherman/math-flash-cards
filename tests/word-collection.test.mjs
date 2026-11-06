import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const data=JSON.parse(readFileSync(new URL('../lib/sight-words.json',import.meta.url)));
test('All 300 ranked CPB entries appear in exactly one practice set',()=>{
 assert.equal(data.words.length,300);
 assert.equal(new Set(data.words).size,300);
 const grouped=data.groups.flatMap(g=>g.words);
 assert.equal(grouped.length,300);
 assert.deepEqual([...grouped].sort(),[...data.words].sort());
 assert.equal(new Set(data.groups.map(g=>g.id)).size,data.groups.length);
 for(const group of data.groups){assert(group.words.length>=7&&group.words.length<=12,group.label);assert(group.note);}
});
test('Stable word IDs work as safe filenames; first set is short-vowel practice',()=>{
 for(const word of data.words) assert(/^[a-z]+('[a-z]+)?$/.test(word),word);
 assert.deepEqual(data.groups[0].words,['at','in','it','on','up','am','an','if']);
 assert.deepEqual(data.words.slice(0,5),['the','and','a','to','i']);
 assert.equal(data.words.at(-1),'fast');
});
