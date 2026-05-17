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
 * Summary information emitted by {@link getThrottlingFilter} when suppressed
 * records are reported.
 *
 * @since 2.1.0
 */
export interface ThrottlingFilterSummary {
  /**
   * The throttling key whose records were suppressed.
   */
  readonly key: string;

  /**
   * The number of records suppressed since the previous summary for the key.
   */
  readonly suppressed: number;

  /**
   * The number of records allowed during the same summary period.
   */
  readonly allowed: number;

  /**
   * Why the summary was emitted.
   */
  readonly reason: "window" | "eviction" | "dispose";

  /**
   * The time at which the summary period started, in milliseconds.
   */
  readonly startTime: number;

  /**
   * The time at which the summary period ended, in milliseconds.
   */
  readonly endTime: number;

  /**
   * The first record observed in the summary period.
   */
  readonly firstRecord: LogRecord;

  /**
   * The most recent record observed in the summary period.
   */
  readonly lastRecord: LogRecord;
}

/**
 * A logger-like object used by {@link getThrottlingFilter} to emit summaries.
 *
 * A regular {@link Logger} returned by `getLogger()` satisfies this interface.
 *
 * @since 2.1.0
 */
export type ThrottlingSummaryLogger = {
  readonly [Level in LogLevel]?: (
    message: string,
    properties: Record<string, unknown>,
  ) => void;
};

/**
 * Summary logging options for {@link getThrottlingFilter}.
 *
 * @since 2.1.0
 */
export interface ThrottlingFilterSummaryOptions {
  /**
   * The logger used to emit summary records.
   */
  readonly logger: ThrottlingSummaryLogger;

  /**
   * The summary log level.
   * @default `"warning"`
   */
  readonly level?:
    | LogLevel
    | ((summary: ThrottlingFilterSummary) => LogLevel);

  /**
   * The summary message.
   * @default `"Last log message was suppressed {suppressed} times."`
   */
  readonly message?:
    | string
    | ((summary: ThrottlingFilterSummary) => string);
}

/**
 * Options for {@link getThrottlingFilter}.
 *
 * @since 2.1.0
 */
export interface ThrottlingFilterOptions {
  /**
   * Number of records allowed for each key in the configured window.
   */
  readonly limit: number;

  /**
   * Window size in milliseconds.
   */
  readonly windowMs: number;

  /**
   * Window algorithm.
   *
   * - `"fixed"` starts a window when the first record for a key arrives.
   * - `"sliding"` counts records accepted during the previous `windowMs`.
   *
   * @default `"fixed"`
   */
  readonly mode?: "fixed" | "sliding";

  /**
   * Source of time for window calculations.
   *
   * - `"clock"` uses {@link ThrottlingFilterOptions.clock}.
   * - `"record"` uses {@link LogRecord.timestamp}.
   *
   * @default `"clock"`
   */
  readonly timeSource?: "clock" | "record";

  /**
   * Clock used when {@link timeSource} is `"clock"`.
   * @default `Date.now`
   */
  readonly clock?: () => number;

  /**
   * Derives a throttling key from a log record.  By default, records are keyed
   * by category, level, and raw message template.
   */
  readonly key?: (record: LogRecord) => string;

  /**
   * Maximum number of keys tracked by the filter.  When the limit is reached,
   * the least recently used key is evicted.  Set to `null` to disable the cap.
   *
   * @default `1000`
   */
  readonly maxKeys?: number | null;

  /**
   * Summary logging options for suppressed records.
   */
  readonly summary?: ThrottlingFilterSummaryOptions;
}

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

interface ThrottlingBucket {
  windowStart: number;
  summaryStartTime: number;
  readonly acceptedAt: number[];
  acceptedAtHead: number;
  acceptedAtCount: number;
  allowed: number;
  suppressed: number;
  firstRecord: LogRecord;
  lastRecord: LogRecord;
  lastTime: number;
}

/**
 * Returns a stateful filter that rate-limits repeated log records.
 *
 * The default key treats records with the same category, level, and raw
 * message template as identical, ignoring substituted values.  If summary
 * logging is enabled, the filter logs summaries as a side effect when
 * suppression ends, when a suppressed key is evicted, or when the filter is
 * disposed.
 *
 * @param options Throttling options.
 * @returns A throttling filter.
 * @since 2.1.0
 */
export function getThrottlingFilter(
  options: ThrottlingFilterOptions,
): Filter & Disposable {
  validatePositiveInteger("limit", options.limit);
  validatePositiveNumber("windowMs", options.windowMs);
  if (options.maxKeys != null) {
    validatePositiveInteger("maxKeys", options.maxKeys);
  }

  const limit = options.limit;
  const windowMs = options.windowMs;
  const mode = options.mode ?? "fixed";
  const timeSource = options.timeSource ?? "clock";
  const clock = options.clock ?? Date.now;
  const getKey = options.key ?? getDefaultThrottlingKey;
  const maxKeys = options.maxKeys === undefined ? 1000 : options.maxKeys;
  const buckets = new Map<string, ThrottlingBucket>();
  const summaryRecord = Symbol("LogTape.throttlingSummaryRecord");
  let emittingSummary = false;

  if (mode !== "fixed" && mode !== "sliding") {
    throw new TypeError(`Invalid throttling mode: ${String(mode)}.`);
  }
  if (timeSource !== "clock" && timeSource !== "record") {
    throw new TypeError(
      `Invalid throttling timeSource: ${String(timeSource)}.`,
    );
  }

  const filter = ((record: LogRecord): boolean => {
    if (emittingSummary && isSummaryRecord(record)) {
      return true;
    }

    const now = timeSource === "record" ? record.timestamp : clock();
    const key = getKey(record);
    let bucket = buckets.get(key);

    if (bucket == null) {
      evictKeysIfNeeded(now);
      bucket = {
        windowStart: now,
        summaryStartTime: now,
        acceptedAt: [],
        acceptedAtHead: 0,
        acceptedAtCount: 0,
        allowed: 0,
        suppressed: 0,
        firstRecord: record,
        lastRecord: record,
        lastTime: now,
      };
      buckets.set(key, bucket);
    } else if (maxKeys != null) {
      buckets.delete(key);
      buckets.set(key, bucket);
    }

    if (mode === "fixed") {
      return filterFixedWindow(key, bucket, record, now);
    }
    return filterSlidingWindow(key, bucket, record, now);
  }) as Filter & Disposable;

  filter[Symbol.dispose] = () => {
    const endTime = clock();
    for (const [key, bucket] of buckets) {
      emitSummary(key, bucket, "dispose", endTime);
    }
    buckets.clear();
  };

  return filter;

  function filterFixedWindow(
    key: string,
    bucket: ThrottlingBucket,
    record: LogRecord,
    now: number,
  ): boolean {
    if (now - bucket.windowStart >= windowMs) {
      emitSummary(key, bucket, "window", now);
      bucket.windowStart = now;
      bucket.summaryStartTime = now;
      bucket.acceptedAtHead = 0;
      bucket.acceptedAtCount = 0;
      bucket.allowed = 0;
      bucket.suppressed = 0;
      bucket.firstRecord = record;
    }

    const allowed = bucket.allowed < limit;
    if (allowed) {
      bucket.allowed++;
    } else {
      bucket.suppressed++;
    }

    bucket.lastRecord = record;
    bucket.lastTime = now;
    return allowed;
  }

  function filterSlidingWindow(
    key: string,
    bucket: ThrottlingBucket,
    record: LogRecord,
    now: number,
  ): boolean {
    pruneExpiredAcceptedAt(bucket, now);

    const allowed = bucket.acceptedAtCount < limit;
    if (allowed) {
      if (bucket.suppressed > 0) {
        emitSummary(key, bucket, "window", now);
        bucket.allowed = 0;
        bucket.suppressed = 0;
        bucket.summaryStartTime = now;
        bucket.firstRecord = record;
      }
      pushAcceptedAt(bucket, now);
      bucket.allowed++;
    } else {
      bucket.suppressed++;
    }

    bucket.lastRecord = record;
    bucket.lastTime = now;
    return allowed;
  }

  function pruneExpiredAcceptedAt(
    bucket: ThrottlingBucket,
    now: number,
  ): void {
    while (bucket.acceptedAtCount > 0) {
      const acceptedAt = bucket.acceptedAt[bucket.acceptedAtHead];
      if (now - acceptedAt < windowMs) break;
      bucket.acceptedAtHead = (bucket.acceptedAtHead + 1) %
        bucket.acceptedAt.length;
      bucket.acceptedAtCount--;
    }
    if (bucket.acceptedAtCount < 1) {
      bucket.acceptedAtHead = 0;
    }
  }

  function pushAcceptedAt(bucket: ThrottlingBucket, acceptedAt: number): void {
    const index = bucket.acceptedAtCount < bucket.acceptedAt.length
      ? (bucket.acceptedAtHead + bucket.acceptedAtCount) %
        bucket.acceptedAt.length
      : bucket.acceptedAt.length < limit
      ? bucket.acceptedAt.length
      : bucket.acceptedAtHead;
    bucket.acceptedAt[index] = acceptedAt;
    bucket.acceptedAtCount++;
  }

  function evictKeysIfNeeded(now: number): void {
    if (maxKeys == null) return;
    while (buckets.size >= maxKeys) {
      const keyToEvict = buckets.keys().next().value;
      if (keyToEvict === undefined) return;
      const bucket = buckets.get(keyToEvict);
      if (bucket != null) {
        emitSummary(keyToEvict, bucket, "eviction", now);
        buckets.delete(keyToEvict);
      }
    }
  }

  function emitSummary(
    key: string,
    bucket: ThrottlingBucket,
    reason: ThrottlingFilterSummary["reason"],
    endTime: number,
  ): void {
    const summaryOptions = options.summary;
    if (summaryOptions == null || bucket.suppressed < 1) return;

    const summary: ThrottlingFilterSummary = {
      key,
      suppressed: bucket.suppressed,
      allowed: bucket.allowed,
      reason,
      startTime: bucket.summaryStartTime,
      endTime,
      firstRecord: bucket.firstRecord,
      lastRecord: bucket.lastRecord,
    };
    const level = typeof summaryOptions.level === "function"
      ? summaryOptions.level(summary)
      : summaryOptions.level ?? "warning";
    const message = typeof summaryOptions.message === "function"
      ? summaryOptions.message(summary)
      : summaryOptions.message ??
        "Last log message was suppressed {suppressed} times.";
    const log = summaryOptions.logger[level];
    if (typeof log !== "function") return;
    const properties = {
      key: summary.key,
      suppressed: summary.suppressed,
      allowed: summary.allowed,
      reason: summary.reason,
      startTime: summary.startTime,
      endTime: summary.endTime,
      firstRecord: summary.firstRecord,
      lastRecord: summary.lastRecord,
      [summaryRecord]: true,
    } as Record<string, unknown> & Record<typeof summaryRecord, true>;

    emittingSummary = true;
    try {
      log.call(summaryOptions.logger, message, properties);
    } finally {
      emittingSummary = false;
    }
  }

  function isSummaryRecord(record: LogRecord): boolean {
    const properties = record.properties;
    return properties != null &&
      typeof properties === "object" &&
      (properties as Record<typeof summaryRecord, unknown>)[summaryRecord] ===
        true;
  }
}

function validatePositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}

function validatePositiveNumber(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number.`);
  }
}

function getDefaultThrottlingKey(record: LogRecord): string {
  const categoryKey = encodeKeyParts(record.category);
  const rawMessage = getRawMessageTemplate(record.rawMessage);
  const rawMessageKey = typeof rawMessage === "string"
    ? `s${encodeKeyPart(rawMessage)}`
    : `t${encodeKeyParts(rawMessage)}`;
  return `c${categoryKey}l${encodeKeyPart(record.level)}r${rawMessageKey}`;
}

function getRawMessageTemplate(
  rawMessage: string | TemplateStringsArray,
): string | readonly string[] {
  if (typeof rawMessage === "string") return rawMessage;
  for (const part of rawMessage) {
    if (typeof part !== "string") return rawMessage.raw;
  }
  return rawMessage;
}

function encodeKeyParts(parts: readonly string[]): string {
  let key = `${parts.length}:`;
  for (const part of parts) key += encodeKeyPart(part);
  return key;
}

function encodeKeyPart(part: string): string {
  return `${part.length}:${part}`;
}
