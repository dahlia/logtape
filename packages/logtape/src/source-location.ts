import type { SourceLocation } from "./record.ts";

/**
 * The prefix of each frame in V8 and JavaScriptCore (Bun) stack traces.
 */
const v8FramePrefix = "    at ";

/**
 * Matches a file that starts with a URL scheme (e.g., `file:`, `http:`,
 * `node:`, or a Windows drive letter), a slash, or a UNC prefix.
 */
const absoluteFilePattern = /^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/|\\\\)/;

/**
 * Matches a `file:line:column` location.
 */
const locationPattern = /^(.+):(\d+):(\d+)$/;

/**
 * Marks a location that matched the grammar but must not be reported.
 */
const rejected: unique symbol = Symbol("rejected");

type ParsedLocation = SourceLocation | typeof rejected | undefined;

/**
 * Parses the source location of a frame from the stack trace of an `Error`
 * that was constructed without a message.
 *
 * The parser is deliberately conservative: whenever the frame could be read
 * in more than one way, or it does not point to a position in a source file
 * (native code, `eval()`, bytecode offsets), it returns `undefined` rather
 * than a possibly wrong location.  It never throws.
 *
 * @param stack The `stack` property of an `Error` constructed without
 *              a message.
 * @param frameIndex The zero-based index of the frame to parse, where `0`
 *                   is the function that constructed the `Error`.
 * @returns The source location of the frame, or `undefined` if it could not
 *          be determined unambiguously.
 */
export function parseSourceLocation(
  stack: unknown,
  frameIndex: number,
): SourceLocation | undefined {
  if (typeof stack !== "string") return undefined;
  const lines = stack.split("\n");
  // The dialect is decided by how the stack starts, never by what later
  // frames look like, because function names can contain anything.
  if (lines[0].trim() === "Error") {
    // V8 (Node.js, Deno, Chromium) and JavaScriptCore (Bun):
    if (lines.length < 2 || !lines[1].startsWith(v8FramePrefix)) {
      return undefined;
    }
    return parseV8Frame(lines[frameIndex + 1]);
  }
  // SpiderMonkey (Firefox) and, presumably, JavaScriptCore in Safari have no
  // header line:
  if (lines[0] === "" || /^\s/.test(lines[0])) return undefined;
  return parseSpiderMonkeyFrame(lines[frameIndex]);
}

function parseV8Frame(frame: string | undefined): SourceLocation | undefined {
  if (frame == null || !frame.startsWith(v8FramePrefix)) return undefined;
  const body = frame.slice(v8FramePrefix.length);
  // Code from eval() or new Function() has no meaningful file position:
  if (body.includes("eval at ")) return undefined;
  // A frame without a function name is just a location, possibly marked as
  // that of an async function resumed by the microtask queue, e.g.,
  // "async file:///app/main.ts:13:1":
  if (!body.endsWith(")")) {
    return accept(
      parseLocation(body.startsWith("async ") ? body.slice(6) : body),
    );
  }
  // Otherwise it is "name (location)", where both the name and the location
  // can contain " (", so the frame is accepted only if exactly one boundary
  // yields a location:
  let found: SourceLocation | undefined;
  for (let i = body.indexOf(" ("); i >= 0; i = body.indexOf(" (", i + 1)) {
    const location = parseLocation(body.slice(i + 2, -1));
    if (location === rejected) return undefined;
    if (location == null) continue;
    if (found != null) return undefined;
    found = location;
  }
  return found;
}

function parseSpiderMonkeyFrame(
  frame: string | undefined,
): SourceLocation | undefined {
  if (frame == null) return undefined;
  // A frame that is itself a location could be an anonymous frame whose
  // location contains "@", so it is ambiguous:
  const whole = parseLocation(frame);
  if (whole === rejected) return undefined;
  if (whole != null && absoluteFilePattern.test(whole.file)) return undefined;
  // Otherwise it is "name@location", where both the name and the location
  // can contain "@".  These engines always report absolute URLs, so the
  // frame is accepted only if exactly one boundary yields an absolute
  // location:
  let found: SourceLocation | undefined;
  for (let i = frame.indexOf("@"); i >= 0; i = frame.indexOf("@", i + 1)) {
    const location = parseLocation(frame.slice(i + 1));
    if (location === rejected) return undefined;
    if (location == null || !absoluteFilePattern.test(location.file)) {
      continue;
    }
    if (found != null) return undefined;
    found = location;
  }
  return found;
}

function accept(location: ParsedLocation): SourceLocation | undefined {
  return location === rejected ? undefined : location;
}

function parseLocation(location: string): ParsedLocation {
  const match = locationPattern.exec(location);
  if (match == null) return undefined;
  const file = match[1];
  const line = Number(match[2]);
  const column = Number(match[3]);
  if (
    // Native code (V8, Bun, Safari):
    file === "native" || file === "<anonymous>" || file === "[native code]" ||
    // Hermes reports bytecode offsets rather than source positions:
    file.includes("address at ") ||
    // eval() and new Function() (V8, SpiderMonkey):
    file.includes("eval at ") || file.includes(" > eval") ||
    file.includes(" > Function") ||
    line < 1 || column < 1
  ) {
    return rejected;
  }
  return { file, line, column };
}
