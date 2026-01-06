import {
  getLogger as getLogTapeLogger,
  type Logger as LogTapeLogger,
  type LogLevel,
} from "@logtape/logtape";

export type { LogLevel } from "@logtape/logtape";

/**
 * Options for configuring the Drizzle ORM LogTape logger.
 * @since 1.3.0
 */
export interface DrizzleLoggerOptions {
  /**
   * The LogTape category to use for logging.
   * @default ["drizzle-orm"]
   */
  readonly category?: string | readonly string[];

  /**
   * The log level to use for query logging.
   * @default "debug"
   */
  readonly level?: LogLevel;
}

/**
 * Drizzle ORM's Logger interface.
 * @since 1.3.0
 */
export interface Logger {
  logQuery(query: string, params: unknown[]): void;
}

/**
 * A Drizzle ORM-compatible logger that wraps LogTape.
 *
 * @example
 * ```typescript
 * import { drizzle } from "drizzle-orm/postgres-js";
 * import { getLogger } from "@logtape/drizzle-orm";
 * import postgres from "postgres";
 *
 * const client = postgres(process.env.DATABASE_URL!);
 * const db = drizzle(client, {
 *   logger: getLogger(),
 * });
 * ```
 *
 * @since 1.3.0
 */
export class DrizzleLogger implements Logger {
  readonly #logger: LogTapeLogger;
  readonly #level: LogLevel;

  /**
   * Creates a new DrizzleLogger instance.
   * @param logger The LogTape logger to use.
   * @param level The log level to use for query logging.
   */
  constructor(logger: LogTapeLogger, level: LogLevel = "debug") {
    this.#logger = logger;
    this.#level = level;
  }

  /**
   * Logs a database query with its parameters.
   *
   * The log output includes:
   * - `formattedQuery`: The query with parameter placeholders replaced with
   *   actual values (for readability)
   * - `query`: The original query string with placeholders
   * - `params`: The original parameters array
   *
   * @param query The SQL query string with parameter placeholders.
   * @param params The parameter values.
   */
  logQuery(query: string, params: unknown[]): void {
    const stringifiedParams = params.map(serialize);
    const formattedQuery = query.replace(/\$(\d+)/g, (match) => {
      const index = Number.parseInt(match.slice(1), 10);
      return stringifiedParams[index - 1] ?? match;
    });

    const logMethod = this.#logger[this.#level].bind(this.#logger);
    logMethod("Query: {formattedQuery}", {
      formattedQuery,
      query,
      params,
    });
  }
}

/**
 * Serializes a parameter value to a SQL-safe string representation.
 *
 * @param value The value to serialize.
 * @returns The serialized string representation.
 * @since 1.3.0
 */
export function serialize(value: unknown): string {
  if (typeof value === "undefined" || value === null) return "NULL";
  if (typeof value === "string") return stringLiteral(value);
  if (typeof value === "number" || typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "boolean") return value ? "'t'" : "'f'";
  if (value instanceof Date) return stringLiteral(value.toISOString());
  if (Array.isArray(value)) {
    return `ARRAY[${value.map(serialize).join(", ")}]`;
  }
  if (typeof value === "object") {
    // Assume it's a JSON object
    return stringLiteral(JSON.stringify(value));
  }
  return stringLiteral(String(value));
}

/**
 * Converts a string to a SQL string literal with proper escaping.
 *
 * @param str The string to convert.
 * @returns The escaped SQL string literal.
 * @since 1.3.0
 */
export function stringLiteral(str: string): string {
  if (/[\\'\n\r\t\b\f]/.test(str)) {
    let escaped = str;
    escaped = escaped.replaceAll("\\", "\\\\");
    escaped = escaped.replaceAll("'", "\\'");
    escaped = escaped.replaceAll("\n", "\\n");
    escaped = escaped.replaceAll("\r", "\\r");
    escaped = escaped.replaceAll("\t", "\\t");
    escaped = escaped.replaceAll("\b", "\\b");
    escaped = escaped.replaceAll("\f", "\\f");
    return `E'${escaped}'`;
  }
  return `'${str}'`;
}

/**
 * Normalize category to array format.
 */
function normalizeCategory(
  category: string | readonly string[],
): readonly string[] {
  return typeof category === "string" ? [category] : category;
}

/**
 * Creates a Drizzle ORM-compatible logger that wraps LogTape.
 *
 * @example Basic usage
 * ```typescript
 * import { drizzle } from "drizzle-orm/postgres-js";
 * import { configure } from "@logtape/logtape";
 * import { getLogger } from "@logtape/drizzle-orm";
 * import postgres from "postgres";
 *
 * await configure({
 *   // ... LogTape configuration
 * });
 *
 * const client = postgres(process.env.DATABASE_URL!);
 * const db = drizzle(client, {
 *   logger: getLogger(),
 * });
 * ```
 *
 * @example With custom category and level
 * ```typescript
 * const db = drizzle(client, {
 *   logger: getLogger({
 *     category: ["my-app", "database"],
 *     level: "info",
 *   }),
 * });
 * ```
 *
 * @param options Configuration options for the logger.
 * @returns A Drizzle ORM-compatible logger wrapping LogTape.
 * @since 1.3.0
 */
export function getLogger(options: DrizzleLoggerOptions = {}): DrizzleLogger {
  const category = normalizeCategory(options.category ?? ["drizzle-orm"]);
  const logger = getLogTapeLogger(category);
  return new DrizzleLogger(logger, options.level ?? "debug");
}
