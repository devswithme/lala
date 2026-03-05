/**
 * Matchmaking helpers: personality overlap.
 */

export function overlapTags(a, b) {
  const setB = new Set((Array.isArray(b) ? b : []).map((x) => String(x)));
  return (Array.isArray(a) ? a : [])
    .map((x) => String(x))
    .filter((x) => setB.has(x));
}
