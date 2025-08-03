// deno-lint-ignore-file no-process-global
/// <reference types="@types/node" />
/**
 * @fileoverview
 * Terminal detection and width calculation utilities
 *
 * Provides cross-runtime compatible functions to detect if the process
 * is attached to a terminal and get the terminal width.
 */

/**
 * Detect if the current process is attached to a terminal (TTY).
 *
 * @returns True if stdout is connected to a terminal
 */
export function isTerminal(): boolean {
  try {
    // Deno runtime
    if (typeof Deno !== "undefined") {
      // Use modern Deno API
      if (Deno.stdout.isTerminal) {
        return Deno.stdout.isTerminal();
      }
    }

    // Node.js/Bun runtime
    if (typeof process !== "undefined" && process.stdout) {
      return Boolean(process.stdout.isTTY);
    }

    // Browser environment - never a terminal
    if (typeof window !== "undefined") {
      return false;
    }

    // Unknown environment - assume not a terminal
    return false;
  } catch {
    // If any detection method fails, assume not a terminal
    return false;
  }
}

/**
 * Get the current terminal width in columns.
 *
 * @returns Terminal width in columns, or null if not available
 */
export function getTerminalWidth(): number | null {
  try {
    // Deno runtime
    if (typeof Deno !== "undefined") {
      // Try to get console size
      if (Deno.consoleSize) {
        const size = Deno.consoleSize();
        return size?.columns || null;
      }
    }

    // Node.js/Bun runtime
    if (typeof process !== "undefined" && process.stdout) {
      return process.stdout.columns || null;
    }

    // Fallback to environment variable
    const envColumns = typeof Deno !== "undefined"
      ? Deno.env.get("COLUMNS")
      : process?.env?.COLUMNS;

    if (envColumns) {
      const parsed = parseInt(envColumns, 10);
      return isNaN(parsed) ? null : parsed;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get the optimal word wrap width based on terminal detection.
 *
 * @param defaultWidth Default width to use when not in a terminal
 * @returns The optimal width
 */
export function getOptimalWordWrapWidth(defaultWidth: number = 80): number {
  if (!isTerminal()) {
    return defaultWidth;
  }

  const terminalWidth = getTerminalWidth();
  return terminalWidth || defaultWidth;
}
