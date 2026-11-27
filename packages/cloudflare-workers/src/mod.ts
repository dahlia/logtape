/**
 * A synchronous console sink for Cloudflare Workers.
 * @module
 */
import { getConsoleSink, type LogLevel, type Sink } from "@logtape/logtape";
import { formatEntry } from "./entry.ts";

const levelMap = {
  trace: "debug",
  debug: "debug",
  info: "info",
  warning: "warn",
  error: "error",
  fatal: "error",
} as const satisfies Record<LogLevel, string>;

/**
 * Create a synchronous sink that writes a structured object per log record to
 * the console. Pass a caught exception as the `error` log property to preserve
 * its stack when available. Enable Workers Logs and Workers Issues separately
 * in your Worker configuration.
 *
 * @returns A LogTape sink for the Workers console.
 */
export function getWorkersConsoleSink(): Sink {
  return getConsoleSink({
    levelMap,
    formatter: (record) => [formatEntry(record, levelMap[record.level])],
  });
}
