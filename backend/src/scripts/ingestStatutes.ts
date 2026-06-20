/**
 * CLI: ingest Pakistani statutes from pakistancode.gov.pk into the corpus.
 *
 * Usage:
 *   tsx src/scripts/ingestStatutes.ts --list <listingUrl> [--limit N]
 *
 * Requires SUPABASE_URL, SUPABASE_SECRET_KEY, and an embedding provider key
 * (GEMINI_API_KEY or OPENAI_API_KEY) in the environment.
 *
 * Respect pakistancode.gov.pk's terms of use and robots.txt before crawling.
 */
import "dotenv/config";
import { createServerSupabase } from "../lib/supabase";
import { ingestStatute } from "../lib/ingest/pipeline";
import { scrapePakistanCode } from "../lib/ingest/statutes/pakistancode";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const listUrl = arg("list");
  if (!listUrl) {
    console.error(
      "Usage: tsx src/scripts/ingestStatutes.ts --list <listingUrl> [--limit N]",
    );
    process.exit(1);
  }
  const limit = arg("limit") ? Number.parseInt(arg("limit")!, 10) : undefined;

  const db = createServerSupabase();
  let acts = 0;
  let sections = 0;

  for await (const parsed of scrapePakistanCode({ listUrl, limit })) {
    try {
      const res = await ingestStatute({
        db,
        statute: parsed.statute,
        sections: parsed.sections,
      });
      acts++;
      sections += res.section_count;
      console.log(
        `[ok] ${parsed.statute.title} (${res.section_count} sections)`,
      );
    } catch (err) {
      console.error(
        `[fail] ${parsed.statute.title}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(`\nDone. Ingested ${acts} statutes, ${sections} sections.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
