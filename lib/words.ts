import collection from './sight-words.json';
export const WORD_GROUPS = collection.groups;
export const ALL_WORDS = collection.words;
export const DEFAULT_WORD_GROUPS = [WORD_GROUPS[0].id];
export function displayWord(word: string) {
  if (word === 'mr') return 'Mr.';
  if (word === 'i' || word.startsWith("i'")) return 'I' + word.slice(1).replaceAll("'", '’');
  return word.replaceAll("'", '’');
}
export function selectedWords(ids: string[]): string[] {
  if (ids.includes('all')) return [...ALL_WORDS];
  const chosen = new Set(ids);
  return WORD_GROUPS.filter(group => chosen.has(group.id)).flatMap(group => group.words);
}
export function validWordGroups(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_WORD_GROUPS];
  if (value.includes('all')) return ['all'];
  const ids = WORD_GROUPS.filter(group => value.includes(group.id)).map(group => group.id);
  return ids.length ? ids : [...DEFAULT_WORD_GROUPS];
}
