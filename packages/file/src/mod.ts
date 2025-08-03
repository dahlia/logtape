export type {
  FileSinkDriver,
  FileSinkOptions,
  RotatingFileSinkDriver,
  RotatingFileSinkOptions,
} from "./filesink.base.ts";
export type { StreamFileSinkOptions } from "./streamfilesink.ts";
export { getFileSink, getRotatingFileSink } from "#filesink";
export { getStreamFileSink } from "./streamfilesink.ts";
