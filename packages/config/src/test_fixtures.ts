import type { LogRecord, Sink } from "@logtape/logtape";

export const logs: LogRecord[] = [];

export function resetLogs() {
  logs.length = 0;
}

export function getSpySink(): Sink {
  return (record: LogRecord) => {
    logs.push(record);
  };
}

export const directSink: Sink = (record: LogRecord) => {
  logs.push(record);
};
