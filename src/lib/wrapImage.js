import { Resvg } from "@resvg/resvg-js";

function escapeXml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeWhitespace(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

/**
 * Extract a single sentence to be used as the quote.
 * - If summary is a bullet list, uses the first non-empty line.
 * - Then takes the first sentence (split by punctuation).
 */
export function extractSingleSentence(summary) {
  if (summary === null || summary === undefined) return null;

  const raw = String(summary).trim();
  if (!raw) return null;

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // If bullet list, take the first bullet line.
  const firstLine = (lines[0] ?? "").replace(/^([-*•\u2022]+)\s+/, "");

  const candidate = normalizeWhitespace(firstLine);
  if (!candidate) return null;

  // Grab the first sentence-ish chunk.
  const m = candidate.match(/^(.+?[.!?])(\s|$)/);
  if (m?.[1]) return m[1].trim();

  // If there's no sentence punctuation, fallback to a shortened quote.
  return candidate.length > 180 ? `${candidate.slice(0, 177)}...` : candidate;
}

function wrapTextLines(text, maxCharsPerLine = 34) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [""];

  const words = normalized.split(" ");
  const lines = [];
  let current = "";

  for (const word of words) {
    // If a single word is longer than the line, hard-split it.
    if (word.length > maxCharsPerLine) {
      const chunks = word.match(new RegExp(`.{1,${maxCharsPerLine}}`, "g")) ?? [
        word,
      ];
      for (const chunk of chunks) {
        const next = current ? `${current} ${chunk}` : chunk;
        if (next.length > maxCharsPerLine && current) {
          lines.push(current);
          current = chunk;
        } else {
          current = next;
        }
      }
      continue;
    }

    const next = current ? `${current} ${word}` : word;
    if (next.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [normalized];
}

function buildWrapSvg(quote) {
  const width = 1080;
  const height = 1080;

  const leftMargin = 120;
  const rightMargin = 120;
  const maxWidth = width - leftMargin - rightMargin;

  const fontSize = 72;
  const lineHeight = 78;
  const authorFontSize = 36;
  const quoteToAuthorGap = 100;
  const maxQuoteLines = 5; // keep space for the author line

  // Approximation: average glyph width for Times at this size.
  // This keeps wrapping conservative to prevent right overflow.
  const approxCharPx = fontSize * 0.55;
  const maxCharsPerLine = Math.max(10, Math.floor(maxWidth / approxCharPx));

  const quoteLines = wrapTextLines(quote, maxCharsPerLine).slice(
    0,
    maxQuoteLines,
  ); // keep layout stable

  const n = quoteLines.length;
  const blockBaselineHeight =
    (n - 1) * lineHeight + quoteToAuthorGap + authorFontSize;

  // Baseline for the first quote line; "block" includes quote lines + author line.
  const startY = Math.round(height / 2 - blockBaselineHeight / 2);
  const authorY = startY + (n - 1) * lineHeight + quoteToAuthorGap;

  const tspanLines = quoteLines
    .map((line, idx) => {
      const dy = idx === 0 ? 0 : lineHeight;
      return `<tspan x="${leftMargin}" dy="${dy}" ${idx === 0 ? `dominant-baseline="alphabetic"` : ""}>${escapeXml(
        line,
      )}</tspan>`;
    })
    .join("");

  // Static design: white background, black text.
  // Font family uses Times New Roman as requested.
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <text x="${leftMargin}" y="${startY}" text-anchor="start"
        font-family="Liberation Serif, Times New Roman, Times, serif"
        font-weight="bold"
        letter-spacing="-0.025em"
        font-size="${fontSize}" fill="#000000">
    ${tspanLines}
  </text>

  <text x="${leftMargin}" y="${authorY}" text-anchor="start"
        font-family="Liberation Serif, Times New Roman, Times, serif"
        font-style="italic"
        font-size="${authorFontSize}" fill="#000000">
    ${escapeXml("Lala " + "$DATE")}
  </text>
</svg>
`.trim();
}

export async function renderWrapImagePng({ quote }) {
  const safeQuote =
    typeof quote === "string" && quote.trim()
      ? quote.trim()
      : "Kamu lagi tumbuh menjadi versi terbaik dari dirimu.";

  const pad2 = (n) => String(n).padStart(2, "0");
  const d = new Date();
  const dateStr = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;

  // Small templating trick to avoid threading more parameters around.
  const svgWithDate = buildWrapSvg(safeQuote).replace("$DATE", dateStr);
  const resvg = new Resvg(svgWithDate, {
    // background is already painted in SVG; kept for safety/compat.
    background: "#ffffff",
    fitTo: { mode: "width", value: 1080 },
  });

  const pngData = resvg.render();
  return pngData.asPng(); // Buffer
}
