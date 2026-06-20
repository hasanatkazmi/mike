import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchBuffer, type FetchOptions } from "../http";
import { extractPdfText } from "../../chatTools";
import { ingestCase, type CaseRecord } from "../pipeline";
import { ocrPdf, containsUrdu } from "../ocr";
import type { EmbedOptions } from "../../legalSourcesTools/pakistanEmbeddings";

/**
 * Judgment ingestion for the Pakistan case-law corpus.
 *
 * Source judgments are typically published as PDFs on court websites (Supreme
 * Court, the High Courts, the Federal Shariat Court). This module fetches a
 * judgment PDF, extracts its text, and ingests it.
 *
 * Many Pakistani judgments — especially older ones and lower-court orders — are
 * scanned image PDFs with no embedded text. extractPdfText returns empty for
 * those; OCR (including Urdu) is handled in Workstream D and will be plugged in
 * here as a fallback. For now, importJudgmentFromText lets callers supply text
 * obtained by any means (digital extraction, OCR, or a licensed feed).
 */

type Db = SupabaseClient;

export interface JudgmentMeta extends CaseRecord {
  /** Reporter citations for this judgment, e.g. ["PLD 2019 SC 318"]. */
  citations?: string[];
}

/**
 * Ingest a judgment from already-extracted text.
 */
export async function importJudgmentFromText(params: {
  db: Db;
  meta: JudgmentMeta;
  fullText: string;
  apiKeys?: EmbedOptions["apiKeys"];
}): Promise<{ case_id: string; chunk_count: number; citation_count: number }> {
  const { db, meta, fullText, apiKeys } = params;
  const { citations = [], ...caseRecord } = meta;
  return ingestCase({ db, caseRecord, citations, fullText, apiKeys });
}

/**
 * Fetch a judgment PDF by URL, extract its text, and ingest it. Returns the
 * result plus the extracted character count so callers can detect scanned PDFs
 * (charCount === 0 means OCR is required).
 */
export async function importJudgmentFromPdf(params: {
  db: Db;
  url: string;
  meta: JudgmentMeta;
  apiKeys?: EmbedOptions["apiKeys"];
  fetchOptions?: FetchOptions;
  /** When true (default), scanned/empty PDFs are transcribed with OCR. */
  ocr?: boolean;
}): Promise<{
  case_id: string | null;
  chunk_count: number;
  citation_count: number;
  char_count: number;
  needs_ocr: boolean;
  used_ocr: boolean;
}> {
  const { db, url, meta, apiKeys, fetchOptions } = params;
  const ocrEnabled = params.ocr !== false;

  const buffer = await fetchBuffer(url, fetchOptions);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
  let text = await extractPdfText(arrayBuffer);
  let charCount = text.trim().length;
  let usedOcr = false;
  let language = meta.language;

  if (charCount === 0) {
    if (!ocrEnabled) {
      // Scanned PDF and OCR disabled: do not insert an empty case.
      return {
        case_id: null,
        chunk_count: 0,
        citation_count: 0,
        char_count: 0,
        needs_ocr: true,
        used_ocr: false,
      };
    }
    // Scanned/Urdu PDF: transcribe with OCR (handles English and Urdu).
    const ocrResult = await ocrPdf(buffer, { apiKeys });
    text = ocrResult.text;
    charCount = text.trim().length;
    usedOcr = true;
    language = language ?? ocrResult.language;
    if (charCount === 0) {
      return {
        case_id: null,
        chunk_count: 0,
        citation_count: 0,
        char_count: 0,
        needs_ocr: true,
        used_ocr: true,
      };
    }
  }

  // Tag Urdu judgments so the corpus records the language even for digital PDFs.
  if (!language) language = containsUrdu(text) ? "ur" : "en";

  const result = await importJudgmentFromText({
    db,
    meta: { ...meta, language, source_url: meta.source_url ?? url },
    fullText: text,
    apiKeys,
  });
  return {
    ...result,
    char_count: charCount,
    needs_ocr: false,
    used_ocr: usedOcr,
  };
}
