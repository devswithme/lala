import {
  getActiveRoomByUserId,
  getActiveGroupRoomByUserId,
  otherUserId,
} from "../db/index.js";
import {
  getLastRoomMessageAt,
  getRecentRoomMessages,
  insertRoomMessage,
  getRoomMessageCount,
  getGroupRoomMemberIds,
  getSession,
  upsertSession,
  getMood,
  decrementMood,
  ensureIdentityPermission,
  ensureGroupIdentityPermission,
} from "../db/index.js";
import {
  ROOM_MESSAGES_TABLE,
  GROUP_ROOM_MESSAGES_TABLE,
} from "../config/index.js";
import { censorText, looksUnsafe, looksLikeIdentity } from "../lib/content.js";
import { moderatorDecision } from "../ai/moderator.js";
import {
  safeAiCurhat,
  buildCurhatSystemContent,
  parseCurhatResponse,
} from "../ai/curhat.js";
import {
  SILENCE_ICEBREAK_MS,
  IDENTITY_UNLOCK_PRICE,
  CHEMISTRY_THRESHOLD,
  CHEMISTRY_HINT_AT,
  MOOD_LOW_THRESHOLD,
  LALA_COFFEE_PRICE,
} from "../config/index.js";

export function registerTextHandler(bot, { sendSafeDM }) {
  bot.on("text", async (ctx) => {
    try {
      const activeRoom = await getActiveRoomByUserId(ctx.from.id);
      if (activeRoom) {
        await handleOneToOneRoom(ctx, activeRoom, sendSafeDM);
        return;
      }

      const activeGroupRoom = await getActiveGroupRoomByUserId(ctx.from.id);
      if (activeGroupRoom) {
        await handleGroupRoom(ctx, activeGroupRoom, sendSafeDM);
        return;
      }

      await handleCurhat(ctx, sendSafeDM);
    } catch (error) {
      console.error("Gemini Error:", error);
      await ctx.reply(
        "Aduh, Lala lagi agak pusing.. Sapa aku lagi ya nanti? 🥺",
      );
    }
  });
}

async function handleOneToOneRoom(ctx, activeRoom, sendSafeDM) {
  const fromId = ctx.from.id;
  const toId = otherUserId(activeRoom, fromId);
  const original = ctx.message.text ?? "";

  const identity = looksLikeIdentity(original);
  if (identity.detected) {
    const allowed = await ensureIdentityPermission(activeRoom.id, fromId);
    if (!allowed) {
      const count = await getRoomMessageCount(
        activeRoom.id,
        ROOM_MESSAGES_TABLE,
      );
      if (count >= CHEMISTRY_THRESHOLD) {
        await ctx.reply(
          "Identitas baru bisa dibuka kalau kalian berdua setuju. Klik tombol Kenalan ya – kalau kalian berdua sama-sama klik, Lala buka akses.",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "Kenalan",
                    callback_data: `kenalan:${activeRoom.id}`,
                  },
                ],
              ],
            },
          },
        );
      } else {
        await ctx.reply(
          "Demi keamanan, Lala tidak mengizinkan tukar identitas (nama/nomor/IG/username/email) di chat gratis.\n\nKalau kamu mau unlock, bayar sekali Rp 6.000 untuk room ini.",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: `Unlock Identitas (Rp ${IDENTITY_UNLOCK_PRICE.toLocaleString("id-ID")})`,
                    callback_data: `unlock_identity:${activeRoom.id}`,
                  },
                ],
              ],
            },
          },
        );
      }
      await sendSafeDM(
        toId,
        "[Pesan berisi identitas pribadi dan tidak dikirim.]",
      );
      return;
    }
  }

  const lastAt = await getLastRoomMessageAt(activeRoom.id, ROOM_MESSAGES_TABLE);
  const silenceMs = lastAt ? Date.now() - new Date(lastAt).getTime() : 0;
  const unsafe = looksUnsafe(original);
  const relayedText = unsafe
    ? "[Pesan disensor oleh Lala]"
    : censorText(original);

  await insertRoomMessage(activeRoom.id, fromId, original, ROOM_MESSAGES_TABLE);
  await sendSafeDM(toId, relayedText);

  const count = await getRoomMessageCount(activeRoom.id, ROOM_MESSAGES_TABLE);
  if (count === CHEMISTRY_HINT_AT) {
    await sendSafeDM(
      fromId,
      `Chemistry: ${count}/${CHEMISTRY_THRESHOLD} – setengah jalan!`,
    );
    await sendSafeDM(
      toId,
      `Chemistry: ${count}/${CHEMISTRY_THRESHOLD} – setengah jalan!`,
    );
  } else if (count === CHEMISTRY_THRESHOLD) {
    const announcement =
      "Ciee, kalian berdua kayaknya nyambung banget nih! Lala udah buka akses buat kalian saling liat profil ya. Silakan klik tombol Kenalan kalau kalian berdua sama-sama setuju!";
    await sendSafeDM(fromId, announcement, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Kenalan", callback_data: `kenalan:${activeRoom.id}` }],
        ],
      },
    });
    await sendSafeDM(toId, announcement, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Kenalan", callback_data: `kenalan:${activeRoom.id}` }],
        ],
      },
    });
  }

  const recent = await getRecentRoomMessages(
    activeRoom.id,
    10,
    ROOM_MESSAGES_TABLE,
  );
  const lines = recent
    .map((m) => {
      const who =
        m.user_id === fromId
          ? "UserA"
          : m.user_id === toId
            ? "UserB"
            : "System";
      return `${who}: ${m.content}`;
    })
    .join("\n");

  if (silenceMs > SILENCE_ICEBREAK_MS || unsafe) {
    const decision = await moderatorDecision({
      transcript: lines,
      newMessage: original,
      silenceMs,
    });
    if (decision.action === "icebreak" && decision.message) {
      await sendSafeDM(fromId, `🌸 Lala: ${decision.message}`);
      await sendSafeDM(toId, `🌸 Lala: ${decision.message}`);
    } else if (decision.action === "warn") {
      const warnMsg =
        decision.message ||
        "Tolong jaga kata-kata ya. Lala bakal sensor kalau ada yang kasar/mesum/menyakiti.";
      await sendSafeDM(fromId, `⚠️ Lala: ${warnMsg}`);
      await sendSafeDM(toId, `⚠️ Lala: ${warnMsg}`);
    }
  }
}

async function handleGroupRoom(ctx, activeGroupRoom, sendSafeDM) {
  const fromId = ctx.from.id;
  const original = ctx.message.text ?? "";
  const memberIds = await getGroupRoomMemberIds(activeGroupRoom.id);
  const otherIds = memberIds.filter((id) => id !== fromId);

  const lastAt = await getLastRoomMessageAt(
    activeGroupRoom.id,
    GROUP_ROOM_MESSAGES_TABLE,
  );
  const silenceMs = lastAt ? Date.now() - new Date(lastAt).getTime() : 0;
  const unsafe = looksUnsafe(original);
  const identity = looksLikeIdentity(original);

  if (identity.detected) {
    const allowed = await ensureGroupIdentityPermission(
      activeGroupRoom.id,
      fromId,
    );
    if (!allowed) {
      await ctx.reply(
        "Demi keamanan, Lala menahan pesan yang berisi identitas (nama/nomor/IG/username/email).\n\nKalau kamu mau unlock identitas di grup ini, bayar sekali Rp 6.000.",
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: `Unlock Identitas Grup (Rp ${IDENTITY_UNLOCK_PRICE.toLocaleString("id-ID")})`,
                  callback_data: `unlock_group_identity:${activeGroupRoom.id}`,
                },
              ],
            ],
          },
        },
      );
      for (const id of otherIds) {
        await sendSafeDM(
          id,
          "[Pesan berisi identitas pribadi dan tidak dikirim.]",
        );
      }
      return;
    }
  }

  const relayedText = unsafe
    ? "[Pesan disensor oleh Lala]"
    : censorText(original);
  await insertRoomMessage(
    activeGroupRoom.id,
    fromId,
    original,
    GROUP_ROOM_MESSAGES_TABLE,
  );
  for (const id of otherIds) {
    await sendSafeDM(id, relayedText);
  }

  const recent = await getRecentRoomMessages(
    activeGroupRoom.id,
    10,
    GROUP_ROOM_MESSAGES_TABLE,
  );
  const lines = recent
    .map((m) => {
      const who =
        m.user_id === 0 ? "System" : m.user_id === fromId ? "Sender" : "Other";
      return `${who}: ${m.content}`;
    })
    .join("\n");

  if (silenceMs > SILENCE_ICEBREAK_MS || unsafe) {
    const decision = await moderatorDecision({
      transcript: lines,
      newMessage: original,
      silenceMs,
    });
    if (decision.action === "icebreak" && decision.message) {
      for (const id of memberIds) {
        await sendSafeDM(id, `🌸 Lala: ${decision.message}`);
      }
    } else if (decision.action === "warn") {
      const warnMsg =
        decision.message ||
        "Tolong jaga kata-kata dan suasana obrolan ya. Lala bakal sensor kalau ada yang kasar/mesum/menyakiti.";
      for (const id of memberIds) {
        await sendSafeDM(id, `⚠️ Lala: ${warnMsg}`);
      }
    }
  }
}

async function handleCurhat(ctx, sendSafeDM) {
  const mood = await getMood(ctx.from.id);
  if (mood < MOOD_LOW_THRESHOLD) {
    await ctx.reply(
      "Duh kak, Lala agak ngantuk nih dengerinnya, balesnya agak lambat ya... Mood Lala lagi rendah. Bisa nunggu sekitar 1 jam biar Lala segar lagi, atau kalau lagi urgent, kamu bisa beliin Lala kopi (Rp 5.000) biar Mood-nya langsung penuh lagi.",
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `Beliin Lala Kopi (Rp ${LALA_COFFEE_PRICE.toLocaleString("id-ID")})`,
                callback_data: "refill_mood",
              },
            ],
          ],
        },
      },
    );
    return;
  }
  const session = await getSession(ctx.from.id);
  await ctx.sendChatAction("typing");

  const systemContent = buildCurhatSystemContent(session?.summary);
  const history = Array.isArray(session?.history) ? session.history : [];
  const historyMessages = [];
  for (const entry of history) {
    const userContent = entry.content != null ? String(entry.content) : "";
    historyMessages.push({ role: "user", content: userContent });
    let assistantContent = entry.reply;
    if (assistantContent == null) {
      try {
        const jsonMatch = (entry.response || "").match(/\{[\s\S]*\}/);
        assistantContent = jsonMatch
          ? JSON.parse(jsonMatch[0]).reply
          : entry.response;
      } catch {
        assistantContent = entry.response || "";
      }
    }
    historyMessages.push({
      role: "assistant",
      content: assistantContent != null ? String(assistantContent) : "",
    });
  }

  const aiResult = await safeAiCurhat({
    systemContent,
    historyMessages,
    userText: ctx.message.text,
  });

  if (!aiResult.ok) {
    await ctx.reply(
      "Aduh, Lala lagi lemot atau kepentok batas waktu. Coba kirim pesannya lagi sebentar ya. 🥺",
    );
    return;
  }

  const rawContent = aiResult.result.choices?.[0]?.message?.content ?? "";
  const parsed = parseCurhatResponse(rawContent);
  if (!parsed) {
    console.error("safeAiCurhat: no JSON found in content", rawContent);
    await ctx.reply(
      "Lala agak bingung baca jawaban AI barusan. Coba tulis ulang curhatmu dengan cara lain ya.",
    );
    return;
  }

  const { reply, intent, gender, personality, summary } = parsed;
  const previousHistory = Array.isArray(session?.history)
    ? session.history
    : [];
  const newHistory = [
    ...previousHistory,
    { content: ctx.message.text, reply },
  ].slice(-5);

  await upsertSession({
    user_id: ctx.from.id,
    updated_at: new Date(),
    gender,
    personality,
    summary,
    history: newHistory,
  });
  await decrementMood(ctx.from.id);

  await ctx.reply(reply, {
    reply_markup:
      intent === "matchmaking"
        ? {
            inline_keyboard: [
              [
                { text: "Cari teman (1:1) 🌸", callback_data: "start_match" },
                {
                  text: "Cari teman Grup 👥",
                  callback_data: "start_group_match",
                },
              ],
            ],
          }
        : undefined,
    parse_mode: "Markdown",
  });
}
