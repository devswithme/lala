import {
  getActiveRoomByUserId,
  getActiveGroupRoomByUserId,
  getRoomById,
  otherUserId,
  getSearchingSessions,
  getSearchingGroupSessions,
  getSessionCandidatesWithPersonality,
  getActiveRoomsUserIds,
  getActiveGroupRoomUserIds,
  claimSessionToLive,
  updateSessionStatus,
  createRoom,
  insertRoomMessage,
  createGroupRoom,
  addGroupRoomMembers,
  getSession,
  getPendingBottleByUserId,
  insertBottle,
  markBottleDelivered,
  ensureIdentityPermission,
  ensureGroupIdentityPermission,
  upsertRoomIdentityPermission,
  upsertGroupIdentityPermission,
  addRevealConsent,
  getRevealConsents,
  walletDeduct,
  walletAdd,
  getGiftEvent,
  insertGiftClaim,
  decrementGiftEventRemaining,
  refillMood,
  markQueueBypassed,
} from "../db/index.js";
import {
  ROOM_MESSAGES_TABLE,
  GROUP_ROOM_MESSAGES_TABLE,
  IDENTITY_UNLOCK_PRICE,
  LALA_COFFEE_PRICE,
  GIFTS,
  isBetaNow,
} from "../config/index.js";
import { overlapTags } from "../lib/matchmaking.js";
import { makeBottleText } from "../ai/bottle.js";

export function registerActions(bot, { sendSafeDM }) {
  bot.action("beta_bypass", async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const userId = ctx.from.id;

      if (!isBetaNow()) {
        await ctx.reply(
          "Bypass antrian hanya tersedia selama periode BETA Lala. Saat ini periode tersebut belum atau sudah lewat.",
        );
        return;
      }

      const price = 5000;
      const { ok, balance } = await walletDeduct(userId, price);
      if (!ok) {
        await ctx.reply(
          `Saldo kamu kurang untuk bypass antrian (butuh Rp ${price.toLocaleString(
            "id-ID",
          )}). Saldo kamu sekarang Rp ${balance.toLocaleString(
            "id-ID",
          )}.\nTopup dulu pakai /topup 10000 ya.`,
        );
        return;
      }

      await markQueueBypassed(userId);
      await ctx.reply(
        "Makasih udah traktir Lala! Akses kamu langsung dibuka, kamu bisa mulai curhat sekarang. 🌸",
      );
    } catch (err) {
      console.error("beta_bypass error:", err);
      await ctx.reply("Gagal memproses bypass antrian. Coba lagi ya.");
    }
  });

  bot.action("refill_mood", async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const { ok, balance } = await walletDeduct(ctx.from.id, LALA_COFFEE_PRICE);
      if (!ok) {
        await ctx.reply(
          `Saldo kamu kurang. Saldo: Rp ${balance.toLocaleString("id-ID")}.\nTopup dulu pakai /topup 10000`,
        );
        return;
      }
      await refillMood(ctx.from.id);
      await ctx.reply(
        "Makasih kopinya! Lala segar lagi, Mood 100%. Curhat lagi ya kalau perlu.",
      );
    } catch (err) {
      console.error("refill_mood error:", err);
      await ctx.reply("Gagal beliin kopi. Coba lagi ya.");
    }
  });

  bot.action(/^claim_gift:(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const eventId = String(ctx.match[1]);
      const event = await getGiftEvent(eventId);
      if (!event) {
        await ctx.reply("Gift ini sudah tidak tersedia.");
        return;
      }
      if (event.expires_at && Date.now() > new Date(event.expires_at).getTime()) {
        await ctx.reply("Gift ini sudah kedaluwarsa.");
        return;
      }
      if (event.remaining <= 0) {
        await ctx.reply("Maaf, jatah gift sudah habis.");
        return;
      }
      const groupRoom = await getActiveGroupRoomByUserId(ctx.from.id);
      if (!groupRoom || groupRoom.id !== event.room_id) {
        await ctx.reply("Kamu tidak ada di grup yang sama untuk klaim gift ini.");
        return;
      }
      const claimErr = await insertGiftClaim(eventId, ctx.from.id);
      if (claimErr) {
        await ctx.reply("Kamu sudah klaim gift ini, atau klaim sedang penuh.");
        return;
      }
      await decrementGiftEventRemaining(eventId, event.remaining);
      await walletAdd(ctx.from.id, event.amount);
      await ctx.reply(
        `✅ Kamu berhasil dapat gift: Rp ${event.amount.toLocaleString("id-ID")} (${GIFTS[event.gift_key]?.label ?? event.gift_key})`,
      );
    } catch (err) {
      console.error("claim_gift error:", err);
      await ctx.reply("Gagal klaim gift. Coba lagi ya.");
    }
  });

  bot.action(/^kenalan:(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const roomId = String(ctx.match[1]).trim();
      const room = await getRoomById(Number(roomId));
      if (!room || room.status !== "active") {
        await ctx.reply("Room tidak ditemukan atau sudah berakhir.");
        return;
      }
      const fromId = ctx.from.id;
      const u1 = room.user1_id;
      const u2 = room.user2_id;
      if (fromId !== u1 && fromId !== u2) {
        await ctx.reply("Kamu tidak ada di room ini.");
        return;
      }
      const allowed = await ensureIdentityPermission(room.id, fromId);
      if (allowed) {
        await ctx.reply("Kamu sudah boleh share identitas di room ini.");
        return;
      }
      await addRevealConsent(room.id, fromId);
      const consents = await getRevealConsents(room.id);
      const memberIds = [u1, u2].filter(Boolean);
      const bothConsented = memberIds.every((id) => consents.includes(id));
      if (bothConsented) {
        await upsertRoomIdentityPermission(room.id, u1);
        await upsertRoomIdentityPermission(room.id, u2);
        const msg =
          "Kalian berdua sudah saling setuju. Sekarang kalian boleh saling kenalan dan share identitas di chat ini.";
        await ctx.reply(msg);
        const otherId = otherUserId(room, fromId);
        await sendSafeDM(otherId, msg);
        try {
          const chatA = await bot.telegram.getChat(u1);
          const chatB = await bot.telegram.getChat(u2);
          const nameA = [chatA.first_name, chatA.last_name].filter(Boolean).join(" ") || "Teman";
          const nameB = [chatB.first_name, chatB.last_name].filter(Boolean).join(" ") || "Teman";
          const usernameA = chatA.username ? `@${chatA.username}` : "";
          const usernameB = chatB.username ? `@${chatB.username}` : "";
          await sendSafeDM(u2, `Profil teman ngobrolmu: ${nameA} ${usernameA}`.trim());
          await sendSafeDM(u1, `Profil teman ngobrolmu: ${nameB} ${usernameB}`.trim());
        } catch (profileErr) {
          console.error("kenalan getChat profile error:", profileErr);
        }
      } else {
        await ctx.reply(
          "Kamu sudah klik Kenalan. Tunggu teman ngobrolmu juga klik ya – identitas baru terbuka kalau kalian berdua setuju.",
        );
      }
    } catch (err) {
      console.error("kenalan error:", err);
      await ctx.reply("Gagal menyimpan. Coba lagi ya.");
    }
  });

  bot.action(/^unlock_identity:(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const roomId = String(ctx.match[1]);
      const allowed = await ensureIdentityPermission(roomId, ctx.from.id);
      if (allowed) {
        await ctx.reply("Identitas kamu sudah boleh dibuka di room ini.");
        return;
      }
      const { ok, balance } = await walletDeduct(ctx.from.id, IDENTITY_UNLOCK_PRICE);
      if (!ok) {
        await ctx.reply(
          `Saldo kamu kurang. Saldo: Rp ${balance.toLocaleString("id-ID")}.\nTopup dulu pakai /topup 10000`,
        );
        return;
      }
      await upsertRoomIdentityPermission(roomId, ctx.from.id);
      await ctx.reply("✅ Oke! Di room ini kamu boleh share identitas. Tetap hati-hati ya.");
    } catch (err) {
      console.error("unlock_identity error:", err);
      await ctx.reply("Gagal unlock identitas. Coba lagi ya.");
    }
  });

  bot.action(/^unlock_group_identity:(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const roomId = String(ctx.match[1]);
      const allowed = await ensureGroupIdentityPermission(roomId, ctx.from.id);
      if (allowed) {
        await ctx.reply("Identitas kamu sudah boleh dibuka di grup ini.");
        return;
      }
      const { ok, balance } = await walletDeduct(ctx.from.id, IDENTITY_UNLOCK_PRICE);
      if (!ok) {
        await ctx.reply(
          `Saldo kamu kurang. Saldo: Rp ${balance.toLocaleString("id-ID")}.\nTopup dulu pakai /topup 10000`,
        );
        return;
      }
      await upsertGroupIdentityPermission(roomId, ctx.from.id);
      await ctx.reply("✅ Oke! Di grup ini kamu boleh share identitas. Tetap hati-hati ya.");
    } catch (err) {
      console.error("unlock_group_identity error:", err);
      await ctx.reply("Gagal unlock identitas grup. Coba lagi ya.");
    }
  });

  // start_match
  bot.action("start_match", async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const existing = await getActiveRoomByUserId(ctx.from.id);
      if (existing) {
        await ctx.reply("Kamu masih dalam obrolan. Ketik /stop dulu ya.");
        return;
      }
      const me = await getSession(ctx.from.id, "personality,summary,status");
      const myTags = Array.isArray(me?.personality) ? me.personality : [];
      if (myTags.length === 0) {
        await ctx.reply(
          "Lala belum cukup ngerti kamu. Coba curhat sedikit dulu ya, nanti Lala cariin teman yang cocok.",
        );
        return;
      }
      const busy = await getActiveRoomsUserIds();
      const searching = await getSearchingSessions(50, ctx.from.id);
      const queuedCandidates = searching
        .filter((c) => !busy.has(c.user_id))
        .map((c) => ({
          user_id: c.user_id,
          personality: Array.isArray(c.personality) ? c.personality : [],
        }))
        .map((c) => ({ ...c, shared: overlapTags(myTags, c.personality) }))
        .filter((c) => c.shared.length > 0);

      for (const cand of queuedCandidates) {
        const claimed = await claimSessionToLive(cand.user_id, ctx.from.id);
        if (claimed.length === 0) continue;

        await updateSessionStatus([ctx.from.id], "live", cand.user_id);

        const bottle = await getPendingBottleByUserId(cand.user_id);
        if (bottle) {
          await markBottleDelivered(bottle.id, ctx.from.id);
          const intro = `Sebelum kalian ngobrol, ada potongan perasaan anonim yang pernah Lala simpan:\n\n"${bottle.bottle_text}"\n\nMungkin ini bisa bikin kalian merasa sedikit kurang sendirian.`;
          await ctx.reply(intro);
          await sendSafeDM(cand.user_id, intro);
        }

        const room = await createRoom(ctx.from.id, cand.user_id);
        await insertRoomMessage(room.id, 0, "[room_started_from_queue]");

        await sendSafeDM(
          ctx.from.id,
          "✅ Lala ketemu teman ngobrol yang lagi nunggu. Kalian sekarang sudah terhubung, silakan mulai ngobrol di sini. Ketik /stop kalau mau mengakhiri.",
        );
        await sendSafeDM(
          cand.user_id,
          "✅ Lala baru ngenalin kamu dengan seseorang yang juga lagi butuh teman. Kalian sudah terhubung di sini. Ketik /stop kalau mau mengakhiri.",
        );
        return;
      }

      const candidates = await getSessionCandidatesWithPersonality(80, ctx.from.id);
      const filtered = candidates
        .filter((c) => !busy.has(c.user_id))
        .map((c) => ({
          user_id: c.user_id,
          personality: Array.isArray(c.personality) ? c.personality : [],
        }))
        .map((c) => ({ ...c, shared: overlapTags(myTags, c.personality) }))
        .filter((c) => c.shared.length > 0);

      if (filtered.length === 0) {
        const bottleText = await makeBottleText({
          userMessage: ctx.callbackQuery?.message?.text ?? "",
          userSummary: me?.summary,
          userPersonality: myTags,
        });
        await insertBottle({
          from_user_id: ctx.from.id,
          personality: myTags,
          bottle_text: bottleText,
          status: "pending",
        });
        await updateSessionStatus([ctx.from.id], "searching", null);
        await ctx.reply(
          'Belum ada yang bisa Lala hubungkan sekarang. Tapi Lala sudah menghanyutkan curhatanmu sebagai "pesan dalam botol". Begitu ada yang cocok, Lala bakal ngenalin kalian, ya.',
        );
        return;
      }

      const pick = filtered[Math.floor(Math.random() * filtered.length)];
      const shared = pick.shared.slice(0, 2).join(", ");
      const inviteText = `🌸 Ada yang pengen ngobrol bareng kamu.\nKesamaan kalian: ${shared}\n\nMau gabung chat?`;
      const invite = await sendSafeDM(pick.user_id, inviteText, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Gabung", callback_data: `accept_match:${ctx.from.id}` },
              { text: "Tolak", callback_data: `decline_match:${ctx.from.id}` },
            ],
          ],
        },
      });
      if (!invite.ok) {
        await ctx.reply(
          "Lala nemu yang cocok, tapi belum bisa kirim undangan ke dia (mungkin belum pernah chat sama bot). Coba lagi ya.",
        );
        return;
      }
      await ctx.reply(
        "Oke! Lala sudah kirim undangan. Tunggu dia jawab ya. Kalau mau batal, tinggal /stop (kalau sudah masuk room).",
      );
    } catch (err) {
      console.error("start_match error:", err);
      await ctx.reply("Matchmaking lagi error. Pastikan kamu sudah bikin tabel `rooms` di Supabase ya.");
    }
  });

  // start_group_match
  bot.action("start_group_match", async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const oneToOne = await getActiveRoomByUserId(ctx.from.id);
      const groupRoom = await getActiveGroupRoomByUserId(ctx.from.id);
      if (oneToOne || groupRoom) {
        await ctx.reply("Kamu masih dalam obrolan. Ketik /stop dulu ya.");
        return;
      }
      const me = await getSession(ctx.from.id, "personality,summary,status");
      const myTags = Array.isArray(me?.personality) ? me.personality : [];
      if (myTags.length === 0) {
        await ctx.reply(
          "Lala belum cukup ngerti kamu. Coba curhat sedikit dulu ya, nanti Lala cariin teman grup yang cocok.",
        );
        return;
      }
      if (me?.status !== "searching_group") {
        await updateSessionStatus([ctx.from.id], "searching_group", null);
      }
      const busy = await getActiveRoomsUserIds();
      const groupBusy = await getActiveGroupRoomUserIds();
      for (const id of groupBusy) busy.add(id);

      const queue = await getSearchingGroupSessions(100, ctx.from.id);
      const candidatesWithOverlap = queue
        .filter((c) => !busy.has(c.user_id))
        .map((c) => ({
          user_id: c.user_id,
          personality: Array.isArray(c.personality) ? c.personality : [],
        }))
        .map((c) => ({ ...c, shared: overlapTags(myTags, c.personality) }))
        .filter((c) => c.shared.length > 0);
      candidatesWithOverlap.sort((a, b) => b.shared.length - a.shared.length);
      const others = candidatesWithOverlap.slice(0, 4);

      if (others.length >= 2) {
        const memberIds = [ctx.from.id, ...others.map((c) => c.user_id)];
        const group = await createGroupRoom();
        await addGroupRoomMembers(group.id, memberIds);
        await updateSessionStatus(memberIds, "live_group", null);
        await insertRoomMessage(group.id, 0, "[group_started]", GROUP_ROOM_MESSAGES_TABLE);

        for (const id of memberIds) {
          await sendSafeDM(
            id,
            "✅ Lala bikin grup kecil buat kalian (3–5 orang). Sapa satu sama lain ya, dan ketik /stop kalau mau mengakhiri obrolan grup.",
          );
        }
        return;
      }
      await ctx.reply(
        "Lala lagi kumpulin beberapa orang dulu. Begitu grup kecil kamu siap (3–5 orang) dengan vibe yang mirip, Lala bakal masukin kamu ya.",
      );
    } catch (err) {
      console.error("start_group_match error:", err);
      await ctx.reply("Matchmaking grup lagi error. Pastikan kamu sudah bikin tabel `group_rooms` di Supabase ya.");
    }
  });

  bot.action(/^accept_match:(\d+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const inviterId = Number(ctx.match[1]);
      const acceptorId = ctx.from.id;
      const inviterRoom = await getActiveRoomByUserId(inviterId);
      const acceptorRoom = await getActiveRoomByUserId(acceptorId);
      if (inviterRoom || acceptorRoom) {
        await ctx.reply("Maaf, salah satu dari kalian sedang ada di obrolan lain.");
        return;
      }
      const room = await createRoom(inviterId, acceptorId);
      await updateSessionStatus([inviterId], "live", acceptorId);
      await updateSessionStatus([acceptorId], "live", inviterId);
      await insertRoomMessage(room.id, 0, "[room_started]");
      await sendSafeDM(
        inviterId,
        "✅ Match ketemu! Room dimulai. Kirim pesan di sini. Ketik /stop untuk mengakhiri.",
      );
      await sendSafeDM(
        acceptorId,
        "✅ Kamu gabung! Room dimulai. Kirim pesan di sini. Ketik /stop untuk mengakhiri.",
      );
    } catch (err) {
      console.error("accept_match error:", err);
      await ctx.reply("Gagal membuat room. Pastikan tabel `rooms` dan `room_messages` sudah ada di Supabase.");
    }
  });

  bot.action(/^decline_match:(\d+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const inviterId = Number(ctx.match[1]);
      await sendSafeDM(inviterId, "Yah, dia belum mau ngobrol sekarang. Coba cari lagi ya.");
      await ctx.reply("Oke, undangan ditolak.");
    } catch (err) {
      console.error("decline_match error:", err);
    }
  });
}
