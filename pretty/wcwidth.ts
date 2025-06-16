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
    i += (code > 0xFFFF) ? 2 : 1;
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
  if (code < 32 || (code >= 0x7F && code < 0xA0)) {
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
  [0x0300, 0x036F], // Combining Diacritical Marks
  [0x0483, 0x0489], // Hebrew combining marks
  [0x0591, 0x05BD], // Arabic combining marks
  [0x05C1, 0x05C2],
  [0x05C4, 0x05C5],
  [0x0610, 0x061A], // More Arabic combining marks
  [0x064B, 0x065F],
  [0x06D6, 0x06DC],
  [0x06DF, 0x06E4],
  [0x06E7, 0x06E8],
  [0x06EA, 0x06ED],
  [0x0730, 0x074A],
  [0x07A6, 0x07B0],
  [0x07EB, 0x07F3],
  [0x0816, 0x0819],
  [0x081B, 0x0823],
  [0x0825, 0x0827],
  [0x0829, 0x082D],
  [0x0859, 0x085B],
  [0x08D3, 0x08E1],
  [0x08E3, 0x0902],
  [0x0941, 0x0948],
  [0x0951, 0x0957],
  [0x0962, 0x0963],
  [0x09C1, 0x09C4],
  [0x09E2, 0x09E3],
  [0x0A01, 0x0A02],
  [0x0A41, 0x0A42],
  [0x0A47, 0x0A48],
  [0x0A4B, 0x0A4D],
  [0x0A70, 0x0A71],
  [0x0A81, 0x0A82],
  [0x0AC1, 0x0AC5],
  [0x0AC7, 0x0AC8],
  [0x0AE2, 0x0AE3],
  [0x0AFA, 0x0AFF],
  [0x0B41, 0x0B44],
  [0x0B55, 0x0B56],
  [0x0B62, 0x0B63],
  [0x0C3E, 0x0C40],
  [0x0C46, 0x0C48],
  [0x0C4A, 0x0C4D],
  [0x0C55, 0x0C56],
  [0x0C62, 0x0C63],
  [0x0CCC, 0x0CCD],
  [0x0CE2, 0x0CE3],
  [0x0D00, 0x0D01],
  [0x0D3B, 0x0D3C],
  [0x0D62, 0x0D63],
  [0x0DD2, 0x0DD4],
  [0x0E34, 0x0E3A],
  [0x0E47, 0x0E4E],
  [0x0EB4, 0x0EBC],
  [0x0EC8, 0x0ECD],
  [0x0F18, 0x0F19],
  [0x0F71, 0x0F7E],
  [0x0F80, 0x0F84],
  [0x0F86, 0x0F87],
  [0x0F8D, 0x0F97],
  [0x0F99, 0x0FBC],
  [0x102D, 0x1030],
  [0x1032, 0x1037],
  [0x1039, 0x103A],
  [0x103D, 0x103E],
  [0x1058, 0x1059],
  [0x105E, 0x1060],
  [0x1071, 0x1074],
  [0x1085, 0x1086],
  [0x135D, 0x135F],
  [0x1712, 0x1714],
  [0x1732, 0x1734],
  [0x1752, 0x1753],
  [0x1772, 0x1773],
  [0x17B4, 0x17B5],
  [0x17B7, 0x17BD],
  [0x17C9, 0x17D3],
  [0x180B, 0x180D],
  [0x1885, 0x1886],
  [0x1920, 0x1922],
  [0x1927, 0x1928],
  [0x1939, 0x193B],
  [0x1A17, 0x1A18],
  [0x1A58, 0x1A5E],
  [0x1A65, 0x1A6C],
  [0x1A73, 0x1A7C],
  [0x1AB0, 0x1ABE],
  [0x1B00, 0x1B03],
  [0x1B36, 0x1B3A],
  [0x1B6B, 0x1B73],
  [0x1B80, 0x1B81],
  [0x1BA2, 0x1BA5],
  [0x1BA8, 0x1BA9],
  [0x1BAB, 0x1BAD],
  [0x1BE8, 0x1BE9],
  [0x1BEF, 0x1BF1],
  [0x1C2C, 0x1C33],
  [0x1C36, 0x1C37],
  [0x1CD0, 0x1CD2],
  [0x1CD4, 0x1CE0],
  [0x1CE2, 0x1CE8],
  [0x1CF8, 0x1CF9],
  [0x1DC0, 0x1DF9],
  [0x1DFB, 0x1DFF],
  [0x200B, 0x200F], // Zero-width spaces
  [0x202A, 0x202E], // Bidirectional format characters
  [0x2060, 0x2064], // Word joiner, etc.
  [0x2066, 0x206F], // More bidirectional
  [0xFE00, 0xFE0F], // Variation selectors
  [0xFE20, 0xFE2F], // Combining half marks
];

// Single zero-width characters
const ZERO_WIDTH_SINGLES = new Set([
  0x05BF,
  0x05C7,
  0x0670,
  0x0711,
  0x07FD,
  0x093A,
  0x093C,
  0x094D,
  0x0981,
  0x09BC,
  0x09CD,
  0x09FE,
  0x0A3C,
  0x0A51,
  0x0A75,
  0x0ABC,
  0x0ACD,
  0x0B01,
  0x0B3C,
  0x0B3F,
  0x0B4D,
  0x0B82,
  0x0BC0,
  0x0BCD,
  0x0C00,
  0x0C04,
  0x0C81,
  0x0CBC,
  0x0CBF,
  0x0CC6,
  0x0D41,
  0x0D44,
  0x0D4D,
  0x0D81,
  0x0DCA,
  0x0DD6,
  0x0E31,
  0x0EB1,
  0x0F35,
  0x0F37,
  0x0F39,
  0x0FC6,
  0x1082,
  0x108D,
  0x109D,
  0x17C6,
  0x17DD,
  0x18A9,
  0x1932,
  0x1A1B,
  0x1A56,
  0x1A60,
  0x1A62,
  0x1A7F,
  0x1B34,
  0x1B3C,
  0x1B42,
  0x1BE6,
  0x1BED,
  0x1CED,
  0x1CF4,
  0xFEFF,
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
    (code >= 0x1100 && code <= 0x115F) || // Hangul Jamo
    (code >= 0x231A && code <= 0x231B) || // Watch, Hourglass
    (code >= 0x2329 && code <= 0x232A) || // Angle brackets
    (code >= 0x23E9 && code <= 0x23EC) || // Media controls
    code === 0x23F0 || code === 0x23F3 || // Alarm clock, hourglass
    (code >= 0x25FD && code <= 0x25FE) || // Small squares
    (code >= 0x2614 && code <= 0x2615) || // Umbrella, coffee
    (code >= 0x2648 && code <= 0x2653) || // Zodiac signs
    code === 0x267F || code === 0x2693 || // Wheelchair, anchor
    code === 0x26A0 || code === 0x26A1 || code === 0x26AA || code === 0x26AB || // Warning, lightning, circles
    (code >= 0x26BD && code <= 0x26BE) || // Sports balls
    (code >= 0x26C4 && code <= 0x26C5) || // Weather
    code === 0x26CE || code === 0x26D4 || // Ophiuchus, no entry
    (code >= 0x26EA && code <= 0x26EA) || // Church
    (code >= 0x26F2 && code <= 0x26F3) || // Fountain, golf
    code === 0x26F5 || code === 0x26FA || // Sailboat, tent
    code === 0x26FD || // Gas pump
    (code >= 0x2705 && code <= 0x2705) || // Check mark
    (code >= 0x270A && code <= 0x270B) || // Raised fists
    code === 0x2728 || // Sparkles (✨)
    code === 0x274C || // Cross mark (❌)
    code === 0x274E || // Cross mark button
    (code >= 0x2753 && code <= 0x2755) || // Question marks
    code === 0x2757 || // Exclamation
    (code >= 0x2795 && code <= 0x2797) || // Plus signs
    code === 0x27B0 || code === 0x27BF || // Curly loop, double curly loop
    (code >= 0x2B1B && code <= 0x2B1C) || // Large squares
    code === 0x2B50 || code === 0x2B55 || // Star, circle
    (code >= 0x2E80 && code <= 0x2E99) || // CJK Radicals Supplement
    (code >= 0x2E9B && code <= 0x2EF3) ||
    (code >= 0x2F00 && code <= 0x2FD5) || // Kangxi Radicals
    (code >= 0x2FF0 && code <= 0x2FFB) || // Ideographic Description Characters
    (code >= 0x3000 && code <= 0x303E) || // CJK Symbols and Punctuation
    (code >= 0x3041 && code <= 0x3096) || // Hiragana
    (code >= 0x3099 && code <= 0x30FF) || // Katakana
    (code >= 0x3105 && code <= 0x312F) || // Bopomofo
    (code >= 0x3131 && code <= 0x318E) || // Hangul Compatibility Jamo
    (code >= 0x3190 && code <= 0x31E3) || // Various CJK
    (code >= 0x31F0 && code <= 0x321E) || // Katakana Phonetic Extensions
    (code >= 0x3220 && code <= 0x3247) || // Enclosed CJK Letters and Months
    (code >= 0x3250 && code <= 0x4DBF) || // Various CJK
    (code >= 0x4E00 && code <= 0x9FFF) || // CJK Unified Ideographs
    (code >= 0xA960 && code <= 0xA97F) || // Hangul Jamo Extended-A
    (code >= 0xAC00 && code <= 0xD7A3) || // Hangul Syllables
    (code >= 0xD7B0 && code <= 0xD7C6) || // Hangul Jamo Extended-B
    (code >= 0xF900 && code <= 0xFAFF) || // CJK Compatibility Ideographs
    (code >= 0xFE10 && code <= 0xFE19) || // Vertical Forms
    (code >= 0xFE30 && code <= 0xFE6F) || // CJK Compatibility Forms
    (code >= 0xFF00 && code <= 0xFF60) || // Fullwidth Forms
    (code >= 0xFFE0 && code <= 0xFFE6) || // Fullwidth Forms
    (code >= 0x16FE0 && code <= 0x16FE4) || // Tangut
    (code >= 0x16FF0 && code <= 0x16FF1) ||
    (code >= 0x17000 && code <= 0x187F7) || // Tangut
    (code >= 0x18800 && code <= 0x18CD5) || // Tangut Components
    (code >= 0x18D00 && code <= 0x18D08) || // Tangut Supplement
    (code >= 0x1AFF0 && code <= 0x1AFF3) ||
    (code >= 0x1AFF5 && code <= 0x1AFFB) ||
    (code >= 0x1AFFD && code <= 0x1AFFE) ||
    (code >= 0x1B000 && code <= 0x1B122) || // Kana Extended-A/Supplement
    (code >= 0x1B150 && code <= 0x1B152) ||
    (code >= 0x1B164 && code <= 0x1B167) ||
    (code >= 0x1B170 && code <= 0x1B2FB) ||
    code === 0x1F004 || // Mahjong Red Dragon
    code === 0x1F0CF || // Playing Card Black Joker
    (code >= 0x1F18E && code <= 0x1F18E) || // AB Button
    (code >= 0x1F191 && code <= 0x1F19A) || // Various squared symbols
    (code >= 0x1F1E6 && code <= 0x1F1FF) || // Regional Indicator Symbols (flags)
    (code >= 0x1F200 && code <= 0x1F202) || // Squared symbols
    (code >= 0x1F210 && code <= 0x1F23B) || // Squared CJK
    (code >= 0x1F240 && code <= 0x1F248) || // Tortoise shell bracketed
    (code >= 0x1F250 && code <= 0x1F251) || // Circled ideographs
    (code >= 0x1F260 && code <= 0x1F265) ||
    (code >= 0x1F300 && code <= 0x1F6D7) || // Large emoji block
    (code >= 0x1F6E0 && code <= 0x1F6EC) ||
    (code >= 0x1F6F0 && code <= 0x1F6FC) ||
    (code >= 0x1F700 && code <= 0x1F773) ||
    (code >= 0x1F780 && code <= 0x1F7D8) ||
    (code >= 0x1F7E0 && code <= 0x1F7EB) ||
    (code >= 0x1F7F0 && code <= 0x1F7F0) ||
    (code >= 0x1F800 && code <= 0x1F80B) ||
    (code >= 0x1F810 && code <= 0x1F847) ||
    (code >= 0x1F850 && code <= 0x1F859) ||
    (code >= 0x1F860 && code <= 0x1F887) ||
    (code >= 0x1F890 && code <= 0x1F8AD) ||
    (code >= 0x1F8B0 && code <= 0x1F8B1) ||
    (code >= 0x1F900 && code <= 0x1FA53) || // Supplemental symbols and pictographs
    (code >= 0x1FA60 && code <= 0x1FA6D) ||
    (code >= 0x1FA70 && code <= 0x1FA7C) ||
    (code >= 0x1FA80 && code <= 0x1FA88) ||
    (code >= 0x1FA90 && code <= 0x1FABD) ||
    (code >= 0x1FABF && code <= 0x1FAC5) ||
    (code >= 0x1FACE && code <= 0x1FADB) ||
    (code >= 0x1FAE0 && code <= 0x1FAE8) ||
    (code >= 0x1FAF0 && code <= 0x1FAF8) ||
    (code >= 0x20000 && code <= 0x2FFFD) || // CJK Extension B
    (code >= 0x30000 && code <= 0x3FFFD) // CJK Extension C
  );
  // cSpell: enable
}
