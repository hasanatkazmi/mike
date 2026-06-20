import { GoogleGenAI } from "@google/genai";
import { containsUrdu } from "../textScript";

export { containsUrdu };

/**
 * OCR for scanned and Urdu-language judgment PDFs.
 *
 * Many Pakistani judgments — older Supreme Court / High Court decisions and most
 * lower-court orders — are scanned image PDFs with no embedded text, and some
 * are in Urdu. We use Gemini's multimodal capability to transcribe the document
 * (it accepts a PDF directly and handles both English and Urdu script), which
 * avoids adding a heavy native OCR toolchain and reuses the existing Gemini key.
 *
 * For very large PDFs the caller should consider splitting; here we send the
 * whole document and let the model transcribe it.
 */

const OCR_MODEL = "gemini-3-flash-preview";

const OCR_PROMPT = [
  "You are an OCR transcription engine for legal documents.",
  "Transcribe ALL text from this PDF verbatim, preserving reading order.",
  "The document may be in English or Urdu, or a mix; transcribe each in its",
  "original script (use proper Urdu script for Urdu text, do not transliterate).",
  "Preserve paragraph breaks. Do not summarise, translate, comment, or add",
  "anything that is not in the document. Output only the transcribed text.",
].join(" ");

function geminiKey(override?: string | null): string {
  const key = override?.trim() || process.env.GEMINI_API_KEY?.trim() || "";
  if (!key) {
    throw new Error(
      "Gemini API key is not configured for OCR. Set GEMINI_API_KEY or add a user Gemini key.",
    );
  }
  return key;
}

export interface OcrResult {
  text: string;
  /** Detected dominant language of the transcription. */
  language: "en" | "ur";
}

/**
 * OCR a PDF buffer using Gemini multimodal. Returns the transcribed text and a
 * best-effort language tag (ur if Urdu script is present, else en).
 */
export async function ocrPdf(
  buffer: Buffer,
  opts: { apiKeys?: { gemini?: string | null }; model?: string } = {},
): Promise<OcrResult> {
  const ai = new GoogleGenAI({ apiKey: geminiKey(opts.apiKeys?.gemini) });
  const resp = await ai.models.generateContent({
    model: opts.model ?? OCR_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: buffer.toString("base64"),
            },
          },
          { text: OCR_PROMPT },
        ],
      },
    ],
  });

  const text = (resp.text ?? "").trim();
  return { text, language: containsUrdu(text) ? "ur" : "en" };
}
