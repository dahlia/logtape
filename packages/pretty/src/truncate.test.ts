import assert from "node:assert/strict";
import test from "node:test";
import { truncateCategory } from "./truncate.ts";

test("truncateCategory() with no truncation", () => {
  const category = ["app", "server"];

  // Strategy false - no truncation
  assert.deepStrictEqual(
    truncateCategory(category, 10, ".", false),
    "app.server",
  );

  // Width is enough - no truncation needed
  assert.deepStrictEqual(
    truncateCategory(category, 20, ".", "middle"),
    "app.server",
  );
});

test("truncateCategory() with end truncation", () => {
  const category = ["app", "server", "http", "middleware"];

  assert.deepStrictEqual(
    truncateCategory(category, 15, ".", "end"),
    "app.server.htt…",
  );

  assert.deepStrictEqual(
    truncateCategory(category, 10, ".", "end"),
    "app.serve…",
  );
});

test("truncateCategory() with middle truncation", () => {
  const category = ["app", "server", "http", "middleware", "auth"];

  // Should keep first and last parts
  assert.deepStrictEqual(
    truncateCategory(category, 20, ".", "middle"),
    "app…auth",
  );

  // With more space, still just first…last for simplicity
  assert.deepStrictEqual(
    truncateCategory(category, 25, ".", "middle"),
    "app…auth",
  );

  // Very long category names
  const longCategory = [
    "application",
    "server",
    "http",
    "middleware",
    "authentication",
  ];
  assert.deepStrictEqual(
    truncateCategory(longCategory, 30, ".", "middle"),
    "application…authentication",
  );
});

test("truncateCategory() edge cases", () => {
  // Very small width
  assert.deepStrictEqual(
    truncateCategory(["app", "server"], 4, ".", "middle"),
    "…",
  );

  // Single segment - falls back to end truncation
  assert.deepStrictEqual(
    truncateCategory(["verylongcategoryname"], 10, ".", "middle"),
    "verylongc…",
  );

  // Two segments that are too long together - should fall back to end truncation
  assert.deepStrictEqual(
    truncateCategory(["verylongname", "anotherlongname"], 15, ".", "middle"),
    "verylongname.a…",
  );

  // Empty category
  assert.deepStrictEqual(
    truncateCategory([], 10, ".", "middle"),
    "",
  );
});

test("truncateCategory() with custom separator", () => {
  const category = ["app", "server", "http"];

  assert.deepStrictEqual(
    truncateCategory(category, 20, "::", "middle"),
    "app::server::http",
  );

  assert.deepStrictEqual(
    truncateCategory(category, 10, "::", "middle"),
    "app…http",
  );
});
