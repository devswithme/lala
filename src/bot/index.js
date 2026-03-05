import { Telegraf } from "telegraf";
import { BOT_TOKEN } from "../config/index.js";
import { registerCommands } from "./commands.js";
import { registerActions } from "./actions.js";
import { registerTextHandler } from "./textHandler.js";

export function createBot() {
  const bot = new Telegraf(BOT_TOKEN);

  async function sendSafeDM(userId, text, extra) {
    try {
      await bot.telegram.sendMessage(userId, text, extra);
      return { ok: true };
    } catch (err) {
      return { ok: false, err };
    }
  }

  const deps = { sendSafeDM };
  registerCommands(bot, deps);
  registerActions(bot, deps);
  registerTextHandler(bot, deps);

  // Set global command list for Telegram autocomplete (/ commands)
  bot.telegram
    .setMyCommands([
      { command: "stop", description: "Akhiri obrolan saat ini" },
      { command: "balance", description: "Lihat saldo dompet kamu" },
      { command: "topup", description: "Top up saldo Lala" },
      { command: "gift", description: "Kirim gift ke teman chat" },
      { command: "giftall", description: "Bagi-bagi gift ke grup" },
    ])
    .catch((err) => {
      console.error("setMyCommands error:", err);
    });

  return bot;
}

export function launchBotLocal(bot) {
  return bot
    .launch()
    .then(() =>
      console.log(
        "🌸 Lala is Online (Local Mode)! Kirim pesan di Telegram sekarang...",
      ),
    )
    .catch((err) => console.error("Gagal nyala:", err));
}
