import { Markup } from "telegraf";
import { GIFTS, GIFT_LABELS, AI_EXTEND_PRICE, AI_EXTEND_BONUS } from "../config/index.js";
import {
  getUser,
  createRoom,
  getRoomPartner,
  deductBalance,
} from "../db/index.js";
import { findMatch } from "../lib/matchmaking.js";
import { createAiExtendInvoice } from "../payments/xendit.js";
import { sendSafeDM } from "./index.js";

// Pending mutual accept: key = sorted "id1_id2" -> { user1Id, user2Id, acceptedBy: Set }
const pendingMatches = new Map();

function matchKey(a, b) {
  return [String(a), String(b)].sort().join("_");
}

async function handleAcceptMatch(ctx, targetId) {
  const userId = String(ctx.from.id);
  targetId = String(targetId);
  const user = await getUser(userId);
  const target = await getUser(targetId);

  await ctx.answerCbQuery();

  if (!user || !target) {
    return ctx.editMessageText("Hmm, teman ini udah nggak ada di antrian. Coba /temen lagi ya!");
  }

  if (user.status !== "SEARCHING" || target.status !== "SEARCHING") {
    return ctx.editMessageText(
      "Salah satu dari kalian udah nggak tersedia. Coba /temen lagi ya!"
    );
  }

  const key = matchKey(userId, targetId);
  let pending = pendingMatches.get(key);
  if (!pending) {
    const [id1, id2] = [userId, targetId].sort();
    pending = { user1Id: id1, user2Id: id2, acceptedBy: new Set() };
    pendingMatches.set(key, pending);
  }
  pending.acceptedBy.add(userId);

  // Room only after both accepted
  if (pending.acceptedBy.size < 2) {
    await ctx.editMessageText(
      "✅ Kamu udah setuju! Sekarang nunggu teman kamu setuju ya 💬"
    );
    await sendSafeDM(
      ctx.telegram,
      targetId,
      "✨ Dia udah setuju mau ngobrol! Kamu mau lanjut?",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Mau ngobrol", `accept_match_${userId}`),
          Markup.button.callback("❌ Nggak dulu", `decline_match_${userId}`),
        ],
      ])
    );
    return;
  }

  pendingMatches.delete(key);
  const room = await createRoom(pending.user1Id, pending.user2Id);

  const intro =
    `✨ Hore! Kalian berhasil terhubung!\n\n` +
    `Lala akan jaga kalian berdua ya 💗\n` +
    `Mulai ngobrol aja — Lala nemenin dari jauh.\n\n` +
    `Mau kasih hadiah? Ketik /hadiah\n` +
    `Butuh ice breaker? Ketik /ice\n` +
    `Mau selesai? Ketik /stop`;

  await ctx.editMessageText(intro);
  await sendSafeDM(ctx.telegram, targetId, intro);
}

async function handleDeclineMatch(ctx, targetId) {
  const userId = String(ctx.from.id);
  targetId = String(targetId);
  const user = await getUser(userId);

  await ctx.answerCbQuery();

  // Clear pending mutual-accept so we don't create room if the other had already accepted
  pendingMatches.delete(matchKey(userId, targetId));

  // Return decliner to SEARCHING or IDLE
  if (user?.status === "SEARCHING") {
    // Try to find another match for them
    const nextMatch = await findMatch(userId, user.concerns ?? []);
    if (nextMatch) {
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Mau ngobrol", `accept_match_${nextMatch.id}`),
          Markup.button.callback("❌ Nggak dulu", `decline_match_${nextMatch.id}`),
        ],
      ]);
      return ctx.editMessageText(
        `🌟 Lala nemuin teman lain yang mungkin cocok!\n\nMau ngobrol sama dia?`,
        keyboard
      );
    }
    return ctx.editMessageText(
      "Nggak apa-apa! Lala masih nyariin teman lain buat kamu ya 🔍"
    );
  }

  await ctx.editMessageText(
    "Oke, Lala masih nyariin yang lain buat kamu ya 🔍"
  );

  // Notify the person who initiated the match (targetId) that their offer was declined
  await sendSafeDM(
    ctx.telegram,
    targetId,
    "Hmm, teman ini lagi nggak bisa ya. Lala masih nyariin teman lain! 🔍"
  );
}

// ─── Gifts ────────────────────────────────────────────────────────────────────

async function handleGift(ctx, giftKey) {
  const userId = String(ctx.from.id);
  const price = GIFTS[giftKey];
  const label = GIFT_LABELS[giftKey];

  if (!price) {
    await ctx.answerCbQuery("Hadiah nggak valid.");
    return;
  }

  await ctx.answerCbQuery();

  const user = await getUser(userId);
  if (!user || user.status !== "LIVE") {
    return ctx.editMessageText("Kamu harus lagi ngobrol sama teman dulu buat kirim hadiah!");
  }

  const partnerId = await getRoomPartner(userId);
  if (!partnerId) {
    return ctx.editMessageText("Teman chatmu nggak ketemu. Coba /stop lalu /temen lagi.");
  }

  const updated = await deductBalance(userId, price);
  if (!updated) {
    return ctx.editMessageText(
      `Saldo kamu nggak cukup buat kirim ${label} (Rp ${price.toLocaleString("id-ID")}).\n` +
        `Isi saldo dulu dengan /topup ya!`
    );
  }

  await ctx.editMessageText(
    `${label} berhasil dikirim! 🎉\nSaldo tersisa: Rp ${updated.balance.toLocaleString("id-ID")}`
  );

  await sendSafeDM(
    ctx.telegram,
    partnerId,
    `🎁 Kamu dapat kiriman ${label} dari temanmu!\n\nLala ikut seneng~ 💗`
  );
}

// ─── AI extend ────────────────────────────────────────────────────────────────

async function handleAiExtend(ctx) {
  const userId = String(ctx.from.id);
  await ctx.answerCbQuery();

  try {
    const { invoiceUrl } = await createAiExtendInvoice(userId);
    return ctx.editMessageText(
      `💳 Invoice perpanjang AI dibuat!\n\n` +
        `Bayar <b>Rp ${AI_EXTEND_PRICE.toLocaleString("id-ID")}</b> untuk dapat +${AI_EXTEND_BONUS} respons lagi hari ini.\n\n` +
        `👉 <a href="${invoiceUrl}">Bayar Sekarang</a>`,
      { parse_mode: "HTML", disable_web_page_preview: true }
    );
  } catch (err) {
    console.error("[ai_extend]", err);
    return ctx.editMessageText("Gagal buat invoice. Coba lagi ya!");
  }
}

// ─── Register ─────────────────────────────────────────────────────────────────

export function registerActions(bot) {
  // Match callbacks: accept_match_{userId} / decline_match_{userId}
  bot.action(/^accept_match_(.+)$/, (ctx) => {
    const targetId = ctx.match[1];
    return handleAcceptMatch(ctx, targetId);
  });

  bot.action(/^decline_match_(.+)$/, (ctx) => {
    const targetId = ctx.match[1];
    return handleDeclineMatch(ctx, targetId);
  });

  // Gift callbacks: gift_{key}
  bot.action(/^gift_(.+)$/, (ctx) => {
    const giftKey = ctx.match[1];
    return handleGift(ctx, giftKey);
  });

  // AI quota extension
  bot.action("ai_extend", handleAiExtend);
}
