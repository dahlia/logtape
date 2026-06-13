import type { Sink } from "@logtape/logtape";

const immediateSinkSymbol = Symbol.for(
  "LogTape.sinkSnapshotPolicy.immediate",
);

export function markSinkAsImmediate<T extends Sink>(sink: T): T {
  Object.defineProperty(sink, immediateSinkSymbol, {
    value: true,
  });
  return sink;
}
