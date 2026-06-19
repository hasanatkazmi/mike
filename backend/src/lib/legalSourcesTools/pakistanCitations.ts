/**
 * Parsing and normalisation of Pakistani law-report citations.
 *
 * Pakistani citations come in two common shapes:
 *   - Reporter-first (PLD):        "PLD 2019 SC 318", "PLD 2020 Lahore 45"
 *   - Year-first (most reporters): "2020 SCMR 456", "2021 CLC 1234"
 *
 * Both are normalised to a single canonical key so the same judgment is matched
 * regardless of input order, spacing, or case. The normalized form is:
 *
 *     "<REPORTER> <YEAR> [COURT] <PAGE>"
 *
 * e.g. "PLD 2019 SC 318" and "pld 2019 sc 318" -> "PLD 2019 SC 318".
 */

// Known Pakistani reporters. Longer tokens first so PCrLJ matches before PLC.
export const PK_REPORTERS = [
  "PLD", // Pakistan Legal Decisions
  "SCMR", // Supreme Court Monthly Review
  "PCrLJ", // Pakistan Criminal Law Journal
  "PTCL", // Pakistan Tax Cases Law
  "GBLR", // Gilgit-Baltistan Law Reports
  "CLD", // Corporate Law Decisions
  "PTD", // Pakistan Tax Decisions
  "PLC", // Pakistan Labour Cases
  "PLJ", // Pakistan Law Journal
  "NLR", // National Law Reporter
  "CLC", // Civil Law Cases
  "YLR", // Yearly Law Reporter
  "MLD", // Monthly Law Digest
] as const;

export type PkReporter = (typeof PK_REPORTERS)[number];

// Court/volume tokens that may appear between year and page (mainly for PLD).
const COURT_TOKENS: Record<string, string> = {
  SC: "SC",
  "SUPREME COURT": "SC",
  LAHORE: "Lahore",
  KARACHI: "Karachi",
  SINDH: "Karachi",
  PESHAWAR: "Peshawar",
  QUETTA: "Quetta",
  BALOCHISTAN: "Quetta",
  ISLAMABAD: "Islamabad",
  FSC: "FSC",
  "FEDERAL SHARIAT COURT": "FSC",
  "SHARIAT COURT": "FSC",
  "AJ&K": "AJK",
  AJK: "AJK",
  "GILGIT-BALTISTAN": "GB",
  GB: "GB",
};

export interface ParsedPkCitation {
  reporter: PkReporter;
  year: number;
  /** Court/volume marker if present (e.g. "SC", "Lahore"), else null. */
  courtOrVolume: string | null;
  page: number;
  /** Input string, trimmed and whitespace-collapsed. */
  raw: string;
  /** Canonical lookup key: "<REPORTER> <YEAR> [COURT] <PAGE>". */
  normalized: string;
}

function collapse(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

// Build an alternation of reporters, longest first, for the regex.
const REPORTER_ALT = [...PK_REPORTERS]
  .sort((a, b) => b.length - a.length)
  .join("|");

// "PLD 2019 SC 318" / "PLD 2020 Lahore 45"
const REPORTER_FIRST = new RegExp(
  `^(${REPORTER_ALT})\\s+(\\d{4})\\s+(.*?)(\\d+)$`,
  "i",
);

// "2020 SCMR 456" / "2021 CLC 1234"
const YEAR_FIRST = new RegExp(
  `^(\\d{4})\\s+(${REPORTER_ALT})\\s+(.*?)(\\d+)$`,
  "i",
);

function canonReporter(token: string): PkReporter | null {
  const upper = token.toUpperCase();
  // Match case-insensitively but return the canonical spelling (e.g. "PCrLJ").
  return PK_REPORTERS.find((r) => r.toUpperCase() === upper) ?? null;
}

function canonCourt(token: string): string | null {
  const cleaned = collapse(token).toUpperCase().replace(/[.,]/g, "");
  if (!cleaned) return null;
  return COURT_TOKENS[cleaned] ?? collapse(token);
}

/**
 * Parse a single citation string. Returns null if it is not a recognised
 * Pakistani reporter citation.
 */
export function parsePkCitation(input: string): ParsedPkCitation | null {
  const raw = collapse(input);
  if (!raw) return null;

  let reporter: PkReporter | null = null;
  let year = NaN;
  let courtRaw = "";
  let page = NaN;

  const rf = raw.match(REPORTER_FIRST);
  if (rf) {
    reporter = canonReporter(rf[1]);
    year = Number.parseInt(rf[2], 10);
    courtRaw = rf[3];
    page = Number.parseInt(rf[4], 10);
  } else {
    const yf = raw.match(YEAR_FIRST);
    if (yf) {
      year = Number.parseInt(yf[1], 10);
      reporter = canonReporter(yf[2]);
      courtRaw = yf[3];
      page = Number.parseInt(yf[4], 10);
    }
  }

  if (!reporter || !Number.isFinite(year) || !Number.isFinite(page)) {
    return null;
  }
  // Sanity bounds: reported case law years.
  if (year < 1947 || year > 2100) return null;

  const courtOrVolume = canonCourt(courtRaw);
  const normalized = [reporter, String(year), courtOrVolume ?? "", String(page)]
    .filter((p) => p !== "")
    .join(" ");

  return { reporter, year, courtOrVolume, page, raw, normalized };
}

/**
 * Parse many citations, dropping any that are unrecognised.
 */
export function parsePkCitations(inputs: string[]): ParsedPkCitation[] {
  const out: ParsedPkCitation[] = [];
  for (const input of inputs) {
    const parsed = parsePkCitation(input);
    if (parsed) out.push(parsed);
  }
  return out;
}

/**
 * Produce the canonical normalized key for a raw citation, or null if it is not
 * a recognised citation. Convenience wrapper for lookups.
 */
export function normalizePkCitation(input: string): string | null {
  return parsePkCitation(input)?.normalized ?? null;
}
