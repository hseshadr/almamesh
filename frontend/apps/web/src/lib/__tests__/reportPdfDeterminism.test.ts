/**
 * The font-subset-tag canonicalizer is the seam that makes the exported report
 * reproducible, so it is tested on its own — not just through a full PDF render.
 *
 * The properties that matter, and why:
 *  - it is LENGTH-PRESERVING. The rewrite happens after serialization, so every
 *    byte offset in the cross-reference table must survive it. One extra byte
 *    and the file is corrupt.
 *  - it is IDEMPOTENT and INPUT-DETERMINED. The same font name always yields the
 *    same tag, whatever random tag it started with.
 *  - it touches NOTHING ELSE. A PDF is mostly binary; a greedy pattern that
 *    caught prose or stream data would silently damage documents.
 */
import { describe, it, expect } from 'vitest';
import { canonicalizeFontSubsetTags, readFontSubsetTags } from '../reportPdfDeterminism';

const encode = (text: string): Uint8Array =>
  Uint8Array.from(text, (character) => character.charCodeAt(0) & 0xff);
// True ISO-8859-1, byte-for-byte. `TextDecoder('latin1')` is windows-1252 and
// would hide the very corruption these tests exist to catch.
const decode = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');

/** A miniature PDF fragment shaped exactly like the one pdfkit emits. */
const fragment = (tagA: string, tagB: string): string =>
  `%PDF-1.3\n` +
  `9 0 obj\n<<\n/Type /FontDescriptor\n/FontName /${tagA}+FrauncesReportRegular\n>>\nendobj\n` +
  `10 0 obj\n<<\n/Subtype /CIDFontType2\n/BaseFont /${tagA}+FrauncesReportRegular\n>>\nendobj\n` +
  `11 0 obj\n<<\n/Type /Font\n/BaseFont /${tagB}+HankenGroteskReportRegular\n>>\nendobj\n`;

describe('canonicalizeFontSubsetTags', () => {
  it('replaces random tags with tags determined by the font name alone', () => {
    const first = decode(canonicalizeFontSubsetTags(encode(fragment('ZTUTBF', 'UDVBEC'))));
    const second = decode(canonicalizeFontSubsetTags(encode(fragment('QQQQQQ', 'MMMMMM'))));
    expect(second).toBe(first);
  });

  it('gives the two fonts DIFFERENT tags (a constant-mapper would also pass the test above)', () => {
    const tags = readFontSubsetTags(canonicalizeFontSubsetTags(encode(fragment('ZTUTBF', 'UDVBEC'))));
    expect(tags).toHaveLength(2);
    expect(tags[0].slice(0, 6)).not.toBe(tags[1].slice(0, 6));
  });

  it('keeps the same font on one tag across all three of its dictionary entries', () => {
    const out = decode(canonicalizeFontSubsetTags(encode(fragment('ZTUTBF', 'UDVBEC'))));
    const fraunces = [...out.matchAll(/([A-Z]{6})\+FrauncesReportRegular/g)].map((m) => m[1]);
    expect(fraunces).toHaveLength(2);
    expect(new Set(fraunces).size).toBe(1);
  });

  it('preserves the byte length exactly — xref offsets depend on it', () => {
    const input = encode(fragment('ZTUTBF', 'UDVBEC'));
    expect(canonicalizeFontSubsetTags(input).length).toBe(input.length);
  });

  it('is idempotent', () => {
    const once = canonicalizeFontSubsetTags(encode(fragment('ZTUTBF', 'UDVBEC')));
    expect(decode(canonicalizeFontSubsetTags(once))).toBe(decode(once));
  });

  it('leaves every non-tag byte untouched, including high bytes in stream data', () => {
    const binary = '\x00\xff\xab stream ABCDEF+NotAFont \x80\x01 endstream';
    const input = encode(fragment('ZTUTBF', 'UDVBEC') + binary);
    const out = decode(canonicalizeFontSubsetTags(input));
    // The bare `ABCDEF+NotAFont` is not preceded by /FontName or /BaseFont, so it
    // is prose as far as this rewriter is concerned and must survive verbatim.
    expect(out.endsWith(binary)).toBe(true);
  });

  it('does not corrupt a document that has no embedded fonts', () => {
    const input = encode('%PDF-1.3\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\n');
    expect(decode(canonicalizeFontSubsetTags(input))).toBe(decode(input));
    expect(readFontSubsetTags(input)).toEqual([]);
  });

  it('gives colliding font names distinct tags rather than merging them', () => {
    // Two DIFFERENT names must never share a tag, or a PDF reader would pick the
    // wrong descriptor for one of them.
    const many = Array.from({ length: 40 }, (_, i) => `20 0 obj\n/BaseFont /AAAAAA+Face${i}\n`).join('');
    const tags = readFontSubsetTags(canonicalizeFontSubsetTags(encode(many)));
    expect(new Set(tags.map((t) => t.slice(0, 6))).size).toBe(40);
  });
});
