import type { LogLevel } from "./level.ts";

/**
 * A log record.
 */
export interface LogRecord {
  /**
   * The category of the logger that produced the log record.
   */
  readonly category: readonly string[];

  /**
   * The log level.
   */
  readonly level: LogLevel;

  /**
   * The log message.  This is the result of substituting the message template
   * with the values.  The number of elements in this array is always odd,
   * with the message template values interleaved between the substitution
   * values.
   */
  readonly message: readonly unknown[];

  /**
   * The raw log message.  This is the original message template without any
   * further processing.  It can be either:
   *
   * - A string without any substitutions if the log record was created with
   *   a method call syntax, e.g., "Hello, {name}!" for
   *   `logger.info("Hello, {name}!", { name })`.
   * - A template string array if the log record was created with a tagged
   *   template literal syntax, e.g., `["Hello, ", "!"]` for
   *   ``logger.info`Hello, ${name}!```.
   *
   * @since 0.6.0
   */
  readonly rawMessage: string | TemplateStringsArray;

  /**
   * The timestamp of the log record in milliseconds since the Unix epoch.
   */
  readonly timestamp: number;

  /**
   * The extra properties of the log record.
   */
  readonly properties: Record<string, unknown>;
}
