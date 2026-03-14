import { Markup } from "telegraf";
import { TALLY_FORM_URL, AI_DAILY_LIMIT, AI_EXTEND_PRICE, AI_EXTEND_BONUS } from "../config/index.js";
import {
  ensureUser,
  getUser,
  getRoomPartner,
  checkAndIncrementAi,
  saveHistory,
} from "../db/index.js";
import { chat } from "../ai/curhat.js";
import { isNegativeContent, isSelfHarmSignal } from "../lib/content.js";
import { sendSafeDM } from "./index.js";

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

  // ── Tally gate ──────────────────────────────────────────────────────────────
  if (!user?.tallyDone) {
    const formUrl = `${TALLY_FORM_URL}?id=${userId}`;
    return ctx.reply(
      `Hei! Lala belum kenal kamu nih 🥺\n\nIsi form singkat ini dulu biar Lala bisa kenal kamu lebih baik:\n👉 <a href="${formUrl}">Kenalan sama Lala</a>`,
      { parse_mode: "HTML", disable_web_page_preview: true }
    );
  }

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
    return ctx.reply("Hmm, Lala nggak nemu teman chatmu. Ketik /stop lalu /temen lagi ya.");
  }

  // Moderation check
  if (isNegativeContent(text)) {
    await ctx.reply(
      `⚠️ <b>Lala perlu ingatkan:</b>\n\nYuk jaga obrolan kita tetap positif dan nyaman buat semua orang. Lala selalu ada buat dengerin kalian, tapi tolong hormati satu sama lain ya 💗`,
      { parse_mode: "HTML" }
    );

    // Also warn partner
    await sendSafeDM(
      ctx.telegram,
      partnerId,
      `⚠️ <b>Lala perlu ingatkan:</b>\n\nAda pesan yang terdeteksi kurang nyaman. Lala minta kalian jaga obrolan tetap positif ya 💗`,
      { parse_mode: "HTML" }
    );
    return;
  }

  // Self-harm signal — Lala responds with care, still relay
  if (isSelfHarmSignal(text)) {
    await ctx.reply(
      `💗 Lala dengerin kamu. Kalau lagi berat banget, nggak ada salahnya minta bantuan profesional ya. Kamu nggak sendirian!`
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
      { parse_mode: "HTML" }
    );
  }

  // Check AI quota
  const { allowed, count } = await checkAndIncrementAi(userId, AI_DAILY_LIMIT);

  if (!allowed) {
    return ctx.reply(
      `Wah, kamu udah ngobrol sama Lala ${AI_DAILY_LIMIT}x hari ini! 🥰\n\n` +
        `Limit harian Lala udah habis, tapi kamu bisa perpanjang dengan membayar ` +
        `<b>Rp ${AI_EXTEND_PRICE.toLocaleString("id-ID")}</b> untuk +${AI_EXTEND_BONUS} respons lagi.`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback(`💳 Perpanjang Rp ${AI_EXTEND_PRICE.toLocaleString("id-ID")}`, "ai_extend")],
        ]),
      }
    );
  }

  // Show typing indicator
  await ctx.sendChatAction("typing");

  try {
    const { reply, history, historySummary } = await chat({ user, userText: text });

    // Save updated history
    await saveHistory(userId, history, historySummary);

    return ctx.reply(reply);
  } catch (err) {
    console.error("[curhat] AI error:", err);
    return ctx.reply(
      "Aduh, Lala lagi nggak bisa mikir sekarang 😔 Coba lagi sebentar ya!"
    );
  }
}
