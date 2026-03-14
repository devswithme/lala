import { PORT, WEBHOOK_BASE_URL, isProduction } from "./config/index.js";
import { createBot, sendSafeDM } from "./bot/index.js";
import { upsertUser, prisma } from "./db/index.js";
import { handleXenditWebhook } from "./payments/xendit.js";

const bot = createBot();

// ─── Tally webhook ────────────────────────────────────────────────────────────

/**
 * Map Tally dropdown option text to a normalized value.
 */
function mapGender(optionText = "") {
  if (optionText.includes("Cowok")) return "male";
  if (optionText.includes("Cewek")) return "female";
  return "secret";
}

function mapOccupation(optionText = "") {
  if (optionText.includes("Sekolah") || optionText.includes("Kuliah"))
    return "Sekolah/Kuliah";
  if (optionText.includes("Kerja")) return "Kerja";
  if (optionText.includes("Gap Year")) return "Gap Year/Nyari Kerja";
  return "Lainnya";
}

function mapConcern(optionText = "") {
  if (optionText.includes("Percintaan") || optionText.includes("percintaan"))
    return "percintaan";
  if (optionText.includes("Keluarga")) return "keluarga";
  if (optionText.includes("Ekonomi") || optionText.includes("Karir"))
    return "ekonomi/karir";
  if (optionText.includes("Kesepian") || optionText.includes("Overthinking"))
    return "kesepian/overthinking";
  return "lainnya";
}

async function handleTallyWebhook(body) {
  if (body.eventType !== "FORM_RESPONSE") return new Response("ok", { status: 200 });

  const { submissionId, fields } = body.data ?? {};
  if (!submissionId || !fields) return new Response("ok", { status: 200 });

  // Dedup: skip if already processed
  const existing = await prisma.user.findFirst({
    where: { tallySubId: submissionId },
    select: { id: true },
  });
  if (existing) return new Response("ok", { status: 200 });

  // Extract fields
  const getValue = (label) =>
    fields.find((f) => f.label === label)?.value ?? null;

  const hiddenId = fields.find(
    (f) => f.type === "HIDDEN_FIELDS" && f.label === "id"
  )?.value;

  if (!hiddenId) return new Response("ok", { status: 200 });

  const userId = String(hiddenId);
  const name = getValue("Lala harus panggil kamu siapa?") ?? null;

  // Gender — dropdown returns array of selected option IDs
  const genderField = fields.find((f) => f.label === "Lala biar nggak salah panggil...");
  const genderOptionId = genderField?.value?.[0] ?? null;
  const genderOptionText =
    genderField?.options?.find((o) => o.id === genderOptionId)?.text ?? "";
  const gender = mapGender(genderOptionText);

  // Occupation
  const occupationField = fields.find((f) => f.label === "Sekarang lagi sibuk apa?");
  const occupationOptionId = occupationField?.value?.[0] ?? null;
  const occupationOptionText =
    occupationField?.options?.find((o) => o.id === occupationOptionId)?.text ?? "";
  const occupation = mapOccupation(occupationOptionText);

  // Concerns — multiple choice, returns array of option IDs
  const concernsField = fields.find((f) =>
    f.label.includes("paling sering bikin kamu kepikiran")
  );
  const concernOptionIds = concernsField?.value ?? [];
  const concerns = concernOptionIds
    .map((id) => {
      const opt = concernsField?.options?.find((o) => o.id === id);
      return opt ? mapConcern(opt.text) : null;
    })
    .filter(Boolean);

  // Upsert user with Tally data
  await upsertUser(userId, {
    name,
    gender,
    occupation,
    concerns,
    tallyDone: true,
    tallySubId: submissionId,
  });

  // Notify user (only once, dedup handled by tallySubId unique constraint)
  const genderGreeting =
    gender === "male" ? "Kak/Bang" : gender === "female" ? "Kak/Neng" : "Teman";

  await sendSafeDM(
    bot,
    userId,
    `🌸 Hei, ${genderGreeting} <b>${name ?? ""}</b>!\n\n` +
      `Lala udah nerima info kamu. Sekarang kita bisa mulai ngobrol!\n\n` +
      `Ketik aja apa yang lagi ada di pikiranmu — Lala siap dengerin kamu 💬\n\n` +
      `Butuh bantuan? Ketik /bantuan`,
    { parse_mode: "HTML" }
  );

  return new Response("ok", { status: 200 });
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;

    // Health check
    if (method === "GET" && url.pathname === "/") {
      return new Response("Lala is Online & Healthy! 🌸", { status: 200 });
    }

    // Telegram webhook
    if (method === "POST" && url.pathname === "/") {
      try {
        const body = await req.json();
        await bot.handleUpdate(body);
        return new Response("ok", { status: 200 });
      } catch (err) {
        console.error("[telegram webhook]", err);
        return new Response("error", { status: 500 });
      }
    }

    // Tally form webhook
    if (method === "POST" && url.pathname === "/api/tally") {
      try {
        const body = await req.json();
        return await handleTallyWebhook(body);
      } catch (err) {
        console.error("[tally webhook]", err);
        return new Response("error", { status: 500 });
      }
    }

    // Xendit payment webhook
    if (method === "POST" && url.pathname === "/api/xendit") {
      try {
        const body = await req.json();
        const callbackToken = req.headers.get("x-callback-token") ?? "";
        await handleXenditWebhook(body, callbackToken, bot);
        return new Response("ok", { status: 200 });
      } catch (err) {
        console.error("[xendit webhook]", err.message);
        return new Response("error", { status: 400 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`[lala] Server running on port ${server.port}`);

// ─── Bot launch ───────────────────────────────────────────────────────────────

if (isProduction && WEBHOOK_BASE_URL) {
  const webhookUrl = `${WEBHOOK_BASE_URL}`;
  await bot.telegram.setWebhook(webhookUrl);
  console.log(`[lala] Webhook set to ${webhookUrl}`);
} else {
  // Development: use long polling
  await bot.telegram.deleteWebhook();
  bot.launch();
  console.log("[lala] Bot started with long polling (dev mode)");
}

// Graceful shutdown
process.on("SIGINT", async () => {
  bot.stop("SIGINT");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  bot.stop("SIGTERM");
  await prisma.$disconnect();
  process.exit(0);
});
