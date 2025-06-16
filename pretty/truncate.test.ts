import { suite } from "@alinea/suite";
import { assertEquals } from "@std/assert/equals";
import { truncateCategory } from "./truncate.ts";

const test = suite(import.meta);

test("truncateCategory() with no truncation", () => {
  const category = ["app", "server"];

  // Strategy false - no truncation
  assertEquals(
    truncateCategory(category, 10, ".", false),
    "app.server",
  );

  // Width is enough - no truncation needed
  assertEquals(
    truncateCategory(category, 20, ".", "middle"),
    "app.server",
  );
});

test("truncateCategory() with end truncation", () => {
  const category = ["app", "server", "http", "middleware"];

  assertEquals(
    truncateCategory(category, 15, ".", "end"),
    "app.server.htt…",
  );

  assertEquals(
    truncateCategory(category, 10, ".", "end"),
    "app.serve…",
  );
});

test("truncateCategory() with middle truncation", () => {
  const category = ["app", "server", "http", "middleware", "auth"];

  // Should keep first and last parts
  assertEquals(
    truncateCategory(category, 20, ".", "middle"),
    "app…auth",
  );

  // With more space, still just first…last for simplicity
  assertEquals(
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
  assertEquals(
    truncateCategory(longCategory, 30, ".", "middle"),
    "application…authentication",
  );
});

test("truncateCategory() edge cases", () => {
  // Very small width
  assertEquals(
    truncateCategory(["app", "server"], 4, ".", "middle"),
    "…",
  );

  // Single segment - falls back to end truncation
  assertEquals(
    truncateCategory(["verylongcategoryname"], 10, ".", "middle"),
    "verylongc…",
  );

  // Two segments that are too long together - should fall back to end truncation
  assertEquals(
    truncateCategory(["verylongname", "anotherlongname"], 15, ".", "middle"),
    "verylongname.a…",
  );

  // Empty category
  assertEquals(
    truncateCategory([], 10, ".", "middle"),
    "",
  );
});

test("truncateCategory() with custom separator", () => {
  const category = ["app", "server", "http"];

  assertEquals(
    truncateCategory(category, 20, "::", "middle"),
    "app::server::http",
  );

  assertEquals(
    truncateCategory(category, 10, "::", "middle"),
    "app…http",
  );
});
