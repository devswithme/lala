/**
 * Vercel serverless entry: same logic as Bun server, compatible with Vercel.
 * Set webhook URL in Telegram to: https://your-domain.vercel.app/api
 */
import "dotenv/config";
import { createBot } from "../src/bot/index.js";
import { isProduction, isBetaNow } from "../src/config/index.js";
import {
  getNextBetaBatch,
  markQueueActivated,
} from "../src/db/index.js";

const bot = createBot();

const DEFAULT_BETA_BATCH_SIZE = 20;
const DEFAULT_BETA_INTERVAL_MS = 3 * 60 * 1000;
const betaIntervalMs =
  Number(process.env.BETA_SCHEDULER_INTERVAL_MS) || DEFAULT_BETA_INTERVAL_MS;

let lastBetaSchedulerRunMs = 0;

async function maybeRunBetaScheduler() {
  if (!isProduction || !isBetaNow()) return;
  const now = Date.now();
  if (now - lastBetaSchedulerRunMs < betaIntervalMs) return;
  lastBetaSchedulerRunMs = now;

  try {
    const batch = await getNextBetaBatch(DEFAULT_BETA_BATCH_SIZE);
    if (!batch || batch.length === 0) return;

    for (const row of batch) {
      try {
        await markQueueActivated(row.user_id);
        await bot.telegram.sendMessage(
          row.user_id,
          "Yeay, sekarang kamu sudah dapat akses BETA Lala. Kamu bisa mulai curhat kapan saja. 🌸",
        );
      } catch (err) {
        console.error("beta scheduler per-user error:", err);
      }
    }
  } catch (err) {
    console.error("beta scheduler error:", err);
  }
}

export default async function handler(req, res) {
  try {
    // Lazy-triggered beta queue activation.
    await maybeRunBetaScheduler();

    if (req.method === "POST") {
      await bot.handleUpdate(req.body, res);
    } else {
      res.status(200).send("Lala is Online & Healthy! 🌸");
    }
  } catch (err) {
    console.error("Vercel Handler Error:", err);
    if (!res.headersSent) {
      res.status(200).send("Error Handled");
    }
  }
}
