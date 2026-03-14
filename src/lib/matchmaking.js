import { prisma } from "../db/index.js";

/**
 * Find the best match for a user in the SEARCHING pool.
 *
 * Strategy:
 * 1. Exclude the requesting user.
 * 2. Score each candidate by how many concerns overlap.
 * 3. Among equal scores, pick the one who has been waiting longest (FIFO by updatedAt).
 *
 * @param {string} userId - Telegram user ID
 * @param {string[]} concerns - user's concern tags
 * @returns {Promise<object|null>} matched user record or null
 */
export async function findMatch(userId, concerns = []) {
  const candidates = await prisma.user.findMany({
    where: {
      status: "SEARCHING",
      id: { not: String(userId) },
    },
    orderBy: { updatedAt: "asc" },
  });

  if (!candidates.length) return null;

  // Score by concern overlap, then FIFO
  const scored = candidates.map((c) => {
    const overlap = (c.concerns ?? []).filter((concern) =>
      concerns.includes(concern)
    ).length;
    return { user: c, overlap };
  });

  // Sort: highest overlap first, then earliest updatedAt
  scored.sort((a, b) => {
    if (b.overlap !== a.overlap) return b.overlap - a.overlap;
    return a.user.updatedAt - b.user.updatedAt;
  });

  return scored[0].user;
}
