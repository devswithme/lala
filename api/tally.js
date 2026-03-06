/**
 * Vercel serverless entry for Tally webhook.
 * Configure Tally webhook URL to: https://your-domain.vercel.app/api/tally
 */
import "dotenv/config";
import { Telegraf } from "telegraf";
import {
  BOT_TOKEN,
  isProduction,
  PRELAUNCH_END,
} from "../src/config/index.js";
import {
  getSession,
  upsertSession,
  assignQueuePositionForUser,
  tryMarkTallySubmissionProcessed,
} from "../src/db/index.js";

const telegram = new Telegraf(BOT_TOKEN).telegram;

function getUserIdFromBody(body) {
  const hidden = body?.data?.hiddenFields ?? {};
  let raw = hidden.id ?? hidden.user_id ?? hidden.userId;
  if (raw == null && Array.isArray(body?.data?.fields)) {
    const idField = body.data.fields.find(
      (f) =>
        f.key === "id" ||
        f.key === "user_id" ||
        f.key === "userId" ||
        f.id === "id" ||
        f.title === "id" ||
        f.type === "HIDDEN_FIELDS"
    );
    const answer = idField?.answer;
    raw =
      idField?.value ??
      (typeof answer === "object" && answer !== null
        ? answer.value ?? answer.raw ?? answer.id ?? answer.user_id
        : answer) ??
      idField?.answer;
  }
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function getFieldValue(fields, keyCandidates) {
  if (!Array.isArray(fields)) return undefined;
  for (const key of keyCandidates) {
    const found = fields.find(
      (f) => f.key === key || f.id === key || f.question?.id === key,
    );
    if (found?.value != null) return found.value;
  }
  return undefined;
}

function normalizeGender(raw) {
  const v = String(raw ?? "").toLowerCase();
  if (!v) return "unknown";
  if (v.includes("laki") || v.startsWith("l") || v === "male") return "male";
  if (v.includes("perem") || v.startsWith("p") || v === "female") return "female";
  return "unknown";
}

function normalizePersonality(raw) {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }
  if (raw == null) return [];
  return String(raw)
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const body = req.body ?? {};
    const submissionId = body?.data?.responseId ?? body?.data?.submissionId ?? null;
    if (submissionId && !(await tryMarkTallySubmissionProcessed(submissionId))) {
      res.status(200).send("OK");
      return;
    }

    const userId = getUserIdFromBody(body);
    if (!userId) {
      console.error("Tally webhook missing user id", body);
      res.status(400).send("Missing user id");
      return;
    }

    const alreadyInQueue = (await getSession(userId, "queue_position"))?.queue_position != null;

    const fields = body?.data?.fields ?? body?.data?.answers ?? [];
    const genderRaw = getFieldValue(fields, ["gender", "jenis_kelamin"]);
    const personalityRaw = getFieldValue(fields, ["personality", "tags", "minat"]);
    const summaryRaw = getFieldValue(fields, ["summary", "ringkasan"]);

    const gender = normalizeGender(genderRaw);
    const personality = normalizePersonality(personalityRaw);
    const summary = summaryRaw != null ? String(summaryRaw) : null;

    const queuePosition = await assignQueuePositionForUser(userId);

    const sessionPayload = {
      user_id: userId,
      gender,
      personality,
      summary,
    };
    await upsertSession(sessionPayload);

    const isFirstTime = !alreadyInQueue;
    if (isProduction && isFirstTime) {
      const releaseDate = PRELAUNCH_END.toLocaleDateString("id-ID", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "Asia/Jakarta",
      });
      const text =
        `Makasih ya sudah isi form kenalan 🌸\n\n` +
        `Kamu ada di antrian #${queuePosition}.\n` +
        `Lala akan rilis ke publik pada ${releaseDate}, dan nanti Lala bakal kabarin kamu lagi lewat broadcast ya.`;
      try {
        await telegram.sendMessage(userId, text);
      } catch (err) {
        console.error("Failed to send Tally queue DM:", err);
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Vercel Tally Handler Error:", err);
    if (!res.headersSent) {
      res.status(200).send("Error Handled");
    }
  }
}

