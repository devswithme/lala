/**
 * Content helpers: censorship, safety, identity detection.
 */

export function censorText(text) {
  const s = String(text ?? "");
  const patterns = [
    /\b(anjing|bangsat|kontol|memek|ngentot|babi|goblok|tolol|jancok|asu|kampret)\b/gi,
    /\b(sex|seks|porno|telanjang|coli|masturbasi)\b/gi,
  ];
  let out = s;
  for (const p of patterns) out = out.replace(p, "***");
  return out;
}

export function looksUnsafe(text) {
  const s = String(text ?? "").toLowerCase();
  return (
    /\b(anjing|bangsat|kontol|memek|ngentot|babi|goblok|tolol|jancok|asu|kampret)\b/.test(
      s,
    ) ||
    /\b(sex|seks|porno|telanjang|coli|masturbasi)\b/.test(s) ||
    /\b(bunuh diri|suicide|kill myself)\b/.test(s)
  );
}

// Phrases that mean "stating my name" / reveal identity by name
const NAME_REVEAL_PATTERNS = [
  /\b(nama\s+saya|namaku|namanya\s+saya)\b/i,
  /\bperkenalkan\s+(saya|namaku|nama\s+saya)?/i,
  /\b(panggil\s+(aku|saya|gue)|call\s+me)\b/i,
  /\b(my\s+name\s+is|i'?m\s+\w+|i\s+am\s+\w+)\b/i,
];

function looksLikeNameReveal(text) {
  const s = String(text ?? "").trim();
  if (s.length > 120) return false;
  return NAME_REVEAL_PATTERNS.some((p) => p.test(s));
}

export function looksLikeIdentity(text) {
  const s = String(text ?? "");
  const lower = s.toLowerCase();
  const phone = /(\+62|62|0)8\d{8,13}/.test(lower);
  const email = /\b\S+@\S+\.\S+\b/.test(lower);
  const socialAt = /@\w{3,}/.test(s);
  const tme = /t\.me\/\w+/i.test(s);
  const keywords =
    /\b(wa|whatsapp|ig|instagram|line|telegram|dm|no hp|nomor|kontak)\b/i.test(s);
  const nameReveal = looksLikeNameReveal(s);
  const detected = phone || email || socialAt || tme || keywords || nameReveal;
  if (!detected) return { detected: false, kind: null };
  return {
    detected: true,
    kind: nameReveal
      ? "name"
      : phone
        ? "phone"
        : email
          ? "email"
          : socialAt || tme
            ? "social"
            : "generic",
  };
}
