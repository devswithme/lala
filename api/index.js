/**
 * Vercel serverless entry: same logic as Bun server, compatible with Vercel.
 * Set webhook URL in Telegram to: https://your-domain.vercel.app/api
 */
import "dotenv/config";
import { createBot } from "../src/bot/index.js";

const bot = createBot();

export default async function handler(req, res) {
  try {
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
