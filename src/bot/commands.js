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
  getRoomPartner,
  endRoom,
} from "../db/index.js";
import { findMatch } from "../lib/matchmaking.js";
import { createTopUpInvoice } from "../payments/xendit.js";
import { sendSafeDM } from "./index.js";

// ─── /start ───────────────────────────────────────────────────────────────────

export async function cmdStart(ctx) {
  const userId = String(ctx.from.id);
  await ensureUser(userId);

  const user = await getUser(userId);

  if (user?.tallyDone) {
    const name = user.name ? `, ${user.name}` : "";
    return ctx.reply(
      `Hei${name}! Lala udah kenal kamu 🌸\n\nKetik apa aja buat mulai ngobrol. Kalau butuh bantuan ketik /bantuan ya!`,
      { parse_mode: "HTML" }
    );
  }

  const formUrl = `${TALLY_FORM_URL}?id=${userId}`;

  return ctx.reply(
    `Halo! Aku Lala 🌸 seneng banget kamu mau kenalan sama aku!\n\n` +
      `Sebelum kita mulai ngobrol, aku mau kenal kamu dulu dong — biar Lala bisa jadi teman yang beneran ngerti kamu.\n\n` +
      `Yuk isi form singkat ini dulu ya:\n👉 <a href="${formUrl}">Kenalan sama Lala</a>\n\n` +
      `Setelah form diisi, Lala langsung siap dengerin kamu! 💬`,
    { parse_mode: "HTML", disable_web_page_preview: true }
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
    { parse_mode: "HTML" }
  );
}

// ─── /profil ──────────────────────────────────────────────────────────────────

export async function cmdProfil(ctx) {
  const userId = String(ctx.from.id);
  const user = await getUser(userId);

  if (!user?.tallyDone) {
    return ctx.reply("Kamu belum isi form Lala dulu nih! Ketik /start ya.");
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
    { parse_mode: "HTML", disable_web_page_preview: true }
  );
}

// ─── /topup ───────────────────────────────────────────────────────────────────

export async function cmdTopup(ctx) {
  const userId = String(ctx.from.id);
  const user = await getUser(userId);

  if (!user?.tallyDone) {
    return ctx.reply("Isi form Lala dulu ya! Ketik /start.");
  }

  const args = ctx.message.text.split(" ");
  const amount = parseInt(args[1], 10);

  if (!amount || amount < TOPUP_MIN) {
    return ctx.reply(
      `💰 Top-up saldo Lala\n\nMinimum top-up: Rp ${TOPUP_MIN.toLocaleString("id-ID")}\n\nContoh: <code>/topup 10000</code>`,
      { parse_mode: "HTML" }
    );
  }

  try {
    const { invoiceUrl } = await createTopUpInvoice(userId, amount);
    return ctx.reply(
      `💳 Invoice top-up sebesar <b>Rp ${amount.toLocaleString("id-ID")}</b> sudah dibuat!\n\n` +
        `Klik link di bawah untuk bayar:\n👉 <a href="${invoiceUrl}">Bayar Sekarang</a>\n\n` +
        `Saldo akan otomatis bertambah setelah pembayaran sukses.`,
      { parse_mode: "HTML", disable_web_page_preview: true }
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

  if (!user?.tallyDone) {
    return ctx.reply("Isi form Lala dulu ya! Ketik /start.");
  }

  if (user.status === "LIVE") {
    return ctx.reply(
      "Kamu lagi ngobrol sama teman nih! Ketik /stop dulu kalau mau cari teman baru."
    );
  }

  if (user.status === "SEARCHING") {
    return ctx.reply(
      "Lala lagi nyariin teman buat kamu, sabar ya! 🔍\n\nKalau mau batal, ketik /stop."
    );
  }

  // Set to SEARCHING
  await upsertUser(userId, { status: "SEARCHING" });

  const match = await findMatch(userId, user.concerns ?? []);

  if (!match) {
    return ctx.reply(
      "🔍 Lala lagi nyariin teman yang cocok buat kamu...\n\n" +
        "Lala kasih tau kamu kalau udah ketemu ya! Sambil nunggu, boleh curhat dulu sama Lala 💬"
    );
  }

  // Found a candidate — send approval request to both
  const makeKeyboard = (targetId) =>
    Markup.inlineKeyboard([
      [
        Markup.button.callback("✅ Mau ngobrol", `accept_match_${targetId}`),
        Markup.button.callback("❌ Nggak dulu", `decline_match_${targetId}`),
      ],
    ]);

  await sendSafeDM(
    ctx.telegram,
    match.id,
    `👋 Hei! Ada yang mau kenalan sama kamu nih!\n\nKita punya hal yang mirip loh — mau ngobrol bareng nggak?`,
    makeKeyboard(userId)
  );

  return ctx.reply(
    `🌟 Lala nemuin seseorang yang kayaknya cocok buat kamu!\n\nTunggu sebentar ya — lagi nunggu dia setuju dulu...`,
    makeKeyboard(match.id)
  );
}

// ─── /ice ─────────────────────────────────────────────────────────────────────

export async function cmdIce(ctx) {
  const userId = String(ctx.from.id);
  const user = await getUser(userId);

  if (!user?.tallyDone) {
    return ctx.reply("Isi form Lala dulu ya! Ketik /start.");
  }

  if (user.status !== "LIVE") {
    return ctx.reply(
      "Ice breaker hanya bisa dipakai saat kamu lagi ngobrol sama teman. Ketik /temen dulu ya!"
    );
  }

  const partnerId = await getRoomPartner(userId);
  if (!partnerId) {
    return ctx.reply("Hmm, Lala nggak nemu teman chatmu. Coba /stop lalu /temen lagi ya.");
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
    return ctx.reply("Oke, Lala berhenti nyariin teman buat kamu. Kapan mau lanjut, ketik /temen lagi ya!");
  }

  if (user.status === "LIVE" && user.roomId) {
    const partnerId = await getRoomPartner(userId);
    await endRoom(user.roomId);

    await ctx.reply(
      "Sesi obrolan udah selesai. Semoga obrolan tadi bermanfaat ya! 🌸\n\nMau cari teman lagi? Ketik /temen!"
    );

    if (partnerId) {
      await sendSafeDM(
        ctx.telegram,
        partnerId,
        "Teman kamu sudah menutup sesi obrolan. Semoga obrolan tadi membantu ya! 🌸\n\nMau cari teman baru? Ketik /temen!"
      );
    }
    return;
  }

  return ctx.reply(
    "Kamu lagi nggak ada sesi aktif nih. Mau ngobrol sama teman? Ketik /temen!"
  );
}

// ─── Gift helper (used from actions) ─────────────────────────────────────────

/**
 * Send a gift keyboard to a user in a LIVE room.
 */
export async function sendGiftKeyboard(ctx) {
  const userId = String(ctx.from.id);
  const user = await getUser(userId);

  if (!user?.tallyDone || user.status !== "LIVE") {
    return ctx.reply("Hadiah hanya bisa dikirim saat kamu lagi ngobrol sama teman.");
  }

  const buttons = Object.entries(GIFTS).map(([key, price]) => [
    Markup.button.callback(
      `${GIFT_LABELS[key]} — Rp ${price.toLocaleString("id-ID")}`,
      `gift_${key}`
    ),
  ]);

  return ctx.reply(
    `🎁 Pilih hadiah untuk temanmu:\n<i>Saldo kamu: Rp ${(user.balance ?? 0).toLocaleString("id-ID")}</i>`,
    { parse_mode: "HTML", ...Markup.inlineKeyboard(buttons) }
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
  bot.command("hadiah", sendGiftKeyboard);
}
