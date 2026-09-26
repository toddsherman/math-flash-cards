export const RANGES = [
  { id: "0-10", label: "0–10", numbers: Array.from({ length: 11 }, (_, i) => i) },
  { id: "10-20", label: "10–20", numbers: Array.from({ length: 11 }, (_, i) => i + 10) },
  { id: "10-30", label: "10–30", numbers: Array.from({ length: 21 }, (_, i) => i + 10) },
  { id: "20-30", label: "20–30", numbers: Array.from({ length: 11 }, (_, i) => i + 20) },
  { id: "0-100", label: "0–100", numbers: Array.from({ length: 101 }, (_, i) => i) },
  { id: "10-100", label: "10–100", numbers: Array.from({ length: 91 }, (_, i) => i + 10) },
  { id: "fives", label: "5–100 (by 5s)", description: "5, 10, 15 … 100", numbers: Array.from({ length: 20 }, (_, i) => (i + 1) * 5) },
  { id: "tens", label: "Only 10s", description: "10, 20, 30 … 100", numbers: Array.from({ length: 10 }, (_, i) => (i + 1) * 10) },
  { id: "teens-and-tens", label: "Teens & tens", description: "In order: 13, 30, 31 … 19, 90, 91", ordered: true, numbers: [13, 30, 31, 14, 40, 41, 15, 50, 51, 16, 60, 61, 17, 70, 71, 18, 80, 81, 19, 90, 91] },
];
export const DEFAULT_RANGE = RANGES.find(range => range.id === "10-20")!;

const small = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
export function numberWord(n: number): string {
  if (n < 20) return small[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? `-${small[n % 10]}` : "");
  if (n < 1000) return `${small[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberWord(n % 100)}` : ""}`;
  return String(n);
}
export function shuffled(values: number[]): number[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
