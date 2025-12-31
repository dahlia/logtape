import {
  defaultTextFormatter,
  type LogRecord,
  type Sink,
} from "@logtape/logtape";
import type {
  AsyncFileSinkDriver,
  FileSinkDriver,
  FileSinkOptions,
} from "./filesink.base.ts";

/**
 * The rotation interval for time-based file sinks.
 */
export type TimeRotationInterval = "hourly" | "daily" | "weekly";

/**
 * Options for the {@link getBaseTimeRotatingFileSink} function.
 */
export interface TimeRotatingFileSinkOptions
  extends Omit<FileSinkOptions, "lazy"> {
  /**
   * The directory to write log files to.
   */
  directory: string;

  /**
   * A function that generates the filename for the log file based on the date.
   * Default depends on `interval`:
   * - `"daily"`: `YYYY-MM-DD.log` (e.g., `2025-01-15.log`)
   * - `"hourly"`: `YYYY-MM-DD-HH.log` (e.g., `2025-01-15-09.log`)
   * - `"weekly"`: `YYYY-WW.log` (e.g., `2025-W03.log`)
   */
  filename?: (date: Date) => string;

  /**
   * The rotation interval.  Defaults to `"daily"`.
   */
  interval?: TimeRotationInterval;

  /**
   * The maximum age of log files in milliseconds.  Files older than this
   * will be deleted.  If not specified, old files are not deleted.
   */
  maxAgeMs?: number;
}

/**
 * A platform-specific time-rotating file sink driver.
 */
export interface TimeRotatingFileSinkDriver<TFile>
  extends FileSinkDriver<TFile> {
  /**
   * Read the contents of a directory.
   * @param path A path to the directory.
   * @returns An array of filenames in the directory.
   */
  readdirSync(path: string): string[];

  /**
   * Delete a file.
   * @param path A path to the file to delete.
   */
  unlinkSync(path: string): void;

  /**
   * Create a directory if it doesn't exist.
   * @param path A path to the directory to create.
   * @param options Options for directory creation.
   */
  mkdirSync(path: string, options?: { recursive?: boolean }): void;

  /**
   * Join path segments.
   * @param paths Path segments to join.
   * @returns The joined path.
   */
  joinPath(...paths: string[]): string;
}

/**
 * A platform-specific async time-rotating file sink driver.
 * @since 1.4.0
 */
export interface AsyncTimeRotatingFileSinkDriver<TFile>
  extends AsyncFileSinkDriver<TFile> {
  /**
   * Read the contents of a directory.
   * @param path A path to the directory.
   * @returns An array of filenames in the directory.
   */
  readdirSync(path: string): string[];

  /**
   * Delete a file.
   * @param path A path to the file to delete.
   */
  unlinkSync(path: string): void;

  /**
   * Create a directory if it doesn't exist.
   * @param path A path to the directory to create.
   * @param options Options for directory creation.
   */
  mkdirSync(path: string, options?: { recursive?: boolean }): void;

  /**
   * Join path segments.
   * @param paths Path segments to join.
   * @returns The joined path.
   */
  joinPath(...paths: string[]): string;
}

/**
 * Get the ISO week number of a date.
 * @param date The date to get the week number of.
 * @returns The ISO week number (1-53).
 */
export function getISOWeek(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Get the ISO week year of a date.  This may differ from the calendar year
 * for dates near the start or end of a year.
 * @param date The date to get the ISO week year of.
 * @returns The ISO week year.
 */
export function getISOWeekYear(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  return d.getUTCFullYear();
}

/**
 * Get the default filename generator for the given interval.
 * @param interval The rotation interval.
 * @returns A function that generates a filename for a given date.
 */
export function getDefaultFilename(
  interval: TimeRotationInterval,
): (date: Date) => string {
  switch (interval) {
    case "hourly":
      return (date: Date): string => {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        const hh = String(date.getHours()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}-${hh}.log`;
      };
    case "daily":
      return (date: Date): string => {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}.log`;
      };
    case "weekly":
      return (date: Date): string => {
        const yyyy = getISOWeekYear(date);
        const week = getISOWeek(date);
        return `${yyyy}-W${String(week).padStart(2, "0")}.log`;
      };
  }
}

/**
 * Get the rotation key for the given date and interval.
 * The key is used to determine when to rotate to a new file.
 * @param date The date to get the rotation key of.
 * @param interval The rotation interval.
 * @returns A string key that changes when rotation should occur.
 */
function getRotationKey(date: Date, interval: TimeRotationInterval): string {
  switch (interval) {
    case "hourly":
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
    case "daily":
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    case "weekly":
      return `${getISOWeekYear(date)}-${getISOWeek(date)}`;
  }
}

/**
 * Get a platform-independent time-rotating file sink.
 *
 * This sink writes log records to a file in a directory, rotating to a new
 * file based on time intervals.  The filename is generated based on the
 * current date/time and the configured interval.
 *
 * @template TFile The type of the file descriptor.
 * @param options The options for the sink and the file driver.
 * @returns A sink that writes to the file.  The sink is also a disposable
 *          object that closes the file when disposed.  If `nonBlocking` is
 *          enabled, returns a sink that also implements {@link AsyncDisposable}.
 */
export function getBaseTimeRotatingFileSink<TFile>(
  options: TimeRotatingFileSinkOptions & TimeRotatingFileSinkDriver<TFile>,
): Sink & Disposable;
export function getBaseTimeRotatingFileSink<TFile>(
  options: TimeRotatingFileSinkOptions & AsyncTimeRotatingFileSinkDriver<TFile>,
): Sink & AsyncDisposable;
export function getBaseTimeRotatingFileSink<TFile>(
  options:
    & TimeRotatingFileSinkOptions
    & (
      | TimeRotatingFileSinkDriver<TFile>
      | AsyncTimeRotatingFileSinkDriver<TFile>
    ),
): Sink & (Disposable | AsyncDisposable) {
  const formatter = options.formatter ?? defaultTextFormatter;
  const encoder = options.encoder ?? new TextEncoder();
  const interval = options.interval ?? "daily";
  const filenameGenerator = options.filename ?? getDefaultFilename(interval);
  const maxAgeMs = options.maxAgeMs;
  const bufferSize = options.bufferSize ?? 1024 * 8;
  const flushInterval = options.flushInterval ?? 5000;
  const directory = options.directory;

  // Ensure directory exists
  try {
    options.mkdirSync(directory, { recursive: true });
  } catch {
    // Directory might already exist
  }

  let currentFilename: string = filenameGenerator(new Date());
  let currentPath: string = options.joinPath(directory, currentFilename);
  let currentRotationKey: string = getRotationKey(new Date(), interval);
  let fd: TFile = options.openSync(currentPath);
  let lastFlushTimestamp: number = Date.now();
  let buffer: string = "";

  function shouldRotate(): boolean {
    const now = new Date();
    const newKey = getRotationKey(now, interval);
    return newKey !== currentRotationKey;
  }

  function performRotation(): void {
    options.closeSync(fd);
    const now = new Date();
    currentFilename = filenameGenerator(now);
    currentPath = options.joinPath(directory, currentFilename);
    currentRotationKey = getRotationKey(now, interval);
    fd = options.openSync(currentPath);
  }

  function cleanupOldFiles(): void {
    if (maxAgeMs === undefined) return;

    const now = Date.now();
    let files: string[];
    try {
      files = options.readdirSync(directory);
    } catch {
      return;
    }

    for (const file of files) {
      if (!file.endsWith(".log")) continue;
      if (file === currentFilename) continue;

      const filePath = options.joinPath(directory, file);

      // Try to parse the date from the filename
      const dateMatch = file.match(
        /^(\d{4})-(\d{2})-(\d{2})(?:-(\d{2}))?\.log$/,
      );
      const weekMatch = file.match(/^(\d{4})-W(\d{2})\.log$/);

      let fileDate: Date | null = null;

      if (dateMatch) {
        const [, year, month, day, hour] = dateMatch;
        fileDate = new Date(
          parseInt(year!, 10),
          parseInt(month!, 10) - 1,
          parseInt(day!, 10),
          hour ? parseInt(hour, 10) : 0,
        );
      } else if (weekMatch) {
        const [, year, week] = weekMatch;
        // Get the date of the first day of the week
        const jan4 = new Date(parseInt(year!, 10), 0, 4);
        const dayOfWeek = jan4.getDay() || 7;
        fileDate = new Date(jan4);
        fileDate.setDate(
          jan4.getDate() - dayOfWeek + 1 + (parseInt(week!, 10) - 1) * 7,
        );
      }

      if (fileDate && now - fileDate.getTime() > maxAgeMs) {
        try {
          options.unlinkSync(filePath);
        } catch {
          // Ignore errors when deleting files
        }
      }
    }
  }

  if (!options.nonBlocking) {
    // Blocking mode implementation
    // deno-lint-ignore no-inner-declarations
    function flushBuffer(): void {
      if (buffer.length > 0) {
        if (shouldRotate()) {
          performRotation();
        }
        const bytes = encoder.encode(buffer);
        buffer = "";
        options.writeSync(fd, bytes);
        options.flushSync(fd);
        lastFlushTimestamp = Date.now();
        cleanupOldFiles();
      }
    }

    const sink: Sink & Disposable = (record: LogRecord) => {
      buffer += formatter(record);

      const shouldFlushBySize = buffer.length >= bufferSize;
      const shouldFlushByTime = flushInterval > 0 &&
        (record.timestamp - lastFlushTimestamp) >= flushInterval;

      if (shouldFlushBySize || shouldFlushByTime) {
        flushBuffer();
      }
    };

    sink[Symbol.dispose] = () => {
      flushBuffer();
      options.closeSync(fd);
    };

    return sink;
  }

  // Non-blocking mode implementation
  const asyncOptions = options as AsyncTimeRotatingFileSinkDriver<TFile>;
  let disposed = false;
  let activeFlush: Promise<void> | null = null;
  let flushTimer: ReturnType<typeof setInterval> | null = null;

  async function flushBuffer(): Promise<void> {
    if (buffer.length === 0) return;

    if (shouldRotate()) {
      performRotation();
    }

    const data = buffer;
    buffer = "";
    try {
      const bytes = encoder.encode(data);
      asyncOptions.writeSync(fd, bytes);
      await asyncOptions.flush(fd);
      lastFlushTimestamp = Date.now();
      cleanupOldFiles();
    } catch {
      // Silently ignore errors in non-blocking mode
    }
  }

  function scheduleFlush(): void {
    if (activeFlush || disposed) return;

    activeFlush = flushBuffer().finally(() => {
      activeFlush = null;
    });
  }

  function startFlushTimer(): void {
    if (flushTimer !== null || disposed) return;

    flushTimer = setInterval(() => {
      scheduleFlush();
    }, flushInterval);
  }

  const nonBlockingSink: Sink & AsyncDisposable = (record: LogRecord) => {
    if (disposed) return;
    buffer += formatter(record);

    const shouldFlushBySize = buffer.length >= bufferSize;
    const shouldFlushByTime = flushInterval > 0 &&
      (record.timestamp - lastFlushTimestamp) >= flushInterval;

    if (shouldFlushBySize || shouldFlushByTime) {
      scheduleFlush();
    } else if (flushTimer === null && flushInterval > 0) {
      startFlushTimer();
    }
  };

  nonBlockingSink[Symbol.asyncDispose] = async () => {
    disposed = true;
    if (flushTimer !== null) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    await flushBuffer();
    try {
      await asyncOptions.close(fd);
    } catch {
      // Writer might already be closed or errored
    }
  };

  return nonBlockingSink;
}
