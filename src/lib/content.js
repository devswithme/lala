/**
 * Regex-based negative content detection for in-room moderation.
 * No AI involved — pure pattern matching for speed and token savings.
 */

const NEGATIVE_PATTERNS = [
  // Harassment / threats
  /\b(ancam|bunuh|mati\s*lo|matiin|hajar|siksa|aniaya|perkosa|rudapaksa)\b/i,
  // Heavy profanity (Indonesian)
  /\b(bangsat|bajingan|brengsek|kampret|tai\s*lo|kontol|memek|jancok|dancok|asu\s*lo|keparat)\b/i,
  // Discrimination / hate
  /\b(kafir|najis\s*lo|monyet\s*lo|babi\s*lo|hina\s*banget)\b/i,
  // Self-harm indicators
  /\b(mau\s*mati|pengen\s*mati|ingin\s*bunuh\s*diri|udah\s*nggak\s*mau\s*hidup)\b/i,
];

/**
 * Returns true if the text contains content that requires moderation.
 * @param {string} text
 * @returns {boolean}
 */
export function isNegativeContent(text) {
  return NEGATIVE_PATTERNS.some((re) => re.test(text));
}

/**
 * Returns true if text looks like it contains a self-harm signal.
 * Used to trigger a gentler, supportive Lala response.
 * @param {string} text
 * @returns {boolean}
 */
export function isSelfHarmSignal(text) {
  const patterns = [
    /\b(mau\s*mati|pengen\s*mati|ingin\s*bunuh\s*diri|udah\s*nggak\s*mau\s*hidup|nyerah\s*hidup)\b/i,
  ];
  return patterns.some((re) => re.test(text));
}

/**
 * Returns true if the user is dismissing or pushing away Lala.
 * Used to trigger a respectful boundary response instead of a normal AI reply.
 * @param {string} text
 * @returns {boolean}
 */
export function isDismissiveOfLala(text) {
  const patterns = [
    /\b(gak\s*usah|jangan)\s*(chat|dm|hubungi|ganggu|contact)/i,
    /\b(stop|berhenti)\s*(chat|dm|hubungi|nge-?chat)/i,
    /\b(pergi|minggat|leave\s*me)\b/i,
    /\b(ganggu\s*(aja|terus|mulu)|jangan\s*ganggu)\b/i,
    /\b(diem\s*aja|diam\s*aja)\b/i,
  ];
  return patterns.some((re) => re.test(text));
}
