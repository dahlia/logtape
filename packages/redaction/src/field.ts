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
    const redactedProperties = redactProperties(record.properties, opts);
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
      );
    } else {
      // Tagged template: redact by comparing values
      const redactedValues = getRedactedValues(
        record.properties,
        redactedProperties,
      );
      if (redactedValues.size > 0) {
        redactedMessage = redactMessageByValues(record.message, redactedValues);
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
): Record<string, unknown> {
  if (visited.has(properties)) {
    return visited.get(properties) as Record<string, unknown>;
  }

  const copy: Record<string, unknown> = {};
  visited.set(properties, copy);

  for (const field in properties) {
    if (shouldFieldRedacted(field, options.fieldPatterns)) {
      if (typeof options.action === "function") {
        copy[field] = options.action(properties[field]);
      }
      continue;
    }

    const value = properties[field];
    if (Array.isArray(value)) {
      copy[field] = redactArray(value, options, visited);
    } else if (typeof value === "object" && value !== null) {
      copy[field] = redactProperties(
        value as Record<string, unknown>,
        options,
        visited,
      );
    } else {
      copy[field] = value;
    }
  }
  return copy;
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
): unknown[] {
  return array.map((item) => {
    if (Array.isArray(item)) {
      return redactArray(item, options, visited);
    }
    if (typeof item === "object" && item !== null) {
      return redactProperties(
        item as Record<string, unknown>,
        options,
        visited,
      );
    }
    return item;
  });
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
  for (const char of path) {
    if (char === "." || char === "[") {
      if (current) segments.push(current);
      current = "";
    } else if (char === "]" || char === "?") {
      // Skip these characters
    } else {
      current += char;
    }
  }
  if (current) segments.push(current);
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
        const rootKey = parsePathSegments(placeholderName)[0];
        if (rootKey in redactedProperties) {
          result.push(redactedProperties[rootKey]);
        } else {
          result.push(message[i]);
        }
      }
      placeholderIndex++;
    }
  }
  return result;
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
  for (const key in original) {
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
): readonly unknown[] {
  if (redactedValues.size === 0) return message;

  const result: unknown[] = [];
  for (let i = 0; i < message.length; i++) {
    if (i % 2 === 0) {
      result.push(message[i]);
    } else {
      const val = message[i];
      if (redactedValues.has(val)) {
        result.push(redactedValues.get(val));
      } else {
        result.push(val);
      }
    }
  }
  return result;
}
