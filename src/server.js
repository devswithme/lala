/**
 * Bun HTTP server: webhook + Tally + Xendit routes.
 * Entry for Docker and local run (bun run src/server.js).
 */
import "dotenv/config";
import { PORT, isProduction } from "./config/index.js";
import mainHandler, { bot } from "../api/index.js";
import { launchBotLocal } from "./bot/index.js";
import tallyHandler from "../api/tally.js";
import xenditHandler from "../api/xendit.js";

function makeRes() {
  let statusCode = 200;
  let body = "";
  let sent = false;
  return {
    get headersSent() {
      return sent;
    },
    status(n) {
      statusCode = n;
      return this;
    },
    send(b) {
      sent = true;
      body = b != null ? String(b) : "";
      return this;
    },
    end(b) {
      sent = true;
      if (b != null) body = typeof b === "string" ? b : String(b);
      return this;
    },
    setHeader() {
      return this;
    },
    _getResponse() {
      return new Response(body, { status: statusCode });
    },
  };
}

export default function serve() {
  const port = Number(PORT) || 3000;
  return Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;
      const method = req.method;

      let body;
      try {
        const text = await req.text();
        body = text ? JSON.parse(text) : {};
      } catch {
        body = {};
      }

      const res = makeRes();
      const nodeReq = { method, url: req.url, body };

      try {
        if (path === "/api/tally" && method === "POST") {
          await tallyHandler(nodeReq, res);
        } else if (path === "/api/xendit" && method === "POST") {
          await xenditHandler(nodeReq, res);
        } else if ((path === "/" || path === "/api") && method === "POST") {
          await mainHandler(nodeReq, res);
        } else if ((path === "/" || path === "/api") && method === "GET") {
          res.status(200).send("Lala is Online & Healthy! 🌸");
        } else {
          res.status(404).send("Not Found");
        }
      } catch (err) {
        console.error("Server fetch error:", err);
        if (!res.headersSent) res.status(500).send("Internal Server Error");
      }

      return res._getResponse();
    },
  });
}

const server = serve();

// In development, Telegram can't reach localhost — use long polling so the bot receives updates
if (!isProduction) {
  bot.telegram
    .deleteWebhook({ drop_pending_updates: true })
    .then(() => launchBotLocal(bot))
    .catch((err) => console.error("Dev polling start error:", err));
}
