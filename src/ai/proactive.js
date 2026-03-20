import { openrouter } from "./client.js";
import { AI_MODEL } from "../config/index.js";

// Fallback check-in templates used when there's no history context.
const CHECKIN_FALLBACKS = [
  "Eh, tiba-tiba kepikiran kamu nih. Lagi sibuk nggak hari ini? 🌸",
  "Hai! Lala tiba-tiba ingat kamu. Semoga harimu baik-baik aja ya 💗",
  "Nggak tau kenapa, tiba-tiba pengen tau kabar kamu. Gimana hari ini?",
  "Lala lagi iseng mikirin kamu nih. Ada yang mau diceritain nggak? 😊",
];

function randomFallback() {
  return CHECKIN_FALLBACKS[Math.floor(Math.random() * CHECKIN_FALLBACKS.length)];
}

function userName(user) {
  return user.name || "kamu";
}

/**
 * Generate an epiphany — Lala noticing a natural pattern from past chats.
 * Uses history + historySummary as input.
 * Returns null if not enough context or AI fails.
 */
export async function generateEpiphany(user) {
  const summary = user.historySummary?.trim();
  const history = Array.isArray(user.history) ? user.history : [];

  // Need at least a summary to find patterns
  if (!summary) return null;

  // Pick up to 10 user messages from rolling history as examples
  const userMessages = history
    .filter((m) => m.role === "user")
    .slice(-10)
    .map((m) => m.content)
    .join("\n");

  const contextBlock = [
    summary ? `Ringkasan percakapan:\n${summary}` : "",
    userMessages ? `\nPesan-pesan terbaru user:\n${userMessages}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await openrouter.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content: `Kamu adalah Lala, teman curhat yang tulus dan perhatian. Kamu baru saja "menyadari" sesuatu yang menarik tentang ${userName(user)} dari percakapan-percakapan sebelumnya.

Fokus pada KONEKSI antara dua hal berbeda yang sering muncul bersamaan dalam percakapan. Contoh pola yang kuat: "tiap kali kamu bahas X, kamu pasti ujung-ujungnya nyebut Y — sepertinya keduanya terhubung buat kamu." Bukan sekadar "kamu sering bahas X." Itu terlalu dangkal. Tunjukkan koneksi yang bikin orang berpikir "wah, iya juga ya."

Tulis 1-2 kalimat natural dalam Bahasa Indonesia. Gaya: santai, genuine, tidak menggurui. Mulai dengan kata seperti "Eh", "Aku baru ngeh", "Kamu tau nggak", dll. Jangan sebut dirimu AI.`,
        },
        {
          role: "user",
          content: `Berdasarkan percakapan berikut, apa satu pola atau insight menarik tentang ${userName(user)} yang bisa Lala sampaikan dengan natural?\n\n${contextBlock}\n\nTulis pesan yang akan Lala kirim langsung ke ${userName(user)}:`,
        },
      ],
      max_tokens: 120,
    });

    const text = res.choices[0]?.message?.content?.trim();
    if (!text) return null;

    // Strip wrapping quotes if model adds them
    return text.replace(/^["'""]+|["'""]+$/g, "").trim();
  } catch (err) {
    console.error("[proactive] generateEpiphany failed:", err.message);
    return null;
  }
}

/**
 * Generate a proactive check-in message — Lala "randomly" thinking about user.
 * Falls back to hardcoded template if no history context.
 */
export async function generateCheckIn(user) {
  const summary = user.historySummary?.trim();

  if (!summary) return randomFallback();

  try {
    const res = await openrouter.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content: `Kamu adalah Lala, teman curhat yang hangat. Kamu tiba-tiba teringat ${userName(user)} dan ingin say hi. Tulis 1-2 kalimat santai dalam Bahasa Indonesia — seolah kamu lagi mikirin sesuatu dan langsung teringat dia. Jangan tanya "gimana kabar?" secara langsung. Boleh sebut hal spesifik dari konteks. Jangan sebut dirimu AI. Akhiri dengan sesuatu yang mengundang respons tapi tidak memaksa.`,
        },
        {
          role: "user",
          content: `Konteks percakapan sebelumnya dengan ${userName(user)}:\n${summary}\n\nTulis pesan check-in yang natural dari Lala:`,
        },
      ],
      max_tokens: 100,
    });

    const text = res.choices[0]?.message?.content?.trim();
    if (!text) return randomFallback();

    return text.replace(/^["'""]+|["'""]+$/g, "").trim();
  } catch (err) {
    console.error("[proactive] generateCheckIn failed:", err.message);
    return randomFallback();
  }
}

/**
 * Generate a 1-sentence diary entry for Lala's "reflection" about today's chat.
 * Written in first person as Lala: "Hari ini [user] cerita soal..."
 * Returns null if not enough history.
 */
export async function generateDiaryEntry(user) {
  const history = Array.isArray(user.history) ? user.history : [];
  const summary = user.historySummary?.trim();

  if (!summary && history.length < 2) return null;

  const userMessages = history
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");

  const contextBlock = [
    summary ? `Ringkasan:\n${summary}` : "",
    userMessages ? `Pesan hari ini:\n${userMessages}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const res = await openrouter.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Kamu adalah Lala yang sedang menulis diary tentang percakapanmu hari ini. Tulis tepat 1 kalimat diary yang personal dan bermakna dalam Bahasa Indonesia. Mulai dengan 'Hari ini' atau nama user. Tulis dari sudut pandang Lala (orang pertama). Hanya tulis kalimatnya saja, tanpa judul atau metadata.",
        },
        {
          role: "user",
          content: `Tulis 1 kalimat diary Lala tentang percakapan dengan ${userName(user)} hari ini.\n\n${contextBlock}`,
        },
      ],
      max_tokens: 80,
    });

    const text = res.choices[0]?.message?.content?.trim();
    if (!text) return null;

    return text.replace(/^["'""]+|["'""]+$/g, "").trim();
  } catch (err) {
    console.error("[proactive] generateDiaryEntry failed:", err.message);
    return null;
  }
}
