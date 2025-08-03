/**
 * Truncation strategies for category names.
 *
 * @since 1.0.0
 */
export type TruncationStrategy = "middle" | "end" | false;

/**
 * Truncates a category array to fit within a maximum width using the specified strategy.
 *
 * This function intelligently shortens long hierarchical category names while
 * preserving important context. The truncation behavior depends on the chosen
 * strategy:
 *
 * - `"middle"`: Keeps the first and last segments with "…" in between
 * - `"end"`: Truncates at the end with "…" suffix
 * - `false`: No truncation (returns full category string)
 *
 * When the category is too long even for middle truncation (first + "…" + last
 * exceeds maxWidth), it falls back to end truncation.
 *
 * @param category The category segments to truncate.
 * @param maxWidth Maximum width for the category string.
 * @param separator Category separator (default: ".").
 * @param strategy Truncation strategy to use (default: "middle").
 * @returns The truncated category string.
 *
 * @example
 * ```typescript
 * // Middle truncation
 * truncateCategory(["app", "server", "http", "auth"], 15, ".", "middle");
 * // Returns: "app…auth"
 *
 * // End truncation
 * truncateCategory(["app", "server", "http", "auth"], 15, ".", "end");
 * // Returns: "app.server.h…"
 *
 * // No truncation
 * truncateCategory(["app", "auth"], 20, ".", false);
 * // Returns: "app.auth"
 * ```
 *
 * @since 1.0.0
 */
export function truncateCategory(
  category: readonly string[],
  maxWidth: number,
  separator: string = ".",
  strategy: TruncationStrategy = "middle",
): string {
  if (!strategy || maxWidth <= 0) {
    return category.join(separator);
  }

  const full = category.join(separator);
  if (full.length <= maxWidth) {
    return full;
  }

  // Minimum width needed for truncation with ellipsis
  const minWidth = 5; // e.g., "a…z"
  if (maxWidth < minWidth) {
    return "…";
  }

  if (strategy === "end") {
    return full.substring(0, maxWidth - 1) + "…";
  }

  // Middle truncation strategy
  if (category.length <= 2) {
    // For short categories, just truncate the end
    return full.substring(0, maxWidth - 1) + "…";
  }

  // Try to keep first and last segments
  const first = category[0];
  const last = category[category.length - 1];
  const ellipsis = "…";

  // Check if we can at least fit first…last
  const minimalLength = first.length + ellipsis.length + last.length;
  if (minimalLength > maxWidth) {
    // Even minimal format is too long, fallback to end truncation
    return full.substring(0, maxWidth - 1) + "…";
  }

  // For simple case with limited space, just do first…last
  return `${first}${ellipsis}${last}`;
}
