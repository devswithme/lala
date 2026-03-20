import { openrouter } from "./client.js";
import { AI_MODEL } from "../config/index.js";

function cleanQuoteText(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return "";

  // Use only the first non-empty line (AI might return line breaks/bullets).
  const firstLine = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);

  if (!firstLine) return "";

  // Strip common bullet prefixes and wrapping quotes.
  return firstLine
    .replace(/^[-*•\u2022]\s*/g, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
}

export async function summarizeWrapQuote(historySummary) {
  const summary = String(historySummary ?? "").trim();
  if (!summary) return "";

  const res = await openrouter.chat.completions.create({
    model: AI_MODEL,
    messages: [
      {
        role: "system",
        content:
          "Kamu adalah asisten yang menulis 1 kalimat quote bermakna dari ringkasan percakapan pengguna. Jawab hanya dengan teks quote saja (tanpa tanda kutip ganda/single, tanpa bullet, tanpa penjelasan tambahan).",
      },
      {
        role: "user",
        content: `Buat 1 quote yang paling bermakna dan menangkap inti emosi dari ringkasan berikut.\n\nRingkasan:\n${summary}\n\nQuote (1 kalimat):`,
      },
    ],
    max_tokens: 80,
  });

  const out = res.choices[0]?.message?.content ?? "";
  return cleanQuoteText(out);
}
