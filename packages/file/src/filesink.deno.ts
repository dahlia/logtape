import { join } from "@std/path/join";
import { getBaseFileSink, getBaseRotatingFileSink } from "./filesink.base.ts";
import { createFileSinks } from "./filesink.factory.deno.ts";
import { getBaseTimeRotatingFileSink } from "./timefilesink.ts";

export const {
  getFileSink,
  getRotatingFileSink,
  getTimeRotatingFileSink,
  driver: denoDriver,
  asyncDriver: denoAsyncDriver,
  timeDriver: denoTimeDriver,
  asyncTimeDriver: denoAsyncTimeDriver,
} = createFileSinks({
  getBaseFileSink,
  getBaseRotatingFileSink,
  getBaseTimeRotatingFileSink,
  join,
});
