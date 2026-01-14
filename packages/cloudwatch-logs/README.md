@logtape/cloudwatch-logs: LogTape AWS CloudWatch Logs Sink
==========================================================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]
[![GitHub Actions][GitHub Actions badge]][GitHub Actions]

This package provides an [AWS CloudWatch Logs] sink for [LogTape]. It allows
you to send your LogTape logs directly to AWS CloudWatch Logs with intelligent
batching and error handling.

[JSR badge]: https://jsr.io/badges/@logtape/cloudwatch-logs
[JSR]: https://jsr.io/@logtape/cloudwatch-logs
[npm badge]: https://img.shields.io/npm/v/@logtape/cloudwatch-logs?logo=npm
[npm]: https://www.npmjs.com/package/@logtape/cloudwatch-logs
[GitHub Actions badge]: https://github.com/dahlia/logtape/actions/workflows/main.yaml/badge.svg
[GitHub Actions]: https://github.com/dahlia/logtape/actions/workflows/main.yaml
[AWS CloudWatch Logs]: https://aws.amazon.com/cloudwatch/
[LogTape]: https://logtape.org/


Installation
------------

The package is available on [JSR] and [npm].

~~~~ bash
deno add jsr:@logtape/cloudwatch-logs  # for Deno
npm  add     @logtape/cloudwatch-logs  # for npm
pnpm add     @logtape/cloudwatch-logs  # for pnpm
yarn add     @logtape/cloudwatch-logs  # for Yarn
bun  add     @logtape/cloudwatch-logs  # for Bun
~~~~


Usage
-----

The quickest way to get started is to use the `getCloudWatchLogsSink()` function
with your log group and stream names:

~~~~ typescript
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

You can also pass an existing CloudWatch Logs client:

~~~~ typescript
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


Testing
-------

The package includes both unit tests and integration tests. Unit tests use
mocked AWS SDK calls and can be run without AWS credentials:

~~~~ bash
deno task test
~~~~

Integration tests require real AWS credentials and will create temporary log
groups and streams in your AWS account:

~~~~ bash
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION="us-east-1"
deno task test
~~~~

Integration tests will automatically skip if AWS credentials are not provided.

> [!WARNING]
> Integration tests may incur small AWS charges for CloudWatch Logs usage.
> Test resources are automatically cleaned up after each test.


Required IAM permissions
------------------------

To use this sink, your AWS credentials need the following CloudWatch Logs
permissions:

~~~~ json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
~~~~


Docs
----

The docs of this package is available at
<https://logtape.org/sinks/cloudwatch-logs>. For the API references,
see <https://jsr.io/@logtape/cloudwatch-logs>.
