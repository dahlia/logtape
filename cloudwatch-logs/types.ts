import type { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import type { TextFormatter } from "@logtape/logtape";

/**
 * Options for configuring the CloudWatch Logs sink.
 * @since 1.0.0
 */
export type CloudWatchLogsSinkOptions =
  & {
    /**
     * An existing CloudWatch Logs client instance.
     * If provided, the client will be used directly and other connection
     * options (region, credentials) will be ignored.
     */
    readonly client?: CloudWatchLogsClient;

    /**
     * The name of the log group to send log events to.
     */
    readonly logGroupName: string;

    /**
     * The AWS region to use when creating a new client.
     * Ignored if `client` is provided.
     * @default "us-east-1"
     */
    readonly region?: string;

    /**
     * AWS credentials to use when creating a new client.
     * Ignored if `client` is provided.
     * If not provided, the AWS SDK will use default credential resolution.
     */
    readonly credentials?: {
      readonly accessKeyId: string;
      readonly secretAccessKey: string;
      readonly sessionToken?: string;
    };

    /**
     * Maximum number of log events to batch before sending to CloudWatch.
     * Must be between 1 and 10,000.
     * @default 1000
     */
    readonly batchSize?: number;

    /**
     * Maximum time in milliseconds to wait before flushing buffered log events.
     * Set to 0 or negative to disable time-based flushing.
     * @default 1000
     */
    readonly flushInterval?: number;

    /**
     * Maximum number of retry attempts for failed requests.
     * @default 3
     */
    readonly maxRetries?: number;

    /**
     * Initial delay in milliseconds for exponential backoff retry strategy.
     * @default 100
     */
    readonly retryDelay?: number;

    /**
     * Text formatter to use for formatting log records before sending to CloudWatch Logs.
     * If not provided, defaults to a simple text formatter.
     * Use `jsonLinesFormatter()` from "@logtape/logtape" for JSON structured logging
     * to enable powerful CloudWatch Logs Insights querying capabilities.
     * @since 1.0.0
     */
    readonly formatter?: TextFormatter;
  }
  & (
    | {
      /**
       * Whether to automatically create the log stream if it doesn't exist.
       * When enabled, the sink will attempt to create the specified log stream
       * before sending log events. If the stream already exists, the creation
       * attempt will be safely ignored.
       * @default false
       * @since 1.1.0
       */
      readonly autoCreateLogStream?: false;

      /**
       * The name of the log stream within the log group.
       * Required unless `logStreamNameTemplate` is provided.
       */
      readonly logStreamName: string;
    }
    | {
      /**
       * Whether to automatically create the log stream if it doesn't exist.
       * When enabled, the sink will attempt to create the specified log stream
       * before sending log events. If the stream already exists, the creation
       * attempt will be safely ignored.
       * @default false
       * @since 1.1.0
       */
      readonly autoCreateLogStream: true;
    }
      & ({
        /**
         * The name of the log stream within the log group.
         * Required unless `logStreamNameTemplate` is provided.
         */
        readonly logStreamName: string;
      } | {
        /**
         * Template for generating dynamic log stream names.
         * Supports the following placeholders:
         * - `{YYYY}`: 4-digit year
         * - `{MM}`: 2-digit month (01-12)
         * - `{DD}`: 2-digit day (01-31)
         * - `{YYYY-MM-DD}`: Date in YYYY-MM-DD format
         * - `{timestamp}`: Unix timestamp in milliseconds
         *
         * If provided, this will be used instead of `logStreamName`.
         * Only used when `autoCreateLogStream` is true.
         * @since 1.1.0
         */
        readonly logStreamNameTemplate: string;
      })
  );
