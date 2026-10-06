import assert from "node:assert/strict";
import test from "node:test";
import { parseSourceLocation } from "./source-location.ts";

// The stacks below were captured from an Error constructed without a message
// inside a library method (frame 0) that was called by a public method
// (frame 1), so that frame 2 is the caller.

test("parseSourceLocation() parses V8 stacks", () => {
  // Node.js and Deno:
  assert.deepStrictEqual(
    parseSourceLocation(
      "Error\n" +
        "    at L.cap (file:///tmp/probe/lib.mjs:3:55)\n" +
        "    at L.info (file:///tmp/probe/lib.mjs:5:29)\n" +
        "    at user (file:///tmp/probe/main.mjs:4:5)\n" +
        "    at file:///tmp/probe/main.mjs:14:16",
      2,
    ),
    { file: "file:///tmp/probe/main.mjs", line: 4, column: 5 },
  );
  // Chromium, from an anonymous arrow function:
  assert.deepStrictEqual(
    parseSourceLocation(
      "Error\n" +
        "    at L.cap (http://localhost:40989/lib.mjs:3:55)\n" +
        "    at L.info (http://localhost:40989/lib.mjs:5:29)\n" +
        "    at http://localhost:40989/main.mjs:6:23",
      2,
    ),
    { file: "http://localhost:40989/main.mjs", line: 6, column: 23 },
  );
  // Node.js CommonJS module scope:
  assert.deepStrictEqual(
    parseSourceLocation(
      "Error\n" +
        "    at a (/app/node_modules/x/index.js:1:2)\n" +
        "    at b (/app/node_modules/x/index.js:1:2)\n" +
        "    at Object.<anonymous> (/app/main.js:3:8)",
      2,
    ),
    { file: "/app/main.js", line: 3, column: 8 },
  );
  // Async and constructor frames:
  assert.deepStrictEqual(
    parseSourceLocation(
      "Error\n    at a (/x.js:1:2)\n    at b (/x.js:1:2)\n" +
        "    at async run (file:///app/main.ts:10:3)",
      2,
    ),
    { file: "file:///app/main.ts", line: 10, column: 3 },
  );
  // An anonymous async frame, as when a bound logging method is called by
  // the microtask queue under top-level await:
  assert.deepStrictEqual(
    parseSourceLocation(
      "Error\n    at a (/x.js:1:2)\n    at b (/x.js:1:2)\n" +
        "    at async file:///app/main.ts:13:1",
      2,
    ),
    { file: "file:///app/main.ts", line: 13, column: 1 },
  );
  // A function named "async" is not an async frame:
  assert.deepStrictEqual(
    parseSourceLocation(
      "Error\n    at a (/x.js:1:2)\n    at b (/x.js:1:2)\n" +
        "    at async (file:///app/main.ts:10:3)",
      2,
    ),
    { file: "file:///app/main.ts", line: 10, column: 3 },
  );
  assert.deepStrictEqual(
    parseSourceLocation(
      "Error\n    at a (/x.js:1:2)\n    at b (/x.js:1:2)\n" +
        "    at new Service (node:internal/foo:10:3)",
      2,
    ),
    { file: "node:internal/foo", line: 10, column: 3 },
  );
});

test("parseSourceLocation() parses JavaScriptCore stacks of Bun", () => {
  assert.deepStrictEqual(
    parseSourceLocation(
      "Error\n" +
        "    at cap (/tmp/probe/lib.mjs:3:59)\n" +
        "    at info (/tmp/probe/lib.mjs:5:29)\n" +
        "    at user (/tmp/probe/main.mjs:4:5)",
      2,
    ),
    { file: "/tmp/probe/main.mjs", line: 4, column: 5 },
  );
  // A frame of a built-in implemented in JavaScript, which Bun shows when
  // the caller's frame was removed by a proper tail call:
  assert.strictEqual(
    parseSourceLocation(
      "Error\n" +
        "    at cap (/tmp/probe/lib.mjs:3:59)\n" +
        "    at info (/tmp/probe/lib.mjs:5:29)\n" +
        "    at forEach (native:1:11)",
      2,
    ),
    undefined,
  );
});

test("parseSourceLocation() parses SpiderMonkey stacks", () => {
  // Firefox, from an anonymous arrow function:
  assert.deepStrictEqual(
    parseSourceLocation(
      "cap@http://localhost:40989/lib.mjs:3:55\n" +
        "info@http://localhost:40989/lib.mjs:5:29\n" +
        "user/<@http://localhost:40989/main.mjs:6:23\n" +
        "user@http://localhost:40989/main.mjs:6:7\n",
      2,
    ),
    { file: "http://localhost:40989/main.mjs", line: 6, column: 23 },
  );
  // Top-level code:
  assert.deepStrictEqual(
    parseSourceLocation(
      "cap@http://h/a.js:1:2\ninfo@http://h/a.js:2:2\n@http://h/main.js:9:1\n",
      2,
    ),
    { file: "http://h/main.js", line: 9, column: 1 },
  );
});

test("parseSourceLocation() keeps query strings, ports, and odd paths", () => {
  assert.deepStrictEqual(
    parseSourceLocation(
      "Error\n    at a (/x.js:1:2)\n    at b (/x.js:1:2)\n" +
        "    at App (http://localhost:5173/src/App.tsx?t=1700000000000:42:7)",
      2,
    ),
    {
      file: "http://localhost:5173/src/App.tsx?t=1700000000000",
      line: 42,
      column: 7,
    },
  );
  assert.deepStrictEqual(
    parseSourceLocation(
      "Error\n    at a (C:\\x.js:1:2)\n    at b (C:\\x.js:1:2)\n" +
        "    at user (C:\\Users\\me\\app\\main.js:10:5)",
      2,
    ),
    { file: "C:\\Users\\me\\app\\main.js", line: 10, column: 5 },
  );
  assert.deepStrictEqual(
    parseSourceLocation(
      "Error\n    at a (/x.js:1:2)\n    at b (/x.js:1:2)\n" +
        "    at user (\\\\server\\share\\app.js:3:4)",
      2,
    ),
    { file: "\\\\server\\share\\app.js", line: 3, column: 4 },
  );
  // A path with parentheses in an anonymous frame is unambiguous:
  assert.deepStrictEqual(
    parseSourceLocation(
      "Error\n    at a (/x.js:1:2)\n    at b (/x.js:1:2)\n" +
        "    at /My Project (copy)/app.js:10:5",
      2,
    ),
    { file: "/My Project (copy)/app.js", line: 10, column: 5 },
  );
  // A relative file name, e.g., of a script run with node:vm or workerd:
  assert.deepStrictEqual(
    parseSourceLocation(
      "Error\n    at a (worker.js:1:2)\n    at b (worker.js:1:2)\n" +
        "    at Object.fetch (worker.js:5:12)",
      2,
    ),
    { file: "worker.js", line: 5, column: 12 },
  );
  // URLs containing "@" in SpiderMonkey stacks:
  assert.deepStrictEqual(
    parseSourceLocation(
      "cap@http://h/a.js:1:2\ninfo@http://h/a.js:2:2\n" +
        "@http://h/node_modules/@scope/x.js:7:8",
      2,
    ),
    { file: "http://h/node_modules/@scope/x.js", line: 7, column: 8 },
  );
  assert.deepStrictEqual(
    parseSourceLocation(
      "cap@http://h/a.js:1:2\ninfo@http://h/a.js:2:2\n" +
        "user@http://localhost:5173/@fs/home/me/x.ts?t=1:3:4",
      2,
    ),
    { file: "http://localhost:5173/@fs/home/me/x.ts?t=1", line: 3, column: 4 },
  );
});

test("parseSourceLocation() is not confused by function names", () => {
  // A SpiderMonkey method named "user@handler":
  assert.deepStrictEqual(
    parseSourceLocation(
      "capture@https://example.test/app.js:1:27\n" +
        "info@https://example.test/app.js:2:29\n" +
        "user@handler@https://example.test/app.js:3:39",
      2,
    ),
    { file: "https://example.test/app.js", line: 3, column: 39 },
  );
  // A SpiderMonkey method named "at handler" does not look like V8:
  assert.deepStrictEqual(
    parseSourceLocation(
      "at handler@http://h/a.js:1:2\ninfo@http://h/a.js:2:2\n" +
        "user@http://h/app.js:3:39",
      2,
    ),
    { file: "http://h/app.js", line: 3, column: 39 },
  );
});

test("parseSourceLocation() returns undefined for ambiguous frames", () => {
  for (
    const frame of [
      // A V8 method named "user (copy)":
      "    at Object.user (copy) (file:///t/app.js:4:75)",
      // A V8 method named "user (file:name)" in a node:vm script:
      "    at user (file:name) (worker.js:4:46)",
      // A path with parentheses in a named frame:
      "    at user (/My Project (copy)/app.js:10:5)",
    ]
  ) {
    assert.strictEqual(
      parseSourceLocation(
        `Error\n    at a (/x.js:1:2)\n    at b (/x.js:1:2)\n${frame}`,
        2,
      ),
      undefined,
      frame,
    );
  }
  for (
    const frame of [
      // A SpiderMonkey method named "https:alias":
      "handler@https:alias@https://example.test/app.js:3:46",
      // A frame that could be an anonymous one whose URL contains "@":
      "https://example.test/@/app.js:10:2",
    ]
  ) {
    assert.strictEqual(
      parseSourceLocation(
        `cap@http://h/a.js:1:2\ninfo@http://h/a.js:2:2\n${frame}`,
        2,
      ),
      undefined,
      frame,
    );
  }
});

test("parseSourceLocation() returns undefined for non-source frames", () => {
  for (
    const frame of [
      "    at eval (eval at <anonymous> (file:///x.ts:1:1), <anonymous>:1:1)",
      "    at Array.forEach (<anonymous>)",
      "    at async Promise.all (index 0)",
      "    at user (address at index.android.bundle:1:1234)",
      "    at user (address at /My Project (copy)/bundle.hbc:1:1234)",
      "    at user (/app.js:0:5)",
    ]
  ) {
    assert.strictEqual(
      parseSourceLocation(
        `Error\n    at a (/x.js:1:2)\n    at b (/x.js:1:2)\n${frame}`,
        2,
      ),
      undefined,
      frame,
    );
  }
  for (
    const frame of [
      "@http://h/main.js line 2 > eval:1:1",
      "@http://h/main.js line 2 > Function:1:1",
      "forEach@[native code]",
    ]
  ) {
    assert.strictEqual(
      parseSourceLocation(
        `cap@http://h/a.js:1:2\ninfo@http://h/a.js:2:2\n${frame}`,
        2,
      ),
      undefined,
      frame,
    );
  }
});

test("parseSourceLocation() returns undefined for unexpected stacks", () => {
  assert.strictEqual(parseSourceLocation(undefined, 2), undefined);
  assert.strictEqual(parseSourceLocation(null, 2), undefined);
  assert.strictEqual(parseSourceLocation(123, 2), undefined);
  assert.strictEqual(parseSourceLocation("", 2), undefined);
  // Only a header, as with Error.stackTraceLimit = 0:
  assert.strictEqual(parseSourceLocation("Error", 2), undefined);
  // Too few frames:
  assert.strictEqual(
    parseSourceLocation("Error\n    at a (/x.js:1:2)\n    at b (/x.js:1:2)", 2),
    undefined,
  );
  // A custom header, e.g., from Error.prepareStackTrace:
  assert.strictEqual(
    parseSourceLocation(
      "MyError: boom\n    at a (/x.js:1:2)\n    at b (/x.js:1:2)\n" +
        "    at user (/app.js:3:4)",
      2,
    ),
    undefined,
  );
  // A frame that is not formatted like the others:
  assert.strictEqual(
    parseSourceLocation(
      "Error\n    at a (/x.js:1:2)\n    at b (/x.js:1:2)\nuser (/app.js:3:4)",
      2,
    ),
    undefined,
  );
  // A line-only location, as some engines report:
  assert.strictEqual(
    parseSourceLocation(
      "Error\n    at a (/x.js:1:2)\n    at b (/x.js:1:2)\n    at user (app.js:3)",
      2,
    ),
    undefined,
  );
  // An indented first line is neither dialect:
  assert.strictEqual(
    parseSourceLocation("  cap@http://h/a.js:1:2\n  x@http://h/b.js:1:2", 1),
    undefined,
  );
});

test("parseSourceLocation() keeps frames aligned around odd lines", () => {
  // A malformed earlier frame must not shift which frame is parsed:
  assert.deepStrictEqual(
    parseSourceLocation(
      "cap@http://h/a.js:1:2\n???\nuser@http://h/app.js:3:4\n" +
        "other@http://h/other.js:5:6",
      2,
    ),
    { file: "http://h/app.js", line: 3, column: 4 },
  );
});
