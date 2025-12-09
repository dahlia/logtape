import type { LogRecord } from "@logtape/logtape";

/**
 * Formats a log record message into a string suitable for Windows Event Log.
 * Combines the template and arguments into a readable message.
 */
function formatMessage(record: LogRecord): string {
  let message = "";

  // Combine template parts with arguments
  for (let i = 0; i < record.message.length; i++) {
    if (i % 2 === 0) {
      // Template part
      message += record.message[i];
    } else {
      // Argument - serialize it
      const arg = record.message[i];
      if (typeof arg === "string") {
        message += arg;
      } else {
        message += JSON.stringify(arg);
      }
    }
  }

  return message;
}

/**
 * Formats additional context information for the log entry.
 * Includes category, properties, and other metadata.
 */
function formatContext(record: LogRecord): string {
  const context: string[] = [];

  // Add category if present
  if (record.category && record.category.length > 0) {
    context.push(`Category: ${record.category.join(".")}`);
  }

  // Add properties if present
  if (record.properties && Object.keys(record.properties).length > 0) {
    context.push(`Properties: ${JSON.stringify(record.properties)}`);
  }

  // Add timestamp
  context.push(`Timestamp: ${new Date(record.timestamp).toISOString()}`);

  return context.length > 0 ? `\n\n${context.join("\n")}` : "";
}

/**
 * Default way of rendering a record into text that goes in the event log.
 */
export function defaultWindowsEventlogFormatter(record: LogRecord): string {
  const msg = formatMessage(record);
  const ctx = formatContext(record);
  return msg + ctx;
}
