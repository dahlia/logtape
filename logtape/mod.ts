export {
  type Config,
  ConfigError,
  configure,
  dispose,
  getConfig,
  type LoggerConfig,
  reset,
} from "./config.ts";
export {
  type Filter,
  type FilterLike,
  getLevelFilter,
  toFilter,
} from "./filter.ts";
export {
  type ConsoleFormatter,
  defaultConsoleFormatter,
  defaultTextFormatter,
  type TextFormatter,
} from "./formatter.ts";
export { isLogLevel, type LogLevel, parseLogLevel } from "./level.ts";
export { getLogger, type Logger } from "./logger.ts";
export type { LogRecord } from "./record.ts";
export {
  type ConsoleSinkOptions,
  type FileSinkOptions,
  getConsoleSink,
  getStreamSink,
  type RotatingFileSinkOptions,
  type Sink,
  type StreamSinkOptions,
  withFilter,
} from "./sink.ts";

const filesink: Omit<typeof import("./filesink.deno.ts"), "denoDriver"> =
  await ("Deno" in globalThis
    ? import("./filesink.deno.ts")
    : import("./filesink.node.ts"));

export const getFileSink = filesink.getFileSink;
export const getRotatingFileSink = filesink.getRotatingFileSink;

// cSpell: ignore filesink
