import { Markup } from "telegraf";
import {
  TALLY_FORM_URL,
  TOPUP_MIN,
  GIFTS,
  GIFT_LABELS,
  ICE_BREAKERS,
} from "../config/index.js";
import {
  ensureUser,
  getUser,
  upsertUser,
  createRoom,
  getRoomPartner,
  endRoom,
} from "../db/index.js";
import { findMatch } from "../lib/matchmaking.js";
import { createTopUpInvoice } from "../payments/xendit.js";
import { sendSafeDM } from "./index.js";
import { extractSingleSentence, renderWrapImagePng } from "../lib/wrapImage.js";
import { summarizeWrapQuote } from "../ai/wrapQuote.js";

// ─── /start ───────────────────────────────────────────────────────────────────

export async function cmdStart(ctx) {
  const userId = String(ctx.from.id);
  await ensureUser(userId);

  const user = await getUser(userId);

  // If profile tally already completed (or user chose to skip), greet directly.
  if (user?.tallyDone) {
    return ctx.reply(
      `Halo! Aku Lala 🌸 seneng banget kamu balik lagi!\n\n` +
        `Ceritain aja apa yang lagi kamu rasain sekarang 💬\n\n` +
        `Kalau butuh bantuan, ketik /bantuan ya!`,
    );
  }

  // First time: give optional "Fill form" button + a "Skip" button.
  const formUrl = `${TALLY_FORM_URL}?id=${userId}`;

  return ctx.reply(
    `Halo! Aku Lala 🌸 seneng banget kamu mau kenalan sama aku!\n\n` +
      `Biar aku bisa jadi teman yang beneran ngerti kamu, kamu bisa isi form profil ini.\n\n` +
      `Kalau kamu nggak mau ngisi sekarang juga nggak apa-apa kok—ketik aja apa yang lagi kamu rasain sekarang 💬\n\n` +
      `Kalau butuh bantuan, ketik /bantuan ya!`,
    {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...Markup.inlineKeyboard([
        [Markup.button.url("Kenalan yuk! 💬", formUrl)],
        [Markup.button.callback("Skip", "skip_tally")],
      ]),
    },
  );
}

// ─── /bantuan ─────────────────────────────────────────────────────────────────

export async function cmdBantuan(ctx) {
  return ctx.reply(
    `<b>🌸 Yang bisa Lala lakuin buat kamu:</b>\n\n` +
      `💬 <b>Curhat</b> — Ketik apa aja, Lala siap dengerin (30 pesan/hari)\n\n` +
      `👥 <b>/temen</b> — Temukan teman ngobrol anonim yang senasib\n\n` +
      `🧊 <b>/ice</b> — Ice breaker saat lagi nggak tau mau ngomong apa (di dalam chat teman)\n\n` +
      `🛑 <b>/stop</b> — Akhiri sesi chat sama teman\n\n` +
      `👤 <b>/profil</b> — Lihat & edit profilmu\n\n` +
      `💰 <b>/topup</b> — Isi saldo buat kirim hadiah ke teman\n\n` +
      `<b>🎁 Hadiah yang bisa kamu kirim:</b>\n` +
      `🍫 Coklat — Rp 4.000\n` +
      `🤗 Peluk — Rp 2.000\n` +
      `🍬 Permen — Rp 1.000\n` +
      `☕ Kopi — Rp 3.000`,
    { parse_mode: "HTML" },
  );
}

// ─── /profil ──────────────────────────────────────────────────────────────────

export async function cmdProfil(ctx) {
  const userId = String(ctx.from.id);
  const user = await getUser(userId);

  if (!user?.tallyDone) {
    const formUrl = `${TALLY_FORM_URL}?id=${userId}`;
    return ctx.reply(
      `Kamu belum isi form profil Lala nih.\n\n` +
        `Form ini <b>opsional</b>, tapi kalau kamu mau, isi di sini ya:\n` +
        `👉 <a href="${formUrl}">Isi Profil</a>`,
      { parse_mode: "HTML", disable_web_page_preview: true },
    );
  }

  const genderLabel =
    user.gender === "male"
      ? "🙋‍♂️ Cowok"
      : user.gender === "female"
        ? "🙋‍♀️ Cewek"
        : "😶‍🌫️ Rahasia";

  const concerns = user.concerns?.length
    ? user.concerns.join(", ")
    : "Belum diisi";

  const occupationLabel = user.occupation || "Belum diisi";

  return ctx.reply(
    `<b>👤 Profilmu di Lala</b>\n\n` +
      `📛 Nama: <b>${user.name || "Belum diisi"}</b>\n` +
      `${genderLabel}\n` +
      `💼 Kesibukan: ${occupationLabel}\n` +
      `💭 Lagi kepikiran: ${concerns}\n` +
      `💰 Saldo: Rp ${(user.balance ?? 0).toLocaleString("id-ID")}\n\n` +
      `Mau edit profil? Isi ulang formnya di sini:\n` +
      `👉 <a href="${TALLY_FORM_URL}?id=${userId}">Edit Profil</a>`,
    { parse_mode: "HTML", disable_web_page_preview: true },
  );
}

// ─── /topup ───────────────────────────────────────────────────────────────────

export async function cmdTopup(ctx) {
  const userId = String(ctx.from.id);
  const user = await getUser(userId);

  const args = ctx.message.text.split(" ");
  const amount = parseInt(args[1], 10);

  if (!amount || amount < TOPUP_MIN) {
    return ctx.reply(
      `💰 Top-up saldo Lala\n\nMinimum top-up: Rp ${TOPUP_MIN.toLocaleString("id-ID")}\n\nContoh: <code>/topup 10000</code>`,
      { parse_mode: "HTML" },
    );
  }

  try {
    const { invoiceUrl } = await createTopUpInvoice(userId, amount);
    return ctx.reply(
      `💳 Invoice top-up sebesar <b>Rp ${amount.toLocaleString("id-ID")}</b> sudah dibuat!\n\n` +
        `Klik link di bawah untuk bayar:\n👉 <a href="${invoiceUrl}">Bayar Sekarang</a>\n\n` +
        `Saldo akan otomatis bertambah setelah pembayaran sukses.`,
      { parse_mode: "HTML", disable_web_page_preview: true },
    );
  } catch (err) {
    console.error("[topup]", err);
    return ctx.reply("Aduh, gagal buat invoice. Coba lagi sebentar ya!");
  }
}

// ─── /temen ───────────────────────────────────────────────────────────────────

export async function cmdTemen(ctx) {
  const userId = String(ctx.from.id);
  const user = await getUser(userId);

  if (user.status === "LIVE") {
    return ctx.reply(
      "Kamu lagi ngobrol sama teman nih! Ketik /stop dulu kalau mau cari teman baru.",
    );
  }

  if (user.status === "SEARCHING") {
    return ctx.reply(
      "Lala lagi nyariin teman buat kamu, sabar ya! 🔍\n\nKalau mau batal, ketik /stop.",
    );
  }

  // Set to SEARCHING
  await upsertUser(userId, { status: "SEARCHING" });

  const match = await findMatch(userId, user.concerns ?? []);

  if (!match) {
    return ctx.reply(
      "🔍 Lala lagi nyariin teman yang cocok buat kamu...\n\n" +
        "Lala kasih tau kamu kalau udah ketemu ya! Sambil nunggu, boleh curhat dulu sama Lala 💬",
    );
  }

  // Found a candidate — connect immediately without approval buttons.
  await createRoom(userId, match.id);

  const intro =
    `✨ Hore! Kalian berhasil terhubung!\n\n` +
    `Lala akan jaga kalian berdua ya 💗\n` +
    `Mulai ngobrol aja — Lala nemenin dari jauh.\n\n` +
    `Mau kasih hadiah? Ketik /hadiah\n` +
    `Butuh ice breaker? Ketik /ice\n` +
    `Mau selesai? Ketik /stop`;

  await sendSafeDM(ctx.telegram, match.id, intro);
  return ctx.reply(intro);
}

// ─── /ice ─────────────────────────────────────────────────────────────────────

export async function cmdIce(ctx) {
  const userId = String(ctx.from.id);
  const user = await getUser(userId);

  if (user.status !== "LIVE") {
    return ctx.reply(
      "Ice breaker hanya bisa dipakai saat kamu lagi ngobrol sama teman. Ketik /temen dulu ya!",
    );
  }

  const partnerId = await getRoomPartner(userId);
  if (!partnerId) {
    return ctx.reply(
      "Hmm, Lala nggak nemu teman chatmu. Coba /stop lalu /temen lagi ya.",
    );
  }

  const question =
    ICE_BREAKERS[Math.floor(Math.random() * ICE_BREAKERS.length)];

  const iceMsg =
    `🧊 <b>Ice Breaker dari Lala!</b>\n\n` +
    `❓ <i>${question}</i>\n\n` +
    `Jawab dulu, terus tanya balik ke teman kamu ya~ 😊`;

  await ctx.reply(iceMsg, { parse_mode: "HTML" });
  await sendSafeDM(ctx.telegram, partnerId, iceMsg, { parse_mode: "HTML" });
}

// ─── /stop ────────────────────────────────────────────────────────────────────

export async function cmdStop(ctx) {
  const userId = String(ctx.from.id);
  const user = await getUser(userId);

  if (!user) return ctx.reply("Ketik /start dulu ya!");

  if (user.status === "SEARCHING") {
    await upsertUser(userId, { status: "IDLE" });
    return ctx.reply(
      "Oke, Lala berhenti nyariin teman buat kamu. Kapan mau lanjut, ketik /temen lagi ya!",
    );
  }

  if (user.status === "LIVE" && user.roomId) {
    const partnerId = await getRoomPartner(userId);
    await endRoom(user.roomId);

    await ctx.reply(
      "Sesi obrolan udah selesai. Semoga obrolan tadi bermanfaat ya! 🌸\n\nMau cari teman lagi? Ketik /temen!",
    );

    if (partnerId) {
      await sendSafeDM(
        ctx.telegram,
        partnerId,
        "Teman kamu sudah menutup sesi obrolan. Semoga obrolan tadi membantu ya! 🌸\n\nMau cari teman baru? Ketik /temen!",
      );
    }
    return;
  }

  return ctx.reply(
    "Kamu lagi nggak ada sesi aktif nih. Mau ngobrol sama teman? Ketik /temen!",
  );
}

// ─── /wrap ──────────────────────────────────────────────────────────────────
// Generate 1:1 quote image using static SVG->PNG rendering (AI only for quote text).
export async function cmdWrap(ctx) {
  const userId = String(ctx.from.id);
  await ensureUser(userId);

  const user = await getUser(userId);

  try {
    let quote = "";
    const historySummary = user?.historySummary;

    if (historySummary?.trim()) {
      try {
        quote = await summarizeWrapQuote(historySummary);
      } catch (err) {
        // Fallback: if AI fails, try the old deterministic extraction.
        console.error("[wrap] AI summarize failed:", err);
        quote = extractSingleSentence(historySummary) ?? "";
      }
    }

    const pngBuffer = await renderWrapImagePng({ quote });

    // Telegraf: replyWithPhoto can take a buffer as `source`.
    return ctx.replyWithPhoto({ source: pngBuffer, filename: "wrap.png" });
  } catch (err) {
    console.error("[wrap] failed to render:", err);
    return ctx.reply("Aduh, gagal bikin gambar wrap. Coba lagi ya!");
  }
}

// ─── Gift helper (used from actions) ─────────────────────────────────────────

/**
 * Send a gift keyboard to a user in a LIVE room.
 */
export async function sendGiftKeyboard(ctx) {
  const userId = String(ctx.from.id);
  const user = await getUser(userId);

  if (user.status !== "LIVE") {
    return ctx.reply(
      "Hadiah hanya bisa dikirim saat kamu lagi ngobrol sama teman.",
    );
  }

  const buttons = Object.entries(GIFTS).map(([key, price]) => [
    Markup.button.callback(
      `${GIFT_LABELS[key]} — Rp ${price.toLocaleString("id-ID")}`,
      `gift_${key}`,
    ),
  ]);

  return ctx.reply(
    `🎁 Pilih hadiah untuk temanmu:\n<i>Saldo kamu: Rp ${(user.balance ?? 0).toLocaleString("id-ID")}</i>`,
    { parse_mode: "HTML", ...Markup.inlineKeyboard(buttons) },
  );
}

// ─── Register ─────────────────────────────────────────────────────────────────

export function registerCommands(bot) {
  bot.command("start", cmdStart);
  bot.command("bantuan", cmdBantuan);
  bot.command("profil", cmdProfil);
  bot.command("topup", cmdTopup);
  bot.command("temen", cmdTemen);
  bot.command("ice", cmdIce);
  bot.command("stop", cmdStop);
  bot.command("wrap", cmdWrap);
  bot.command("hadiah", sendGiftKeyboard);
}
