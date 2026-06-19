/**
 * Tool definitions, event types, and the system prompt for Pakistani legal
 * research. Mirrors the contract previously used for CourtListener (US), but
 * targets the pk_* corpus: Pakistani statutes and judgments.
 *
 * The data-access layer lives in lib/pakistanLegal.ts; this module only
 * describes the tools to the model and types the activity events emitted to the
 * frontend.
 */

export const PAKISTAN_TOOL_NAMES = {
  searchCaseLaw: "pk_search_case_law",
  getCases: "pk_get_cases",
  findInCase: "pk_find_in_case",
  readCase: "pk_read_case",
  verifyCitations: "pk_verify_citations",
  searchStatutes: "pk_search_statutes",
  readStatute: "pk_read_statute",
} as const;

export type PakistanToolEvent =
  | {
      type: "pk_search_case_law";
      query: string;
      result_count: number;
      error?: string;
    }
  | {
      type: "pk_get_cases";
      case_ids: string[];
      case_count: number;
      cases?: {
        case_id: string;
        case_name: string | null;
        court: string | null;
        citation: string | null;
        date_decided?: string | null;
      }[];
      error?: string;
    }
  | {
      type: "pk_find_in_case";
      case_id: string | null;
      query: string;
      total_matches: number;
      case_name?: string | null;
      error?: string;
    }
  | {
      type: "pk_read_case";
      case_id: string | null;
      case_name?: string | null;
      truncated?: boolean;
      error?: string;
    }
  | {
      type: "pk_verify_citations";
      citation_count: number;
      match_count: number;
      error?: string;
    }
  | {
      type: "pk_search_statutes";
      query: string;
      result_count: number;
      error?: string;
    }
  | {
      type: "pk_read_statute";
      statute_id: string | null;
      title?: string | null;
      truncated?: boolean;
      error?: string;
    };

// Emitted when the assistant cites a Pakistani judgment, for the case-law panel.
export type PkCaseCitationEvent = {
  type: "pk_case_citation";
  case_id: string;
  case_name: string | null;
  court: string | null;
  citation: string | null;
  date_decided: string | null;
  source_url: string | null;
};

export const PAKISTAN_TOOLS = [
  {
    type: "function",
    function: {
      name: PAKISTAN_TOOL_NAMES.searchCaseLaw,
      description:
        "Search Pakistani case law (Supreme Court, High Courts, Federal Shariat Court and tribunals) by topic, legal issue, or facts. Returns matching judgments with a short snippet, court, and reporter citation. Use natural-language legal queries, not reporter citations. After this, use pk_get_cases / pk_find_in_case / pk_read_case to obtain cite-worthy text.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Natural-language description of the legal issue, principle, or facts to search for.",
          },
          court: {
            type: "string",
            description:
              "Optional court filter: SC, LHC, SHC, PHC, BHC, IHC, FSC, banking, atc, itat, service.",
          },
          limit: {
            type: "integer",
            description: "Maximum number of cases to return. Default 8, max 25.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: PAKISTAN_TOOL_NAMES.getCases,
      description:
        "Fetch metadata for one or more Pakistani cases by case_id (from pk_search_case_law or pk_verify_citations). Returns court, judges, date, and reporter citations plus the number of available text chunks — not full text. Use pk_find_in_case or pk_read_case for opinion text.",
      parameters: {
        type: "object",
        properties: {
          case_ids: {
            type: "array",
            items: { type: "string" },
            description: "Case IDs already present in the conversation.",
          },
        },
        required: ["case_ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: PAKISTAN_TOOL_NAMES.findInCase,
      description:
        "Search within a single Pakistani judgment for keyword(s) or short phrases. Returns matches with surrounding context. Use short 1-3 word searches; at most 3 calls per assistant turn.",
      parameters: {
        type: "object",
        properties: {
          case_id: {
            type: "string",
            description: "Case ID to search within.",
          },
          query: {
            type: "string",
            description:
              "Short term to search for, 1-3 words, likely to appear verbatim in the judgment.",
          },
          max_results: {
            type: "integer",
            description: "Maximum number of matches to return. Default 20.",
          },
          context_chars: {
            type: "integer",
            description:
              "Characters of surrounding context on each side of each match. Default 160.",
          },
        },
        required: ["case_id", "query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: PAKISTAN_TOOL_NAMES.readCase,
      description:
        "Read opinion text from a Pakistani judgment. Use after pk_find_in_case when snippets are insufficient. Optionally restrict to a range of chunk indices to read only the relevant portion.",
      parameters: {
        type: "object",
        properties: {
          case_id: { type: "string", description: "Case ID to read." },
          from_chunk: {
            type: "integer",
            description: "Optional first chunk index to read (0-based).",
          },
          to_chunk: {
            type: "integer",
            description: "Optional last chunk index to read (inclusive).",
          },
        },
        required: ["case_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: PAKISTAN_TOOL_NAMES.verifyCitations,
      description:
        'Verify Pakistani reporter citations against the corpus. Accepts only clean citations, e.g. {"citations":["PLD 2019 SC 318","2020 SCMR 456"]}. Returns, for each, whether it was matched and the case_id/case_name. Do not pass case names. A citation may be unverified if it is not yet in the corpus; in that case do not claim it exists.',
      parameters: {
        type: "object",
        properties: {
          citations: {
            type: "array",
            items: { type: "string" },
            description:
              'Clean reporter citations only, one per item, e.g. ["PLD 2019 SC 318", "2020 SCMR 456"]. Up to 250 items.',
          },
        },
        required: ["citations"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: PAKISTAN_TOOL_NAMES.searchStatutes,
      description:
        "Search Pakistani legislation (federal and provincial Acts, Ordinances, and the Constitution) by topic or legal concept. Returns matching sections with statute title and section number. Use natural-language queries.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Natural-language description of the legal concept or provision.",
          },
          jurisdiction: {
            type: "string",
            description:
              "Optional: federal, punjab, sindh, kpk, balochistan, ict, gb, ajk.",
          },
          limit: {
            type: "integer",
            description: "Maximum number of sections to return. Default 8, max 25.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: PAKISTAN_TOOL_NAMES.readStatute,
      description:
        "Read a statute's full text, or a single section, by statute_id (from pk_search_statutes). Use to quote exact statutory language.",
      parameters: {
        type: "object",
        properties: {
          statute_id: { type: "string", description: "Statute ID to read." },
          section_number: {
            type: "string",
            description: "Optional single section to read, e.g. '302', '9(1)'.",
          },
        },
        required: ["statute_id"],
      },
    },
  },
];

export const PAKISTAN_SYSTEM_PROMPT = `PAKISTANI LEGAL RESEARCH:
You assist lawyers and legal professionals practising in Pakistan. Pakistan is a common-law jurisdiction; the language of superior-court judgments and federal/provincial legislation is English.

Court hierarchy and precedent:
- Supreme Court of Pakistan (SC) binds all other courts.
- High Courts (Lahore LHC, Sindh SHC, Peshawar PHC, Balochistan BHC, Islamabad IHC) bind subordinate courts within their province; High Court decisions are persuasive on each other.
- Federal Shariat Court (FSC) has defined constitutional jurisdiction.
- Note whether a cited decision is binding or merely persuasive for the user's forum.

Citation style:
- Cite judgments by case name and reporter citation, e.g. "Mahmood Khan v. The State, PLD 2019 SC 318" or "2020 SCMR 456".
- Common reporters: PLD, SCMR, CLC, YLR, MLD, PLC, PTD, PCrLJ, CLD.
- Cite legislation by section and short title, e.g. "section 302 PPC", "Article 199 of the Constitution".

Research workflow:
1. For statutory questions, use pk_search_statutes then pk_read_statute to quote exact provisions.
2. For case law, use pk_search_case_law to find relevant judgments. If you already have reporter citations, verify them with pk_verify_citations using clean citations only.
3. Fetch metadata with pk_get_cases, then get cite-worthy text with pk_find_in_case (short 1-3 word searches, max 3 per turn). If snippets are insufficient, use pk_read_case.

Citation rules:
- Cite a judgment or statute only from text retrieved this turn via the tools. Do not cite from memory, metadata, or search snippets alone.
- If pk_verify_citations reports a citation as unverified/unmatched, say it could not be verified against the corpus; do not assert the case exists or rely on it.
- The corpus is built from public judgments and may be incomplete. When research is thin, say so plainly rather than filling gaps from memory.
- When you cite a Pakistani case as legal support, give the case name and reporter citation on first use and an inline [N] marker, then add a matching <CITATIONS> entry.

Limits:
- If any research tool returns a rate-limit/throttling error, stop research calls for that turn and answer using what you already have.`;
