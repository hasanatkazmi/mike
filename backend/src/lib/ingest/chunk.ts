/**
 * Text chunking for the Pakistan legal corpus. Splits long judgment or statute
 * text into overlapping chunks sized for embedding, preferring to break on
 * paragraph and sentence boundaries so chunks stay semantically coherent.
 */

export interface ChunkOptions {
  /** Target maximum characters per chunk. */
  maxChars?: number;
  /** Characters of overlap carried from the end of one chunk into the next. */
  overlapChars?: number;
}

const DEFAULT_MAX = 1800;
const DEFAULT_OVERLAP = 200;

// Non-breaking space and related characters common in HTML/OCR text.
const ODD_SPACES = /[   \t]/g;

function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function splitSentences(text: string): string[] {
  // Coarse sentence split; good enough for chunk packing.
  const parts = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g);
  return parts ? parts.map((s) => s.trim()).filter(Boolean) : [text];
}

function tail(text: string, n: number): string {
  if (n <= 0) return "";
  return text.length <= n ? text : text.slice(text.length - n);
}

/**
 * Chunk text into overlapping segments. Paragraphs are kept together when they
 * fit; oversized paragraphs are split on sentence boundaries, and any remaining
 * over-long sentence is hard-split.
 */
export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const maxChars = Math.max(opts.maxChars ?? DEFAULT_MAX, 200);
  const overlap = Math.min(
    Math.max(opts.overlapChars ?? DEFAULT_OVERLAP, 0),
    maxChars - 1,
  );

  const clean = text.replace(ODD_SPACES, " ").trim();
  if (!clean) return [];

  const units: string[] = [];
  for (const para of splitParagraphs(clean)) {
    if (para.length <= maxChars) {
      units.push(para);
      continue;
    }
    for (const sentence of splitSentences(para)) {
      if (sentence.length <= maxChars) {
        units.push(sentence);
      } else {
        // Hard-split an over-long sentence.
        for (let i = 0; i < sentence.length; i += maxChars) {
          units.push(sentence.slice(i, i + maxChars));
        }
      }
    }
  }

  const chunks: string[] = [];
  let current = "";
  for (const unit of units) {
    if (!current) {
      current = unit;
    } else if (current.length + 2 + unit.length <= maxChars) {
      current += "\n\n" + unit;
    } else {
      chunks.push(current);
      const carry = overlap > 0 ? tail(current, overlap) : "";
      current = carry ? `${carry}\n\n${unit}` : unit;
    }
  }
  if (current) chunks.push(current);

  return chunks;
}
