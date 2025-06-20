/**
 * Auto-installation module for @logtape/adaptor-winston.
 *
 * This module automatically configures LogTape to route all log records
 * to winston's default logger when imported. This provides the simplest
 * possible integration - just import this module and all LogTape-enabled
 * libraries will immediately start logging through winston.
 *
 * @example Automatic installation via import
 * ```typescript
 * // Simply import this module to automatically set up winston adapter
 * import "@logtape/adaptor-winston/install";
 *
 * // Now all LogTape logs will be routed to winston's default logger
 * import { getLogger } from "@logtape/logtape";
 * const logger = getLogger("my-app");
 * logger.info("This will be logged through winston");
 * ```
 *
 * @example Usage in package.json scripts
 * ```json
 * {
 *   "scripts": {
 *     "start": "node -r @logtape/adaptor-winston/install app.js"
 *   }
 * }
 * ```
 *
 * @example Usage with module bundlers
 * ```typescript
 * // webpack.config.js or similar
 * module.exports = {
 *   entry: [
 *     '@logtape/adaptor-winston/install',
 *     './src/index.js'
 *   ]
 * };
 * ```
 *
 * > [!NOTE]
 * > This module uses winston's default logger with default configuration.
 * > If you need a custom winston logger or configuration options (category
 * > formatting, level mapping, etc.), use the `install()` function from the
 * > main module instead:
 *
 * @example Custom winston logger
 * ```typescript
 * import winston from "winston";
 * import { install } from "@logtape/adaptor-winston";
 *
 * const customLogger = winston.createLogger({
 *   transports: [new winston.transports.File({ filename: "app.log" })]
 * });
 *
 * install(customLogger);
 * ```
 *
 * @example Custom configuration options
 * ```typescript
 * import { install } from "@logtape/adaptor-winston";
 *
 * install({
 *   category: { position: "start", decorator: "[]" }
 * });
 * ```
 *
 * @example Custom logger with custom options
 * ```typescript
 * import winston from "winston";
 * import { install } from "@logtape/adaptor-winston";
 *
 * const customLogger = winston.createLogger({
 *   transports: [new winston.transports.Console()]
 * });
 *
 * install(customLogger, {
 *   category: { position: "start", decorator: "[]" }
 * });
 * ```
 *
 * @module
 * @since 1.0.0
 */

import { install } from "./mod.ts";

install();
