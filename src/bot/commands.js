import {
  getActiveRoomByUserId,
  getActiveGroupRoomByUserId,
  otherUserId,
  endRoom,
  endGroupRoom,
  getGroupRoomMemberIds,
  updateSessionStatus,
  walletBalance,
  walletDeduct,
  walletAdd,
  insertGiftEvent,
} from "../db/index.js";
import { createTopupInvoice } from "../payments/xendit.js";
import { GIFTS } from "../config/index.js";

function parseGiftKey(raw) {
  const key = String(raw ?? "").toLowerCase();
  return key in GIFTS ? key : null;
}

function getGiftListText() {
  return Object.entries(GIFTS)
    .map(([key, { price }]) => `• ${key} — Rp ${price.toLocaleString("id-ID")}`)
    .join("\n");
}

async function isUserInLiveContext(userId) {
  const room = await getActiveRoomByUserId(userId);
  if (room) return { kind: "one_to_one", room };
  const groupRoom = await getActiveGroupRoomByUserId(userId);
  if (groupRoom) return { kind: "group", room: groupRoom };
  return null;
}

export function registerCommands(bot, { sendSafeDM }) {
  bot.start(async (ctx) => {
    const userId = ctx.from?.id;
    const firstName = ctx.from?.first_name ?? "teman";
    const tallyUrl = `https://tally.so/r/eqB4bk?id=${encodeURIComponent(
      String(userId ?? ""),
    )}`;

    await ctx.reply(
      `Hai ${firstName}! 🌸\n\nSebelum kita sering curhat bareng, boleh kenalan dikit dulu nggak?\n\nIsi form singkat ini ya, biar Lala lebih ngerti kamu:\n${tallyUrl}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Isi form kenalan 🌸",
                url: tallyUrl,
              },
            ],
          ],
        },
      },
    );
  });

  bot.command("stop", async (ctx) => {
    try {
      const room = await getActiveRoomByUserId(ctx.from.id);
      const groupRoom = await getActiveGroupRoomByUserId(ctx.from.id);

      if (!room && !groupRoom) {
        await ctx.reply("Kamu tidak sedang dalam obrolan.");
        return;
      }

      if (room) {
        await endRoom(room.id);
        const otherId = otherUserId(room, ctx.from.id);
        await sendSafeDM(otherId, "Obrolan diakhiri. Kamu bisa cari teman lagi ya.");
        await ctx.reply("Obrolan diakhiri. Kamu bisa cari teman lagi ya.");
        await updateSessionStatus([ctx.from.id, otherId], "idle", null);
      } else {
        const memberIds = await getGroupRoomMemberIds(groupRoom.id);
        await endGroupRoom(groupRoom.id);
        await updateSessionStatus(memberIds, "idle", null);
        for (const id of memberIds) {
          await sendSafeDM(id, "Obrolan grup diakhiri. Kamu bisa cari teman lagi kapan saja.");
        }
      }
    } catch (err) {
      console.error("Stop room error:", err);
      await ctx.reply("Maaf, gagal mengakhiri room. Coba lagi ya.");
    }
  });

  bot.command("balance", async (ctx) => {
    try {
      const bal = await walletBalance(ctx.from.id);
      await ctx.reply(`Saldo kamu sekarang: Rp ${bal.toLocaleString("id-ID")}`);
    } catch (err) {
      console.error("balance error:", err);
      await ctx.reply("Gagal cek saldo. Coba lagi ya.");
    }
  });

  bot.command("topup", async (ctx) => {
    try {
      const parts = String(ctx.message.text ?? "").trim().split(/\s+/);
      const amount = Number(parts[1]);
      if (!Number.isFinite(amount) || amount < 2000) {
        await ctx.reply("Format: /topup <nominal>. Minimal 2000.");
        return;
      }
      const { invoiceUrl } = await createTopupInvoice({
        userId: ctx.from.id,
        amount,
      });
      // Guard against invalid / missing invoice URLs that could break inline keyboards.
      if (typeof invoiceUrl !== "string" || !invoiceUrl.trim()) {
        console.error("topup error: invalid invoiceUrl from Xendit", {
          userId: ctx.from.id,
          amount,
          invoiceUrl,
        });
        await ctx.reply(
          "Maaf, Lala gagal bikin tombol pembayaran topup. Coba lagi sebentar lagi ya.",
        );
        return;
      }

      const replyMarkup = {
        inline_keyboard: [[{ text: "💳 Bayar topup sekarang", url: invoiceUrl }]],
      };

      await ctx.reply(
        "Silakan bayar topup dengan tombol di bawah. Setelah berhasil, saldo kamu akan otomatis masuk.",
        {
          reply_markup: replyMarkup,
        },
      );
    } catch (err) {
      console.error("topup error:", err);
      await ctx.reply("Gagal bikin invoice topup. Pastikan Xendit sudah dikonfigurasi.");
    }
  });

  bot.command("gift", async (ctx) => {
    try {
      const live = await isUserInLiveContext(ctx.from.id);
      if (!live) {
        await ctx.reply("Perintah /gift hanya bisa dipakai saat sedang live chat.");
        return;
      }
      const parts = String(ctx.message.text ?? "").trim().split(/\s+/);
      const giftKey = parseGiftKey(parts[1]);
      if (!giftKey) {
        await ctx.reply(
          `Daftar gift (ketik 1 kata):\n${getGiftListText()}\n\nContoh: /gift kopi`,
        );
        return;
      }
      const price = GIFTS[giftKey].price;
      let targetId = null;
      if (ctx.message.reply_to_message?.from?.id) {
        targetId = ctx.message.reply_to_message.from.id;
      } else if (live.kind === "one_to_one") {
        targetId = otherUserId(live.room, ctx.from.id);
      }
      if (!targetId || targetId === ctx.from.id) {
        await ctx.reply(
          "Reply pesan orang yang mau kamu gift, atau gunakan /gift saat 1:1 (otomatis ke lawan bicara).",
        );
        return;
      }
      const { ok, balance } = await walletDeduct(ctx.from.id, price);
      if (!ok) {
        await ctx.reply(
          `Saldo kamu kurang. Saldo: Rp ${balance.toLocaleString("id-ID")}.\nTopup dulu pakai /topup 10000`,
        );
        return;
      }
      await walletAdd(targetId, price);
      await sendSafeDM(
        targetId,
        `🎁 Kamu dapat ${GIFTS[giftKey].label} senilai Rp ${price.toLocaleString("id-ID")} dari ${ctx.from.first_name ?? "seseorang"}!`,
      );
      await ctx.reply(
        `✅ Gift terkirim: ${GIFTS[giftKey].label} (Rp ${price.toLocaleString("id-ID")})`,
      );
    } catch (err) {
      console.error("gift error:", err);
      await ctx.reply("Gagal mengirim gift. Coba lagi ya.");
    }
  });

  bot.command("giftall", async (ctx) => {
    try {
      const live = await isUserInLiveContext(ctx.from.id);
      if (!live || live.kind !== "group") {
        await ctx.reply("Perintah /giftall hanya bisa dipakai di live grup.");
        return;
      }
      const parts = String(ctx.message.text ?? "").trim().split(/\s+/);
      const giftKey = parseGiftKey(parts[1]);
      const count = Number(parts[2]);
      if (!giftKey || !Number.isFinite(count) || count < 1 || count > 5) {
        await ctx.reply(
          `Daftar gift (ketik 1 kata):\n${getGiftListText()}\n\nContoh: /giftall kopi 2`,
        );
        return;
      }
      const price = GIFTS[giftKey].price;
      const total = price * count;
      const { ok, balance } = await walletDeduct(ctx.from.id, total);
      if (!ok) {
        await ctx.reply(
          `Saldo kamu kurang untuk giftall. Butuh Rp ${total.toLocaleString("id-ID")}, saldo kamu Rp ${balance.toLocaleString("id-ID")}.\nTopup dulu pakai /topup 20000`,
        );
        return;
      }
      const event = await insertGiftEvent({
        creator_user_id: ctx.from.id,
        room_kind: "group",
        room_id: live.room.id,
        gift_key: giftKey,
        amount: price,
        remaining: count,
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
      });
      const announce = `Wah, ${ctx.from.first_name ?? "seseorang"} lagi bagi-bagi ${
        GIFTS[giftKey].label
      } senilai Rp ${total.toLocaleString("id-ID")} buat ${count} orang tercepat! Klik tombol di bawah buat ambil jatahmu!`;
      const memberIds = await getGroupRoomMemberIds(live.room.id);
      for (const uid of memberIds) {
        await sendSafeDM(uid, announce, {
          reply_markup: {
            inline_keyboard: [
              [{ text: `Ambil ${GIFTS[giftKey].label}`, callback_data: `claim_gift:${event.id}` }],
            ],
          },
        });
      }
      await ctx.reply("✅ Giftall dibuat!");
    } catch (err) {
      console.error("giftall error:", err);
      await ctx.reply("Gagal membuat giftall. Coba lagi ya.");
    }
  });
}
