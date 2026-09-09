import { join } from "node:path";
import { getBaseFileSink, getBaseRotatingFileSink } from "./filesink.base.ts";
import { createFileSinks } from "./filesink.factory.node.ts";
import { getBaseTimeRotatingFileSink } from "./timefilesink.ts";

export const {
  getFileSink,
  getRotatingFileSink,
  getTimeRotatingFileSink,
  driver: nodeDriver,
  asyncDriver: nodeAsyncDriver,
  timeDriver: nodeTimeDriver,
  asyncTimeDriver: nodeAsyncTimeDriver,
} = createFileSinks({
  getBaseFileSink,
  getBaseRotatingFileSink,
  getBaseTimeRotatingFileSink,
  join,
});
