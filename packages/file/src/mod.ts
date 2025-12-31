export type {
  FileSinkDriver,
  FileSinkOptions,
  RotatingFileSinkDriver,
  RotatingFileSinkOptions,
} from "./filesink.base.ts";
export type { StreamFileSinkOptions } from "./streamfilesink.ts";
export type {
  TimeRotatingFileSinkOptions,
  TimeRotationInterval,
} from "./timefilesink.ts";
export {
  getFileSink,
  getRotatingFileSink,
  getTimeRotatingFileSink,
} from "#filesink";
export { getStreamFileSink } from "./streamfilesink.ts";
