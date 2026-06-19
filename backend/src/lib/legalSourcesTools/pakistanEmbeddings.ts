import { GoogleGenAI } from "@google/genai";

/**
 * Embedding support for the Pakistan legal corpus (statutes and case law).
 *
 * Vectors are stored in pgvector columns declared as vector(1536) in
 * backend/oss-migrations/20260619_pakistan_legal_corpus.sql. The dimension here
 * MUST stay in sync with that schema. If you change it, re-embed the corpus.
 *
 * Gemini is the default provider because it is the instance default model and
 * its SDK (@google/genai) is already a dependency. OpenAI is supported as a
 * fallback via raw fetch (matching how lib/llm/openai.ts calls the API).
 */

export const PK_EMBEDDING_DIMENSION = 1536;

// gemini-embedding-001 supports configurable output dimensionality.
const GEMINI_EMBED_MODEL = "gemini-embedding-001";
// text-embedding-3-small natively returns 1536 dimensions.
const OPENAI_EMBED_MODEL = "text-embedding-3-small";

export type EmbeddingProvider = "gemini" | "openai";

export interface EmbedOptions {
  /** Per-user/instance API keys, mirroring lib/userSettings UserApiKeys. */
  apiKeys?: { gemini?: string | null; openai?: string | null };
  /** Force a provider; otherwise inferred from available keys. */
  provider?: EmbeddingProvider;
  /**
   * Retrieval intent. "document" for corpus text being indexed, "query" for a
   * search string. Gemini uses this as task_type to improve match quality.
   */
  kind?: "document" | "query";
}

function resolveProvider(opts: EmbedOptions): EmbeddingProvider {
  if (opts.provider) return opts.provider;
  const geminiKey = opts.apiKeys?.gemini?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) return "gemini";
  const openaiKey = opts.apiKeys?.openai?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) return "openai";
  // Default to gemini so the error message points at the primary provider.
  return "gemini";
}

function geminiKey(opts: EmbedOptions): string {
  const key = opts.apiKeys?.gemini?.trim() || process.env.GEMINI_API_KEY?.trim() || "";
  if (!key) {
    throw new Error(
      "Gemini API key is not configured for embeddings. Set GEMINI_API_KEY or add a user Gemini key.",
    );
  }
  return key;
}

function openaiKey(opts: EmbedOptions): string {
  const key = opts.apiKeys?.openai?.trim() || process.env.OPENAI_API_KEY?.trim() || "";
  if (!key) {
    throw new Error(
      "OpenAI API key is not configured for embeddings. Set OPENAI_API_KEY or add a user OpenAI key.",
    );
  }
  return key;
}

function assertDimension(vector: number[]): number[] {
  if (vector.length !== PK_EMBEDDING_DIMENSION) {
    throw new Error(
      `Embedding dimension mismatch: got ${vector.length}, expected ${PK_EMBEDDING_DIMENSION}.`,
    );
  }
  return vector;
}

async function embedWithGemini(
  texts: string[],
  opts: EmbedOptions,
): Promise<number[][]> {
  const ai = new GoogleGenAI({ apiKey: geminiKey(opts) });
  const taskType = opts.kind === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT";
  const out: number[][] = [];
  // @google/genai accepts a batch of contents per call.
  const resp = await ai.models.embedContent({
    model: GEMINI_EMBED_MODEL,
    contents: texts,
    config: {
      outputDimensionality: PK_EMBEDDING_DIMENSION,
      taskType,
    },
  });
  const embeddings = resp.embeddings ?? [];
  for (const e of embeddings) {
    out.push(assertDimension(e.values ?? []));
  }
  if (out.length !== texts.length) {
    throw new Error(
      `Gemini returned ${out.length} embeddings for ${texts.length} inputs.`,
    );
  }
  return out;
}

async function embedWithOpenai(
  texts: string[],
  opts: EmbedOptions,
): Promise<number[][]> {
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey(opts)}`,
    },
    body: JSON.stringify({
      model: OPENAI_EMBED_MODEL,
      input: texts,
      dimensions: PK_EMBEDDING_DIMENSION,
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`OpenAI embeddings failed (${resp.status}): ${detail}`);
  }
  const json = (await resp.json()) as {
    data?: { index: number; embedding: number[] }[];
  };
  const rows = json.data ?? [];
  // Preserve input order regardless of API ordering.
  const ordered = [...rows].sort((a, b) => a.index - b.index);
  if (ordered.length !== texts.length) {
    throw new Error(
      `OpenAI returned ${ordered.length} embeddings for ${texts.length} inputs.`,
    );
  }
  return ordered.map((r) => assertDimension(r.embedding));
}

/**
 * Embed a batch of texts into 1536-dim vectors. Order is preserved.
 */
export async function embedTexts(
  texts: string[],
  opts: EmbedOptions = {},
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const provider = resolveProvider(opts);
  return provider === "openai"
    ? embedWithOpenai(texts, opts)
    : embedWithGemini(texts, opts);
}

/**
 * Embed a single text (convenience wrapper around embedTexts).
 */
export async function embedText(
  text: string,
  opts: EmbedOptions = {},
): Promise<number[]> {
  const [vector] = await embedTexts([text], opts);
  return vector;
}

/**
 * Format a JS number[] as a pgvector literal string, e.g. "[0.1,0.2,...]".
 * Use when binding an embedding to a SQL parameter or RPC argument.
 */
export function toPgVector(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
