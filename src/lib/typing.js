const CHAR_DELAY_MS = 15;
const MAX_DELAY_MS = 2000;
const THINKING_MIN = 375;
const THINKING_MAX = 625;

export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

export const randomBetween = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Compute how long Lala "types" a given text based on her current mood.
 * @param {string} text
 * @param {"WARM"|"GUARDED"|"TIRED"} mood
 * @returns {number} milliseconds
 */
export function getTypingDelay(text, mood = "WARM") {
  const base = (text?.length ?? 0) * CHAR_DELAY_MS;
  const multiplier = mood === "TIRED" ? 1.5 : mood === "GUARDED" ? 1.2 : 1.0;
  return Math.min(Math.round(base * multiplier), MAX_DELAY_MS);
}

/**
 * Split a reply into at most 2 parts when it is long enough to feel like a
 * "double text". Splits at the paragraph boundary nearest the midpoint.
 * Returns a single-element array for short or simple messages.
 * @param {string} text
 * @returns {string[]}
 */
export function splitMessage(text) {
  const paragraphs = text.split(/\n\n+/);
  if (text.length <= 300 || paragraphs.length <= 2) return [text];
  const mid = Math.ceil(paragraphs.length / 2);
  return [
    paragraphs.slice(0, mid).join("\n\n"),
    paragraphs.slice(mid).join("\n\n"),
  ];
}

/**
 * Send a reply via Telegraf ctx with post-AI typing simulation.
 * The caller is responsible for the initial thinking delay and keeping
 * the typing indicator alive during the AI call. This function handles
 * only the "typing then send" phase after the reply text is known.
 * @param {object} ctx - Telegraf context
 * @param {string} text
 * @param {"WARM"|"GUARDED"|"TIRED"} mood
 */
export async function sendWithTyping(ctx, text, mood = "WARM") {
  const parts = splitMessage(text);
  for (let i = 0; i < parts.length; i++) {
    await ctx.sendChatAction("typing");
    await sleep(getTypingDelay(parts[i], mood));
    await ctx.reply(parts[i]);
    if (i < parts.length - 1) await sleep(1000);
  }
}

/**
 * Send a proactive DM with full typing simulation (thinking delay included).
 * Used by the scheduler which has no Telegraf ctx. Returns true on success.
 * @param {object} telegram - bot.telegram (raw Telegram API)
 * @param {string|number} userId
 * @param {string} text
 * @param {"WARM"|"GUARDED"|"TIRED"} mood
 * @returns {Promise<boolean>}
 */
export async function sendDMWithTyping(telegram, userId, text, mood = "WARM") {
  const id = String(userId);
  try {
    // Thinking pause — makes it feel like Lala just thought of the user
    await telegram.sendChatAction(id, "typing");
    await sleep(randomBetween(THINKING_MIN, THINKING_MAX));

    const parts = splitMessage(text);
    for (let i = 0; i < parts.length; i++) {
      await telegram.sendChatAction(id, "typing");
      await sleep(getTypingDelay(parts[i], mood));
      await telegram.sendMessage(id, parts[i], { parse_mode: "HTML" });
      if (i < parts.length - 1) await sleep(1000);
    }
    return true;
  } catch (err) {
    console.warn(`[typing] Failed to DM ${userId}:`, err.message);
    return false;
  }
}
