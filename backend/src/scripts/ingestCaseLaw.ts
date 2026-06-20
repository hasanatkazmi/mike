/**
 * CLI: ingest Pakistani judgments into the case-law corpus from a manifest.
 *
 * Usage:
 *   tsx src/scripts/ingestCaseLaw.ts --manifest <path-to-json>
 *
 * The manifest is a JSON array of judgment entries:
 *   [
 *     {
 *       "url": "https://.../judgment.pdf",
 *       "case_name": "Mahmood Khan v. The State",
 *       "court": "SC",
 *       "date_decided": "2019-03-12",
 *       "case_number": "Criminal Appeal No. 95 of 2018",
 *       "judges": ["..."],
 *       "citations": ["PLD 2019 SC 318"]
 *     }
 *   ]
 *
 * Entries may instead provide "text" directly (e.g. from OCR or a licensed
 * feed) instead of "url". Requires SUPABASE_URL, SUPABASE_SECRET_KEY, and an
 * embedding provider key. Respect each court site's terms of use and robots.txt.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createServerSupabase } from "../lib/supabase";
import {
  importJudgmentFromPdf,
  importJudgmentFromText,
  type JudgmentMeta,
} from "../lib/ingest/caselaw/judgments";

interface ManifestEntry extends JudgmentMeta {
  url?: string;
  text?: string;
}

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const manifestPath = arg("manifest");
  if (!manifestPath) {
    console.error(
      "Usage: tsx src/scripts/ingestCaseLaw.ts --manifest <path-to-json>",
    );
    process.exit(1);
  }

  const entries = JSON.parse(await readFile(manifestPath, "utf8")) as ManifestEntry[];
  if (!Array.isArray(entries)) throw new Error("Manifest must be a JSON array.");

  const db = createServerSupabase();
  let ok = 0;
  let needsOcr = 0;
  let failed = 0;

  for (const entry of entries) {
    const { url, text, ...meta } = entry;
    try {
      if (text) {
        const res = await importJudgmentFromText({ db, meta, fullText: text });
        ok++;
        console.log(`[ok] ${meta.case_name} (${res.chunk_count} chunks)`);
      } else if (url) {
        const res = await importJudgmentFromPdf({ db, url, meta });
        if (res.needs_ocr) {
          needsOcr++;
          console.warn(`[ocr] ${meta.case_name}: OCR produced no text.`);
        } else {
          ok++;
          const via = res.used_ocr ? " via OCR" : "";
          console.log(
            `[ok] ${meta.case_name} (${res.chunk_count} chunks${via})`,
          );
        }
      } else {
        failed++;
        console.error(`[fail] ${meta.case_name}: entry has neither url nor text.`);
      }
    } catch (err) {
      failed++;
      console.error(
        `[fail] ${meta.case_name}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `\nDone. ${ok} ingested, ${needsOcr} need OCR, ${failed} failed.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
