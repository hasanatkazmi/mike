import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkText } from "./chunk";
import {
  embedTexts,
  toPgVector,
  type EmbedOptions,
} from "../legalSourcesTools/pakistanEmbeddings";
import { parsePkCitation } from "../legalSourcesTools/pakistanCitations";

/**
 * Ingestion pipeline for the Pakistan legal corpus. Takes parsed statute or
 * judgment records, chunks and embeds the text, and upserts into the pk_* tables.
 *
 * Embedding is batched. Vectors are written as pgvector string literals, which
 * PostgREST accepts for a vector column.
 */

type Db = SupabaseClient;

const EMBED_BATCH = 64;

async function embedInBatches(
  texts: string[],
  opts: EmbedOptions,
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    out.push(...(await embedTexts(batch, { ...opts, kind: "document" })));
  }
  return out;
}

export interface StatuteRecord {
  title: string;
  short_title?: string | null;
  act_number?: string | null;
  year?: number | null;
  jurisdiction?: string;
  category?: string | null;
  source_url?: string | null;
  enacted_on?: string | null;
  status?: string;
}

export interface StatuteSectionInput {
  section_number?: string | null;
  heading?: string | null;
  chapter?: string | null;
  text: string;
}

/**
 * Ingest a statute and its sections. Returns the new statute id.
 */
export async function ingestStatute(params: {
  db: Db;
  statute: StatuteRecord;
  sections: StatuteSectionInput[];
  apiKeys?: EmbedOptions["apiKeys"];
}): Promise<{ statute_id: string; section_count: number }> {
  const { db, statute, sections, apiKeys } = params;

  const { data: inserted, error } = await db
    .from("pk_statutes")
    .insert({
      title: statute.title,
      short_title: statute.short_title ?? null,
      act_number: statute.act_number ?? null,
      year: statute.year ?? null,
      jurisdiction: statute.jurisdiction ?? "federal",
      category: statute.category ?? null,
      source_url: statute.source_url ?? null,
      enacted_on: statute.enacted_on ?? null,
      status: statute.status ?? "in_force",
    })
    .select("id")
    .single();
  if (error) throw new Error(`pk_statutes insert failed: ${error.message}`);
  const statuteId = inserted.id as string;

  const valid = sections.filter((s) => s.text && s.text.trim());
  if (valid.length === 0) return { statute_id: statuteId, section_count: 0 };

  const embedInputs = valid.map((s) =>
    [s.section_number, s.heading, s.text].filter(Boolean).join(" — "),
  );
  const embeddings = await embedInBatches(embedInputs, { apiKeys });

  const rows = valid.map((s, i) => ({
    statute_id: statuteId,
    section_number: s.section_number ?? null,
    heading: s.heading ?? null,
    chapter: s.chapter ?? null,
    text: s.text.trim(),
    ordinal: i,
    embedding: toPgVector(embeddings[i]),
  }));

  const { error: secErr } = await db.from("pk_statute_sections").insert(rows);
  if (secErr)
    throw new Error(`pk_statute_sections insert failed: ${secErr.message}`);

  return { statute_id: statuteId, section_count: rows.length };
}

export interface CaseRecord {
  case_name: string;
  court: string;
  bench?: string | null;
  judges?: string[];
  date_decided?: string | null;
  case_number?: string | null;
  source_url?: string | null;
  pdf_storage_key?: string | null;
  language?: string;
  summary?: string | null;
}

/**
 * Ingest a judgment: case metadata, parsed reporter citations, and chunked +
 * embedded opinion text. Returns the new case id.
 */
export async function ingestCase(params: {
  db: Db;
  caseRecord: CaseRecord;
  citations: string[];
  fullText: string;
  apiKeys?: EmbedOptions["apiKeys"];
  chunkMaxChars?: number;
}): Promise<{ case_id: string; chunk_count: number; citation_count: number }> {
  const { db, caseRecord, citations, fullText, apiKeys } = params;

  const { data: inserted, error } = await db
    .from("pk_cases")
    .insert({
      case_name: caseRecord.case_name,
      court: caseRecord.court,
      bench: caseRecord.bench ?? null,
      judges: caseRecord.judges ?? [],
      date_decided: caseRecord.date_decided ?? null,
      case_number: caseRecord.case_number ?? null,
      source_url: caseRecord.source_url ?? null,
      pdf_storage_key: caseRecord.pdf_storage_key ?? null,
      language: caseRecord.language ?? "en",
      summary: caseRecord.summary ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`pk_cases insert failed: ${error.message}`);
  const caseId = inserted.id as string;

  // Citations: parse, normalise, and upsert (ignore duplicates by normalized).
  let citationCount = 0;
  const citationRows = citations
    .map((c) => parsePkCitation(c))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({
      case_id: caseId,
      reporter: p.reporter,
      year: p.year,
      court_or_volume: p.courtOrVolume,
      page: p.page,
      raw: p.raw,
      normalized: p.normalized,
    }));
  if (citationRows.length > 0) {
    const { error: citErr } = await db
      .from("pk_case_citations")
      .upsert(citationRows, { onConflict: "normalized", ignoreDuplicates: true });
    if (citErr)
      throw new Error(`pk_case_citations upsert failed: ${citErr.message}`);
    citationCount = citationRows.length;
  }

  // Opinion text: chunk + embed.
  const chunks = chunkText(fullText, { maxChars: params.chunkMaxChars });
  if (chunks.length === 0)
    return { case_id: caseId, chunk_count: 0, citation_count: citationCount };

  const embeddings = await embedInBatches(chunks, { apiKeys });
  const chunkRows = chunks.map((text, i) => ({
    case_id: caseId,
    chunk_index: i,
    text,
    page: null,
    embedding: toPgVector(embeddings[i]),
  }));

  const { error: chunkErr } = await db.from("pk_case_chunks").insert(chunkRows);
  if (chunkErr)
    throw new Error(`pk_case_chunks insert failed: ${chunkErr.message}`);

  return {
    case_id: caseId,
    chunk_count: chunkRows.length,
    citation_count: citationCount,
  };
}
