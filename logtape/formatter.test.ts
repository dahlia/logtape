import { assertEquals } from "@std/assert/assert-equals";
import { assertThrows } from "@std/assert/assert-throws";
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

Deno.test("getTextFormatter()", () => {
  assertEquals(
    getTextFormatter()(info),
    "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    getTextFormatter({ timestamp: "date" })(info),
    "2023-11-14 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    getTextFormatter({ timestamp: "date-time" })(info),
    "2023-11-14 22:13:20.000 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    getTextFormatter({ timestamp: "date-time-timezone" })(info),
    "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    getTextFormatter({ timestamp: "date-time-tz" })(info),
    "2023-11-14 22:13:20.000 +00 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    getTextFormatter({ timestamp: "none" })(info),
    "[INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    getTextFormatter({ timestamp: "disabled" })(info),
    "[INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    getTextFormatter({ timestamp: "rfc3339" })(info),
    "2023-11-14T22:13:20.000Z [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    getTextFormatter({ timestamp: "time" })(info),
    "22:13:20.000 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    getTextFormatter({ timestamp: "time-timezone" })(info),
    "22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    getTextFormatter({ timestamp: "time-tz" })(info),
    "22:13:20.000 +00 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    getTextFormatter({
      timestamp(ts) {
        const t = new Date(ts);
        return t.toUTCString();
      },
    })(info),
    "Tue, 14 Nov 2023 22:13:20 GMT [INF] my-app·junk: Hello, 123 & 456!\n",
  );

  assertEquals(
    getTextFormatter({ level: "ABBR" })(info),
    "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    getTextFormatter({ level: "FULL" })(info),
    "2023-11-14 22:13:20.000 +00:00 [INFO] my-app·junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    getTextFormatter({ level: "L" })(info),
    "2023-11-14 22:13:20.000 +00:00 [I] my-app·junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    getTextFormatter({ level: "abbr" })(info),
    "2023-11-14 22:13:20.000 +00:00 [inf] my-app·junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    getTextFormatter({ level: "full" })(info),
    "2023-11-14 22:13:20.000 +00:00 [info] my-app·junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    getTextFormatter({ level: "l" })(info),
    "2023-11-14 22:13:20.000 +00:00 [i] my-app·junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    getTextFormatter({
      level(level) {
        return level.at(-1) ?? "";
      },
    })(info),
    "2023-11-14 22:13:20.000 +00:00 [o] my-app·junk: Hello, 123 & 456!\n",
  );

  assertEquals(
    getTextFormatter({ category: "." })(info),
    "2023-11-14 22:13:20.000 +00:00 [INF] my-app.junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    getTextFormatter({
      category(category) {
        return `<${category.join("/")}>`;
      },
    })(info),
    "2023-11-14 22:13:20.000 +00:00 [INF] <my-app/junk>: Hello, 123 & 456!\n",
  );

  assertEquals(
    getTextFormatter({
      value(value) {
        return typeof value;
      },
    })(info),
    "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, number & number!\n",
  );

  let recordedValues: FormattedValues | null = null;
  assertEquals(
    getTextFormatter({
      format(values) {
        recordedValues = values;
        const { timestamp, level, category, message } = values;
        return `${level} <${category}> ${message} ${timestamp}`;
      },
    })(info),
    "INF <my-app·junk> Hello, 123 & 456! 2023-11-14 22:13:20.000 +00:00\n",
  );
  assertEquals(
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
    assertEquals(
      getTextFormatter()(longStringAndArray),
      `2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, "${
        "a".repeat(15000)
      }" & ${longArrayStr}!\n`,
    );
  } else {
    assertEquals(
      getTextFormatter()(longStringAndArray),
      `2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, '${
        "a".repeat(15000)
      }' & ${longArrayStr}!\n`,
    );
  }
});

Deno.test("defaultTextFormatter()", () => {
  assertEquals(
    defaultTextFormatter(info),
    "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    defaultTextFormatter(fatal),
    "2023-11-14 22:13:20.000 +00:00 [FTL] my-app·junk: Hello, 123 & 456!\n",
  );
});

Deno.test("getAnsiColorFormatter()", () => {
  assertEquals(
    getAnsiColorFormatter()(info),
    "\x1b[2m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[1m\x1b[32mINF\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );
  assertEquals(
    getAnsiColorFormatter({ timestampStyle: "bold" })(info),
    "\x1b[1m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[1m\x1b[32mINF\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );
  assertEquals(
    getAnsiColorFormatter({ timestampStyle: null })(info),
    "2023-11-14 22:13:20.000 +00 " +
      "\x1b[1m\x1b[32mINF\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );

  assertEquals(
    getAnsiColorFormatter({ timestampColor: "cyan" })(info),
    "\x1b[2m\x1b[36m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[1m\x1b[32mINF\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );
  assertEquals(
    getAnsiColorFormatter({ timestampColor: null })(info),
    "\x1b[2m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[1m\x1b[32mINF\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );
  assertEquals(
    getAnsiColorFormatter({ timestampStyle: null, timestampColor: "cyan" })(
      info,
    ),
    "\x1b[36m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[1m\x1b[32mINF\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );
  assertEquals(
    getAnsiColorFormatter({ timestampStyle: null, timestampColor: null })(info),
    "2023-11-14 22:13:20.000 +00 " +
      "\x1b[1m\x1b[32mINF\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );

  assertEquals(
    getAnsiColorFormatter({ levelStyle: null })(info),
    "\x1b[2m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[32mINF\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );
  assertEquals(
    getAnsiColorFormatter({ levelStyle: "dim" })(info),
    "\x1b[2m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[2m\x1b[32mINF\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );

  assertEquals(
    getAnsiColorFormatter({
      levelColors: {
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
  assertEquals(
    getAnsiColorFormatter({
      levelColors: {
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

  assertEquals(
    getAnsiColorFormatter({ categoryStyle: "bold" })(info),
    "\x1b[2m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[1m\x1b[32mINF\x1b[0m " +
      "\x1b[1mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );
  assertEquals(
    getAnsiColorFormatter({ categoryStyle: null })(info),
    "\x1b[2m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[1m\x1b[32mINF\x1b[0m " +
      "my-app·junk: " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );

  assertEquals(
    getAnsiColorFormatter({ categoryColor: "cyan" })(info),
    "\x1b[2m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[1m\x1b[32mINF\x1b[0m " +
      "\x1b[2m\x1b[36mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );

  let recordedValues: FormattedValues | null = null;
  assertEquals(
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
  assertEquals(
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

Deno.test("ansiColorFormatter()", () => {
  assertEquals(
    ansiColorFormatter(info),
    "\x1b[2m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[1m\x1b[32mINF\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );
  assertEquals(
    ansiColorFormatter(fatal),
    "\x1b[2m2023-11-14 22:13:20.000 +00\x1b[0m " +
      "\x1b[1m\x1b[35mFTL\x1b[0m " +
      "\x1b[2mmy-app·junk:\x1b[0m " +
      "Hello, \x1b[33m123\x1b[39m & \x1b[33m456\x1b[39m!\n",
  );
});

Deno.test("defaultConsoleFormatter()", () => {
  assertEquals(
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

Deno.test("getJsonLinesFormatter()", async (t) => {
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

  await t.step("default options", () => {
    const formatter = getJsonLinesFormatter();
    const result = JSON.parse(formatter(logRecord));

    assertEquals(result["@timestamp"], "2023-11-14T22:13:20.000Z");
    assertEquals(result.level, "INFO");
    assertEquals(result.message, "Hello, 123 & 456!");
    assertEquals(result.logger, "my-app.junk");
    assertEquals(result.properties, { userId: "12345", requestId: "abc-def" });
  });

  await t.step("warning level converts to WARN", () => {
    const formatter = getJsonLinesFormatter();
    const result = JSON.parse(formatter(warningRecord));
    assertEquals(result.level, "WARN");
  });

  await t.step("categorySeparator string option", () => {
    const formatter = getJsonLinesFormatter({ categorySeparator: "/" });
    const result = JSON.parse(formatter(logRecord));
    assertEquals(result.logger, "my-app/junk");
  });

  await t.step("categorySeparator function option", () => {
    const formatter = getJsonLinesFormatter({
      categorySeparator: (category) => category.join("::").toUpperCase(),
    });
    const result = JSON.parse(formatter(logRecord));
    assertEquals(result.logger, "MY-APP::JUNK");
  });

  await t.step("categorySeparator function returning array", () => {
    const formatter = getJsonLinesFormatter({
      categorySeparator: (category) => category,
    });
    const result = JSON.parse(formatter(logRecord));
    assertEquals(result.logger, ["my-app", "junk"]);
  });

  await t.step("message template option", () => {
    const formatter = getJsonLinesFormatter({ message: "template" });
    const result = JSON.parse(formatter(logRecord));
    assertEquals(result.message, "Hello, {a} & {b}!");

    const result2 = JSON.parse(formatter(warningRecord));
    assertEquals(result2.message, "Login failed for {}");
  });

  await t.step("message template with string rawMessage", () => {
    const stringRawRecord: LogRecord = {
      ...logRecord,
      rawMessage: "Simple string message",
    };
    const formatter = getJsonLinesFormatter({ message: "template" });
    const result = JSON.parse(formatter(stringRawRecord));
    assertEquals(result.message, "Simple string message");
  });

  await t.step("message rendered option (default)", () => {
    const formatter = getJsonLinesFormatter({ message: "rendered" });
    const result = JSON.parse(formatter(logRecord));
    assertEquals(result.message, "Hello, 123 & 456!");
  });

  await t.step("properties flatten option", () => {
    const formatter = getJsonLinesFormatter({ properties: "flatten" });
    const result = JSON.parse(formatter(logRecord));
    assertEquals(result.userId, "12345");
    assertEquals(result.requestId, "abc-def");
    assertEquals(result.properties, undefined);
  });

  await t.step("properties prepend option", () => {
    const formatter = getJsonLinesFormatter({ properties: "prepend:ctx_" });
    const result = JSON.parse(formatter(logRecord));
    assertEquals(result.ctx_userId, "12345");
    assertEquals(result.ctx_requestId, "abc-def");
    assertEquals(result.properties, undefined);
  });

  await t.step("properties nest option", () => {
    const formatter = getJsonLinesFormatter({ properties: "nest:context" });
    const result = JSON.parse(formatter(logRecord));
    assertEquals(result.context, { userId: "12345", requestId: "abc-def" });
    assertEquals(result.properties, undefined);
  });

  await t.step("properties nest option (default)", () => {
    const formatter = getJsonLinesFormatter();
    const result = JSON.parse(formatter(logRecord));
    assertEquals(result.properties, { userId: "12345", requestId: "abc-def" });
  });

  await t.step("invalid properties option - empty prepend prefix", () => {
    assertThrows(
      () => getJsonLinesFormatter({ properties: "prepend:" }),
      TypeError,
      'Invalid properties option: "prepend:". It must be of the form "prepend:<prefix>" where <prefix> is a non-empty string.',
    );
  });

  await t.step("invalid properties option - invalid format", () => {
    assertThrows(
      () =>
        getJsonLinesFormatter({
          // @ts-ignore: Intentionally invalid type for testing
          properties: "invalid:option",
        }),
      TypeError,
      'Invalid properties option: "invalid:option". It must be "flatten", "prepend:<prefix>", or "nest:<key>".',
    );
  });

  await t.step("combined options", () => {
    const formatter = getJsonLinesFormatter({
      categorySeparator: "::",
      message: "template",
      properties: "prepend:prop_",
    });
    const result = JSON.parse(formatter(logRecord));

    assertEquals(result, {
      "@timestamp": "2023-11-14T22:13:20.000Z",
      level: "INFO",
      message: "Hello, {a} & {b}!",
      logger: "my-app::junk",
      prop_userId: "12345",
      prop_requestId: "abc-def",
    });
  });
});
