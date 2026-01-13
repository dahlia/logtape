import assert from "node:assert/strict";
import test from "node:test";
import { fatal, info } from "./fixtures.ts";
import {
  ansiColorFormatter,
  defaultConsoleFormatter,
  defaultTextFormatter,
  type FormattedValues,
  getAnsiColorFormatter,
  getJsonLinesFormatter,
  getTextFormatter,
} from "./formatter.ts";
import type { LogRecord } from "./record.ts";

test("getTextFormatter()", () => {
  assert.deepStrictEqual(
    getTextFormatter()(info),
    "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.deepStrictEqual(
    getTextFormatter({ timestamp: "date" })(info),
    "2023-11-14 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.deepStrictEqual(
    getTextFormatter({ timestamp: "date-time" })(info),
    "2023-11-14 22:13:20.000 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.deepStrictEqual(
    getTextFormatter({ timestamp: "date-time-timezone" })(info),
    "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.deepStrictEqual(
    getTextFormatter({ timestamp: "date-time-tz" })(info),
    "2023-11-14 22:13:20.000 +00 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.deepStrictEqual(
    getTextFormatter({ timestamp: "none" })(info),
    "[INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.deepStrictEqual(
    getTextFormatter({ timestamp: "disabled" })(info),
    "[INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.deepStrictEqual(
    getTextFormatter({ timestamp: "rfc3339" })(info),
    "2023-11-14T22:13:20.000Z [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.deepStrictEqual(
    getTextFormatter({ timestamp: "time" })(info),
    "22:13:20.000 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.deepStrictEqual(
    getTextFormatter({ timestamp: "time-timezone" })(info),
    "22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.deepStrictEqual(
    getTextFormatter({ timestamp: "time-tz" })(info),
    "22:13:20.000 +00 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.deepStrictEqual(
    getTextFormatter({
      timestamp(ts) {
        const t = new Date(ts);
        return t.toUTCString();
      },
    })(info),
    "Tue, 14 Nov 2023 22:13:20 GMT [INF] my-app·junk: Hello, 123 & 456!\n",
  );

  assert.deepStrictEqual(
    getTextFormatter({ level: "ABBR" })(info),
    "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.deepStrictEqual(
    getTextFormatter({ level: "FULL" })(info),
    "2023-11-14 22:13:20.000 +00:00 [INFO] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.deepStrictEqual(
    getTextFormatter({ level: "L" })(info),
    "2023-11-14 22:13:20.000 +00:00 [I] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.deepStrictEqual(
    getTextFormatter({ level: "abbr" })(info),
    "2023-11-14 22:13:20.000 +00:00 [inf] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.deepStrictEqual(
    getTextFormatter({ level: "full" })(info),
    "2023-11-14 22:13:20.000 +00:00 [info] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.deepStrictEqual(
    getTextFormatter({ level: "l" })(info),
    "2023-11-14 22:13:20.000 +00:00 [i] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.deepStrictEqual(
    getTextFormatter({
      level(level) {
        return level.at(-1) ?? "";
      },
    })(info),
    "2023-11-14 22:13:20.000 +00:00 [o] my-app·junk: Hello, 123 & 456!\n",
  );

  assert.deepStrictEqual(
    getTextFormatter({ category: "." })(info),
    "2023-11-14 22:13:20.000 +00:00 [INF] my-app.junk: Hello, 123 & 456!\n",
  );
  assert.deepStrictEqual(
    getTextFormatter({
      category(category) {
        return `<${category.join("/")}>`;
      },
    })(info),
    "2023-11-14 22:13:20.000 +00:00 [INF] <my-app/junk>: Hello, 123 & 456!\n",
  );

  assert.deepStrictEqual(
    getTextFormatter({
      value(value) {
        return typeof value;
      },
    })(info),
    "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, number & number!\n",
  );

  // Test the inspect parameter fallback
  assert.deepStrictEqual(
    getTextFormatter({
      value(value, inspect) {
        // Custom formatting for numbers, fallback to inspect for others
        if (typeof value === "number") {
          return `NUM(${value})`;
        }
        return inspect(value);
      },
    })(info),
    "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, NUM(123) & NUM(456)!\n",
  );

  // Test inspect fallback with objects
  const recordWithObject: LogRecord = {
    level: "info",
    category: ["test"],
    message: ["Data: ", { foo: "bar", baz: 42 }, ""],
    rawMessage: "Data: {}",
    timestamp: 1700000000000,
    properties: {},
  };
  const resultWithObject = getTextFormatter({
    value(value, inspect) {
      // For objects, use inspect without colors
      if (typeof value === "object" && value !== null) {
        return inspect(value, { colors: false });
      }
      return String(value);
    },
  })(recordWithObject);
  // Should contain the object keys
  assert.deepStrictEqual(resultWithObject.includes("foo"), true);
  assert.deepStrictEqual(resultWithObject.includes("bar"), true);
  assert.deepStrictEqual(resultWithObject.includes("baz"), true);

  let recordedValues: FormattedValues | null = null;
  assert.deepStrictEqual(
    getTextFormatter({
      format(values) {
        recordedValues = values;
        const { timestamp, level, category, message } = values;
        return `${level} <${category}> ${message} ${timestamp}`;
      },
    })(info),
    "INF <my-app·junk> Hello, 123 & 456! 2023-11-14 22:13:20.000 +00:00\n",
  );
  assert.deepStrictEqual(
    recordedValues,
    {
      timestamp: "2023-11-14 22:13:20.000 +00:00",
      level: "INF",
      category: "my-app·junk",
      message: "Hello, 123 & 456!",
      record: info,
    },
  );

  const longArray = new Array(150).fill(0);
  const longStringAndArray: LogRecord = {
    level: "info",
    category: ["my-app", "junk"],
    message: ["Hello, ", "a".repeat(15000), " & ", longArray, "!"],
    rawMessage: "Hello, {a} & {b}!",
    timestamp: 1700000000000,
    properties: {},
  };
  let longArrayStr = "[\n";
  for (let i = 0; i < Math.floor(longArray.length / 12); i++) {
    longArrayStr += "  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,\n";
  }
  for (let i = 0; i < longArray.length % 12; i++) {
    if (i < 1) longArrayStr += "  0";
    else longArrayStr += ", 0";
    if (i === longArray.length % 12 - 1) longArrayStr += "\n";
  }
  longArrayStr += "]";
  // dnt-shim-ignore
  if ("Deno" in globalThis) {
    assert.deepStrictEqual(
      getTextFormatter()(longStringAndArray),
      `2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, "${
        "a".repeat(15000)
      }" & ${longArrayStr}!\n`,
    );
  } else {
    assert.deepStrictEqual(
      getTextFormatter()(longStringAndArray),
      `2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, '${
        "a".repeat(15000)
      }' & ${longArrayStr}!\n`,
    );
  }
});

test("defaultTextFormatter()", () => {
  assert.deepStrictEqual(
    defaultTextFormatter(info),
    "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.deepStrictEqual(
    defaultTextFormatter(fatal),
    "2023-11-14 22:13:20.000 +00:00 [FTL] my-app·junk: Hello, 123 & 456!\n",
  );
});

test("getAnsiColorFormatter()", () => {
  assert.deepStrictEqual(
    getAnsiColorFormatter()(info),
    "\x1b[2m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[1m\x1b[32mINF\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );
  assert.deepStrictEqual(
    getAnsiColorFormatter({ timestampStyle: "bold" })(info),
    "\x1b[1m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[1m\x1b[32mINF\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );
  assert.deepStrictEqual(
    getAnsiColorFormatter({ timestampStyle: null })(info),
    "2023-11-14 22:13:20.000 +00 " +
      "\x1b[1m\x1b[32mINF\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );

  assert.deepStrictEqual(
    getAnsiColorFormatter({ timestampColor: "cyan" })(info),
    "\x1b[2m\x1b[36m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[1m\x1b[32mINF\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );
  assert.deepStrictEqual(
    getAnsiColorFormatter({ timestampColor: null })(info),
    "\x1b[2m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[1m\x1b[32mINF\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );
  assert.deepStrictEqual(
    getAnsiColorFormatter({ timestampStyle: null, timestampColor: "cyan" })(
      info,
    ),
    "\x1b[36m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[1m\x1b[32mINF\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );
  assert.deepStrictEqual(
    getAnsiColorFormatter({ timestampStyle: null, timestampColor: null })(info),
    "2023-11-14 22:13:20.000 +00 " +
      "\x1b[1m\x1b[32mINF\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );

  assert.deepStrictEqual(
    getAnsiColorFormatter({ levelStyle: null })(info),
    "\x1b[2m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[32mINF\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );
  assert.deepStrictEqual(
    getAnsiColorFormatter({ levelStyle: "dim" })(info),
    "\x1b[2m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[2m\x1b[32mINF\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );

  assert.deepStrictEqual(
    getAnsiColorFormatter({
      levelColors: {
        trace: null,
        debug: "blue",
        info: "cyan",
        warning: "yellow",
        error: "red",
        fatal: "magenta",
      },
    })(info),
    "\x1b[2m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[1m\x1b[36mINF\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );
  assert.deepStrictEqual(
    getAnsiColorFormatter({
      levelColors: {
        trace: null,
        debug: "blue",
        info: null,
        warning: "yellow",
        error: "red",
        fatal: "magenta",
      },
      levelStyle: null,
    })(info),
    "\x1b[2m2023-11-14 22:13:20.000 +00\x1b[0m INF " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );

  assert.deepStrictEqual(
    getAnsiColorFormatter({ categoryStyle: "bold" })(info),
    "\x1b[2m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[1m\x1b[32mINF\x1b[0m " +
      "\x1b[1mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );
  assert.deepStrictEqual(
    getAnsiColorFormatter({ categoryStyle: null })(info),
    "\x1b[2m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[1m\x1b[32mINF\x1b[0m " +
      "my-app·junk: " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );

  assert.deepStrictEqual(
    getAnsiColorFormatter({ categoryColor: "cyan" })(info),
    "\x1b[2m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[1m\x1b[32mINF\x1b[0m " +
      "\x1b[2m\x1b[36mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );

  assert.deepStrictEqual(
    getAnsiColorFormatter({ timestamp: "none" })(info),
    "\x1b[1m\x1b[32mINF\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );
  assert.deepStrictEqual(
    getAnsiColorFormatter({ timestamp: "disabled" })(info),
    "\x1b[1m\x1b[32mINF\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );

  let recordedValues: FormattedValues | null = null;
  assert.deepStrictEqual(
    getAnsiColorFormatter({
      format(values) {
        recordedValues = values;
        const { timestamp, level, category, message } = values;
        return `${level} <${category}> ${message} ${timestamp}`;
      },
    })(info),
    "\x1b[1m\x1b[32mINF\x1b[0m " +
      "<\x1b[2mmy-app·junk\x1b[0m> " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m! " +
      "\x1b[2m2023-11-14 22:13:20.000 +00\x1b[0m\n",
  );
  assert.deepStrictEqual(
    recordedValues,
    {
      timestamp: "\x1b[2m2023-11-14 22:13:20.000 +00\x1b[0m",
      level: "\x1b[1m\x1b[32mINF\x1b[0m",
      category: "\x1b[2mmy-app·junk\x1b[0m",
      message: "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!",
      record: info,
    },
  );
});

test("ansiColorFormatter()", () => {
  assert.deepStrictEqual(
    ansiColorFormatter(info),
    "\x1b[2m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[1m\x1b[32mINF\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );
  assert.deepStrictEqual(
    ansiColorFormatter(fatal),
    "\x1b[2m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[1m\x1b[35mFTL\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );
});

test("defaultConsoleFormatter()", () => {
  assert.deepStrictEqual(
    defaultConsoleFormatter(info),
    [
      "%c22:13:20.000 %cINF%c %cmy-app·junk %cHello, %o & %o!",
      "color: gray;",
      "background-color: white; color: black;",
      "background-color: default;",
      "color: gray;",
      "color: default;",
      123,
      456,
    ],
  );
});

test("getJsonLinesFormatter()", () => {
  const logRecord: LogRecord = {
    level: "info",
    category: ["my-app", "junk"],
    message: ["Hello, ", 123, " & ", 456, "!"],
    rawMessage: "Hello, {a} & {b}!",
    timestamp: 1700000000000,
    properties: { userId: "12345", requestId: "abc-def" },
  };

  const warningRecord: LogRecord = {
    level: "warning",
    category: ["auth"],
    message: ["Login failed for ", "user@example.com"],
    // @ts-ignore: Mimicking a raw message with a template string
    rawMessage: ["Login failed for ", ""],
    timestamp: 1700000000000,
    properties: { attempt: 3 },
  };

  { // default options
    const formatter = getJsonLinesFormatter();
    const result = JSON.parse(formatter(logRecord));

    assert.deepStrictEqual(result["@timestamp"], "2023-11-14T22:13:20.000Z");
    assert.deepStrictEqual(result.level, "INFO");
    assert.deepStrictEqual(result.message, "Hello, 123 & 456!");
    assert.deepStrictEqual(result.logger, "my-app.junk");
    assert.deepStrictEqual(result.properties, {
      userId: "12345",
      requestId: "abc-def",
    });
  }

  { // warning level converts to WARN
    const formatter = getJsonLinesFormatter();
    const result = JSON.parse(formatter(warningRecord));
    assert.deepStrictEqual(result.level, "WARN");
  }

  { // categorySeparator string option
    const formatter = getJsonLinesFormatter({ categorySeparator: "/" });
    const result = JSON.parse(formatter(logRecord));
    assert.deepStrictEqual(result.logger, "my-app/junk");
  }

  { // categorySeparator function option
    const formatter = getJsonLinesFormatter({
      categorySeparator: (category) => category.join("::").toUpperCase(),
    });
    const result = JSON.parse(formatter(logRecord));
    assert.deepStrictEqual(result.logger, "MY-APP::JUNK");
  }

  { // categorySeparator function returning array
    const formatter = getJsonLinesFormatter({
      categorySeparator: (category) => category,
    });
    const result = JSON.parse(formatter(logRecord));
    assert.deepStrictEqual(result.logger, ["my-app", "junk"]);
  }

  { // message template option
    const formatter = getJsonLinesFormatter({ message: "template" });
    const result = JSON.parse(formatter(logRecord));
    assert.deepStrictEqual(result.message, "Hello, {a} & {b}!");

    const result2 = JSON.parse(formatter(warningRecord));
    assert.deepStrictEqual(result2.message, "Login failed for {}");
  }

  { // message template with string rawMessage
    const stringRawRecord: LogRecord = {
      ...logRecord,
      rawMessage: "Simple string message",
    };
    const formatter = getJsonLinesFormatter({ message: "template" });
    const result = JSON.parse(formatter(stringRawRecord));
    assert.deepStrictEqual(result.message, "Simple string message");
  }

  { // message rendered option (default)
    const formatter = getJsonLinesFormatter({ message: "rendered" });
    const result = JSON.parse(formatter(logRecord));
    assert.deepStrictEqual(result.message, "Hello, 123 & 456!");
  }

  { // properties flatten option
    const formatter = getJsonLinesFormatter({ properties: "flatten" });
    const result = JSON.parse(formatter(logRecord));
    assert.deepStrictEqual(result.userId, "12345");
    assert.deepStrictEqual(result.requestId, "abc-def");
    assert.deepStrictEqual(result.properties, undefined);
  }

  { // properties prepend option
    const formatter = getJsonLinesFormatter({ properties: "prepend:ctx_" });
    const result = JSON.parse(formatter(logRecord));
    assert.deepStrictEqual(result.ctx_userId, "12345");
    assert.deepStrictEqual(result.ctx_requestId, "abc-def");
    assert.deepStrictEqual(result.properties, undefined);
  }

  { // properties nest option
    const formatter = getJsonLinesFormatter({ properties: "nest:context" });
    const result = JSON.parse(formatter(logRecord));
    assert.deepStrictEqual(result.context, {
      userId: "12345",
      requestId: "abc-def",
    });
    assert.deepStrictEqual(result.properties, undefined);
  }

  { // properties nest option (default)
    const formatter = getJsonLinesFormatter();
    const result = JSON.parse(formatter(logRecord));
    assert.deepStrictEqual(result.properties, {
      userId: "12345",
      requestId: "abc-def",
    });
  }

  { // Error properties are serialized
    const recordWithError: LogRecord = {
      ...logRecord,
      properties: {
        error: new Error("boom"),
      },
    };

    const formatter = getJsonLinesFormatter();
    const result = JSON.parse(formatter(recordWithError));

    assert.deepStrictEqual(result.properties.error.name, "Error");
    assert.deepStrictEqual(result.properties.error.message, "boom");

    // stack is runtime-dependent; if present, it should be a string
    if ("stack" in result.properties.error) {
      assert.deepStrictEqual(typeof result.properties.error.stack, "string");
    }
  }

  { // Error cause is serialized (recursively)
    // `cause` option typing differs across runtimes / TS libs
    const inner = new Error("inner");
    const outer = new Error("outer", { cause: inner });

    const recordWithCause: LogRecord = {
      ...logRecord,
      properties: { error: outer },
    };

    const formatter = getJsonLinesFormatter();
    const result = JSON.parse(formatter(recordWithCause));

    assert.deepStrictEqual(result.properties.error.name, "Error");
    assert.deepStrictEqual(result.properties.error.message, "outer");
    assert.deepStrictEqual(result.properties.error.cause.name, "Error");
    assert.deepStrictEqual(result.properties.error.cause.message, "inner");
  }

  { // AggregateError.errors is serialized
    const aggregate = new AggregateError([
      new Error("first"),
      new Error("second"),
    ], "boom");

    const recordWithAggregate: LogRecord = {
      ...logRecord,
      properties: { error: aggregate },
    };

    const formatter = getJsonLinesFormatter();
    const result = JSON.parse(formatter(recordWithAggregate));

    assert.deepStrictEqual(result.properties.error.name, "AggregateError");
    assert.deepStrictEqual(result.properties.error.message, "boom");
    assert.deepStrictEqual(result.properties.error.errors.length, 2);
    assert.deepStrictEqual(result.properties.error.errors[0].message, "first");
    assert.deepStrictEqual(result.properties.error.errors[1].message, "second");
  }

  { // invalid properties option - empty prepend prefix
    assert.throws(
      () => getJsonLinesFormatter({ properties: "prepend:" }),
      TypeError,
      'Invalid properties option: "prepend:". It must be of the form "prepend:<prefix>" where <prefix> is a non-empty string.',
    );
  }

  { // invalid properties option - invalid format
    assert.throws(
      () =>
        getJsonLinesFormatter({
          // @ts-ignore: Intentionally invalid type for testing
          properties: "invalid:option",
        }),
      TypeError,
      'Invalid properties option: "invalid:option". It must be "flatten", "prepend:<prefix>", or "nest:<key>".',
    );
  }

  { // combined options
    const formatter = getJsonLinesFormatter({
      categorySeparator: "::",
      message: "template",
      properties: "prepend:prop_",
    });
    const result = JSON.parse(formatter(logRecord));

    assert.deepStrictEqual(result, {
      "@timestamp": "2023-11-14T22:13:20.000Z",
      level: "INFO",
      message: "Hello, {a} & {b}!",
      logger: "my-app::junk",
      prop_userId: "12345",
      prop_requestId: "abc-def",
    });
  }
});

test("getTextFormatter() with lineEnding option", () => {
  assert.deepStrictEqual(
    getTextFormatter({ lineEnding: "crlf" })(info),
    "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!\r\n",
  );
  assert.deepStrictEqual(
    getTextFormatter({ lineEnding: "lf" })(info),
    "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.deepStrictEqual(
    getTextFormatter()(info),
    "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
});

test("getJsonLinesFormatter() with lineEnding option", () => {
  const crlfOutput = getJsonLinesFormatter({ lineEnding: "crlf" })(info);
  assert.deepStrictEqual(crlfOutput.endsWith("\r\n"), true);
  assert.deepStrictEqual(
    JSON.parse(crlfOutput.trimEnd())["@timestamp"],
    "2023-11-14T22:13:20.000Z",
  );

  const lfOutput = getJsonLinesFormatter({ lineEnding: "lf" })(info);
  assert.deepStrictEqual(lfOutput.endsWith("\n"), true);
  assert.deepStrictEqual(lfOutput.endsWith("\r\n"), false);

  const defaultOutput = getJsonLinesFormatter()(info);
  assert.deepStrictEqual(defaultOutput.endsWith("\n"), true);
  assert.deepStrictEqual(defaultOutput.endsWith("\r\n"), false);
});

test("getAnsiColorFormatter() with lineEnding option", () => {
  assert.deepStrictEqual(
    getAnsiColorFormatter({ lineEnding: "crlf" })(info).endsWith("\r\n"),
    true,
  );
  assert.deepStrictEqual(
    getAnsiColorFormatter({ lineEnding: "lf" })(info).endsWith("\r\n"),
    false,
  );
});
