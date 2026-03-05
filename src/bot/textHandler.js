import {
  getSession,
  upsertSession,
  decrementMood,
} from "../db/index.js";
import {
  isPrelaunchNow,
  isBetaNow,
  isFullLaunch,
  PRELAUNCH_END,
} from "../config/index.js";
import {
  safeAiCurhat,
  buildCurhatSystemContent,
  parseCurhatResponse,
} from "../ai/curhat.js";

function formatReleaseDate() {
  return PRELAUNCH_END.toLocaleDateString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

async function handleCurhat(ctx) {
  const userId = ctx.from?.id;
  const text = ctx.message?.text ?? "";
  if (!userId || !text) return;

  const session = await getSession(
    userId,
    "summary,history,gender,personality,queue_position,queue_activated_at,queue_bypassed",
  );
  const queuePosition = session?.queue_position ?? null;
  const queueActivatedAt = session?.queue_activated_at ?? null;

  // --- Prelaunch: gate all AI with static messaging ---
  if (isPrelaunchNow()) {
    const releaseDate = formatReleaseDate();
    if (queuePosition == null) {
      await ctx.reply(
        `Makasih sudah mampir curhat ke Lala 🌸\n\nSaat ini Lala masih dalam tahap persiapan (prelaunch), jadi curhat AI-nya belum dibuka.\n\nBiar nanti pas Lala buka kamu bisa dapat giliran, isi dulu form kenalan lewat perintah /start ya. Setelah isi, kamu akan masuk antrian dan Lala kabari lagi menjelang rilis pada ${releaseDate}.`,
      );
      return;
    }

    await ctx.reply(
      `Makasih sudah curhat ke Lala 🌸\n\nSekarang Lala masih dalam tahap persiapan (prelaunch), jadi AI curhatnya belum dibuka dulu ya.\n\nKamu sudah ada di antrian #${queuePosition}. Lala rencananya akan rilis ke publik pada ${releaseDate}. Nanti Lala bakal kabarin kamu lagi begitu udah mendekati rilis, jadi tetap tunggu kabar dari Lala ya. 💌`,
    );
    return;
  }

  // --- Beta: only activated users can use AI ---
  if (isBetaNow() && !isFullLaunch()) {
    if (!queueActivatedAt) {
      const posText =
        queuePosition != null
          ? `Kamu masih dalam antrian #${queuePosition}.`
          : "Kamu belum terdaftar di antrian.";

      const body =
        `${posText}\n\nSaat ini Lala lagi buka akses BETA secara bertahap, sekitar 20 orang per jam, urut dari yang paling duluan daftar.\n\nKamu akan dapat notifikasi begitu giliran kamu dibuka ya. Kalau mau, kamu juga bisa traktir Lala Rp 5.000 untuk langsung bypass antrian.`;

      const replyMarkup = {
        inline_keyboard: [
          [
            {
              text: "Traktir Lala Rp 5.000 (Bypass Antrian)",
              callback_data: "beta_bypass",
            },
          ],
        ],
      };

      await ctx.reply(body, { reply_markup: replyMarkup });
      return;
    }
  }

  // --- Full launch or non-production / activated beta: run normal AI curhat flow ---
  try {
    await decrementMood(userId);
  } catch (err) {
    console.error("decrementMood error:", err);
  }

  const historyMessages = Array.isArray(session?.history) ? session.history : [];
  const systemContent = buildCurhatSystemContent(session?.summary ?? null);

  const aiResult = await safeAiCurhat({
    systemContent,
    historyMessages,
    userText: text,
  });

  let replyText =
    "Maaf, Lala lagi agak error waktu baca curhatan kamu. Coba kirim lagi sebentar ya. 🌸";
  let nextSummary = session?.summary ?? null;
  let nextPersonality = Array.isArray(session?.personality)
    ? session.personality
    : [];
  let nextGender = session?.gender ?? "unknown";

  if (aiResult.ok && aiResult.result) {
    const rawContent =
      aiResult.result?.choices?.[0]?.message?.content ??
      aiResult.result?.message?.content ??
      "";
    const parsed = rawContent ? parseCurhatResponse(String(rawContent)) : null;
    if (parsed?.reply) replyText = String(parsed.reply);
    if (Array.isArray(parsed?.personality))
      nextPersonality = parsed.personality;
    if (typeof parsed?.summary === "string") nextSummary = parsed.summary;
    if (typeof parsed?.gender === "string") nextGender = parsed.gender;
  }

  await ctx.reply(replyText);

  const nextHistory = [
    ...historyMessages.slice(-8),
    { role: "user", content: text },
    { role: "assistant", content: replyText },
  ];

  await upsertSession({
    user_id: userId,
    summary: nextSummary,
    personality: nextPersonality,
    gender: nextGender,
    history: nextHistory,
  });
}

export function registerTextHandler(bot /*, deps */) {
  bot.on("text", async (ctx) => {
    const text = ctx.message?.text ?? "";
    // Let command handlers (/start, /stop, etc.) take precedence.
    if (text.startsWith("/")) return;
    await handleCurhat(ctx);
  });
}

