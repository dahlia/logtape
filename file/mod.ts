export { getFileSink, getRotatingFileSink } from "#filesink";
export type {
  FileSinkDriver,
  FileSinkOptions,
  RotatingFileSinkDriver,
  RotatingFileSinkOptions,
} from "./filesink.base.ts";

// Runtime-specific exports for workersink
// Note: These will resolve differently based on the runtime's import map
export { getWorkerFileSink } from "#workersink";
export type { WorkerFileSinkOptions } from "#workersink";
