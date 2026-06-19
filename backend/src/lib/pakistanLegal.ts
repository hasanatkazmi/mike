import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText, toPgVector } from "./legalSourcesTools/pakistanEmbeddings";
import { parsePkCitations } from "./legalSourcesTools/pakistanCitations";

/**
 * Data-access layer for Pakistani legal research. Backed by the pk_* corpus
 * tables (see backend/oss-migrations/20260619_pakistan_legal_corpus.sql).
 *
 * Case-law retrieval is semantic (pgvector) rather than exact reporter lookup,
 * because the open corpus is built from public judgments and will have gaps.
 * Citation verification is exact, against whatever has been ingested into
 * pk_case_citations; unmatched citations are reported as unverified rather than
 * silently dropped, so the assistant never implies a case exists when it cannot
 * be confirmed.
 */

type Db = SupabaseClient;

export interface PkApiKeys {
  gemini?: string | null;
  openai?: string | null;
}

export interface PkCaseMeta {
  case_id: string;
  case_name: string;
  court: string;
  bench: string | null;
  judges: string[];
  date_decided: string | null;
  case_number: string | null;
  source_url: string | null;
  language: string;
  citations: string[];
}

export interface PkCaseLawSearchResult extends PkCaseMeta {
  /** Best matching snippet for this case from the semantic search. */
  snippet: string;
  similarity: number;
}

// Human-readable court names for prose and panels.
export const PK_COURT_LABELS: Record<string, string> = {
  SC: "Supreme Court of Pakistan",
  LHC: "Lahore High Court",
  SHC: "Sindh High Court",
  PHC: "Peshawar High Court",
  BHC: "Balochistan High Court",
  IHC: "Islamabad High Court",
  FSC: "Federal Shariat Court",
  banking: "Banking Court",
  atc: "Anti-Terrorism Court",
  itat: "Appellate Tribunal Inland Revenue",
  service: "Service Tribunal",
};

export function courtLabel(court: string): string {
  return PK_COURT_LABELS[court] ?? court;
}

async function loadCaseMeta(
  db: Db,
  caseIds: string[],
): Promise<Map<string, PkCaseMeta>> {
  const result = new Map<string, PkCaseMeta>();
  if (caseIds.length === 0) return result;

  const { data: cases, error } = await db
    .from("pk_cases")
    .select(
      "id, case_name, court, bench, judges, date_decided, case_number, source_url, language",
    )
    .in("id", caseIds);
  if (error) throw new Error(`pk_cases lookup failed: ${error.message}`);

  const { data: cites } = await db
    .from("pk_case_citations")
    .select("case_id, raw")
    .in("case_id", caseIds);

  const citesByCase = new Map<string, string[]>();
  for (const row of cites ?? []) {
    const list = citesByCase.get(row.case_id) ?? [];
    list.push(row.raw);
    citesByCase.set(row.case_id, list);
  }

  for (const c of cases ?? []) {
    result.set(c.id, {
      case_id: c.id,
      case_name: c.case_name,
      court: c.court,
      bench: c.bench ?? null,
      judges: Array.isArray(c.judges) ? c.judges : [],
      date_decided: c.date_decided ?? null,
      case_number: c.case_number ?? null,
      source_url: c.source_url ?? null,
      language: c.language ?? "en",
      citations: citesByCase.get(c.id) ?? [],
    });
  }
  return result;
}

/**
 * Semantic case-law search. Embeds the query, finds the closest opinion chunks,
 * then groups them by case and returns case metadata with the best snippet.
 */
export async function searchPakistanCaseLaw(params: {
  db: Db;
  query: string;
  court?: string | null;
  limit?: number;
  apiKeys?: PkApiKeys;
}): Promise<PkCaseLawSearchResult[]> {
  const { db, query, court, apiKeys } = params;
  const limit = Math.min(Math.max(params.limit ?? 8, 1), 25);

  const embedding = await embedText(query, { apiKeys, kind: "query" });
  // Over-fetch chunks so grouping by case still yields enough distinct cases.
  const { data, error } = await db.rpc("pk_match_case_chunks", {
    query_embedding: toPgVector(embedding),
    match_count: limit * 4,
    filter_court: court ?? null,
  });
  if (error) throw new Error(`pk_match_case_chunks failed: ${error.message}`);

  const rows = (data ?? []) as {
    case_id: string;
    text: string;
    similarity: number;
  }[];

  // Keep the best chunk per case, preserving similarity order.
  const bestByCase = new Map<string, { text: string; similarity: number }>();
  for (const row of rows) {
    const existing = bestByCase.get(row.case_id);
    if (!existing || row.similarity > existing.similarity) {
      bestByCase.set(row.case_id, {
        text: row.text,
        similarity: row.similarity,
      });
    }
  }

  const orderedCaseIds = [...bestByCase.entries()]
    .sort((a, b) => b[1].similarity - a[1].similarity)
    .slice(0, limit)
    .map(([caseId]) => caseId);

  const meta = await loadCaseMeta(db, orderedCaseIds);
  const results: PkCaseLawSearchResult[] = [];
  for (const caseId of orderedCaseIds) {
    const m = meta.get(caseId);
    const best = bestByCase.get(caseId);
    if (!m || !best) continue;
    results.push({
      ...m,
      snippet: best.text.slice(0, 400),
      similarity: best.similarity,
    });
  }
  return results;
}

/**
 * Fetch metadata for one or more cases by id, including reporter citations and
 * chunk counts. Does not return full opinion text.
 */
export async function getPakistanCases(params: {
  db: Db;
  caseIds: string[];
}): Promise<(PkCaseMeta & { chunk_count: number })[]> {
  const { db, caseIds } = params;
  const meta = await loadCaseMeta(db, caseIds);

  const counts = new Map<string, number>();
  if (caseIds.length > 0) {
    const { data } = await db
      .from("pk_case_chunks")
      .select("case_id")
      .in("case_id", caseIds);
    for (const row of data ?? []) {
      counts.set(row.case_id, (counts.get(row.case_id) ?? 0) + 1);
    }
  }

  return caseIds
    .map((id) => meta.get(id))
    .filter((m): m is PkCaseMeta => Boolean(m))
    .map((m) => ({ ...m, chunk_count: counts.get(m.case_id) ?? 0 }));
}

export interface PkCaseMatch {
  chunk_index: number;
  page: number | null;
  context: string;
}

/**
 * Keyword search within a single already-known case. Matches are case- and
 * whitespace-insensitive, returned with surrounding context.
 */
export async function findInPakistanCase(params: {
  db: Db;
  caseId: string;
  query: string;
  maxResults?: number;
  contextChars?: number;
}): Promise<{ case_name: string | null; matches: PkCaseMatch[] }> {
  const { db, caseId, query } = params;
  const maxResults = Math.min(Math.max(params.maxResults ?? 20, 1), 50);
  const contextChars = Math.min(Math.max(params.contextChars ?? 160, 20), 600);

  const { data: chunks, error } = await db
    .from("pk_case_chunks")
    .select("chunk_index, page, text")
    .eq("case_id", caseId)
    .order("chunk_index", { ascending: true });
  if (error) throw new Error(`pk_case_chunks lookup failed: ${error.message}`);

  const { data: caseRow } = await db
    .from("pk_cases")
    .select("case_name")
    .eq("id", caseId)
    .maybeSingle();

  const needle = query.trim().toLowerCase().replace(/\s+/g, " ");
  const matches: PkCaseMatch[] = [];
  for (const chunk of chunks ?? []) {
    const haystack = String(chunk.text);
    const normalizedHay = haystack.toLowerCase().replace(/\s+/g, " ");
    let from = 0;
    while (matches.length < maxResults) {
      const idx = normalizedHay.indexOf(needle, from);
      if (idx === -1) break;
      const start = Math.max(0, idx - contextChars);
      const end = Math.min(haystack.length, idx + needle.length + contextChars);
      matches.push({
        chunk_index: chunk.chunk_index,
        page: chunk.page ?? null,
        context: haystack.slice(start, end).trim(),
      });
      from = idx + needle.length;
    }
    if (matches.length >= maxResults) break;
  }

  return { case_name: caseRow?.case_name ?? null, matches };
}

/**
 * Read selected opinion text for a case. Returns concatenated chunk text up to
 * maxChars, optionally restricted to a range of chunk indices.
 */
export async function readPakistanCase(params: {
  db: Db;
  caseId: string;
  fromChunk?: number;
  toChunk?: number;
  maxChars?: number;
}): Promise<{ case_name: string | null; text: string; truncated: boolean }> {
  const { db, caseId } = params;
  const maxChars = Math.min(Math.max(params.maxChars ?? 30000, 1000), 80000);

  let q = db
    .from("pk_case_chunks")
    .select("chunk_index, text")
    .eq("case_id", caseId)
    .order("chunk_index", { ascending: true });
  if (typeof params.fromChunk === "number") q = q.gte("chunk_index", params.fromChunk);
  if (typeof params.toChunk === "number") q = q.lte("chunk_index", params.toChunk);

  const { data: chunks, error } = await q;
  if (error) throw new Error(`pk_case_chunks read failed: ${error.message}`);

  const { data: caseRow } = await db
    .from("pk_cases")
    .select("case_name")
    .eq("id", caseId)
    .maybeSingle();

  let text = "";
  let truncated = false;
  for (const chunk of chunks ?? []) {
    if (text.length + chunk.text.length > maxChars) {
      text += chunk.text.slice(0, maxChars - text.length);
      truncated = true;
      break;
    }
    text += (text ? "\n\n" : "") + chunk.text;
  }

  return { case_name: caseRow?.case_name ?? null, text, truncated };
}

export interface PkCitationVerification {
  input: string;
  matched: boolean;
  case_id: string | null;
  case_name: string | null;
  court: string | null;
  citations: string[];
}

/**
 * Verify reporter citations against the corpus. Each input is parsed and looked
 * up by its normalized key. Unrecognised or unmatched citations are returned
 * with matched=false rather than dropped.
 */
export async function verifyPakistanCitations(params: {
  db: Db;
  citations: string[];
}): Promise<PkCitationVerification[]> {
  const { db, citations } = params;
  const out: PkCitationVerification[] = [];

  const parsed = parsePkCitations(citations);
  const normalizedByInput = new Map<string, string>();
  for (let i = 0; i < citations.length; i++) {
    const p = parsePkCitations([citations[i]])[0];
    if (p) normalizedByInput.set(citations[i], p.normalized);
  }

  const normalizedKeys = [...new Set(parsed.map((p) => p.normalized))];
  const caseByNormalized = new Map<string, string>();
  if (normalizedKeys.length > 0) {
    const { data } = await db
      .from("pk_case_citations")
      .select("case_id, normalized")
      .in("normalized", normalizedKeys);
    for (const row of data ?? []) {
      caseByNormalized.set(row.normalized, row.case_id);
    }
  }

  const caseIds = [...new Set([...caseByNormalized.values()])];
  const meta = await loadCaseMeta(db, caseIds);

  for (const input of citations) {
    const normalized = normalizedByInput.get(input) ?? null;
    const caseId = normalized ? caseByNormalized.get(normalized) ?? null : null;
    const m = caseId ? meta.get(caseId) : null;
    out.push({
      input,
      matched: Boolean(m),
      case_id: caseId,
      case_name: m?.case_name ?? null,
      court: m?.court ?? null,
      citations: m?.citations ?? [],
    });
  }
  return out;
}

export interface PkStatuteResult {
  section_id: string;
  statute_id: string;
  statute_title: string;
  section_number: string | null;
  heading: string | null;
  text: string;
  similarity: number;
}

/**
 * Semantic search over statute sections (legislation).
 */
export async function searchPakistanStatutes(params: {
  db: Db;
  query: string;
  jurisdiction?: string | null;
  limit?: number;
  apiKeys?: PkApiKeys;
}): Promise<PkStatuteResult[]> {
  const { db, query, jurisdiction, apiKeys } = params;
  const limit = Math.min(Math.max(params.limit ?? 8, 1), 25);

  const embedding = await embedText(query, { apiKeys, kind: "query" });
  const { data, error } = await db.rpc("pk_match_statute_sections", {
    query_embedding: toPgVector(embedding),
    match_count: limit,
    filter_jurisdiction: jurisdiction ?? null,
  });
  if (error) throw new Error(`pk_match_statute_sections failed: ${error.message}`);

  const rows = (data ?? []) as {
    section_id: string;
    statute_id: string;
    section_number: string | null;
    heading: string | null;
    text: string;
    similarity: number;
  }[];

  const statuteIds = [...new Set(rows.map((r) => r.statute_id))];
  const titles = new Map<string, string>();
  if (statuteIds.length > 0) {
    const { data: statutes } = await db
      .from("pk_statutes")
      .select("id, title")
      .in("id", statuteIds);
    for (const s of statutes ?? []) titles.set(s.id, s.title);
  }

  return rows.map((r) => ({
    section_id: r.section_id,
    statute_id: r.statute_id,
    statute_title: titles.get(r.statute_id) ?? "Unknown statute",
    section_number: r.section_number,
    heading: r.heading,
    text: r.text,
    similarity: r.similarity,
  }));
}

/**
 * Read a statute's sections (full text), optionally a single section.
 */
export async function readPakistanStatute(params: {
  db: Db;
  statuteId: string;
  sectionNumber?: string | null;
  maxChars?: number;
}): Promise<{
  title: string | null;
  sections: { section_number: string | null; heading: string | null; text: string }[];
  truncated: boolean;
}> {
  const { db, statuteId } = params;
  const maxChars = Math.min(Math.max(params.maxChars ?? 30000, 1000), 80000);

  const { data: statute } = await db
    .from("pk_statutes")
    .select("title")
    .eq("id", statuteId)
    .maybeSingle();

  let q = db
    .from("pk_statute_sections")
    .select("section_number, heading, text, ordinal")
    .eq("statute_id", statuteId)
    .order("ordinal", { ascending: true });
  if (params.sectionNumber) q = q.eq("section_number", params.sectionNumber);

  const { data: rows, error } = await q;
  if (error) throw new Error(`pk_statute_sections read failed: ${error.message}`);

  const sections: { section_number: string | null; heading: string | null; text: string }[] = [];
  let used = 0;
  let truncated = false;
  for (const row of rows ?? []) {
    if (used + row.text.length > maxChars) {
      sections.push({
        section_number: row.section_number ?? null,
        heading: row.heading ?? null,
        text: row.text.slice(0, maxChars - used),
      });
      truncated = true;
      break;
    }
    sections.push({
      section_number: row.section_number ?? null,
      heading: row.heading ?? null,
      text: row.text,
    });
    used += row.text.length;
  }

  return { title: statute?.title ?? null, sections, truncated };
}
