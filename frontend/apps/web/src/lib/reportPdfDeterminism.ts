/**
 * reportPdfDeterminism — the one seam that makes the exported report file
 * byte-reproducible: same chart in, same bytes out, every time.
 *
 * WHY IT EXISTS. `@react-pdf/pdfkit` picks each embedded font's six-letter
 * subset prefix with `Math.random()` (`EmbeddedFont.embed()`), so two exports of
 * the SAME chart differ in ~30 places across the eight report faces. That single
 * library detail is what made the README's "same input, same file every time"
 * claim false. PDF 32000-1 §9.6.4 says the tag is arbitrary — it only has to be
 * consistent within one file — so rewriting it changes nothing any reader can
 * observe, and it makes the claim true.
 *
 * WHY A BYTE REWRITE AND NOT A PATCH. The tag is generated deep inside a vendored
 * dependency, with no option to seed it. Rewriting the finished bytes keeps the
 * fix in code we own (the Lego seam), needs no dependency fork, and is a pure
 * function we can test directly. The rewrite is LENGTH-PRESERVING — six letters
 * in, six letters out — so every byte offset in the cross-reference table stays
 * valid and the file needs no re-serialization.
 *
 * WHY IT IS SAFE. Subset tags appear only in the uncompressed `/FontName` and
 * `/BaseFont` dictionary entries. pdfkit compresses stream *data*, never
 * dictionaries, and emits classic `N 0 obj` bodies rather than object streams,
 * so no tag is ever hidden behind a filter. The pattern below matches only those
 * two keys, so no other text in the document can be touched.
 *
 * The OTHER two clock-shaped sources of drift (`/CreationDate` and the trailer
 * `/ID`, which is an MD5 over the info dictionary and therefore derived from it)
 * are pinned upstream instead: `buildReportPdfData` resolves ONE instant from
 * the chart's own data and `ReportDocument` passes it as `creationDate`.
 */

/**
 * Matches `/FontName /ABCDEF+PostScriptName` and the `/BaseFont` spelling of the
 * same thing. The name is a PDF name token, so it runs to the first delimiter.
 */
const SUBSET_TAG_ENTRY = /\/(FontName|BaseFont) \/([A-Z]{6})\+([^\s/[\]<>(){}%]+)/g;

const TAG_LENGTH = 6;
const LETTERS = 26;
const UPPERCASE_A = 65;

/** FNV-1a over the PostScript name — a stable 32-bit seed for the tag. */
function nameSeed(postScriptName: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < postScriptName.length; i += 1) {
    hash ^= postScriptName.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Render a 32-bit seed as six uppercase letters (26^6 > 2^28, so no wrap-around bias worth caring about). */
function tagFromSeed(seed: number): string {
  let remaining = seed;
  let tag = '';
  for (let i = 0; i < TAG_LENGTH; i += 1) {
    tag += String.fromCharCode(UPPERCASE_A + (remaining % LETTERS));
    remaining = Math.floor(remaining / LETTERS);
  }
  return tag;
}

/**
 * The canonical tag for a font, disambiguated deterministically if two different
 * PostScript names happen to hash to the same six letters.
 */
function canonicalTag(postScriptName: string, taken: ReadonlySet<string>): string {
  let seed = nameSeed(postScriptName);
  for (let attempt = 0; attempt < LETTERS ** TAG_LENGTH; attempt += 1) {
    const tag = tagFromSeed(seed);
    if (!taken.has(tag)) return tag;
    seed = (seed + 1) >>> 0;
  }
  /* istanbul ignore next — unreachable: 308 million tags, at most a handful of fonts. */
  throw new Error('reportPdfDeterminism: exhausted the font subset tag space');
}

/** `String.fromCharCode` in ~32 KB slices; larger spreads blow the argument limit. */
const DECODE_CHUNK = 0x8000;

/**
 * Byte n becomes code unit U+00n and back again, so every byte 0x00–0xFF survives
 * the string hop untouched — which is what lets a binary PDF go through a regex.
 *
 * NOT `TextDecoder('latin1')`. That label is an Encoding-Standard alias for
 * windows-1252, which maps 0x80–0x9F onto printable code points (0x80 → U+20AC),
 * so re-encoding turns € back into 0xAC and quietly corrupts every deflated
 * stream carrying those bytes. The test "leaves every non-tag byte untouched"
 * caught exactly that.
 */
function decodeLatin1(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += DECODE_CHUNK) {
    text += String.fromCharCode(...bytes.subarray(i, i + DECODE_CHUNK));
  }
  return text;
}

function encodeLatin1(text: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

/**
 * Replace every random font subset tag with a deterministic one derived from the
 * font's own PostScript name. Pure; the input buffer is not mutated.
 */
export function canonicalizeFontSubsetTags(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const assigned = new Map<string, string>();
  const taken = new Set<string>();
  const rewritten = decodeLatin1(bytes).replace(
    SUBSET_TAG_ENTRY,
    (_whole, key: string, tag: string, postScriptName: string) => {
      const cacheKey = `${tag}+${postScriptName}`;
      let canonical = assigned.get(cacheKey);
      if (canonical === undefined) {
        canonical = canonicalTag(postScriptName, taken);
        assigned.set(cacheKey, canonical);
        taken.add(canonical);
      }
      return `/${key} /${canonical}+${postScriptName}`;
    },
  );
  return encodeLatin1(rewritten);
}

/** The subset tags present in a finished PDF, in order of first appearance. */
export function readFontSubsetTags(bytes: Uint8Array): ReadonlyArray<string> {
  const seen = new Set<string>();
  for (const match of decodeLatin1(bytes).matchAll(SUBSET_TAG_ENTRY)) {
    seen.add(`${match[2]}+${match[3]}`);
  }
  return [...seen];
}
