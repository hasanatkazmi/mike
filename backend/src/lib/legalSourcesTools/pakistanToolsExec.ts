import type { SupabaseClient } from "@supabase/supabase-js";
import {
  searchPakistanCaseLaw,
  getPakistanCases,
  findInPakistanCase,
  readPakistanCase,
  verifyPakistanCitations,
  searchPakistanStatutes,
  readPakistanStatute,
  courtLabel,
  type PkApiKeys,
} from "../pakistanLegal";
import {
  PAKISTAN_TOOL_NAMES,
  type PakistanToolEvent,
  type PkCaseCitationEvent,
} from "./pakistanTools";

/**
 * Self-contained executor for the pk_* research tools. Kept separate from the
 * large chatTools dispatch so the Pakistani research path is easy to read and
 * test in isolation. Each call returns the tool_result message plus any
 * activity/citation events to stream to the frontend.
 */

export interface PkToolCall {
  id: string;
  args: Record<string, unknown>;
  name: string;
}

export interface PkToolExecResult {
  toolResult: { role: "tool"; tool_call_id: string; content: string };
  events: PakistanToolEvent[];
  caseCitations: PkCaseCitationEvent[];
}

type Write = (chunk: string) => void;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toolResult(
  id: string,
  content: unknown,
): { role: "tool"; tool_call_id: string; content: string } {
  return {
    role: "tool",
    tool_call_id: id,
    content: typeof content === "string" ? content : JSON.stringify(content),
  };
}

/** True for any tool name handled by this executor. */
export function isPakistanTool(name: string): boolean {
  return (Object.values(PAKISTAN_TOOL_NAMES) as string[]).includes(name);
}

export async function executePakistanTool(params: {
  call: PkToolCall;
  db: SupabaseClient;
  write: Write;
  apiKeys?: PkApiKeys;
}): Promise<PkToolExecResult> {
  const { call, db, write, apiKeys } = params;
  const { id, name, args } = call;
  const events: PakistanToolEvent[] = [];
  const caseCitations: PkCaseCitationEvent[] = [];

  const emit = (event: PakistanToolEvent) => {
    write(`data: ${JSON.stringify(event)}\n\n`);
    events.push(event);
  };

  try {
    switch (name) {
      case PAKISTAN_TOOL_NAMES.searchCaseLaw: {
        const query = str(args.query) ?? "";
        write(
          `data: ${JSON.stringify({ type: "pk_search_case_law_start", query })}\n\n`,
        );
        const results = await searchPakistanCaseLaw({
          db,
          query,
          court: str(args.court) ?? null,
          limit: num(args.limit),
          apiKeys,
        });
        emit({
          type: "pk_search_case_law",
          query,
          result_count: results.length,
        });
        return {
          toolResult: toolResult(id, {
            ok: true,
            result_count: results.length,
            results: results.map((r) => ({
              case_id: r.case_id,
              case_name: r.case_name,
              court: courtLabel(r.court),
              citation: r.citations[0] ?? null,
              date_decided: r.date_decided,
              snippet: r.snippet,
            })),
            next_required_action:
              "Use pk_find_in_case (short 1-3 word probes) or pk_read_case to obtain cite-worthy text before citing any case.",
          }),
          events,
          caseCitations,
        };
      }

      case PAKISTAN_TOOL_NAMES.getCases: {
        const caseIds = Array.isArray(args.case_ids)
          ? args.case_ids.filter((v): v is string => typeof v === "string")
          : [];
        write(
          `data: ${JSON.stringify({ type: "pk_get_cases_start", case_ids: caseIds })}\n\n`,
        );
        const cases = await getPakistanCases({ db, caseIds });
        emit({
          type: "pk_get_cases",
          case_ids: caseIds,
          case_count: cases.length,
          cases: cases.map((c) => ({
            case_id: c.case_id,
            case_name: c.case_name,
            court: courtLabel(c.court),
            citation: c.citations[0] ?? null,
            date_decided: c.date_decided,
          })),
        });
        return {
          toolResult: toolResult(id, {
            ok: true,
            case_count: cases.length,
            cases: cases.map((c) => ({
              case_id: c.case_id,
              case_name: c.case_name,
              court: courtLabel(c.court),
              judges: c.judges,
              date_decided: c.date_decided,
              case_number: c.case_number,
              citations: c.citations,
              chunk_count: c.chunk_count,
            })),
            next_required_action:
              "Opinion text is not included. Use pk_find_in_case for passages or pk_read_case for fuller context.",
          }),
          events,
          caseCitations,
        };
      }

      case PAKISTAN_TOOL_NAMES.findInCase: {
        const caseId = str(args.case_id) ?? "";
        const query = str(args.query) ?? "";
        const { case_name, matches } = await findInPakistanCase({
          db,
          caseId,
          query,
          maxResults: num(args.max_results),
          contextChars: num(args.context_chars),
        });
        emit({
          type: "pk_find_in_case",
          case_id: caseId || null,
          query,
          total_matches: matches.length,
          case_name,
        });
        return {
          toolResult: toolResult(id, {
            ok: true,
            case_id: caseId,
            case_name,
            total_matches: matches.length,
            matches,
          }),
          events,
          caseCitations,
        };
      }

      case PAKISTAN_TOOL_NAMES.readCase: {
        const caseId = str(args.case_id) ?? "";
        const { case_name, text, truncated } = await readPakistanCase({
          db,
          caseId,
          fromChunk: num(args.from_chunk),
          toChunk: num(args.to_chunk),
        });
        emit({
          type: "pk_read_case",
          case_id: caseId || null,
          case_name,
          truncated,
        });
        return {
          toolResult: toolResult(id, {
            ok: true,
            case_id: caseId,
            case_name,
            truncated,
            text,
          }),
          events,
          caseCitations,
        };
      }

      case PAKISTAN_TOOL_NAMES.verifyCitations: {
        const citations = Array.isArray(args.citations)
          ? args.citations
              .filter((v): v is string => typeof v === "string")
              .slice(0, 250)
          : [];
        const verifications = await verifyPakistanCitations({ db, citations });
        const matchCount = verifications.filter((v) => v.matched).length;
        emit({
          type: "pk_verify_citations",
          citation_count: citations.length,
          match_count: matchCount,
        });
        return {
          toolResult: toolResult(id, {
            ok: true,
            citation_count: citations.length,
            match_count: matchCount,
            verifications,
            note: "Citations with matched=false are not in the corpus; do not assert those cases exist or rely on them.",
          }),
          events,
          caseCitations,
        };
      }

      case PAKISTAN_TOOL_NAMES.searchStatutes: {
        const query = str(args.query) ?? "";
        write(
          `data: ${JSON.stringify({ type: "pk_search_statutes_start", query })}\n\n`,
        );
        const results = await searchPakistanStatutes({
          db,
          query,
          jurisdiction: str(args.jurisdiction) ?? null,
          limit: num(args.limit),
          apiKeys,
        });
        emit({
          type: "pk_search_statutes",
          query,
          result_count: results.length,
        });
        return {
          toolResult: toolResult(id, {
            ok: true,
            result_count: results.length,
            results: results.map((r) => ({
              statute_id: r.statute_id,
              statute_title: r.statute_title,
              section_number: r.section_number,
              heading: r.heading,
              text: r.text,
            })),
            next_required_action:
              "Use pk_read_statute to quote exact statutory language before relying on it.",
          }),
          events,
          caseCitations,
        };
      }

      case PAKISTAN_TOOL_NAMES.readStatute: {
        const statuteId = str(args.statute_id) ?? "";
        const { title, sections, truncated } = await readPakistanStatute({
          db,
          statuteId,
          sectionNumber: str(args.section_number) ?? null,
        });
        emit({
          type: "pk_read_statute",
          statute_id: statuteId || null,
          title,
          truncated,
        });
        return {
          toolResult: toolResult(id, {
            ok: true,
            statute_id: statuteId,
            title,
            truncated,
            sections,
          }),
          events,
          caseCitations,
        };
      }

      default:
        return {
          toolResult: toolResult(id, {
            error: `Unknown Pakistan research tool: ${name}`,
          }),
          events,
          caseCitations,
        };
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Pakistan research tool failed.";
    return {
      toolResult: toolResult(id, { error: message }),
      events,
      caseCitations,
    };
  }
}
