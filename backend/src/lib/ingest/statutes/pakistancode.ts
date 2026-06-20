import * as cheerio from "cheerio";
import { fetchHtml, type FetchOptions } from "../http";
import type { StatuteRecord, StatuteSectionInput } from "../pipeline";

/**
 * Scraper for pakistancode.gov.pk, the consolidated federal statute portal.
 *
 * The parsing functions (parseActList, parseActPage) are pure and operate on
 * HTML strings, so they can be unit-tested against fixtures without network
 * access. The orchestrator (scrapePakistanCode) wires them to the live site.
 *
 * NOTE: pakistancode.gov.pk markup may change. The selectors below are written
 * defensively (multiple fallbacks) but should be verified against the live DOM
 * when first run, and adjusted via the ParseConfig if needed. Always respect the
 * site's terms of use and robots.txt before crawling.
 */

const BASE_URL = "https://pakistancode.gov.pk";

export interface ParseConfig {
  /** Selector for links to individual act pages on a listing page. */
  actLinkSelector?: string;
  /** Selector for the act title on an act page. */
  actTitleSelector?: string;
  /** Selector for each section block on an act page. */
  sectionSelector?: string;
}

export interface ActListItem {
  title: string;
  url: string;
}

function absolute(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  return `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
}

function clean(text: string): string {
  return text
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Parse a listing page into act links. Looks for anchors that point at act
 * detail pages, de-duplicating by URL.
 */
export function parseActList(html: string, config: ParseConfig = {}): ActListItem[] {
  const $ = cheerio.load(html);
  const selector =
    config.actLinkSelector ??
    "a[href*='ActDetail'], a[href*='actdetail'], a[href*='UID'], .act-list a, table a";
  const seen = new Set<string>();
  const items: ActListItem[] = [];
  $(selector).each((_, el) => {
    const href = $(el).attr("href");
    const title = clean($(el).text());
    if (!href || !title) return;
    const url = absolute(href);
    if (seen.has(url)) return;
    // Skip obvious non-act links (pagination, nav).
    if (/^(next|prev|previous|home|\d+)$/i.test(title)) return;
    seen.add(url);
    items.push({ title, url });
  });
  return items;
}

/**
 * Extract a four-digit year from an act title, e.g. "Act, 1872" -> 1872.
 */
export function yearFromTitle(title: string): number | null {
  const m = title.match(/\b(1[89]\d{2}|20\d{2})\b/);
  return m ? Number.parseInt(m[1], 10) : null;
}

/**
 * Parse an act detail page into a statute record and its sections.
 */
export function parseActPage(
  html: string,
  url: string,
  config: ParseConfig = {},
): { statute: StatuteRecord; sections: StatuteSectionInput[] } {
  const $ = cheerio.load(html);

  const titleSel =
    config.actTitleSelector ?? "h1, h2, .act-title, .ActTitle, title";
  const title = clean($(titleSel).first().text()) || clean($("title").text());

  const sectionSel =
    config.sectionSelector ??
    ".section, .Section, .act-section, tr.section, div[id^='sec']";

  const sections: StatuteSectionInput[] = [];
  $(sectionSel).each((_, el) => {
    const block = $(el);
    const heading = clean(
      block.find(".section-title, .heading, b, strong").first().text(),
    );
    // Section number often appears at the start of the heading or in a label.
    const numberMatch = heading.match(/^\s*(\d+[A-Za-z]?(?:\(\d+\))?)/);
    const sectionNumber =
      clean(block.find(".section-number, .sec-no").first().text()) ||
      (numberMatch ? numberMatch[1] : null);
    const text = clean(block.text());
    if (text) {
      sections.push({
        section_number: sectionNumber || null,
        heading: heading || null,
        text,
      });
    }
  });

  // Fallback: if no structured sections were found, store the whole body as one
  // section so the act is still searchable.
  if (sections.length === 0) {
    const body = clean($("body").text());
    if (body) sections.push({ section_number: null, heading: title, text: body });
  }

  return {
    statute: {
      title: title || "Untitled statute",
      short_title: title || null,
      year: yearFromTitle(title),
      jurisdiction: "federal",
      source_url: url,
      status: "in_force",
    },
    sections,
  };
}

/**
 * Crawl a listing URL and yield parsed acts. Network-bound; the caller passes
 * each result to ingestStatute. limit caps the number of acts fetched.
 */
export async function* scrapePakistanCode(params: {
  listUrl: string;
  limit?: number;
  config?: ParseConfig;
  fetchOptions?: FetchOptions;
}): AsyncGenerator<{ statute: StatuteRecord; sections: StatuteSectionInput[] }> {
  const { listUrl, config, fetchOptions } = params;
  const limit = params.limit ?? Infinity;

  const listHtml = await fetchHtml(listUrl, fetchOptions);
  const acts = parseActList(listHtml, config);

  let count = 0;
  for (const act of acts) {
    if (count >= limit) break;
    try {
      const actHtml = await fetchHtml(act.url, fetchOptions);
      yield parseActPage(actHtml, act.url, config);
      count++;
    } catch (err) {
      // Skip a failed act but keep crawling the rest.
      console.error(
        `[pakistancode] failed to fetch ${act.url}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
