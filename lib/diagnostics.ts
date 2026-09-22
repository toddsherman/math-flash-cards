export type DiagnosticEntry = { id: number; time: string; message: string };
let entries: DiagnosticEntry[] = [];
let sequence = 0;
const listeners = new Set<(entries: DiagnosticEntry[]) => void>();

// Bounded, in-memory only. No analytics endpoint or persistent storage.
export function recordDiagnostic(message: string) {
  if (typeof window === "undefined") return;
  entries = [...entries.slice(-99), { id: ++sequence, time: new Date().toISOString().slice(11, 23), message }];
  console.debug("[math diagnostics]", message);
  listeners.forEach(listener => listener(entries));
}
export function subscribeDiagnostics(listener: (entries: DiagnosticEntry[]) => void) {
  listeners.add(listener);
  listener(entries);
  return () => { listeners.delete(listener); };
}
export function diagnosticsText() { return entries.map(entry => `${entry.time} ${entry.message}`).join("\n"); }
