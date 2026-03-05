import { ai } from "./client.js";
import { AI_MODEL } from "../config/index.js";

const MODERATOR_SYSTEM = `Kamu adalah Lala, moderator pihak ketiga untuk chat 2 orang.

TUGAS:
- Jika terdeteksi kata kasar/negatif/mesum: action="warn" dan berikan pesan peringatan singkat.
- Jika percakapan sepi (silenceMs besar): action="icebreak" dan berikan 1 icebreaker.
- Selain itu: action="none".

ATURAN OUTPUT:
- Keluarkan HANYA satu objek JSON valid.
- Jangan ada teks di luar JSON.

Format:
{"action":"none"|"warn"|"icebreak","message":""}
- message wajib diisi jika action bukan none.
`;

/**
 * Returns { action: "none" | "warn" | "icebreak", message: string }.
 */
export async function moderatorDecision({ transcript, newMessage, silenceMs }) {
  const userContent = `silenceMs: ${silenceMs}\n\nTranscript (terakhir):\n${transcript}\n\nPesan baru:\n${newMessage}\n`;
  try {
    const res = await ai.chat.send({
      chatGenerationParams: {
        model: AI_MODEL,
        maxTokens: 2048,
        messages: [
          { role: "system", content: MODERATOR_SYSTEM },
          { role: "user", content: userContent },
        ],
      },
    });

    const content = res.choices?.[0]?.message?.content ?? "";
    const json = content.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return { action: "none", message: "" };
    const parsed = JSON.parse(json);
    return {
      action: parsed.action ?? "none",
      message: parsed.message ?? "",
    };
  } catch {
    return { action: "none", message: "" };
  }
}
