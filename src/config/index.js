/**
 * Central config: env and constants.
 * Works in Bun and Node; Bun loads .env automatically.
 */
const env = typeof process !== "undefined" ? process.env : {};

export const BOT_TOKEN = env.BOT_TOKEN ?? "";
export const SUPABASE_URL = env.SUPABASE_URL ?? "";
export const SUPABASE_KEY = env.SUPABASE_KEY ?? "";
export const OPENROUTER_API_KEY = env.OPENROUTER_API_KEY ?? "";
export const XENDIT_API_KEY = env.XENDIT_API_KEY ?? "";
export const NODE_ENV = env.NODE_ENV ?? "development";
export const PORT = Number(env.PORT) || 3000;
export const TALLY_SIGNING_SECRET = env.TALLY_SIGNING_SECRET ?? "";
/** Public URL for Telegram webhook (e.g. https://your-domain.com/api). If set in production, webhook is used; otherwise polling. */
export const WEBHOOK_BASE_URL = env.WEBHOOK_BASE_URL ?? "";

export const isProduction = NODE_ENV === "production";

// Launch windows (UTC-based)
const PRELAUNCH_END_RAW = env.PRELAUNCH_END ?? "2026-03-14T00:00:00Z";
const BETA_END_RAW = env.BETA_END ?? "2026-03-31T23:59:59Z";
const FULL_LAUNCH_START_RAW = env.FULL_LAUNCH_START ?? "2026-04-01T00:00:00Z";

export const PRELAUNCH_END = new Date(PRELAUNCH_END_RAW);
export const BETA_END = new Date(BETA_END_RAW);
export const FULL_LAUNCH_START = new Date(FULL_LAUNCH_START_RAW);

function nowUtcMs() {
  return Date.now();
}

export function isPrelaunchNow() {
  if (!isProduction) return false;
  const now = nowUtcMs();
  return now < PRELAUNCH_END.getTime();
}

export function isBetaNow() {
  if (!isProduction) return false;
  const now = nowUtcMs();
  return now >= PRELAUNCH_END.getTime() && now <= BETA_END.getTime();
}

export function isFullLaunch() {
  if (!isProduction) return false;
  const now = nowUtcMs();
  return now >= FULL_LAUNCH_START.getTime();
}

// Table names
export const ROOMS_TABLE = "rooms";
export const ROOM_MESSAGES_TABLE = "room_messages";
export const SESSIONS_TABLE = "sessions";
export const BOTTLES_TABLE = "bottles";
export const GROUP_ROOMS_TABLE = "group_rooms";
export const GROUP_ROOM_MEMBERS_TABLE = "group_room_members";
export const GROUP_ROOM_MESSAGES_TABLE = "group_room_messages";
export const WALLETS_TABLE = "wallets";
export const PAYMENTS_TABLE = "payments";
export const USER_ENTITLEMENTS_TABLE = "user_entitlements";
export const ROOM_IDENTITY_PERMISSIONS_TABLE = "room_identity_permissions";
export const GROUP_ROOM_IDENTITY_PERMISSIONS_TABLE =
  "group_room_identity_permissions";
export const ROOM_REVEAL_CONSENTS_TABLE = "room_reveal_consents";
export const GIFT_EVENTS_TABLE = "gift_events";
export const GIFT_CLAIMS_TABLE = "gift_claims";
export const PROCESSED_TALLY_SUBMISSIONS_TABLE = "processed_tally_submissions";

// Timing
export const SILENCE_ICEBREAK_MS = 3 * 60 * 1000;
export const AI_CURHAT_TIMEOUT_MS = 25_000;

// Mood Energy
export const MOOD_DECREMENT_PER_CHAT = 1;
export const MOOD_LOW_THRESHOLD = 10;
export const MOOD_RECOVERY_PER_HOUR = 100;
export const LALA_COFFEE_PRICE = 5000;

// Chemistry (unlock identity via chat count + mutual consent)
export const CHEMISTRY_THRESHOLD = 50;
export const CHEMISTRY_HINT_AT = 25;

// Prices (IDR)
export const IDENTITY_UNLOCK_PRICE = 6000;
export const GROUP_PASS_PRICE = 9000;

export const GIFTS = {
  permen: { label: "Permen 🍬", price: 2000 },
  kopi: { label: "Kopi Hangat ☕", price: 4000 },
  bunga: { label: "Bunga 🌸", price: 7000 },
  peluk: { label: "Peluk Jauh 🫂", price: 10000 },
};

export const AI_MODEL = "google/gemini-2.0-flash-001";
