import type { LogRecord, Sink } from "@logtape/logtape";

/**
 * The type for a field pattern used in redaction.  A string or a regular
 * expression that matches field names.
 * @since 0.10.0
 */
export type FieldPattern = string | RegExp;

/**
 * An array of field patterns used for redaction.  Each pattern can be
 * a string or a regular expression that matches field names.
 * @since 0.10.0
 */
export type FieldPatterns = FieldPattern[];

/**
 * Default field patterns for redaction.  These patterns will match
 * common sensitive fields such as passwords, tokens, and personal
 * information.
 * @since 0.10.0
 */
export const DEFAULT_REDACT_FIELDS: FieldPatterns = [
  /pass(?:code|phrase|word)/i,
  /secret/i,
  /token/i,
  /key/i,
  /credential/i,
  /auth/i,
  /signature/i,
  /sensitive/i,
  /private/i,
  /ssn/i,
  /email/i,
  /phone/i,
  /address/i,
];

/**
 * Options for redacting fields in a {@link LogRecord}.  Used by
 * the {@link redactByField} function.
 * @since 0.10.0
 */
export interface FieldRedactionOptions {
  /**
   * The field patterns to match against.  This can be an array of
   * strings or regular expressions.  If a field matches any of the
   * patterns, it will be redacted.
   * @defaultValue {@link DEFAULT_REDACT_FIELDS}
   */
  readonly fieldPatterns: FieldPatterns;

  /**
   * The action to perform on the matched fields.  If not provided,
   * the default action is to delete the field from the properties.
   * If a function is provided, it will be called with the
   * value of the field, and the return value will be used to replace
   * the field in the properties.
   * If the action is `"delete"`, the field will be removed from the
   * properties.
   * @default `"delete"`
   */
  readonly action?: "delete" | ((value: unknown) => unknown);
}

/**
 * Redacts properties in a {@link LogRecord} based on the provided field
 * patterns and action.
 *
 * Note that it is a decorator which wraps the sink and redacts properties
 * before passing them to the sink.
 *
 * @example
 * ```ts
 * import { getConsoleSink } from "@logtape/logtape";
 * import { redactByField } from "@logtape/redaction";
 *
 * const sink = redactByField(getConsoleSink());
 * ```
 *
 * @param sink The sink to wrap.
 * @param options The redaction options.
 * @returns The wrapped sink.
 * @since 0.10.0
 */
export function redactByField(
  sink: Sink | Sink & Disposable | Sink & AsyncDisposable,
  options: FieldRedactionOptions | FieldPatterns = DEFAULT_REDACT_FIELDS,
): Sink | Sink & Disposable | Sink & AsyncDisposable {
  const opts = Array.isArray(options) ? { fieldPatterns: options } : options;
  const wrapped = (record: LogRecord) => {
    sink({ ...record, properties: redactProperties(record.properties, opts) });
  };
  if (Symbol.dispose in sink) wrapped[Symbol.dispose] = sink[Symbol.dispose];
  if (Symbol.asyncDispose in sink) {
    wrapped[Symbol.asyncDispose] = sink[Symbol.asyncDispose];
  }
  return wrapped;
}

/**
 * Redacts properties from an object based on specified field patterns.
 *
 * This function creates a shallow copy of the input object and applies
 * redaction rules to its properties. For properties that match the redaction
 * patterns, the function either removes them or transforms their values based
 * on the provided action.
 *
 * The redaction process is recursive and will be applied to nested objects
 * as well, allowing for deep redaction of sensitive data in complex object
 * structures.
 * @param properties The properties to redact.
 * @param options The redaction options.
 * @returns The redacted properties.
 * @since 0.10.0
 */
export function redactProperties(
  properties: Record<string, unknown>,
  options: FieldRedactionOptions,
): Record<string, unknown> {
  const copy = { ...properties };
  for (const field in copy) {
    if (shouldFieldRedacted(field, options.fieldPatterns)) {
      if (options.action == null || options.action === "delete") {
        delete copy[field];
      } else {
        copy[field] = options.action(copy[field]);
      }
      continue;
    }
    const value = copy[field];
    // Check if value is an array:
    if (Array.isArray(value)) {
      copy[field] = value.map((item) => {
        if (
          typeof item === "object" && item !== null &&
          (Object.getPrototypeOf(item) === Object.prototype ||
            Object.getPrototypeOf(item) === null)
        ) {
          // @ts-ignore: item is always Record<string, unknown>
          return redactProperties(item, options);
        }
        return item;
      });
      // Check if value is a vanilla object:
    } else if (
      typeof value === "object" && value !== null &&
      (Object.getPrototypeOf(value) === Object.prototype ||
        Object.getPrototypeOf(value) === null)
    ) {
      // @ts-ignore: value is always Record<string, unknown>
      copy[field] = redactProperties(value, options);
    }
  }
  return copy;
}

/**
 * Checks if a field should be redacted based on the provided field patterns.
 * @param field The field name to check.
 * @param fieldPatterns The field patterns to match against.
 * @returns `true` if the field should be redacted, `false` otherwise.
 * @since 0.10.0
 */
export function shouldFieldRedacted(
  field: string,
  fieldPatterns: FieldPatterns,
): boolean {
  for (const fieldPattern of fieldPatterns) {
    if (typeof fieldPattern === "string") {
      if (fieldPattern === field) return true;
    } else {
      if (fieldPattern.test(field)) return true;
    }
  }
  return false;
}
