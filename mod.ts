import type { LogRecord, Sink } from "@logtape/logtape";
import { type BaseClient, getClient } from "@sentry/core";
import type { ClientOptions, ParameterizedString } from "@sentry/types";
// deno-lint-ignore no-unused-vars
import type util from "node:util";

function getParameterizedString(record: LogRecord): ParameterizedString {
  let result = "";
  let tplString = "";
  const tplValues: string[] = [];
  for (let i = 0; i < record.message.length; i++) {
    if (i % 2 === 0) {
      result += record.message[i];
      tplString += String(record.message[i]).replaceAll("%", "%%");
    } else {
      const value = inspect(record.message[i]);
      result += value;
      tplString += `%s`;
      tplValues.push(value);
    }
  }
  const paramStr = new String(result) as ParameterizedString;
  paramStr.__sentry_template_string__ = tplString;
  paramStr.__sentry_template_values__ = tplValues;
  return result;
}

/**
 * A platform-specific inspect function.  In Deno, this is {@link Deno.inspect},
 * and in Node.js/Bun it is {@link util.inspect}.  If neither is available, it
 * falls back to {@link JSON.stringify}.
 *
 * @param value The value to inspect.
 * @returns The string representation of the value.
 */
const inspect: (value: unknown) => string =
  // @ts-ignore: Deno global
  "Deno" in globalThis && "inspect" in globalThis.Deno &&
    // @ts-ignore: Deno global
    typeof globalThis.Deno.inspect === "function"
    // @ts-ignore: Deno global
    ? globalThis.Deno.inspect
    // @ts-ignore: Node.js global
    : "util" in globalThis && "inspect" in globalThis.util &&
        // @ts-ignore: Node.js global
        globalThis.util.inspect === "function"
    // @ts-ignore: Node.js global
    ? globalThis.util.inspect
    : JSON.stringify;

/**
 * Gets a LogTape sink that sends logs to Sentry.
 * @param client The Sentry client.  If omitted, the global default client is
 *               used.
 * @returns A LogTape sink that sends logs to Sentry.
 */
export function getSentrySink(client?: BaseClient<ClientOptions>): Sink {
  return (record: LogRecord) => {
    if (client == null) client = getClient();
    client?.captureMessage(
      getParameterizedString(record),
      record.level,
      { data: record.properties },
    );
  };
}
