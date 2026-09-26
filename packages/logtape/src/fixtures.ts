import type { LogRecord } from "./record.ts";

export const info: LogRecord = {
  level: "info",
  category: ["my-app", "junk"],
  message: ["Hello, ", 123, " & ", 456, "!"],
  rawMessage: "Hello, {a} & {b}!",
  timestamp: 1700000000000,
  properties: {},
};

export const trace: LogRecord = {
  ...info,
  level: "trace",
};

export const debug: LogRecord = {
  ...info,
  level: "debug",
};

export const warning: LogRecord = {
  ...info,
  level: "warning",
};

export const error: LogRecord = {
  ...info,
  level: "error",
};

export const fatal: LogRecord = {
  ...info,
  level: "fatal",
};

/**
 * The traces that building a log record leaves behind.
 */
export interface RecordWork {
  /**
   * The number of timestamps taken with `Date.now()`.  Every log record gets
   * one when it is built.
   */
  readonly timestamps: number;

  /**
   * The number of objects copied with `Object.getOwnPropertyDescriptors()`,
   * which is how records are rebuilt for category prefixes and snapshots.
   */
  readonly descriptorCopies: number;
}

/**
 * Runs the given callback synchronously and counts the work it does toward
 * building log records.  A log call that is certainly dropped should do none
 * of it; see dahlia/logtape#227 for what happens otherwise.
 * @param callback The callback to run.
 * @returns The work done while the callback ran.
 */
export function countRecordWork(callback: () => void): RecordWork {
  const now = Date.now;
  const getOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
  let timestamps = 0;
  let descriptorCopies = 0;
  Date.now = () => {
    timestamps++;
    return now.call(Date);
  };
  Object.getOwnPropertyDescriptors = ((object: object) => {
    descriptorCopies++;
    return getOwnPropertyDescriptors(object);
  }) as typeof Object.getOwnPropertyDescriptors;
  try {
    callback();
  } finally {
    Date.now = now;
    Object.getOwnPropertyDescriptors = getOwnPropertyDescriptors;
  }
  return { timestamps, descriptorCopies };
}
