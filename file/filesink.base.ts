import {
  defaultTextFormatter,
  type LogRecord,
  type Sink,
  type StreamSinkOptions,
} from "@logtape/logtape";

/**
 * Options for the {@link getBaseFileSink} function.
 */
export type FileSinkOptions = StreamSinkOptions & {
  /**
   * If `true`, the file is not opened until the first write.  Defaults to `false`.
   */
  lazy?: boolean;
};

/**
 * A platform-specific file sink driver.
 * @typeParam TFile The type of the file descriptor.
 */
export interface FileSinkDriver<TFile> {
  /**
   * Open a file for appending and return a file descriptor.
   * @param path A path to the file to open.
   */
  openSync(path: string): TFile;

  /**
   * Write a chunk of data to the file.
   * @param fd The file descriptor.
   * @param chunk The data to write.
   */
  writeSync(fd: TFile, chunk: Uint8Array): void;

  /**
   * Flush the file to ensure that all data is written to the disk.
   * @param fd The file descriptor.
   */
  flushSync(fd: TFile): void;

  /**
   * Close the file.
   * @param fd The file descriptor.
   */
  closeSync(fd: TFile): void;
}

/**
 * Get a platform-independent file sink.
 *
 * @typeParam TFile The type of the file descriptor.
 * @param path A path to the file to write to.
 * @param options The options for the sink and the file driver.
 * @returns A sink that writes to the file.  The sink is also a disposable
 *          object that closes the file when disposed.
 */
export function getBaseFileSink<TFile>(
  path: string,
  options: FileSinkOptions & FileSinkDriver<TFile>,
): Sink & Disposable {
  const formatter = options.formatter ?? defaultTextFormatter;
  const encoder = options.encoder ?? new TextEncoder();
  let fd = options.lazy ? null : options.openSync(path);
  const sink: Sink & Disposable = (record: LogRecord) => {
    if (fd === null) {
      fd = options.openSync(path);
    }
    options.writeSync(fd, encoder.encode(formatter(record)));
    options.flushSync(fd);
  };
  sink[Symbol.dispose] = () => {
    if (fd !== null) {
      options.closeSync(fd);
    }
  };
  return sink;
}

/**
 * Options for the {@link getBaseRotatingFileSink} function.
 */
export interface RotatingFileSinkOptions extends Omit<FileSinkOptions, "lazy"> {
  /**
   * The maximum bytes of the file before it is rotated.  1 MiB by default.
   */
  maxSize?: number;

  /**
   * The maximum number of files to keep.  5 by default.
   */
  maxFiles?: number;
}

/**
 * A platform-specific rotating file sink driver.
 */
export interface RotatingFileSinkDriver<TFile> extends FileSinkDriver<TFile> {
  /**
   * Get the size of the file.
   * @param path A path to the file.
   * @returns The `size` of the file in bytes, in an object.
   */
  statSync(path: string): { size: number };

  /**
   * Rename a file.
   * @param oldPath A path to the file to rename.
   * @param newPath A path to be renamed to.
   */
  renameSync(oldPath: string, newPath: string): void;
}

/**
 * Get a platform-independent rotating file sink.
 *
 * This sink writes log records to a file, and rotates the file when it reaches
 * the `maxSize`.  The rotated files are named with the original file name
 * followed by a dot and a number, starting from 1.  The number is incremented
 * for each rotation, and the maximum number of files to keep is `maxFiles`.
 *
 * @param path A path to the file to write to.
 * @param options The options for the sink and the file driver.
 * @returns A sink that writes to the file.  The sink is also a disposable
 *          object that closes the file when disposed.
 */
export function getBaseRotatingFileSink<TFile>(
  path: string,
  options: RotatingFileSinkOptions & RotatingFileSinkDriver<TFile>,
): Sink & Disposable {
  const formatter = options.formatter ?? defaultTextFormatter;
  const encoder = options.encoder ?? new TextEncoder();
  const maxSize = options.maxSize ?? 1024 * 1024;
  const maxFiles = options.maxFiles ?? 5;
  let offset: number = 0;
  try {
    const stat = options.statSync(path);
    offset = stat.size;
  } catch {
    // Continue as the offset is already 0.
  }
  let fd = options.openSync(path);
  function shouldRollover(bytes: Uint8Array): boolean {
    return offset + bytes.length > maxSize;
  }
  function performRollover(): void {
    options.closeSync(fd);
    for (let i = maxFiles - 1; i > 0; i--) {
      const oldPath = `${path}.${i}`;
      const newPath = `${path}.${i + 1}`;
      try {
        options.renameSync(oldPath, newPath);
      } catch (_) {
        // Continue if the file does not exist.
      }
    }
    options.renameSync(path, `${path}.1`);
    offset = 0;
    fd = options.openSync(path);
  }
  const sink: Sink & Disposable = (record: LogRecord) => {
    const bytes = encoder.encode(formatter(record));
    if (shouldRollover(bytes)) performRollover();
    options.writeSync(fd, bytes);
    options.flushSync(fd);
    offset += bytes.length;
  };
  sink[Symbol.dispose] = () => options.closeSync(fd);
  return sink;
}
