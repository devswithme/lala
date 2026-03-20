import { prisma } from "../db/index.js";
import { upsertUser } from "../db/index.js";
import { generateEpiphany, generateCheckIn, generateDiaryEntry } from "../ai/proactive.js";
import { isSelfHarmSignal } from "./content.js";
import { deriveMood } from "../ai/curhat.js";
import { sendDMWithTyping } from "./typing.js";

const SCHEDULER_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Start the background scheduler. Call once after bot is created.
 * @param {import('telegraf').Telegraf} bot
 */
export function startScheduler(bot) {
  // Run immediately on startup then on interval
  runJobs(bot).catch((err) => console.error("[scheduler] initial run failed:", err));

  const timer = setInterval(() => {
    runJobs(bot).catch((err) => console.error("[scheduler] job failed:", err));
  }, SCHEDULER_INTERVAL_MS);

  // Don't block process exit
  if (timer.unref) timer.unref();

  console.log("[scheduler] started (30 min interval)");
}

async function runJobs(bot) {
  await Promise.allSettled([
    jobProactiveNudge(bot),
    jobDailyDiary(),
    jobNaturalDecay(),
  ]);
}

// ─── Job A: Proactive nudge ───────────────────────────────────────────────────

async function jobProactiveNudge(bot) {
  const now = new Date();
  const twelveHoursAgo = new Date(now - 12 * 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);

  const candidates = await prisma.user.findMany({
    where: {
      status: "IDLE",
      toxicCount: { lt: 5 },
      lastChatAt: { not: null, lt: twelveHoursAgo },
      historySummary: { not: null },
      OR: [
        { lastNudgeAt: null },
        { lastNudgeAt: { lt: twentyFourHoursAgo } },
      ],
    },
  });

  if (!candidates.length) return;

  console.log(`[scheduler] nudge: ${candidates.length} candidate(s)`);

  for (const user of candidates) {
    try {
      // Guard: skip if the last message in history looks like self-harm
      const lastUserMsg = getLastUserMessage(user.history);
      if (lastUserMsg && isSelfHarmSignal(lastUserMsg)) {
        console.log(`[scheduler] skipping nudge for ${user.id} — self-harm signal`);
        continue;
      }

      // Try epiphany first; fall back to generic check-in
      let message = await generateEpiphany(user);
      if (!message) {
        message = await generateCheckIn(user);
      }

      const narrativeMood = deriveMood(user.toxicCount ?? 0);
      const sent = await sendDMWithTyping(bot.telegram, user.id, message, narrativeMood);

      if (sent) {
        await upsertUser(user.id, { lastNudgeAt: now });
        console.log(`[scheduler] nudge sent to ${user.id}`);
      }
    } catch (err) {
      console.error(`[scheduler] nudge error for ${user.id}:`, err.message);
    }
  }
}

// ─── Job B: Daily diary ───────────────────────────────────────────────────────

async function jobDailyDiary() {
  const now = new Date();

  // Only write diaries from 23:00 onwards
  if (now.getHours() < 23) return;

  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);

  const candidates = await prisma.user.findMany({
    where: {
      lastChatAt: { not: null, gte: todayMidnight },
      OR: [
        { diaryWrittenAt: null },
        { diaryWrittenAt: { lt: todayMidnight } },
      ],
    },
  });

  if (!candidates.length) return;

  console.log(`[scheduler] diary: ${candidates.length} user(s)`);

  for (const user of candidates) {
    try {
      const entry = await generateDiaryEntry(user);
      if (!entry) continue;

      await upsertUser(user.id, {
        diaryEntry: entry,
        diaryWrittenAt: now,
      });

      console.log(`[scheduler] diary written for ${user.id}`);
    } catch (err) {
      console.error(`[scheduler] diary error for ${user.id}:`, err.message);
    }
  }
}

// ─── Job C: Natural mood decay ────────────────────────────────────────────────

async function jobNaturalDecay() {
  const result = await prisma.user.updateMany({
    where: { toxicCount: { gt: 0 } },
    data: { toxicCount: { decrement: 1 } },
  });
  if (result.count > 0) {
    console.log(`[scheduler] decay: cooled mood for ${result.count} user(s)`);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLastUserMessage(history) {
  if (!Array.isArray(history)) return null;
  const userMsgs = history.filter((m) => m.role === "user");
  return userMsgs[userMsgs.length - 1]?.content ?? null;
}
