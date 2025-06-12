import type { LogLevel } from "./level.ts";
import type { LogRecord } from "./record.ts";

/**
 * A filter is a function that accepts a log record and returns `true` if the
 * record should be passed to the sink.
 *
 * @param record The log record to filter.
 * @returns `true` if the record should be passed to the sink.
 */
export type Filter = (record: LogRecord) => boolean;

/**
 * A filter-like value is either a {@link Filter} or a {@link LogLevel}.
 * `null` is also allowed to represent a filter that rejects all records.
 */
export type FilterLike = Filter | LogLevel | null;

/**
 * Converts a {@link FilterLike} value to an actual {@link Filter}.
 *
 * @param filter The filter-like value to convert.
 * @returns The actual filter.
 */
export function toFilter(filter: FilterLike): Filter {
  if (typeof filter === "function") return filter;
  return getLevelFilter(filter);
}

/**
 * Returns a filter that accepts log records with the specified level.
 *
 * @param level The level to filter by.  If `null`, the filter will reject all
 *              records.
 * @returns The filter.
 */
export function getLevelFilter(level: LogLevel | null): Filter {
  if (level == null) return () => false;
  if (level === "fatal") {
    return (record: LogRecord) => record.level === "fatal";
  } else if (level === "error") {
    return (record: LogRecord) =>
      record.level === "fatal" || record.level === "error";
  } else if (level === "warning") {
    return (record: LogRecord) =>
      record.level === "fatal" ||
      record.level === "error" ||
      record.level === "warning";
  } else if (level === "info") {
    return (record: LogRecord) =>
      record.level === "fatal" ||
      record.level === "error" ||
      record.level === "warning" ||
      record.level === "info";
  } else if (level === "debug") {
    return (record: LogRecord) =>
      record.level === "fatal" ||
      record.level === "error" ||
      record.level === "warning" ||
      record.level === "info" ||
      record.level === "debug";
  } else if (level === "trace") return () => true;
  throw new TypeError(`Invalid log level: ${level}.`);
}
