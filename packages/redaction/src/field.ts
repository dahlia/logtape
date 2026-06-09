import { getLogger, type LogRecord, type Sink } from "@logtape/logtape";
import {
  createRedactionTraversalContext,
  type RedactionLimit,
  type RedactionTraversalContext,
  type RedactionTraversalLimits,
  type RedactionTraversalOptions,
  redactionTruncatedValue,
} from "./traversal.ts";

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
 * The synchronous action to perform on a redacted field value.
 * @since 0.10.0
 */
export type FieldRedactionAction = "delete" | ((value: unknown) => unknown);

/**
 * The asynchronous action to perform on a redacted field value.
 * @since 2.1.0
 */
export type AsyncFieldRedactionAction = (
  value: unknown,
) => PromiseLike<unknown>;

/**
 * A pseudonymizer created by {@link createHmacPseudonymizer}.
 * @since 2.1.0
 */
export type HmacPseudonymizer = (value: unknown) => Promise<string>;

const metaLogger = getLogger(["logtape", "meta"]);
let reportingRedactionFailure = false;
let reportingRedactionLimit = false;

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
export interface FieldRedactionOptions extends RedactionTraversalOptions {
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
  readonly action?: FieldRedactionAction;

  /**
   * Maximum recursion depth for object and array traversal.
   * @default `20`
   * @since 2.2.0
   */
  readonly maxDepth?: number;

  /**
   * Maximum number of properties or array elements to process per object.
   * @default `1000`
   * @since 2.2.0
   */
  readonly maxProperties?: number;
}

/**
 * Options for asynchronously redacting fields in a {@link LogRecord}.  Used by
 * the {@link redactByFieldAsync} function.
 * @since 2.1.0
 */
export interface AsyncFieldRedactionOptions extends RedactionTraversalOptions {
  /**
   * The field patterns to match against.  This can be an array of
   * strings or regular expressions.  If a field matches any of the
   * patterns, it will be redacted.
   */
  readonly fieldPatterns: FieldPatterns;

  /**
   * The asynchronous action to perform on the matched fields.
   */
  readonly action: AsyncFieldRedactionAction;

  /**
   * Maximum recursion depth for object and array traversal.
   * @default `20`
   * @since 2.2.0
   */
  readonly maxDepth?: number;

  /**
   * Maximum number of properties or array elements to process per object.
   * @default `1000`
   * @since 2.2.0
   */
  readonly maxProperties?: number;
}

/**
 * Options for the {@link createHmacPseudonymizer} function.
 * @since 2.1.0
 */
export interface HmacPseudonymizerOptions {
  /**
   * The secret key to use for HMAC.  Strings are encoded as UTF-8.
   */
  readonly key: string | Uint8Array | ArrayBuffer | CryptoKey;

  /**
   * The HMAC hash algorithm.
   * @default `"SHA-256"`
   */
  readonly hash?: "SHA-256" | "SHA-384" | "SHA-512";

  /**
   * The digest encoding.
   * @default `"base64url"`
   */
  readonly encoding?: "base64url" | "hex";

  /**
   * The string prefix to prepend to each pseudonym.  If omitted, a prefix based
   * on the hash algorithm is used, such as `"hmac-sha256:"`.  Set this to an
   * empty string to disable the prefix.
   */
  readonly prefix?: string;
}

/**
 * Redacts properties and message values in a {@link LogRecord} based on the
 * provided field patterns and action.
 *
 * Note that it is a decorator which wraps the sink and redacts properties
 * and message values before passing them to the sink.
 *
 * For string templates (e.g., `"Hello, {name}!"`), placeholder names are
 * matched against the field patterns to determine which values to redact.
 *
 * For tagged template literals (e.g., `` `Hello, ${name}!` ``), redaction
 * is performed by comparing message values with redacted property values.
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
    const context = createFieldRedactionContext(opts);
    const redactedProperties = redactProperties(
      record.properties,
      opts,
      context.visited,
      0,
      context,
    );
    let redactedMessage = record.message;

    if (typeof record.rawMessage === "string") {
      // String template: redact by placeholder names
      const placeholders = extractPlaceholderNames(record.rawMessage);
      const { redactedIndices, wildcardIndices } =
        getRedactedPlaceholderIndices(
          placeholders,
          opts.fieldPatterns,
        );
      redactedMessage = redactMessageArray(
        record.message,
        placeholders,
        redactedIndices,
        wildcardIndices,
        redactedProperties,
        opts.action,
        context.exceededLimits.size > 0,
      );
    } else {
      // Tagged template: redact by comparing values
      const redactedValues = getRedactedValues(
        record.properties,
        redactedProperties,
      );
      if (redactedValues.size > 0 || context.exceededLimits.size > 0) {
        redactedMessage = redactMessageByValues(
          record.message,
          redactedValues,
          context.exceededLimits.size > 0,
        );
      }
    }

    sink({
      ...record,
      message: redactedMessage,
      properties: redactedProperties,
    });
  };
  if (Symbol.dispose in sink) wrapped[Symbol.dispose] = sink[Symbol.dispose];
  if (Symbol.asyncDispose in sink) {
    wrapped[Symbol.asyncDispose] = sink[Symbol.asyncDispose];
  }
  return wrapped;
}

/**
 * Redacts properties and message values in a {@link LogRecord} based on the
 * provided field patterns and asynchronous action.
 *
 * The returned sink preserves record ordering by processing redaction work in
 * sequence and implements {@link AsyncDisposable} so callers can wait for all
 * pending redaction work before shutdown.
 *
 * @example
 * ```ts
 * import { getConsoleSink } from "@logtape/logtape";
 * import {
 *   createHmacPseudonymizer,
 *   redactByFieldAsync,
 * } from "@logtape/redaction";
 *
 * const pseudonymize = await createHmacPseudonymizer({ key: "secret" });
 * const sink = redactByFieldAsync(getConsoleSink(), {
 *   fieldPatterns: [/userId/i, /email/i],
 *   action: pseudonymize,
 * });
 * ```
 *
 * @param sink The sink to wrap.
 * @param options The async redaction options.
 * @returns The wrapped sink.
 * @since 2.1.0
 */
export function redactByFieldAsync(
  sink: Sink | Sink & Disposable | Sink & AsyncDisposable,
  options: AsyncFieldRedactionOptions,
): Sink & AsyncDisposable {
  let lastPromise = Promise.resolve();
  let closed = false;
  const sinkErrors: unknown[] = [];
  const wrapped: Sink & AsyncDisposable = (record: LogRecord) => {
    if (closed) return;

    const work = redactLogRecordAsync(record, options).catch((error) => {
      reportRedactionFailure(error);
      return null;
    });
    lastPromise = lastPromise.then(async () => {
      const result = await work;
      if (result == null) return;

      try {
        await sink({
          ...record,
          message: result.message,
          properties: result.properties,
        });
      } catch (error) {
        sinkErrors.push(error);
      }
    });
  };
  wrapped[Symbol.asyncDispose] = async () => {
    closed = true;
    await lastPromise;

    let disposeError: unknown;
    try {
      if (Symbol.asyncDispose in sink) {
        await sink[Symbol.asyncDispose]();
      } else if (Symbol.dispose in sink) {
        sink[Symbol.dispose]();
      }
    } catch (error) {
      disposeError = error;
    }

    if (sinkErrors.length > 0) {
      const errors = disposeError == null
        ? sinkErrors
        : [...sinkErrors, disposeError];
      if (errors.length === 1) throw errors[0];
      throw new AggregateError(
        errors,
        "One or more errors occurred while emitting redacted log records.",
      );
    }
    if (disposeError != null) {
      throw disposeError;
    }
  };
  return wrapped;
}

async function redactLogRecordAsync(
  record: LogRecord,
  options: AsyncFieldRedactionOptions,
): Promise<Pick<LogRecord, "message" | "properties">> {
  const context = createFieldRedactionContext(options);
  const redactedProperties = await redactPropertiesAsync(
    record.properties,
    options,
    context.visited,
    0,
    context,
  );

  if (typeof record.rawMessage === "string") {
    const placeholders = extractPlaceholderNames(record.rawMessage);
    const { redactedIndices, wildcardIndices } = getRedactedPlaceholderIndices(
      placeholders,
      options.fieldPatterns,
    );
    return {
      message: await redactMessageArrayAsync(
        record.message,
        placeholders,
        redactedIndices,
        wildcardIndices,
        redactedProperties,
        options.action,
        context.exceededLimits.size > 0,
      ),
      properties: redactedProperties,
    };
  }

  let redactedMessage = record.message;
  const redactedValues = getRedactedValues(
    record.properties,
    redactedProperties,
  );
  if (redactedValues.size > 0 || context.exceededLimits.size > 0) {
    redactedMessage = redactMessageByValues(
      record.message,
      redactedValues,
      context.exceededLimits.size > 0,
    );
  }
  return { message: redactedMessage, properties: redactedProperties };
}

function reportRedactionFailure(error: unknown): void {
  if (reportingRedactionFailure || typeof metaLogger.warn !== "function") {
    return;
  }
  try {
    reportingRedactionFailure = true;
    metaLogger.warn(
      "Failed to redact a log record; dropping the record to avoid leaking " +
        "sensitive data: {error}",
      { error },
    );
  } catch {
    // Meta logging failures must not make normal logging fail.
  } finally {
    reportingRedactionFailure = false;
  }
}

function reportRedactionLimitExceeded(
  limit: RedactionLimit,
  limits: RedactionTraversalLimits,
): void {
  if (reportingRedactionLimit || typeof metaLogger.warn !== "function") {
    return;
  }
  try {
    reportingRedactionLimit = true;
    metaLogger.warn(
      "Redaction traversal exceeded {limit}; replacing or omitting " +
        "remaining data to keep logging bounded.",
      { limit, ...limits },
    );
  } catch {
    // Meta logging failures must not make normal logging fail.
  } finally {
    reportingRedactionLimit = false;
  }
}

function createFieldRedactionContext(
  options: RedactionTraversalOptions,
  visited = new Map<object, object>(),
): RedactionTraversalContext {
  return createRedactionTraversalContext(
    options,
    reportRedactionLimitExceeded,
    visited,
  );
}

function reportLimitOnce(
  context: RedactionTraversalContext,
  limit: RedactionLimit,
): void {
  if (context.exceededLimits.has(limit)) return;
  context.reportLimitExceeded(limit);
}

/**
 * Creates an asynchronous pseudonymizer based on HMAC using the Web Crypto API.
 *
 * The returned function converts each value with `String(value)`, encodes it
 * as UTF-8, and returns a stable pseudonym.  Because HMAC is keyed, this is
 * safer than a plain salted hash for values with small input spaces, such as
 * email addresses or numeric user IDs.
 *
 * @param options The HMAC pseudonymizer options.
 * @returns An async redaction action.
 * @since 2.1.0
 */
export async function createHmacPseudonymizer(
  options: HmacPseudonymizerOptions,
): Promise<HmacPseudonymizer> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle == null) {
    throw new TypeError("The Web Crypto API is not available.");
  }
  const hash = getHmacHash(options.key, options.hash);
  const encoding = options.encoding ?? "base64url";
  const prefix = options.prefix ??
    `hmac-${hash.toLowerCase().replaceAll("-", "")}:`;
  const key = isCryptoKey(options.key) ? options.key : await subtle.importKey(
    "raw",
    keyToBytes(options.key),
    { name: "HMAC", hash },
    false,
    ["sign"],
  );
  const encoder = new TextEncoder();

  return async (value: unknown): Promise<string> => {
    const data = encoder.encode(String(value));
    const signature = new Uint8Array(
      await subtle.sign("HMAC", key, data),
    );
    return prefix + encodeBytes(signature, encoding);
  };
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
  visited = new Map<object, object>(),
  depth = 0,
  context = createFieldRedactionContext(options, visited),
): Record<string, unknown> {
  if (visited.has(properties)) {
    return visited.get(properties) as Record<string, unknown>;
  }

  const copy: Record<string, unknown> = {};
  visited.set(properties, copy);

  const fields = Object.keys(properties);
  if (fields.length > context.limits.maxProperties) {
    reportLimitOnce(context, "maxProperties");
  }

  for (const field of fields.slice(0, context.limits.maxProperties)) {
    if (shouldFieldRedacted(field, options.fieldPatterns)) {
      if (typeof options.action === "function") {
        setProperty(copy, field, options.action(properties[field]));
      }
      continue;
    }

    const value = properties[field];
    if (Array.isArray(value)) {
      if (depth + 1 > context.limits.maxDepth) {
        reportLimitOnce(context, "maxDepth");
        setProperty(copy, field, redactionTruncatedValue);
      } else {
        setProperty(
          copy,
          field,
          redactArray(value, options, visited, depth + 1, context),
        );
      }
    } else if (typeof value === "object" && value !== null) {
      if (isBuiltInObject(value)) {
        setProperty(copy, field, value);
      } else if (depth + 1 > context.limits.maxDepth) {
        reportLimitOnce(context, "maxDepth");
        setProperty(copy, field, redactionTruncatedValue);
      } else {
        setProperty(
          copy,
          field,
          redactProperties(
            value as Record<string, unknown>,
            options,
            visited,
            depth + 1,
            context,
          ),
        );
      }
    } else {
      setProperty(copy, field, value);
    }
  }
  return copy;
}

/**
 * Redacts properties from an object using an asynchronous action.
 * @param properties The properties to redact.
 * @param options The async redaction options.
 * @param visited Map of visited objects to prevent circular reference issues.
 * @returns The redacted properties.
 * @since 2.1.0
 */
export async function redactPropertiesAsync(
  properties: Record<string, unknown>,
  options: AsyncFieldRedactionOptions,
  visited = new Map<object, object>(),
  depth = 0,
  context = createFieldRedactionContext(options, visited),
): Promise<Record<string, unknown>> {
  if (visited.has(properties)) {
    return visited.get(properties) as Record<string, unknown>;
  }

  const copy: Record<string, unknown> = {};
  visited.set(properties, copy);

  const fields: string[] = [];
  const values: Promise<unknown>[] = [];
  const propertyFields = Object.keys(properties);
  if (propertyFields.length > context.limits.maxProperties) {
    reportLimitOnce(context, "maxProperties");
  }
  for (const field of propertyFields.slice(0, context.limits.maxProperties)) {
    fields.push(field);
    if (shouldFieldRedacted(field, options.fieldPatterns)) {
      values.push(Promise.resolve(options.action(properties[field])));
      continue;
    }

    const value = properties[field];
    if (Array.isArray(value)) {
      if (depth + 1 > context.limits.maxDepth) {
        reportLimitOnce(context, "maxDepth");
        values.push(Promise.resolve(redactionTruncatedValue));
      } else {
        values.push(
          redactArrayAsync(value, options, visited, depth + 1, context),
        );
      }
    } else if (typeof value === "object" && value !== null) {
      if (isBuiltInObject(value)) {
        values.push(Promise.resolve(value));
      } else if (depth + 1 > context.limits.maxDepth) {
        reportLimitOnce(context, "maxDepth");
        values.push(Promise.resolve(redactionTruncatedValue));
      } else {
        values.push(
          redactPropertiesAsync(
            value as Record<string, unknown>,
            options,
            visited,
            depth + 1,
            context,
          ),
        );
      }
    } else {
      values.push(Promise.resolve(value));
    }
  }
  const redactedValues = await Promise.all(values);
  for (let i = 0; i < fields.length; i++) {
    setProperty(copy, fields[i], redactedValues[i]);
  }
  return copy;
}

function setProperty(
  object: Record<string, unknown>,
  field: string,
  value: unknown,
): void {
  if (field === "__proto__") {
    Object.defineProperty(object, field, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  } else {
    object[field] = value;
  }
}

/**
 * Redacts sensitive fields in an array recursively.
 * @param array The array to process.
 * @param options The redaction options.
 * @param visited Map of visited objects to prevent circular reference issues.
 * @returns A new array with redacted values.
 */
function redactArray(
  array: unknown[],
  options: FieldRedactionOptions,
  visited: Map<object, object>,
  depth: number,
  context: RedactionTraversalContext,
): unknown[] {
  if (visited.has(array)) return visited.get(array) as unknown[];

  const copy: unknown[] = [];
  const length = Math.min(array.length, context.limits.maxProperties);
  copy.length = length;
  visited.set(array, copy);
  if (array.length > context.limits.maxProperties) {
    reportLimitOnce(context, "maxProperties");
  }
  for (let i = 0; i < length; i++) {
    if (!(i in array)) continue;
    const item = array[i];
    if (Array.isArray(item)) {
      if (depth + 1 > context.limits.maxDepth) {
        reportLimitOnce(context, "maxDepth");
        copy[i] = redactionTruncatedValue;
      } else {
        copy[i] = redactArray(item, options, visited, depth + 1, context);
      }
    } else if (typeof item === "object" && item !== null) {
      if (isBuiltInObject(item)) {
        copy[i] = item;
      } else if (depth + 1 > context.limits.maxDepth) {
        reportLimitOnce(context, "maxDepth");
        copy[i] = redactionTruncatedValue;
      } else {
        copy[i] = redactProperties(
          item as Record<string, unknown>,
          options,
          visited,
          depth + 1,
          context,
        );
      }
    } else {
      copy[i] = item;
    }
  }
  return copy;
}

async function redactArrayAsync(
  array: unknown[],
  options: AsyncFieldRedactionOptions,
  visited: Map<object, object>,
  depth: number,
  context: RedactionTraversalContext,
): Promise<unknown[]> {
  if (visited.has(array)) return visited.get(array) as unknown[];

  const copy: unknown[] = [];
  const length = Math.min(array.length, context.limits.maxProperties);
  copy.length = length;
  visited.set(array, copy);
  const itemPromises: Promise<unknown>[] = [];
  if (array.length > context.limits.maxProperties) {
    reportLimitOnce(context, "maxProperties");
  }
  for (let i = 0; i < length; i++) {
    if (!(i in array)) {
      itemPromises.push(Promise.resolve(undefined));
      continue;
    }
    const item = array[i];
    if (Array.isArray(item)) {
      if (depth + 1 > context.limits.maxDepth) {
        reportLimitOnce(context, "maxDepth");
        itemPromises.push(Promise.resolve(redactionTruncatedValue));
      } else {
        itemPromises.push(
          redactArrayAsync(item, options, visited, depth + 1, context),
        );
      }
    } else if (typeof item === "object" && item !== null) {
      if (isBuiltInObject(item)) {
        itemPromises.push(Promise.resolve(item));
      } else if (depth + 1 > context.limits.maxDepth) {
        reportLimitOnce(context, "maxDepth");
        itemPromises.push(Promise.resolve(redactionTruncatedValue));
      } else {
        itemPromises.push(
          redactPropertiesAsync(
            item as Record<string, unknown>,
            options,
            visited,
            depth + 1,
            context,
          ),
        );
      }
    } else {
      itemPromises.push(Promise.resolve(item));
    }
  }
  const redactedItems = await Promise.all(itemPromises);
  for (let i = 0; i < redactedItems.length; i++) {
    if (i in array) copy[i] = redactedItems[i];
  }
  return copy;
}

/**
 * Checks if a value is a built-in object that should not be recursively
 * processed (e.g., Error, Date, RegExp, Map, Set, etc.).
 * @param value The value to check.
 * @returns `true` if the value is a built-in object, `false` otherwise.
 */
function isBuiltInObject(value: object): boolean {
  return value instanceof Error ||
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof Map ||
    value instanceof Set ||
    value instanceof WeakMap ||
    value instanceof WeakSet ||
    value instanceof Promise ||
    value instanceof ArrayBuffer ||
    (typeof SharedArrayBuffer !== "undefined" &&
      value instanceof SharedArrayBuffer) ||
    ArrayBuffer.isView(value);
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
      const matched = testFieldPattern(field, fieldPattern);
      if (matched) return true;
    }
  }
  return false;
}

function testFieldPattern(field: string, fieldPattern: RegExp): boolean {
  if (!fieldPattern.global && !fieldPattern.sticky) {
    return fieldPattern.test(field);
  }
  const descriptor = Object.getOwnPropertyDescriptor(fieldPattern, "lastIndex");
  if (descriptor?.writable === false) {
    return new RegExp(fieldPattern).test(field);
  }
  return RegExp.prototype[Symbol.search].call(fieldPattern, field) !== -1;
}

/**
 * Extracts placeholder names from a message template string in order.
 * @param template The message template string.
 * @returns An array of placeholder names in the order they appear.
 */
function extractPlaceholderNames(template: string): string[] {
  const placeholders: string[] = [];
  for (let i = 0; i < template.length; i++) {
    if (template[i] === "{") {
      // Check for escaped brace
      if (i + 1 < template.length && template[i + 1] === "{") {
        i++;
        continue;
      }
      const closeIndex = template.indexOf("}", i + 1);
      if (closeIndex === -1) continue;
      const key = template.slice(i + 1, closeIndex).trim();
      placeholders.push(key);
      i = closeIndex;
    }
  }
  return placeholders;
}

/**
 * Parses a property path into its segments.
 * @param path The property path (e.g., "user.password" or "users[0].email").
 * @returns An array of path segments.
 */
function parsePathSegments(path: string): string[] {
  const segments: string[] = [];
  let current = "";
  let inBracket = false;
  let quotedBracketSegment = false;
  let quote: '"' | "'" | undefined;
  let escaped = false;

  const pushCurrent = (trim = false): void => {
    const segment = trim ? current.trimEnd() : current;
    if (segment) segments.push(segment);
    current = "";
  };

  for (const char of path) {
    if (quote != null) {
      if (escaped) {
        current += char;
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }

    if (inBracket && current === "" && /\s/.test(char)) {
      continue;
    }
    if (inBracket && (char === '"' || char === "'") && current === "") {
      quote = char;
      quotedBracketSegment = true;
      continue;
    }
    if (inBracket && quotedBracketSegment && /\s/.test(char)) {
      continue;
    }
    if (char === "." && !inBracket) {
      pushCurrent();
      continue;
    }
    if (char === "[") {
      pushCurrent();
      inBracket = true;
      continue;
    }
    if (char === "]") {
      pushCurrent(!quotedBracketSegment);
      inBracket = false;
      quotedBracketSegment = false;
      continue;
    }
    if (char === "?") continue;
    current += char;
  }
  pushCurrent();
  return segments;
}

/**
 * Determines which placeholder indices should be redacted based on field
 * patterns, and which are wildcard placeholders.
 * @param placeholders Array of placeholder names from the template.
 * @param fieldPatterns Field patterns to match against.
 * @returns Object with redactedIndices and wildcardIndices.
 */
function getRedactedPlaceholderIndices(
  placeholders: string[],
  fieldPatterns: FieldPatterns,
): { redactedIndices: Set<number>; wildcardIndices: Set<number> } {
  const redactedIndices = new Set<number>();
  const wildcardIndices = new Set<number>();

  for (let i = 0; i < placeholders.length; i++) {
    const placeholder = placeholders[i];

    // Track wildcard {*} separately
    if (placeholder === "*") {
      wildcardIndices.add(i);
      continue;
    }

    // Check the full placeholder name
    if (shouldFieldRedacted(placeholder, fieldPatterns)) {
      redactedIndices.add(i);
      continue;
    }
    // For nested paths, check each segment
    const segments = parsePathSegments(placeholder);
    for (const segment of segments) {
      if (shouldFieldRedacted(segment, fieldPatterns)) {
        redactedIndices.add(i);
        break;
      }
    }
  }
  return { redactedIndices, wildcardIndices };
}

/**
 * Redacts values in the message array based on the redacted placeholder
 * indices and wildcard indices.
 * @param message The original message array.
 * @param placeholders Array of placeholder names from the template.
 * @param redactedIndices Set of placeholder indices to redact.
 * @param wildcardIndices Set of wildcard placeholder indices.
 * @param redactedProperties The redacted properties object.
 * @param action The redaction action.
 * @returns New message array with redacted values.
 */
function redactMessageArray(
  message: readonly unknown[],
  placeholders: string[],
  redactedIndices: Set<number>,
  wildcardIndices: Set<number>,
  redactedProperties: Record<string, unknown>,
  action: "delete" | ((value: unknown) => unknown) | undefined,
  truncateUnmappedValues = false,
): readonly unknown[] {
  const result: unknown[] = [];
  let placeholderIndex = 0;

  for (let i = 0; i < message.length; i++) {
    if (i % 2 === 0) {
      // Even index: text segment
      result.push(message[i]);
    } else {
      // Odd index: value/placeholder
      if (wildcardIndices.has(placeholderIndex)) {
        // Wildcard {*}: replace with redacted properties
        result.push(redactedProperties);
      } else if (redactedIndices.has(placeholderIndex)) {
        if (action == null || action === "delete") {
          result.push("");
        } else {
          result.push(action(message[i]));
        }
      } else {
        // For non-redacted placeholders, use value from redactedProperties
        // to ensure nested sensitive fields are redacted
        const placeholderName = placeholders[placeholderIndex];
        const redactedValue = getPathValue(redactedProperties, placeholderName);
        if (redactedValue.found) {
          result.push(redactedValue.value);
        } else if (truncateUnmappedValues) {
          result.push(redactionTruncatedValue);
        } else {
          result.push(message[i]);
        }
      }
      placeholderIndex++;
    }
  }
  return result;
}

async function redactMessageArrayAsync(
  message: readonly unknown[],
  placeholders: string[],
  redactedIndices: Set<number>,
  wildcardIndices: Set<number>,
  redactedProperties: Record<string, unknown>,
  action: AsyncFieldRedactionAction,
  truncateUnmappedValues = false,
): Promise<readonly unknown[]> {
  const result: unknown[] = [];
  const tasks: Promise<void>[] = [];
  let placeholderIndex = 0;

  for (let i = 0; i < message.length; i++) {
    if (i % 2 === 0) {
      result.push(message[i]);
    } else {
      if (wildcardIndices.has(placeholderIndex)) {
        result.push(redactedProperties);
      } else if (redactedIndices.has(placeholderIndex)) {
        const index = result.length;
        result.push(undefined);
        tasks.push(
          Promise.resolve(action(message[i])).then((redacted) => {
            result[index] = redacted;
          }),
        );
      } else {
        const placeholderName = placeholders[placeholderIndex];
        const redactedValue = getPathValue(redactedProperties, placeholderName);
        if (redactedValue.found) {
          result.push(redactedValue.value);
        } else if (truncateUnmappedValues) {
          result.push(redactionTruncatedValue);
        } else {
          result.push(message[i]);
        }
      }
      placeholderIndex++;
    }
  }
  await Promise.all(tasks);
  return result;
}

function getPathValue(
  properties: Record<string, unknown>,
  path: string,
): { found: true; value: unknown } | { found: false } {
  const segments = parsePathSegments(path);
  if (segments.length < 1) return { found: false };

  let value: unknown = properties;
  for (const segment of segments) {
    if (
      (typeof value !== "object" && typeof value !== "function") ||
      value == null ||
      !Object.hasOwn(value, segment)
    ) {
      return { found: false };
    }
    value = (value as Record<string, unknown>)[segment];
  }
  return { found: true, value };
}

/**
 * Collects redacted value mappings from original to redacted properties.
 * @param original The original properties.
 * @param redacted The redacted properties.
 * @param map The map to populate with original -> redacted value pairs.
 */
function collectRedactedValues(
  original: Record<string, unknown>,
  redacted: Record<string, unknown>,
  map: Map<unknown, unknown>,
): void {
  for (const key of Object.keys(redacted)) {
    const origVal = original[key];
    const redVal = redacted[key];

    if (origVal !== redVal) {
      map.set(origVal, redVal);
    }

    // Recurse into nested objects
    if (
      typeof origVal === "object" && origVal !== null &&
      typeof redVal === "object" && redVal !== null &&
      !Array.isArray(origVal)
    ) {
      collectRedactedValues(
        origVal as Record<string, unknown>,
        redVal as Record<string, unknown>,
        map,
      );
    }
  }
}

/**
 * Gets a map of original values to their redacted replacements.
 * @param original The original properties.
 * @param redacted The redacted properties.
 * @returns A map of original -> redacted values.
 */
function getRedactedValues(
  original: Record<string, unknown>,
  redacted: Record<string, unknown>,
): Map<unknown, unknown> {
  const map = new Map<unknown, unknown>();
  collectRedactedValues(original, redacted, map);
  return map;
}

/**
 * Redacts message array values by comparing with redacted property values.
 * Used for tagged template literals where placeholder names are not available.
 * @param message The original message array.
 * @param redactedValues Map of original -> redacted values.
 * @returns New message array with redacted values.
 */
function redactMessageByValues(
  message: readonly unknown[],
  redactedValues: Map<unknown, unknown>,
  truncateUnmappedValues = false,
): readonly unknown[] {
  if (redactedValues.size === 0 && !truncateUnmappedValues) return message;

  const result: unknown[] = [];
  for (let i = 0; i < message.length; i++) {
    if (i % 2 === 0) {
      result.push(message[i]);
    } else {
      const val = message[i];
      if (redactedValues.has(val)) {
        result.push(redactedValues.get(val));
      } else if (truncateUnmappedValues) {
        result.push(redactionTruncatedValue);
      } else {
        result.push(val);
      }
    }
  }
  return result;
}

function keyToBytes(key: string | Uint8Array | ArrayBuffer): BufferSource {
  if (typeof key === "string") return new TextEncoder().encode(key);
  if (key instanceof ArrayBuffer) return key;
  return key as Uint8Array<ArrayBuffer>;
}

function isCryptoKey(
  key: string | Uint8Array | ArrayBuffer | CryptoKey,
): key is CryptoKey {
  return typeof key === "object" && key !== null &&
    Object.prototype.toString.call(key) === "[object CryptoKey]";
}

function getHmacHash(
  key: string | Uint8Array | ArrayBuffer | CryptoKey,
  hash: HmacPseudonymizerOptions["hash"],
): NonNullable<HmacPseudonymizerOptions["hash"]> {
  if (!isCryptoKey(key)) return hash ?? "SHA-256";
  if (!key.usages.includes("sign")) {
    throw new TypeError('The HMAC CryptoKey must include the "sign" usage.');
  }
  const keyHash = getCryptoKeyHmacHash(key);
  if (hash != null && hash !== keyHash) {
    throw new TypeError(
      `The HMAC CryptoKey uses ${keyHash}, but the "hash" option is ${hash}.`,
    );
  }
  return keyHash;
}

function getCryptoKeyHmacHash(
  key: CryptoKey,
): NonNullable<HmacPseudonymizerOptions["hash"]> {
  const algorithm = key.algorithm;
  if (algorithm.name !== "HMAC" || !("hash" in algorithm)) {
    throw new TypeError("The CryptoKey must be an HMAC key.");
  }
  const hashAlgorithm = algorithm.hash;
  if (
    typeof hashAlgorithm !== "object" || hashAlgorithm == null ||
    !("name" in hashAlgorithm) || typeof hashAlgorithm.name !== "string"
  ) {
    throw new TypeError("The CryptoKey must specify an HMAC hash algorithm.");
  }
  const hash = hashAlgorithm.name;
  switch (hash) {
    case "SHA-256":
    case "SHA-384":
    case "SHA-512":
      return hash;
    default:
      throw new TypeError(`Unsupported HMAC hash algorithm: ${hash}.`);
  }
}

function encodeBytes(bytes: Uint8Array, encoding: "base64url" | "hex"): string {
  switch (encoding) {
    case "base64url":
      return encodeBase64Url(bytes);
    case "hex":
      return encodeHex(bytes);
  }
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function encodeHex(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) {
    result += byte.toString(16).padStart(2, "0");
  }
  return result;
}
