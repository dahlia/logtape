/**
 * @fileoverview
 * wcwidth implementation for JavaScript/TypeScript
 *
 * This module provides functions to calculate the display width of Unicode
 * characters and strings in terminal/monospace contexts, compatible with
 * the Python wcwidth library and POSIX wcwidth() standard.
 *
 * Based on Unicode 15.1.0 character width tables.
 */

// Pre-compiled regex for ANSI escape sequences
// deno-lint-ignore no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

/**
 * Remove all ANSI escape sequences from a string.
 *
 * @param text The string to clean
 * @returns String with ANSI escape sequences removed
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

/**
 * Calculate the display width of a string, ignoring ANSI escape codes
 * and accounting for Unicode character widths using wcwidth-compatible logic.
 *
 * @param text The string to measure
 * @returns The display width in terminal columns
 */
export function getDisplayWidth(text: string): number {
  // Remove all ANSI escape sequences first
  const cleanText = stripAnsi(text);

  if (cleanText.length === 0) return 0;

  let width = 0;
  let i = 0;

  // Process character by character, handling surrogate pairs and combining characters
  while (i < cleanText.length) {
    const code = cleanText.codePointAt(i);
    if (code === undefined) {
      i++;
      continue;
    }

    const charWidth = wcwidth(code);
    if (charWidth >= 0) {
      width += charWidth;
    }

    // Move to next code point (handles surrogate pairs)
    i += code > 0xffff ? 2 : 1;
  }

  return width;
}

/**
 * Get the display width of a single Unicode code point.
 * Based on wcwidth implementation - returns:
 * -1: Non-printable/control character
 *  0: Zero-width character (combining marks, etc.)
 *  1: Normal width character
 *  2: Wide character (East Asian, emoji, etc.)
 *
 * @param code Unicode code point
 * @returns Display width (-1, 0, 1, or 2)
 */
export function wcwidth(code: number): number {
  // C0 and C1 control characters
  if (code < 32 || (code >= 0x7f && code < 0xa0)) {
    return -1;
  }

  // Zero-width characters (based on wcwidth table_zero.py)
  if (isZeroWidth(code)) {
    return 0;
  }

  // Wide characters (based on wcwidth table_wide.py)
  if (isWideCharacter(code)) {
    return 2;
  }

  return 1;
}

// Zero-width character ranges (sorted for binary search)
const ZERO_WIDTH_RANGES: Array<[number, number]> = [
  [0x0300, 0x036f], // Combining Diacritical Marks
  [0x0483, 0x0489], // Hebrew combining marks
  [0x0591, 0x05bd], // Arabic combining marks
  [0x05c1, 0x05c2],
  [0x05c4, 0x05c5],
  [0x0610, 0x061a], // More Arabic combining marks
  [0x064b, 0x065f],
  [0x06d6, 0x06dc],
  [0x06df, 0x06e4],
  [0x06e7, 0x06e8],
  [0x06ea, 0x06ed],
  [0x0730, 0x074a],
  [0x07a6, 0x07b0],
  [0x07eb, 0x07f3],
  [0x0816, 0x0819],
  [0x081b, 0x0823],
  [0x0825, 0x0827],
  [0x0829, 0x082d],
  [0x0859, 0x085b],
  [0x08d3, 0x08e1],
  [0x08e3, 0x0902],
  [0x0941, 0x0948],
  [0x0951, 0x0957],
  [0x0962, 0x0963],
  [0x09c1, 0x09c4],
  [0x09e2, 0x09e3],
  [0x0a01, 0x0a02],
  [0x0a41, 0x0a42],
  [0x0a47, 0x0a48],
  [0x0a4b, 0x0a4d],
  [0x0a70, 0x0a71],
  [0x0a81, 0x0a82],
  [0x0ac1, 0x0ac5],
  [0x0ac7, 0x0ac8],
  [0x0ae2, 0x0ae3],
  [0x0afa, 0x0aff],
  [0x0b41, 0x0b44],
  [0x0b55, 0x0b56],
  [0x0b62, 0x0b63],
  [0x0c3e, 0x0c40],
  [0x0c46, 0x0c48],
  [0x0c4a, 0x0c4d],
  [0x0c55, 0x0c56],
  [0x0c62, 0x0c63],
  [0x0ccc, 0x0ccd],
  [0x0ce2, 0x0ce3],
  [0x0d00, 0x0d01],
  [0x0d3b, 0x0d3c],
  [0x0d62, 0x0d63],
  [0x0dd2, 0x0dd4],
  [0x0e34, 0x0e3a],
  [0x0e47, 0x0e4e],
  [0x0eb4, 0x0ebc],
  [0x0ec8, 0x0ecd],
  [0x0f18, 0x0f19],
  [0x0f71, 0x0f7e],
  [0x0f80, 0x0f84],
  [0x0f86, 0x0f87],
  [0x0f8d, 0x0f97],
  [0x0f99, 0x0fbc],
  [0x102d, 0x1030],
  [0x1032, 0x1037],
  [0x1039, 0x103a],
  [0x103d, 0x103e],
  [0x1058, 0x1059],
  [0x105e, 0x1060],
  [0x1071, 0x1074],
  [0x1085, 0x1086],
  [0x135d, 0x135f],
  [0x1712, 0x1714],
  [0x1732, 0x1734],
  [0x1752, 0x1753],
  [0x1772, 0x1773],
  [0x17b4, 0x17b5],
  [0x17b7, 0x17bd],
  [0x17c9, 0x17d3],
  [0x180b, 0x180d],
  [0x1885, 0x1886],
  [0x1920, 0x1922],
  [0x1927, 0x1928],
  [0x1939, 0x193b],
  [0x1a17, 0x1a18],
  [0x1a58, 0x1a5e],
  [0x1a65, 0x1a6c],
  [0x1a73, 0x1a7c],
  [0x1ab0, 0x1abe],
  [0x1b00, 0x1b03],
  [0x1b36, 0x1b3a],
  [0x1b6b, 0x1b73],
  [0x1b80, 0x1b81],
  [0x1ba2, 0x1ba5],
  [0x1ba8, 0x1ba9],
  [0x1bab, 0x1bad],
  [0x1be8, 0x1be9],
  [0x1bef, 0x1bf1],
  [0x1c2c, 0x1c33],
  [0x1c36, 0x1c37],
  [0x1cd0, 0x1cd2],
  [0x1cd4, 0x1ce0],
  [0x1ce2, 0x1ce8],
  [0x1cf8, 0x1cf9],
  [0x1dc0, 0x1df9],
  [0x1dfb, 0x1dff],
  [0x200b, 0x200f], // Zero-width spaces
  [0x202a, 0x202e], // Bidirectional format characters
  [0x2060, 0x2064], // Word joiner, etc.
  [0x2066, 0x206f], // More bidirectional
  [0xfe00, 0xfe0f], // Variation selectors
  [0xfe20, 0xfe2f], // Combining half marks
];

// Single zero-width characters
const ZERO_WIDTH_SINGLES = new Set([
  0x05bf, 0x05c7, 0x0670, 0x0711, 0x07fd, 0x093a, 0x093c, 0x094d, 0x0981,
  0x09bc, 0x09cd, 0x09fe, 0x0a3c, 0x0a51, 0x0a75, 0x0abc, 0x0acd, 0x0b01,
  0x0b3c, 0x0b3f, 0x0b4d, 0x0b82, 0x0bc0, 0x0bcd, 0x0c00, 0x0c04, 0x0c81,
  0x0cbc, 0x0cbf, 0x0cc6, 0x0d41, 0x0d44, 0x0d4d, 0x0d81, 0x0dca, 0x0dd6,
  0x0e31, 0x0eb1, 0x0f35, 0x0f37, 0x0f39, 0x0fc6, 0x1082, 0x108d, 0x109d,
  0x17c6, 0x17dd, 0x18a9, 0x1932, 0x1a1b, 0x1a56, 0x1a60, 0x1a62, 0x1a7f,
  0x1b34, 0x1b3c, 0x1b42, 0x1be6, 0x1bed, 0x1ced, 0x1cf4, 0xfeff,
]);

/**
 * Binary search to check if a value is within any range
 */
function isInRanges(code: number, ranges: Array<[number, number]>): boolean {
  let left = 0;
  let right = ranges.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const [start, end] = ranges[mid];

    if (code >= start && code <= end) {
      return true;
    } else if (code < start) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  return false;
}

/**
 * Check if a character is zero-width (combining marks, etc.)
 * Based on wcwidth's zero-width table.
 *
 * @param code Unicode code point
 * @returns True if the character has zero display width
 */
function isZeroWidth(code: number): boolean {
  return ZERO_WIDTH_SINGLES.has(code) || isInRanges(code, ZERO_WIDTH_RANGES);
}

/**
 * Check if a character code point represents a wide character.
 * Based on wcwidth's wide character table (selected ranges from Unicode 15.1.0).
 *
 * @param code Unicode code point
 * @returns True if the character has width 2
 */
function isWideCharacter(code: number): boolean {
  // cSpell: disable
  return (
    // Based on wcwidth table_wide.py for Unicode 15.1.0
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x231a && code <= 0x231b) || // Watch, Hourglass
    (code >= 0x2329 && code <= 0x232a) || // Angle brackets
    (code >= 0x23e9 && code <= 0x23ec) || // Media controls
    code === 0x23f0 ||
    code === 0x23f3 || // Alarm clock, hourglass
    (code >= 0x25fd && code <= 0x25fe) || // Small squares
    (code >= 0x2614 && code <= 0x2615) || // Umbrella, coffee
    (code >= 0x2648 && code <= 0x2653) || // Zodiac signs
    code === 0x267f ||
    code === 0x2693 || // Wheelchair, anchor
    code === 0x26a0 ||
    code === 0x26a1 ||
    code === 0x26aa ||
    code === 0x26ab || // Warning, lightning, circles
    (code >= 0x26bd && code <= 0x26be) || // Sports balls
    (code >= 0x26c4 && code <= 0x26c5) || // Weather
    code === 0x26ce ||
    code === 0x26d4 || // Ophiuchus, no entry
    (code >= 0x26ea && code <= 0x26ea) || // Church
    (code >= 0x26f2 && code <= 0x26f3) || // Fountain, golf
    code === 0x26f5 ||
    code === 0x26fa || // Sailboat, tent
    code === 0x26fd || // Gas pump
    (code >= 0x2705 && code <= 0x2705) || // Check mark
    (code >= 0x270a && code <= 0x270b) || // Raised fists
    code === 0x2728 || // Sparkles (✨)
    code === 0x274c || // Cross mark (❌)
    code === 0x274e || // Cross mark button
    (code >= 0x2753 && code <= 0x2755) || // Question marks
    code === 0x2757 || // Exclamation
    (code >= 0x2795 && code <= 0x2797) || // Plus signs
    code === 0x27b0 ||
    code === 0x27bf || // Curly loop, double curly loop
    (code >= 0x2b1b && code <= 0x2b1c) || // Large squares
    code === 0x2b50 ||
    code === 0x2b55 || // Star, circle
    (code >= 0x2e80 && code <= 0x2e99) || // CJK Radicals Supplement
    (code >= 0x2e9b && code <= 0x2ef3) ||
    (code >= 0x2f00 && code <= 0x2fd5) || // Kangxi Radicals
    (code >= 0x2ff0 && code <= 0x2ffb) || // Ideographic Description Characters
    (code >= 0x3000 && code <= 0x303e) || // CJK Symbols and Punctuation
    (code >= 0x3041 && code <= 0x3096) || // Hiragana
    (code >= 0x3099 && code <= 0x30ff) || // Katakana
    (code >= 0x3105 && code <= 0x312f) || // Bopomofo
    (code >= 0x3131 && code <= 0x318e) || // Hangul Compatibility Jamo
    (code >= 0x3190 && code <= 0x31e3) || // Various CJK
    (code >= 0x31f0 && code <= 0x321e) || // Katakana Phonetic Extensions
    (code >= 0x3220 && code <= 0x3247) || // Enclosed CJK Letters and Months
    (code >= 0x3250 && code <= 0x4dbf) || // Various CJK
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0xa960 && code <= 0xa97f) || // Hangul Jamo Extended-A
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul Syllables
    (code >= 0xd7b0 && code <= 0xd7c6) || // Hangul Jamo Extended-B
    (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
    (code >= 0xfe10 && code <= 0xfe19) || // Vertical Forms
    (code >= 0xfe30 && code <= 0xfe6f) || // CJK Compatibility Forms
    (code >= 0xff00 && code <= 0xff60) || // Fullwidth Forms
    (code >= 0xffe0 && code <= 0xffe6) || // Fullwidth Forms
    (code >= 0x16fe0 && code <= 0x16fe4) || // Tangut
    (code >= 0x16ff0 && code <= 0x16ff1) ||
    (code >= 0x17000 && code <= 0x187f7) || // Tangut
    (code >= 0x18800 && code <= 0x18cd5) || // Tangut Components
    (code >= 0x18d00 && code <= 0x18d08) || // Tangut Supplement
    (code >= 0x1aff0 && code <= 0x1aff3) ||
    (code >= 0x1aff5 && code <= 0x1affb) ||
    (code >= 0x1affd && code <= 0x1affe) ||
    (code >= 0x1b000 && code <= 0x1b122) || // Kana Extended-A/Supplement
    (code >= 0x1b150 && code <= 0x1b152) ||
    (code >= 0x1b164 && code <= 0x1b167) ||
    (code >= 0x1b170 && code <= 0x1b2fb) ||
    code === 0x1f004 || // Mahjong Red Dragon
    code === 0x1f0cf || // Playing Card Black Joker
    (code >= 0x1f18e && code <= 0x1f18e) || // AB Button
    (code >= 0x1f191 && code <= 0x1f19a) || // Various squared symbols
    (code >= 0x1f1e6 && code <= 0x1f1ff) || // Regional Indicator Symbols (flags)
    (code >= 0x1f200 && code <= 0x1f202) || // Squared symbols
    (code >= 0x1f210 && code <= 0x1f23b) || // Squared CJK
    (code >= 0x1f240 && code <= 0x1f248) || // Tortoise shell bracketed
    (code >= 0x1f250 && code <= 0x1f251) || // Circled ideographs
    (code >= 0x1f260 && code <= 0x1f265) ||
    (code >= 0x1f300 && code <= 0x1f6d7) || // Large emoji block
    (code >= 0x1f6e0 && code <= 0x1f6ec) ||
    (code >= 0x1f6f0 && code <= 0x1f6fc) ||
    (code >= 0x1f700 && code <= 0x1f773) ||
    (code >= 0x1f780 && code <= 0x1f7d8) ||
    (code >= 0x1f7e0 && code <= 0x1f7eb) ||
    (code >= 0x1f7f0 && code <= 0x1f7f0) ||
    (code >= 0x1f800 && code <= 0x1f80b) ||
    (code >= 0x1f810 && code <= 0x1f847) ||
    (code >= 0x1f850 && code <= 0x1f859) ||
    (code >= 0x1f860 && code <= 0x1f887) ||
    (code >= 0x1f890 && code <= 0x1f8ad) ||
    (code >= 0x1f8b0 && code <= 0x1f8b1) ||
    (code >= 0x1f900 && code <= 0x1fa53) || // Supplemental symbols and pictographs
    (code >= 0x1fa60 && code <= 0x1fa6d) ||
    (code >= 0x1fa70 && code <= 0x1fa7c) ||
    (code >= 0x1fa80 && code <= 0x1fa88) ||
    (code >= 0x1fa90 && code <= 0x1fabd) ||
    (code >= 0x1fabf && code <= 0x1fac5) ||
    (code >= 0x1face && code <= 0x1fadb) ||
    (code >= 0x1fae0 && code <= 0x1fae8) ||
    (code >= 0x1faf0 && code <= 0x1faf8) ||
    (code >= 0x20000 && code <= 0x2fffd) || // CJK Extension B
    (code >= 0x30000 && code <= 0x3fffd) // CJK Extension C
  );
  // cSpell: enable
}
