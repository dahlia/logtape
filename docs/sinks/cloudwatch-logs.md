AWS CloudWatch Logs sink
========================

*This API is available since LogTape 1.0.0.*

If you are using AWS CloudWatch Logs for log aggregation and monitoring, you can
use the CloudWatch Logs sink to send log messages directly to AWS CloudWatch
using *@logtape/cloudwatch-logs* package:

::: code-group

~~~~ sh [Deno]
deno add jsr:@logtape/cloudwatch-logs
~~~~

~~~~ sh [npm]
npm add @logtape/cloudwatch-logs
~~~~

~~~~ sh [pnpm]
pnpm add @logtape/cloudwatch-logs
~~~~

~~~~ sh [Yarn]
yarn add @logtape/cloudwatch-logs
~~~~

~~~~ sh [Bun]
bun add @logtape/cloudwatch-logs
~~~~

:::

The quickest way to get started is to use the `getCloudWatchLogsSink()`
function with your log group and stream configuration:

~~~~ typescript twoslash
import { configure } from "@logtape/logtape";
import { getCloudWatchLogsSink } from "@logtape/cloudwatch-logs";

await configure({
  sinks: {
    cloudwatch: getCloudWatchLogsSink({
      logGroupName: "/aws/lambda/my-function",
      logStreamName: "my-stream",
      region: "us-east-1",
    }),
  },
  loggers: [
    { category: [], sinks: ["cloudwatch"], lowestLevel: "info" },
  ],
});
~~~~

You can also pass an existing CloudWatch Logs client for more control:

~~~~ typescript twoslash
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { configure } from "@logtape/logtape";
import { getCloudWatchLogsSink } from "@logtape/cloudwatch-logs";

const client = new CloudWatchLogsClient({ region: "us-east-1" });

await configure({
  sinks: {
    cloudwatch: getCloudWatchLogsSink({
      client,
      logGroupName: "/aws/lambda/my-function",
      logStreamName: "my-stream",
    }),
  },
  loggers: [
    { category: [], sinks: ["cloudwatch"], lowestLevel: "info" },
  ],
});
~~~~


Performance and batching
------------------------

The CloudWatch Logs sink automatically batches log events to optimize
performance and reduce API calls. You can customize the batching behavior:

~~~~ typescript twoslash
import { configure } from "@logtape/logtape";
import { getCloudWatchLogsSink } from "@logtape/cloudwatch-logs";

await configure({
  sinks: {
    cloudwatch: getCloudWatchLogsSink({
      logGroupName: "/aws/lambda/my-function",
      logStreamName: "my-stream",
      region: "us-east-1",
      batchSize: 500,        // Send batches of 500 events (default: 1000)
      flushInterval: 2000,   // Flush every 2 seconds (default: 1000ms)
      maxRetries: 5,         // Retry failed requests up to 5 times (default: 3)
    }),
  },
  loggers: [
    { category: [], sinks: ["cloudwatch"], lowestLevel: "debug" },
  ],
});
~~~~


Error handling and meta logger
------------------------------

The CloudWatch Logs sink uses LogTape's meta logger to report errors that
occur during log transmission. When log events fail to send after exhausting
all retries, the error is logged to the `["logtape", "meta", "cloudwatch-logs"]`
category. This prevents logging failures from crashing your application while
still providing visibility into issues.

You can monitor these meta logs by configuring a separate sink for the meta
logger category:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, getConsoleSink } from "@logtape/logtape";
import { getCloudWatchLogsSink } from "@logtape/cloudwatch-logs";

await configure({
  sinks: {
    cloudwatch: getCloudWatchLogsSink({ /* ... */ }),
    console: getConsoleSink(),
  },
  loggers: [
    { category: ["logtape", "meta"], sinks: ["console"], lowestLevel: "error" },
    { category: [], sinks: ["cloudwatch"], lowestLevel: "info" },
  ],
});
~~~~

See also [*Meta logger* section](../manual/categories.md#meta-logger) for more
details.


Custom formatting
-----------------

The CloudWatch Logs sink supports custom text formatters, allowing you to
control how log records are formatted before being sent to CloudWatch Logs.
By default, a simple text formatter is used, but you can specify any
`TextFormatter` from LogTape:

~~~~ typescript twoslash
import { configure, jsonLinesFormatter } from "@logtape/logtape";
import { getCloudWatchLogsSink } from "@logtape/cloudwatch-logs";

await configure({
  sinks: {
    cloudwatch: getCloudWatchLogsSink({
      logGroupName: "/aws/lambda/my-function",
      logStreamName: "my-stream",
      region: "us-east-1",
      formatter: jsonLinesFormatter,  // Use JSON Lines format for structured logging
    }),
  },
  loggers: [
    { category: [], sinks: ["cloudwatch"], lowestLevel: "info" },
  ],
});
~~~~

When using `jsonLinesFormatter`, log records are sent as JSON objects,
which enables powerful querying capabilities with CloudWatch Logs Insights:

~~~~ json
{
  "@timestamp": "2023-12-01T10:30:00.000Z",
  "level": "ERROR",
  "logger": "api.auth",
  "message": "Failed login attempt for user {\"email\":\"user@example.com\"}",
  "properties": {
    "ip": "192.168.1.1",
    "userAgent": "Mozilla/5.0...",
    "attempts": 3
  }
}
~~~~

This format enables you to query logs using CloudWatch Logs Insights with
dot notation for nested fields:

~~~~ logsinsightsql
fields @timestamp, level, logger, message, properties.ip
| filter level = "ERROR"
| filter properties.attempts > 2
| sort @timestamp desc
| limit 100
~~~~

You can also use other built-in formatters like `defaultTextFormatter`,
or create your own custom formatter.

For more control over JSON formatting, you can use `getJsonLinesFormatter()`
with custom options:

~~~~ typescript twoslash
import { configure, getJsonLinesFormatter } from "@logtape/logtape";
import { getCloudWatchLogsSink } from "@logtape/cloudwatch-logs";

await configure({
  sinks: {
    cloudwatch: getCloudWatchLogsSink({
      logGroupName: "/aws/lambda/my-function",
      logStreamName: "my-stream",
      formatter: getJsonLinesFormatter({
        categorySeparator: ".",  // Use dots for category separation
        message: "template",     // Use message template instead of rendered one
      }),
    }),
  },
  loggers: [
    { category: [], sinks: ["cloudwatch"], lowestLevel: "info" },
  ],
});
~~~~


IAM permissions
---------------

The CloudWatch Logs sink requires appropriate IAM permissions to send logs.
The minimal required permission is:

~~~~ json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:PutLogEvents"
      ],
      "Resource": [
        "arn:aws:logs:region:account-id:log-group:log-group-name:*"
      ]
    }
  ]
}
~~~~

For more details, see the `getCloudWatchLogsSink()` function and
`CloudWatchLogsSinkOptions` interface in the API reference.
