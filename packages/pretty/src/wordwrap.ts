/**
 * @fileoverview
 * Word wrapping utilities for terminal output
 *
 * This module provides functions for wrapping text at specified widths
 * while preserving proper indentation and handling Unicode characters
 * correctly.
 */

import { getDisplayWidth } from "./wcwidth.ts";

/**
 * Wrap text at specified width with proper indentation for continuation lines.
 * Automatically detects the message start position from the first line.
 *
 * @param text The text to wrap (may contain ANSI escape codes)
 * @param maxWidth Maximum width in terminal columns
 * @param indentWidth Indentation width for continuation lines
 * @returns Wrapped text with proper indentation
 */
export function wrapText(
  text: string,
  maxWidth: number,
  indentWidth: number,
): string {
  if (maxWidth <= 0) return text;

  const displayWidth = getDisplayWidth(text);
  // If text has newlines (multiline interpolated values), always process it
  // even if it fits within the width
  if (displayWidth <= maxWidth && !text.includes("\n")) return text;

  const indent = " ".repeat(Math.max(0, indentWidth));

  // Check if text contains newlines (from interpolated values like Error objects)
  if (text.includes("\n")) {
    // Split by existing newlines and process each line
    const lines = text.split("\n");
    const wrappedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineDisplayWidth = getDisplayWidth(line);

      if (lineDisplayWidth <= maxWidth) {
        // Line doesn't need wrapping, but add indentation if it's not the first line
        if (i === 0) {
          wrappedLines.push(line);
        } else {
          wrappedLines.push(indent + line);
        }
      } else {
        // Line needs wrapping
        const wrappedLine = wrapSingleLine(line, maxWidth, indent);
        if (i === 0) {
          wrappedLines.push(wrappedLine);
        } else {
          // For continuation lines from interpolated values, add proper indentation
          const subLines = wrappedLine.split("\n");
          for (let j = 0; j < subLines.length; j++) {
            if (j === 0) {
              wrappedLines.push(indent + subLines[j]);
            } else {
              wrappedLines.push(subLines[j]);
            }
          }
        }
      }
    }

    return wrappedLines.join("\n");
  }

  // Process as a single line since log records should not have newlines in the formatted output
  return wrapSingleLine(text, maxWidth, indent);
}

/**
 * Wrap a single line of text (without existing newlines) at word boundaries.
 * Preserves ANSI escape codes and handles Unicode character widths correctly.
 *
 * @param text The text to wrap (single line, may contain ANSI codes)
 * @param maxWidth Maximum width in terminal columns
 * @param indent Indentation string for continuation lines
 * @returns Wrapped text with newlines and proper indentation
 */
export function wrapSingleLine(
  text: string,
  maxWidth: number,
  indent: string,
): string {
  // Split text into chunks while preserving ANSI codes
  const lines: string[] = [];
  let currentLine = "";
  let currentDisplayWidth = 0;
  let i = 0;

  while (i < text.length) {
    // Check for ANSI escape sequence
    if (text[i] === "\x1b" && text[i + 1] === "[") {
      // Find the end of the ANSI sequence
      let j = i + 2;
      while (j < text.length && text[j] !== "m") {
        j++;
      }
      if (j < text.length) {
        j++; // Include the 'm'
        currentLine += text.slice(i, j);
        i = j;
        continue;
      }
    }

    const char = text[i];

    // Check if adding this character would exceed the width
    if (currentDisplayWidth >= maxWidth && char !== " ") {
      // Try to find a good break point (space) before the current position
      const breakPoint = currentLine.lastIndexOf(" ");
      if (breakPoint > 0) {
        // Break at the space
        lines.push(currentLine.slice(0, breakPoint));
        currentLine = indent + currentLine.slice(breakPoint + 1) + char;
        currentDisplayWidth = getDisplayWidth(currentLine);
      } else {
        // No space found, hard break
        lines.push(currentLine);
        currentLine = indent + char;
        currentDisplayWidth = getDisplayWidth(currentLine);
      }
    } else {
      currentLine += char;
      // Recalculate display width properly for Unicode characters
      currentDisplayWidth = getDisplayWidth(currentLine);
    }

    i++;
  }

  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  // Filter out empty lines (lines with only indentation/spaces)
  const filteredLines = lines.filter((line) => line.trim().length > 0);

  return filteredLines.join("\n");
}
