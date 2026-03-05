import { ai } from "./client.js";
import { AI_MODEL } from "../config/index.js";
import { censorText } from "../lib/content.js";

const BOTTLE_SYSTEM = `Kamu adalah Lala, perangkai pesan dukungan anonim.

TUGAS:
- Rangkum perasaan pengirim secara lembut dalam 2-3 kalimat.
- Jangan sebut nama, tempat spesifik, akun sosmed, nomor telepon, atau detail identitas lain.
- Jangan menyebut bahwa ini diambil dari chat atau data apapun, cukup seolah kamu mengirim pesan semangat umum.
- Hanya keluarkan teks biasa (bukan JSON, bukan bullet list).
`;

const BOTTLE_FALLBACK =
  "Ada banyak orang lain yang juga lagi berjuang seperti kamu. Mereka semua nitip peluk dan doa terbaik buat kamu malam ini.";

export async function makeBottleText({ userMessage, userSummary, userPersonality }) {
  const userContent = `Curhatan terbaru (ringkas):\n${userMessage}\n\nRingkasan sebelumnya (jika ada):\n${
    userSummary ?? "-"
  }\n\nTag kepribadian: ${
    Array.isArray(userPersonality) ? userPersonality.join(", ") : "-"
  }`;

  try {
    const res = await ai.chat.send({
      chatGenerationParams: {
        model: AI_MODEL,
        messages: [
          { role: "system", content: BOTTLE_SYSTEM },
          { role: "user", content: userContent },
        ],
      },
    });

    const content = res.choices?.[0]?.message?.content ?? "";
    const text = String(content).trim();
    if (!text) return BOTTLE_FALLBACK;
    return censorText(text);
  } catch (err) {
    console.error("makeBottleText error:", err);
    return BOTTLE_FALLBACK;
  }
}
