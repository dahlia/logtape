import process from "node:process";
import { WindowsPlatformError } from "./types.ts";

/**
 * Validates that the current platform is Windows.
 * Throws a WindowsPlatformError if running on a non-Windows platform.
 *
 * @throws {WindowsPlatformError} When running on non-Windows platforms
 * @since 1.0.0
 */
export function validateWindowsPlatform(): void {
  const platform = getPlatform();

  if (platform !== "windows" && platform !== "win32") {
    throw new WindowsPlatformError(platform);
  }
}

/**
 * Gets the current platform in a cross-runtime compatible way.
 *
 * @returns The platform identifier
 * @since 1.0.0
 */
export function getPlatform(): string {
  // Deno
  if (typeof Deno !== "undefined" && Deno.build?.os) {
    return Deno.build.os;
  }

  // Node.js/Bun
  if (typeof process !== "undefined" && process.platform) {
    return process.platform;
  }

  // Fallback - assume non-Windows
  return "unknown";
}

/**
 * Checks if the current platform is Windows without throwing.
 *
 * @returns true if running on Windows, false otherwise
 * @since 1.0.0
 */
export function isWindows(): boolean {
  try {
    validateWindowsPlatform();
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets the current JavaScript runtime.
 *
 * @returns The runtime identifier ("deno", "node", "bun", or "unknown")
 * @since 1.0.0
 */
export function getRuntime(): "deno" | "node" | "bun" | "unknown" {
  // Deno
  if (typeof Deno !== "undefined") {
    return "deno";
  }

  // Bun
  if (typeof globalThis !== "undefined" && "Bun" in globalThis) {
    return "bun";
  }

  // Node.js (check process exists and is not Deno/Bun)
  if (typeof process !== "undefined" && process.versions?.node) {
    return "node";
  }

  return "unknown";
}
