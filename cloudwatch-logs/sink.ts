import {
  CloudWatchLogsClient,
  CreateLogStreamCommand,
  type InputLogEvent,
  PutLogEventsCommand,
  ResourceAlreadyExistsException,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  getLogger,
  type LogRecord,
  type Sink,
  type TextFormatter,
} from "@logtape/logtape";
import type { CloudWatchLogsSinkOptions } from "./types.ts";

// AWS CloudWatch Logs PutLogEvents API limits
// See: https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/cloudwatch_limits_cwl.html
const MAX_BATCH_SIZE_EVENTS = 10000; // Maximum 10,000 events per batch
const MAX_BATCH_SIZE_BYTES = 1048576; // Maximum batch size: 1 MiB (1,048,576 bytes)
const OVERHEAD_PER_EVENT = 26; // AWS overhead per log event: 26 bytes per event

/**
 * Resolves the log stream name from template.
 * @param logStreamNameTemplate Template for generating stream names
 * @returns Resolved log stream name
 */
function resolveLogStreamName(
  logStreamNameTemplate: string,
): string {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  const timestamp = now.getTime().toString();

  return logStreamNameTemplate
    .replace(/\{YYYY\}/g, year)
    .replace(/\{MM\}/g, month)
    .replace(/\{DD\}/g, day)
    .replace(/\{YYYY-MM-DD\}/g, `${year}-${month}-${day}`)
    .replace(/\{timestamp\}/g, timestamp);
}

/**
 * Ensures that the log stream exists, creating it if necessary.
 * @param client CloudWatch Logs client
 * @param logGroupName Log group name
 * @param logStreamName Log stream name
 * @param createdStreams Set to track already created streams
 */
async function ensureLogStreamExists(
  client: CloudWatchLogsClient,
  logGroupName: string,
  logStreamName: string,
  createdStreams: Set<string>,
): Promise<void> {
  const streamKey = `${logGroupName}/${logStreamName}`;

  // If we've already created this stream, skip
  if (createdStreams.has(streamKey)) {
    return;
  }

  try {
    const command = new CreateLogStreamCommand({
      logGroupName,
      logStreamName,
    });

    await client.send(command);
    createdStreams.add(streamKey);
  } catch (error) {
    if (error instanceof ResourceAlreadyExistsException) {
      // Stream already exists, this is fine
      createdStreams.add(streamKey);
    } else {
      // Log stream creation failure to meta logger
      const metaLogger = getLogger(["logtape", "meta", "cloudwatch-logs"]);
      metaLogger.error(
        "Failed to create log stream {logStreamName} in group {logGroupName}: {error}",
        { logStreamName, logGroupName, error },
      );
      // Re-throw other errors
      throw error;
    }
  }
}

/**
 * Gets a CloudWatch Logs sink that sends log records to AWS CloudWatch Logs.
 *
 * @param options Configuration options for the CloudWatch Logs sink.
 * @returns A sink that sends log records to CloudWatch Logs.
 * @since 1.0.0
 */
export function getCloudWatchLogsSink(
  options: CloudWatchLogsSinkOptions,
): Sink & AsyncDisposable {
  const client = options.client ??
    new CloudWatchLogsClient({
      region: options.region ?? "us-east-1",
      credentials: options.credentials,
    });

  const batchSize = Math.min(
    Math.max(options.batchSize ?? 1000, 1),
    MAX_BATCH_SIZE_EVENTS,
  );
  const flushInterval = options.flushInterval ?? 1000;
  const maxRetries = Math.max(options.maxRetries ?? 3, 0);
  const retryDelay = Math.max(options.retryDelay ?? 100, 0);

  // Resolve the log stream name
  const logStreamName =
    options.autoCreateLogStream && "logStreamNameTemplate" in options
      ? resolveLogStreamName(options.logStreamNameTemplate)
      : options.logStreamName;

  // Track created streams to avoid redundant API calls
  const createdStreams = new Set<string>();

  // Default formatter that formats message parts into a simple string
  const defaultFormatter: TextFormatter = (record) => {
    let result = "";
    for (let i = 0; i < record.message.length; i++) {
      if (i % 2 === 0) {
        result += record.message[i];
      } else {
        result += JSON.stringify(record.message[i]);
      }
    }
    return result;
  };

  const formatter = options.formatter ?? defaultFormatter;

  const logEvents: InputLogEvent[] = [];
  let currentBatchSize = 0;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let flushPromise: Promise<void> | null = null;

  function scheduleFlush(): void {
    if (flushInterval <= 0 || flushTimer !== null) return;

    flushTimer = setTimeout(() => {
      flushTimer = null;
      if (logEvents.length > 0) {
        void flushEvents();
      }
    }, flushInterval);
  }

  async function flushEvents(): Promise<void> {
    if (logEvents.length === 0 || disposed) return;

    // If there's already a flush in progress, wait for it
    if (flushPromise !== null) {
      await flushPromise;
      return;
    }

    // Start a new flush operation
    flushPromise = doFlush();
    await flushPromise;
    flushPromise = null;
  }

  async function doFlush(): Promise<void> {
    if (logEvents.length === 0 || disposed) return;

    const events = logEvents.splice(0);
    currentBatchSize = 0;

    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    // Auto-create log stream if enabled (only once per stream)
    if (options.autoCreateLogStream) {
      await ensureLogStreamExists(
        client,
        options.logGroupName,
        logStreamName,
        createdStreams,
      );
    }

    await sendEventsWithRetry(events, maxRetries);
  }

  async function sendEventsWithRetry(
    events: InputLogEvent[],
    remainingRetries: number,
  ): Promise<void> {
    try {
      const command = new PutLogEventsCommand({
        logGroupName: options.logGroupName,
        logStreamName: logStreamName,
        logEvents: events,
      });

      await client.send(command);
    } catch (error) {
      if (remainingRetries > 0) {
        // Calculate exponential backoff: base, base*2, base*4, etc.
        const attemptNumber = maxRetries - remainingRetries;
        const delay = retryDelay * Math.pow(2, attemptNumber);
        await new Promise((resolve) => setTimeout(resolve, delay));
        await sendEventsWithRetry(events, remainingRetries - 1);
      } else {
        // Log to meta logger to avoid crashing the application
        const metaLogger = getLogger(["logtape", "meta", "cloudwatch-logs"]);
        metaLogger.error(
          "Failed to send log events to CloudWatch Logs after {maxRetries} retries: {error}",
          { maxRetries, error },
        );
      }
    }
  }

  function formatLogMessage(record: LogRecord): string {
    return formatter(record);
  }

  const sink: Sink & AsyncDisposable = (record: LogRecord) => {
    if (disposed) return;

    // Skip meta logger logs to prevent infinite loops
    if (
      record.category[0] === "logtape" &&
      record.category[1] === "meta" &&
      record.category[2] === "cloudwatch-logs"
    ) {
      return;
    }

    const message = formatLogMessage(record);
    const messageBytes = new TextEncoder().encode(message).length;
    const eventSize = messageBytes + OVERHEAD_PER_EVENT;

    const logEvent: InputLogEvent = {
      timestamp: record.timestamp,
      message,
    };

    logEvents.push(logEvent);
    currentBatchSize += eventSize;

    const shouldFlushBySize = currentBatchSize > MAX_BATCH_SIZE_BYTES;
    const shouldFlushByCount = logEvents.length >= batchSize;

    if (shouldFlushBySize || shouldFlushByCount) {
      void flushEvents();
    } else {
      scheduleFlush();
    }
  };

  sink[Symbol.asyncDispose] = async () => {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    await flushEvents();
    disposed = true;
  };

  return sink;
}
