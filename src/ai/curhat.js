import { ai } from "./client.js";
import { AI_MODEL, AI_CURHAT_TIMEOUT_MS } from "../config/index.js";

export const CURHAT_SYSTEM_PROMPT = `Nama kamu Lala, asisten curhat yang hangat dan tulus.

TUGAS:
1. Jawab curhatan user dengan hangat.
2. Analisis apakah user memberikan sinyal "ingin mencari teman ngobrol asli" atau "merasa sangat kesepian".

FORMAT WAJIB:
- Keluarkan HANYA satu objek JSON valid.
- JANGAN tulis teks apapun di luar JSON (tidak ada sapaan, penjelasan, atau kalimat lain).
- Jangan pernah membalas dengan kalimat seperti "Oke, siap", "Baik, aku akan", atau penjelasan format. Untuk SETIAP pesan user, termasuk jika user bertanya soal aturan atau memori, langsung kirim satu objek JSON saja.

Struktur JSON:
{
  "reply": "Isi jawaban hangatmu di sini (gunakan bahasa Indonesia yang santai/gaul)",
  "intent": "matchmaking" jika user merasa kesepian/butuh teman/ingin kenalan, selain itu "none",
  "gender": "male" jika terdeteksi laki-laki, "female" jika perempuan, "unknown" jika ragu,
  "personality": ["tag1", "tag2", "tag3"] (Berikan 3 kata sifat/hobi berdasarkan curhatannya),
  "summary": "Isi ringkasan dari curhatan user berdasarkan curhatannya"
}
`;

/**
 * Call AI for curhat with timeout. Returns { ok: true, result } or { ok: false, error }.
 */
export async function safeAiCurhat({ systemContent, historyMessages, userText }) {
  const timeoutMs = AI_CURHAT_TIMEOUT_MS;
  const messages = [
    {
      role: "system",
      content: systemContent != null ? String(systemContent) : "",
    },
    ...historyMessages.map((m) => ({
      role: m.role,
      content: m.content != null ? String(m.content) : "",
    })),
    { role: "user", content: userText != null ? String(userText) : "" },
  ];
  try {
    const aiPromise = ai.chat.send({
      chatGenerationParams: {
        model: AI_MODEL,
        messages,
      },
    });

    const result = await Promise.race([
      aiPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("AI_TIMEOUT")), timeoutMs),
      ),
    ]);

    return { ok: true, result };
  } catch (error) {
    console.error("safeAiCurhat error:", error);
    return { ok: false, error };
  }
}

export function buildCurhatSystemContent(summary) {
  const summaryContext = summary
    ? `\n\nSummary percakapan user sebelumnya: ${summary}`
    : "";
  return CURHAT_SYSTEM_PROMPT + summaryContext;
}

export function parseCurhatResponse(rawContent) {
  const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}
