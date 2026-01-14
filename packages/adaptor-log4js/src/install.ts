/**
 * Auto-installation module for @logtape/adaptor-log4js.
 *
 * This module automatically configures LogTape to route all log records
 * to log4js when imported. This provides the simplest possible integration -
 * just import this module after configuring log4js and all LogTape-enabled
 * libraries will immediately start logging through log4js.
 *
 * > [!NOTE]
 * > You must configure log4js before importing this module. This module
 * > uses log4js.getLogger() to get loggers for each LogTape category, so
 * > log4js must already be set up with appenders and categories.
 *
 * @example Automatic installation via import
 * ```typescript
 * import log4js from "log4js";
 *
 * // Configure log4js first
 * log4js.configure({
 *   appenders: { out: { type: "stdout" } },
 *   categories: { default: { appenders: ["out"], level: "info" } }
 * });
 *
 * // Simply import this module to automatically set up log4js adapter
 * import "@logtape/adaptor-log4js/install";
 *
 * // Now all LogTape logs will be routed to log4js
 * import { getLogger } from "@logtape/logtape";
 * const logger = getLogger("my-app");
 * logger.info("This will be logged through log4js");
 * ```
 *
 * @example Usage in package.json scripts
 * ```json
 * {
 *   "scripts": {
 *     "start": "node -r @logtape/adaptor-log4js/install app.js"
 *   }
 * }
 * ```
 *
 * @example Usage with module bundlers
 * ```typescript
 * // webpack.config.js or similar
 * module.exports = {
 *   entry: [
 *     '@logtape/adaptor-log4js/install',
 *     './src/index.js'
 *   ]
 * };
 * ```
 *
 * > [!NOTE]
 * > This module uses the default log4js configuration. If you need a custom
 * > log4js logger or configuration options (category mapping, context strategy,
 * > etc.), use the `install()` function from the main module instead:
 *
 * @example Custom log4js logger
 * ```typescript
 * import log4js from "log4js";
 * import { install } from "@logtape/adaptor-log4js";
 *
 * const customLogger = log4js.getLogger("myapp");
 * install(log4js, customLogger);
 * ```
 *
 * @example Custom configuration options
 * ```typescript
 * import log4js from "log4js";
 * import { install } from "@logtape/adaptor-log4js";
 *
 * install(log4js, undefined, {
 *   categoryMapper: (cat) => cat.join("::"),
 *   contextStrategy: "args"
 * });
 * ```
 *
 * @module
 * @since 2.0.0
 */

import log4js from "log4js";
import { install } from "./mod.ts";

install(log4js);
