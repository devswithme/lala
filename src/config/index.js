export const BOT_TOKEN = process.env.BOT_TOKEN;
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
export const DATABASE_URL = process.env.DATABASE_URL;
export const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL;
export const XENDIT_SECRET_KEY = process.env.XENDIT_SECRET_KEY;
export const XENDIT_CALLBACK_TOKEN = process.env.XENDIT_CALLBACK_TOKEN;

export const PORT = Number(process.env.PORT) || 3000;
export const NODE_ENV = process.env.NODE_ENV || "development";
export const isProduction = NODE_ENV === "production";

// Tally
export const TALLY_FORM_URL = "https://tally.so/r/xXQVy9";

// AI limits
export const AI_DAILY_LIMIT = 30;
export const AI_EXTEND_PRICE = 5000;
export const AI_EXTEND_BONUS = 30;
export const AI_MODEL = "google/gemini-2.0-flash-001";

// Topup
export const TOPUP_MIN = 5000;

// Gifts (IDR)
export const GIFTS = {
  coklat: 4000,
  peluk: 2000,
  permen: 1000,
  kopi: 3000,
};

// Gift emoji display
export const GIFT_LABELS = {
  coklat: "🍫 Coklat",
  peluk: "🤗 Peluk",
  permen: "🍬 Permen",
  kopi: "☕ Kopi",
};

// Ice breaker prompts
export const ICE_BREAKERS = [
  "Kalau kamu bisa ke mana saja besok, kamu mau ke mana?",
  "Apa hal kecil yang bikin harimu jadi lebih baik hari ini?",
  "Film atau series apa yang lagi kamu tonton sekarang?",
  "Satu hal yang pengen kamu pelajari tapi belum sempat?",
  "Kalau bisa makan satu makanan seumur hidup, kamu mau makan apa?",
  "Tempat yang paling bikin kamu tenang itu di mana?",
  "Musik apa yang lagi sering kamu dengerin belakangan ini?",
  "Hal random apa yang bikin kamu senyum minggu ini?",
  "Kalau bisa ngobrol sama siapa saja, kamu mau ngobrol sama siapa?",
  "Apa hobi yang kamu mau coba tapi belum pernah?",
];
