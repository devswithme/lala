/**
 * Bun HTTP server: Telegram webhook + Xendit webhook.
 * Run: bun run src/server.js
 */
import { createBot } from "./bot/index.js";
import { handleXenditWebhook } from "./payments/xendit.js";
import { PORT } from "./config/index.js";

const bot = createBot();

function createResAdapter() {
  let statusCode = 200;
  let body = "";
  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    send(b) {
      body = typeof b === "string" ? b : JSON.stringify(b ?? "");
      return res;
    },
  };
  return {
    res,
    getResponse: () => new Response(body, { status: statusCode }),
  };
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/api/xendit") {
      try {
        const body = await req.json().catch(() => ({}));
        const { statusCode, body: resBody } = await handleXenditWebhook(body);
        return new Response(resBody, { status: statusCode });
      } catch (err) {
        console.error("Xendit webhook error:", err);
        return new Response("Error Handled", { status: 200 });
      }
    }

    if (req.method === "POST") {
      try {
        const update = await req.json().catch(() => ({}));
        const { res, getResponse } = createResAdapter();
        await bot.handleUpdate(update, res);
        return getResponse();
      } catch (err) {
        console.error("Telegram webhook error:", err);
        return new Response("Error Handled", { status: 200 });
      }
    }

    return new Response("Lala is Online & Healthy! 🌸", { status: 200 });
  },
});

console.log(`🌸 Lala listening on http://localhost:${server.port}`);
