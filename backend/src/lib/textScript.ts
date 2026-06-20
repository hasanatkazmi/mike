/**
 * Script detection helpers shared across OCR, ingestion, and docx generation.
 */

// Arabic block + Arabic Supplement + Arabic Presentation Forms-A/B, which cover
// the Urdu script.
const URDU_RANGE = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

/** True if the text contains any Urdu/Arabic-script characters. */
export function containsUrdu(text: string): boolean {
  return URDU_RANGE.test(text);
}

/** Recommended docx font for Urdu (Nastaliq) text. */
export const URDU_FONT = "Noto Nastaliq Urdu";
