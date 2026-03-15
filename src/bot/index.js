import { Telegraf } from "telegraf";
import { BOT_TOKEN } from "../config/index.js";
import { registerCommands } from "./commands.js";
import { registerActions } from "./actions.js";
import { handleText } from "./textHandler.js";

let _bot = null;

export function createBot() {
  if (_bot) return _bot;

  _bot = new Telegraf(BOT_TOKEN);

  registerCommands(_bot);
  registerActions(_bot);

  _bot.telegram
    .setMyCommands([
      { command: "start", description: "Mulai / kenalan dengan Lala" },
      { command: "bantuan", description: "Bantuan & daftar fitur" },
      { command: "profil", description: "Lihat profil & saldo" },
      { command: "topup", description: "Isi saldo (contoh: /topup 10000)" },
      { command: "temen", description: "Cari teman ngobrol anonim" },
      { command: "ice", description: "Ice breaker (saat di chat teman)" },
      { command: "stop", description: "Batalkan cari / akhiri sesi teman" },
      { command: "hadiah", description: "Kirim hadiah ke teman" },
    ])
    .catch((err) => console.error("[bot] setMyCommands failed:", err));

  _bot.on("text", handleText);

  _bot.catch((err, ctx) => {
    console.error(`[bot] Error for ${ctx.updateType}:`, err);
  });

  return _bot;
}

/**
 * Safely send a DM. Returns false if blocked or user not found.
 * Accepts either a Telegraf bot instance or a raw `ctx.telegram` object.
 * @param {object} telegramOrBot - bot instance or ctx.telegram
 * @param {string|number} userId
 * @param {string} text
 * @param {object} [extra] - Telegraf extra options (reply_markup, etc.)
 */
export async function sendSafeDM(telegramOrBot, userId, text, extra = {}) {
  const telegram =
    typeof telegramOrBot.sendMessage === "function"
      ? telegramOrBot
      : telegramOrBot.telegram;
  try {
    await telegram.sendMessage(String(userId), text, {
      parse_mode: "HTML",
      ...extra,
    });
    return true;
  } catch (err) {
    console.warn(`[bot] Failed to DM ${userId}:`, err.message);
    return false;
  }
}
