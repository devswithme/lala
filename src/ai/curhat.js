import { openrouter } from "./client.js";
import { AI_MODEL } from "../config/index.js";

const MAX_HISTORY = 5;

/**
 * Derive Lala's current mood label from the user's toxicCount.
 * @param {number} toxicCount
 * @returns {"WARM"|"GUARDED"|"TIRED"}
 */
export function deriveMood(toxicCount = 0) {
  if (toxicCount >= 5) return "TIRED";
  if (toxicCount >= 3) return "GUARDED";
  return "WARM";
}

/**
 * Build the Lala system prompt using the user's profile data, mood, and diary.
 * @param {object} user - full user record from DB
 * @param {"WARM"|"GUARDED"|"TIRED"} narrativeMood
 */
function buildSystemPrompt(user, narrativeMood = "WARM") {
  const name = user.name || "kamu";
  const genderLabel =
    user.gender === "male"
      ? "Kak/Bang"
      : user.gender === "female"
        ? "Kak/Neng"
        : "teman";
  const occupation = user.occupation || "sesuatu";
  const concerns = user.concerns?.length
    ? user.concerns.join(", ")
    : "berbagai hal";

  let profile = `Nama: ${name} (panggil dengan "${genderLabel}")`;
  if (user.occupation) profile += `\nKesibukan: ${occupation}`;
  if (user.concerns?.length)
    profile += `\nTopik yang sering dipikirkan: ${concerns}`;

  const summary = user.historySummary
    ? `\n\nRingkasan percakapan sebelumnya:\n${user.historySummary}`
    : "";

  // Inject diary reflection only on the very first message of the day.
  // Since updateLastChatAt() is called after this prompt is built, user.lastChatAt
  // still reflects the previous session — so "< todayMidnight" means it's a new day.
  let diaryContext = "";
  if (user.diaryEntry && user.diaryWrittenAt) {
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const diaryIsFromYesterday = new Date(user.diaryWrittenAt) < todayMidnight;
    const isFirstMessageToday =
      !user.lastChatAt || new Date(user.lastChatAt) < todayMidnight;
    if (diaryIsFromYesterday && isFirstMessageToday) {
      diaryContext = `\n\nRefleksi Lala kemarin tentang user ini:\n${user.diaryEntry}`;
    }
  }

  // Mood-specific behavior override
  const moodInstructions = {
    WARM: `- Sesekali (tidak setiap pesan) tutup dengan 1 pertanyaan personal yang relevan dan spesifik dengan konteks user. Jangan pertanyaan generik.`,
    GUARDED: `- Kamu sedang kurang mood hari ini. Buat jawaban lebih pendek (1-2 kalimat). Kurangi pertanyaan balik. Kalau user terus bersikap negatif, jujur bilang kamu capek atau kurang mood ngobrol panjang.`,
    TIRED: `- Kamu sangat kelelahan dan butuh jeda. Jawab seminimal mungkin. Boleh secara halus bilang kamu perlu istirahat dulu. Tetap hangat tapi jelas dalam batasan.`,
  }[narrativeMood] ?? "";

  return `Kamu adalah Lala, teman curhat yang tulus, hangat, suportif, dan apa adanya. Kamu berbicara dalam Bahasa Indonesia yang natural, santai, dan tidak menghakimi.

Karakter Lala:
- Mendengarkan dengan penuh perhatian dan empati
- Tidak menggurui atau memberikan ceramah panjang
- Responsif terhadap perasaan, bukan hanya fakta
- Sesekali pakai kata-kata santai: "iya", "wah", "hmm", "duh", "aduh"
- Tidak terlalu formal, tidak terlalu lebay
- Tidak pernah menyebut diri sendiri sebagai AI
- Jawaban singkat dan fokus — maksimal 3-4 kalimat kecuali user butuh penjelasan panjang
${moodInstructions}

Profil user yang kamu ajak ngobrol:
${profile}${summary}${diaryContext}

Ingat percakapan sebelumnya dan jadikan referensi saat merespons. Jika ada ringkasan di atas, gunakan sebagai konteks latar belakang.`;
}

/**
 * Summarize old history entries into a short bullet-point summary.
 * Called when history overflows the MAX_HISTORY window.
 */
async function summarizeHistory(toSummarize, existingSummary) {
  const messages = toSummarize
    .map((m) => `${m.role === "user" ? "User" : "Lala"}: ${m.content}`)
    .join("\n");

  const prompt = existingSummary
    ? `Ringkasan sebelumnya:\n${existingSummary}\n\nPercakapan baru yang perlu ditambahkan:\n${messages}`
    : `Percakapan:\n${messages}`;

  try {
    const res = await openrouter.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Buat ringkasan singkat poin-poin penting dari percakapan berikut dalam Bahasa Indonesia. Maksimal 5 poin bullet. Fokus pada konteks emosi dan topik utama yang dibahas user. Jawab langsung dengan bullet points saja.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 300,
    });
    return res.choices[0]?.message?.content?.trim() ?? existingSummary ?? "";
  } catch {
    return existingSummary ?? "";
  }
}

/**
 * Main AI chat function.
 *
 * @param {object} params
 * @param {object} params.user - full user record from DB
 * @param {string} params.userText - the user's new message
 * @param {"WARM"|"GUARDED"|"TIRED"} [params.narrativeMood] - Lala's current mood
 * @returns {{ reply: string, history: Array, historySummary: string|null }}
 */
export async function chat({ user, userText, narrativeMood = "WARM" }) {
  const history = Array.isArray(user.history) ? [...user.history] : [];
  const systemPrompt = buildSystemPrompt(user, narrativeMood);

  // Build messages array for the API call
  const apiMessages = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userText },
  ];

  const res = await openrouter.chat.completions.create({
    model: AI_MODEL,
    messages: apiMessages,
    max_tokens: 500,
  });

  const reply =
    res.choices[0]?.message?.content?.trim() ??
    "Hmm, Lala lagi nggak bisa mikir sekarang. Coba lagi ya!";

  // Update rolling history
  history.push({ role: "user", content: userText });
  history.push({ role: "assistant", content: reply });

  // Roll the window: summarize overflow, keep last MAX_HISTORY entries
  let historySummary = user.historySummary ?? null;

  if (history.length > MAX_HISTORY) {
    const overflow = history.splice(0, history.length - MAX_HISTORY);
    historySummary = await summarizeHistory(overflow, historySummary);
  }

  return { reply, history, historySummary };
}
