import type { LogRecord } from "@logtape/logtape";

type Value = string | number | boolean | null | Value[] | Entry;
interface Entry {
  [key: string]: Value;
}

const unavailable = "[unserializable]";
const maxDepth = 12;
const maxValues = 1024;

interface Budget {
  remaining: number;
  readonly ancestors: Set<object>;
}

function budget(): Budget {
  return { remaining: maxValues, ancestors: new Set() };
}

function set(entry: Entry, key: string, value: Value): void {
  Object.defineProperty(entry, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function render(value: Value): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function readError(
  error: Error,
  key: "name" | "message" | "stack" | "cause",
): unknown {
  try {
    return Reflect.get(error, key);
  } catch {
    return undefined;
  }
}

function formatError(error: Error, state: Budget, depth: number): Entry {
  const name = readError(error, "name");
  const message = readError(error, "message");
  const stack = readError(error, "stack");
  const cause = readError(error, "cause");
  const entry: Entry = {
    name: typeof name === "string" ? name : "Error",
    message: typeof message === "string" ? message : "",
  };
  if (typeof stack === "string") entry.stack = stack;
  if (cause !== undefined) entry.cause = normalize(cause, state, depth + 1);
  return entry;
}

function normalize(value: unknown, state: Budget, depth: number): Value {
  if (state.remaining <= 0) return unavailable;
  state.remaining--;
  if (depth > maxDepth) return unavailable;
  if (value === null) return null;
  switch (typeof value) {
    case "boolean":
    case "string":
      return value;
    case "number":
      return Number.isFinite(value) ? value : null;
    case "bigint":
      return String(value);
    case "object":
      break;
    default:
      return unavailable;
  }
  if (state.ancestors.has(value)) return unavailable;
  state.ancestors.add(value);
  try {
    if (value instanceof Error) return formatError(value, state, depth);
    if (value instanceof Date) return Date.prototype.toISOString.call(value);
    if (Array.isArray(value)) {
      const length: unknown = Object.getOwnPropertyDescriptor(
        value,
        "length",
      )?.value;
      if (typeof length !== "number") return unavailable;
      const result: Value[] = [];
      for (let i = 0; i < length && state.remaining > 0; i++) {
        const item = Object.getOwnPropertyDescriptor(value, String(i));
        result.push(
          normalize(item == null ? null : item.value, state, depth + 1),
        );
      }
      return result;
    }
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      return unavailable;
    const entry: Entry = {};
    for (const key of Object.keys(value)) {
      if (state.remaining <= 0) break;
      const property = Object.getOwnPropertyDescriptor(value, key);
      if (property != null) {
        set(entry, key, normalize(property.value, state, depth + 1));
      }
    }
    return entry;
  } catch {
    return unavailable;
  } finally {
    state.ancestors.delete(value);
  }
}

export function formatEntry(record: LogRecord, level: string): Entry {
  const state = budget();
  let message = "";
  for (const [index, part] of record.message.entries()) {
    if (index % 2 === 0 && typeof part === "string") {
      message += part;
    } else if (typeof part === "number" && !Number.isFinite(part)) {
      message += String(part);
    } else {
      message += render(normalize(part, state, 0));
    }
  }
  const entry: Entry = { level, message, category: record.category.join(".") };
  try {
    const error = Object.getOwnPropertyDescriptor(record.properties, "error");
    if (error != null && (!("value" in error) || error.value !== undefined)) {
      const errorState = budget();
      const value: unknown = error.value;
      if (isError(value)) {
        errorState.ancestors.add(value);
        entry.error = formatError(value, errorState, 0);
      } else {
        entry.error = {
          name: "Error",
          message: render(normalize(value, errorState, 0)),
        };
      }
    }
  } catch {
    entry.error = { name: "Error", message: unavailable };
  }
  try {
    for (const key of Object.keys(record.properties)) {
      if (state.remaining <= 0) break;
      if (
        key === "level" ||
        key === "message" ||
        key === "category" ||
        key === "error"
      )
        continue;
      try {
        const property = Object.getOwnPropertyDescriptor(
          record.properties,
          key,
        );
        if (property != null)
          set(entry, key, normalize(property.value, state, 0));
      } catch {
        set(entry, key, normalize(undefined, state, 0));
      }
    }
  } catch {
    // An unreadable properties object cannot hide the core log fields.
  }
  return entry;
}

function isError(value: unknown): value is Error {
  try {
    return value instanceof Error;
  } catch {
    return false;
  }
}
