import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DATABASE_URL } from "../config/index.js";

const adapter = new PrismaPg({ connectionString: DATABASE_URL });
export const prisma = new PrismaClient({ adapter });

// ─── User ────────────────────────────────────────────────────────────────────

/** Get a user by Telegram ID string. Returns null if not found. */
export async function getUser(userId) {
  return prisma.user.findUnique({ where: { id: String(userId) } });
}

/** Create or update a user. Merges provided fields. */
export async function upsertUser(userId, data) {
  const id = String(userId);
  try {
    return await prisma.user.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
  } catch (e) {
    // P2002: unique constraint (e.g. race or PgBouncer split SELECT/INSERT across connections)
    if (e.code === "P2002") {
      return prisma.user.update({ where: { id }, data });
    }
    throw e;
  }
}

/**
 * Ensure user row exists (called on every bot interaction).
 * Only inserts if not present — no overwrite.
 */
export async function ensureUser(userId) {
  const id = String(userId);
  try {
    return await prisma.user.upsert({
      where: { id },
      create: { id },
      update: {},
    });
  } catch (e) {
    if (e.code === "P2002") {
      return prisma.user.findUnique({ where: { id } });
    }
    throw e;
  }
}

// ─── Room ─────────────────────────────────────────────────────────────────────

export async function createRoom(user1Id, user2Id) {
  const room = await prisma.room.create({
    data: { user1Id: String(user1Id), user2Id: String(user2Id) },
  });

  await prisma.user.updateMany({
    where: { id: { in: [String(user1Id), String(user2Id)] } },
    data: { status: "LIVE", roomId: room.id },
  });

  return room;
}

export async function getRoom(roomId) {
  return prisma.room.findUnique({ where: { id: roomId } });
}

export async function endRoom(roomId) {
  await prisma.room.update({
    where: { id: roomId },
    data: { status: "ENDED" },
  });

  await prisma.user.updateMany({
    where: { roomId },
    data: { status: "IDLE", roomId: null },
  });
}

/** Return the active room partner's userId given one member. */
export async function getRoomPartner(userId) {
  const user = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: { roomId: true },
  });
  if (!user?.roomId) return null;

  const room = await prisma.room.findUnique({ where: { id: user.roomId } });
  if (!room || room.status !== "ACTIVE") return null;

  return room.user1Id === String(userId) ? room.user2Id : room.user1Id;
}

// ─── Payment ──────────────────────────────────────────────────────────────────

export async function createPayment(userId, { xenditId, amount, type }) {
  return prisma.payment.create({
    data: { userId: String(userId), xenditId, amount, type },
  });
}

export async function getPaymentByXenditId(xenditId) {
  return prisma.payment.findUnique({ where: { xenditId } });
}

export async function markPaymentPaid(xenditId) {
  return prisma.payment.update({
    where: { xenditId },
    data: { status: "PAID" },
  });
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

export async function addBalance(userId, amount) {
  return prisma.user.update({
    where: { id: String(userId) },
    data: { balance: { increment: amount } },
  });
}

export async function deductBalance(userId, amount) {
  const user = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: { balance: true },
  });
  if (!user || user.balance < amount) return null;
  return prisma.user.update({
    where: { id: String(userId) },
    data: { balance: { decrement: amount } },
  });
}

// ─── AI quota ────────────────────────────────────────────────────────────────

/**
 * Check and increment AI daily usage.
 * Returns { allowed: boolean, count: number } after increment.
 * Resets counter if aiResetAt is from a previous day.
 */
export async function checkAndIncrementAi(userId, dailyLimit) {
  const user = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: { aiCount: true, aiResetAt: true },
  });

  if (!user) return { allowed: false, count: 0 };

  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  const needsReset = user.aiResetAt < todayMidnight;
  const currentCount = needsReset ? 0 : user.aiCount;

  if (currentCount >= dailyLimit)
    return { allowed: false, count: currentCount };

  await prisma.user.update({
    where: { id: String(userId) },
    data: {
      aiCount: needsReset ? 1 : { increment: 1 },
      ...(needsReset ? { aiResetAt: new Date() } : {}),
    },
  });

  return { allowed: true, count: currentCount + 1 };
}

/** Subtract from aiCount (used when extending quota via payment). */
export async function extendAiQuota(userId, bonus) {
  return prisma.user.update({
    where: { id: String(userId) },
    data: { aiCount: { decrement: bonus } },
  });
}

// ─── Proactive state ──────────────────────────────────────────────────────────

/** Mark that user just had a curhat exchange. */
export async function updateLastChatAt(userId) {
  return prisma.user.update({
    where: { id: String(userId) },
    data: { lastChatAt: new Date() },
  });
}

/** Increment toxicCount (called when negative content detected in curhat). */
export async function incrementToxicCount(userId) {
  return prisma.user.update({
    where: { id: String(userId) },
    data: { toxicCount: { increment: 1 } },
  });
}

/**
 * Decrement toxicCount toward 0 (called on normal, non-toxic curhat message).
 * Uses a raw update guarded by a WHERE clause to avoid going below 0.
 */
export async function decrementToxicCount(userId) {
  const user = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: { toxicCount: true },
  });
  if (!user || user.toxicCount <= 0) return;
  return prisma.user.update({
    where: { id: String(userId) },
    data: { toxicCount: { decrement: 1 } },
  });
}

// ─── History ──────────────────────────────────────────────────────────────────

/** Save updated history and optional summary back to user row. */
export async function saveHistory(userId, history, historySummary) {
  const data = { history };
  if (historySummary !== undefined) data.historySummary = historySummary;
  return prisma.user.update({ where: { id: String(userId) }, data });
}
