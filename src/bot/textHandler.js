import { Markup } from "telegraf";
import {
  AI_DAILY_LIMIT,
  AI_EXTEND_PRICE,
  AI_EXTEND_BONUS,
} from "../config/index.js";
import {
  ensureUser,
  getUser,
  getRoomPartner,
  checkAndIncrementAi,
  saveHistory,
  updateLastChatAt,
  incrementToxicCount,
  decrementToxicCount,
} from "../db/index.js";
import { chat, deriveMood } from "../ai/curhat.js";
import { isNegativeContent, isSelfHarmSignal, isDismissiveOfLala } from "../lib/content.js";
import { sendSafeDM } from "./index.js";
import { sleep, randomBetween, sendWithTyping } from "../lib/typing.js";

/**
 * Main text message handler — handles both curhat (1:1 with Lala)
 * and live room relay (1:1 with anonymous partner).
 */
export async function handleText(ctx) {
  const userId = String(ctx.from.id);
  const text = ctx.message.text?.trim();

  if (!text) return;

  // Ensure user row exists
  await ensureUser(userId);
  const user = await getUser(userId);

  // ── Live room relay ──────────────────────────────────────────────────────────
  if (user.status === "LIVE" && user.roomId) {
    return handleRoomMessage(ctx, user, text);
  }

  // ── Curhat with Lala ─────────────────────────────────────────────────────────
  return handleCurhat(ctx, user, text);
}

// ─── Room relay ───────────────────────────────────────────────────────────────

async function handleRoomMessage(ctx, user, text) {
  const userId = String(ctx.from.id);

  const partnerId = await getRoomPartner(userId);
  if (!partnerId) {
    return ctx.reply(
      "Hmm, Lala nggak nemu teman chatmu. Ketik /stop lalu /temen lagi ya.",
    );
  }

  // Moderation check — toxic messages degrade Lala's mood for this user
  if (isNegativeContent(text)) {
    await incrementToxicCount(userId);

    await ctx.reply(
      `⚠️ <b>Lala perlu ingatkan:</b>\n\nYuk jaga obrolan kita tetap positif dan nyaman buat semua orang. Lala selalu ada buat dengerin kalian, tapi tolong hormati satu sama lain ya 💗`,
      { parse_mode: "HTML" },
    );

    // Also warn partner
    await sendSafeDM(
      ctx.telegram,
      partnerId,
      `⚠️ <b>Lala perlu ingatkan:</b>\n\nAda pesan yang terdeteksi kurang nyaman. Lala minta kalian jaga obrolan tetap positif ya 💗`,
      { parse_mode: "HTML" },
    );
    return;
  }

  // Self-harm signal — Lala responds with care, still relay
  if (isSelfHarmSignal(text)) {
    await ctx.reply(
      `💗 Lala dengerin kamu. Kalau lagi berat banget, nggak ada salahnya minta bantuan profesional ya. Kamu nggak sendirian!`,
    );
  }

  // Relay message to partner (anonymous — no username shown)
  await sendSafeDM(ctx.telegram, partnerId, `💬 ${text}`);
}

// ─── Curhat ───────────────────────────────────────────────────────────────────

async function handleCurhat(ctx, user, text) {
  const userId = String(ctx.from.id);

  // Self-harm — always respond, skip quota
  if (isSelfHarmSignal(text)) {
    return ctx.reply(
      `💗 Lala dengerin kamu, dan Lala peduli banget sama kamu.\n\n` +
        `Kalau kamu lagi beneran ngerasa nggak kuat, tolong hubungi Into The Light Indonesia ya:\n` +
        `📞 <b>119 ext 8</b> (hotline 24 jam)\n\n` +
        `Kamu nggak sendirian. Lala ada di sini.`,
      { parse_mode: "HTML" },
    );
  }

  // Dismissive — user is pushing Lala away; respect it and back off
  if (isDismissiveOfLala(text)) {
    await incrementToxicCount(userId);
    return ctx.reply(
      "Oh, maaf ya kalau aku ganggu. Aku bakal diem dulu kalau gitu. Chat aja kalau udah butuh ya.",
    );
  }

  // Check AI quota
  const { allowed } = await checkAndIncrementAi(userId, AI_DAILY_LIMIT);

  if (!allowed) {
    return ctx.reply(
      `Wah, kamu udah ngobrol sama Lala ${AI_DAILY_LIMIT}x hari ini! 🥰\n\n` +
        `Limit harian Lala udah habis, tapi kamu bisa perpanjang dengan membayar ` +
        `<b>Rp ${AI_EXTEND_PRICE.toLocaleString("id-ID")}</b> untuk +${AI_EXTEND_BONUS} respons lagi.`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              `💳 Perpanjang Rp ${AI_EXTEND_PRICE.toLocaleString("id-ID")}`,
              "ai_extend",
            ),
          ],
        ]),
      },
    );
  }

  // Derive Lala's current mood from recent toxic count
  const narrativeMood = deriveMood(user.toxicCount ?? 0);

  // Non-toxic message: slowly cool down the mood score
  if (!isNegativeContent(text)) {
    await decrementToxicCount(userId);
  }

  // 1. Show typing immediately so user sees a reaction
  await ctx.sendChatAction("typing");

  // 2. Thinking delay — Lala "reads" the message before she starts typing
  await sleep(randomBetween(1500, 2500));

  // 3. Keep the typing indicator alive every 4 s while waiting on the AI
  const keepTyping = setInterval(
    () => ctx.sendChatAction("typing").catch(() => {}),
    4000,
  );

  let reply, history, historySummary;
  try {
    ({ reply, history, historySummary } = await chat({
      user,
      userText: text,
      narrativeMood,
    }));
  } catch (err) {
    clearInterval(keepTyping);
    console.error("[curhat] AI error:", err);
    return ctx.reply(
      "Aduh, Lala lagi nggak bisa mikir sekarang 😔 Coba lagi sebentar ya!",
    );
  }

  clearInterval(keepTyping);

  // Save updated history and mark last chat time
  await Promise.all([
    saveHistory(userId, history, historySummary),
    updateLastChatAt(userId),
  ]);

  // 4. Typing simulation + optional split send
  await sendWithTyping(ctx, reply, narrativeMood);
}
