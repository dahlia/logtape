import assert from "node:assert/strict";
import test from "node:test";
import {
  CloudWatchLogsClient,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import type { LogRecord } from "@logtape/logtape";
import { jsonLinesFormatter } from "@logtape/logtape";
import { mockClient } from "aws-sdk-client-mock";
import { getCloudWatchLogsSink } from "./sink.ts";

const mockLogRecord: LogRecord = {
  category: ["test"],
  level: "info",
  message: ["Hello, ", "world", "!"],
  rawMessage: "Hello, {name}!",
  timestamp: Date.now(),
  properties: {},
};

test("getCloudWatchLogsSink() creates a working sink", async () => {
  const cwlMock = mockClient(CloudWatchLogsClient);
  cwlMock.reset();
  cwlMock.on(PutLogEventsCommand).resolves({});

  const sink = getCloudWatchLogsSink({
    logGroupName: "/test/log-group",
    logStreamName: "test-stream",
    region: "us-east-1",
    batchSize: 1,
    flushInterval: 0,
  });

  sink(mockLogRecord);
  await sink[Symbol.asyncDispose]();

  assert.strictEqual(cwlMock.commandCalls(PutLogEventsCommand).length, 1);
  const call = cwlMock.commandCalls(PutLogEventsCommand)[0];
  assert.strictEqual(call.args[0].input.logGroupName, "/test/log-group");
  assert.strictEqual(call.args[0].input.logStreamName, "test-stream");
  assert.strictEqual(call.args[0].input.logEvents?.length, 1);
  assert.strictEqual(
    call.args[0].input.logEvents?.[0].message,
    'Hello, "world"!',
  );
});

test("getCloudWatchLogsSink() batches multiple log events", async () => {
  const cwlMock = mockClient(CloudWatchLogsClient);
  cwlMock.reset();
  cwlMock.on(PutLogEventsCommand).resolves({});

  const sink = getCloudWatchLogsSink({
    logGroupName: "/test/log-group",
    logStreamName: "test-stream",
    batchSize: 3,
    flushInterval: 0,
  });

  sink(mockLogRecord);
  sink(mockLogRecord);
  sink(mockLogRecord);

  await sink[Symbol.asyncDispose]();

  assert.strictEqual(cwlMock.commandCalls(PutLogEventsCommand).length, 1);
  const call = cwlMock.commandCalls(PutLogEventsCommand)[0];
  assert.strictEqual(call.args[0].input.logEvents?.length, 3);
});

test("getCloudWatchLogsSink() flushes when batch size is reached", async () => {
  const cwlMock = mockClient(CloudWatchLogsClient);
  cwlMock.reset();
  cwlMock.on(PutLogEventsCommand).resolves({});

  const sink = getCloudWatchLogsSink({
    logGroupName: "/test/log-group",
    logStreamName: "test-stream",
    batchSize: 2,
    flushInterval: 0,
  });

  sink(mockLogRecord);
  sink(mockLogRecord); // Should flush here
  sink(mockLogRecord); // Should be in next batch

  await sink[Symbol.asyncDispose](); // Should flush remaining

  assert.strictEqual(cwlMock.commandCalls(PutLogEventsCommand).length, 2);
  assert.strictEqual(
    cwlMock.commandCalls(PutLogEventsCommand)[0].args[0].input.logEvents
      ?.length,
    2,
  );
  assert.strictEqual(
    cwlMock.commandCalls(PutLogEventsCommand)[1].args[0].input.logEvents
      ?.length,
    1,
  );
});

test("getCloudWatchLogsSink() with custom client", async () => {
  const client = new CloudWatchLogsClient({ region: "us-west-2" });
  const cwlMock = mockClient(client);
  cwlMock.on(PutLogEventsCommand).resolves({});

  const sink = getCloudWatchLogsSink({
    client,
    logGroupName: "/test/log-group",
    logStreamName: "test-stream",
    batchSize: 1,
    flushInterval: 0,
  });

  sink(mockLogRecord);
  await sink[Symbol.asyncDispose]();

  assert.strictEqual(cwlMock.commandCalls(PutLogEventsCommand).length, 1);
});

test("getCloudWatchLogsSink() handles credentials", () => {
  const sink = getCloudWatchLogsSink({
    logGroupName: "/test/log-group",
    logStreamName: "test-stream",
    region: "eu-west-1",
    credentials: {
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    },
  });

  assert.ok(sink instanceof Function);
  assert.ok(sink[Symbol.asyncDispose] instanceof Function);
});

test("getCloudWatchLogsSink() handles errors gracefully", async () => {
  const cwlMock = mockClient(CloudWatchLogsClient);
  cwlMock.reset();
  cwlMock.on(PutLogEventsCommand).rejects(new Error("Permanent failure"));

  const sink = getCloudWatchLogsSink({
    logGroupName: "/test/log-group",
    logStreamName: "test-stream",
    batchSize: 1,
    flushInterval: 0,
    maxRetries: 0, // No retries
    retryDelay: 10,
  });

  sink(mockLogRecord);
  await sink[Symbol.asyncDispose]();

  // Should attempt once and fail gracefully
  assert.strictEqual(cwlMock.commandCalls(PutLogEventsCommand).length, 1);
});

test("getCloudWatchLogsSink() handles large message batches", async () => {
  const cwlMock = mockClient(CloudWatchLogsClient);
  cwlMock.reset();
  cwlMock.on(PutLogEventsCommand).resolves({});

  // Create a message that will exceed 1MB when combined with overhead
  const largeMessage = "x".repeat(600000); // ~600KB message
  const largeLogRecord: LogRecord = {
    category: ["test"],
    level: "info",
    message: [largeMessage],
    rawMessage: largeMessage,
    timestamp: Date.now(),
    properties: {},
  };

  const sink = getCloudWatchLogsSink({
    logGroupName: "/test/log-group",
    logStreamName: "test-stream",
    batchSize: 10,
    flushInterval: 0,
  });

  // Add two large messages - should exceed 1MB limit
  sink(largeLogRecord);
  sink(largeLogRecord);

  await sink[Symbol.asyncDispose]();

  const calls = cwlMock.commandCalls(PutLogEventsCommand);
  // Should either flush immediately due to size or flush remaining on dispose
  assert.strictEqual(calls.length >= 1, true);
});

test("getCloudWatchLogsSink() formats complex log messages", async () => {
  const cwlMock = mockClient(CloudWatchLogsClient);
  cwlMock.reset();
  cwlMock.on(PutLogEventsCommand).resolves({});

  const complexLogRecord: LogRecord = {
    category: ["app", "module"],
    level: "error",
    message: ["User ", { id: 123, name: "John" }, " failed to login"],
    rawMessage: "User {user} failed to login",
    timestamp: Date.now(),
    properties: { error: "Invalid password" },
  };

  const sink = getCloudWatchLogsSink({
    logGroupName: "/test/log-group",
    logStreamName: "test-stream",
    batchSize: 1,
    flushInterval: 0,
  });

  sink(complexLogRecord);
  await sink[Symbol.asyncDispose]();

  const call = cwlMock.commandCalls(PutLogEventsCommand)[0];
  assert.strictEqual(
    call.args[0].input.logEvents?.[0].message,
    'User {"id":123,"name":"John"} failed to login',
  );
});

test("getCloudWatchLogsSink() respects batch size limits", async () => {
  const cwlMock = mockClient(CloudWatchLogsClient);
  cwlMock.reset();
  cwlMock.on(PutLogEventsCommand).resolves({});

  const sink = getCloudWatchLogsSink({
    logGroupName: "/test/log-group",
    logStreamName: "test-stream",
    batchSize: 50000, // Should be clamped to 10000
    flushInterval: 0,
  });

  // Verify the sink works (batch size should be internally limited)
  sink(mockLogRecord);
  await sink[Symbol.asyncDispose]();

  assert.strictEqual(cwlMock.commandCalls(PutLogEventsCommand).length, 1);
});

test("getCloudWatchLogsSink() flushes remaining events on disposal", async () => {
  const cwlMock = mockClient(CloudWatchLogsClient);
  cwlMock.reset();
  cwlMock.on(PutLogEventsCommand).resolves({});

  const sink = getCloudWatchLogsSink({
    logGroupName: "/test/log-group",
    logStreamName: "test-stream",
    batchSize: 10,
    flushInterval: 0,
  });

  sink(mockLogRecord);
  sink(mockLogRecord);

  await sink[Symbol.asyncDispose]();

  assert.strictEqual(cwlMock.commandCalls(PutLogEventsCommand).length, 1);
  assert.strictEqual(
    cwlMock.commandCalls(PutLogEventsCommand)[0].args[0].input.logEvents
      ?.length,
    2,
  );
});

test("getCloudWatchLogsSink() supports JSON Lines formatter", async () => {
  const cwlMock = mockClient(CloudWatchLogsClient);
  cwlMock.reset();
  cwlMock.on(PutLogEventsCommand).resolves({});

  const sink = getCloudWatchLogsSink({
    logGroupName: "/test/log-group",
    logStreamName: "test-stream",
    batchSize: 1,
    flushInterval: 0,
    formatter: jsonLinesFormatter,
  });

  const structuredLogRecord: LogRecord = {
    category: ["app", "database"],
    level: "error",
    message: ["User ", { id: 123, name: "John" }, " failed to connect"],
    rawMessage: "User {user} failed to connect",
    timestamp: 1672531200000, // Fixed timestamp for testing
    properties: { error: "Connection timeout", retries: 3 },
  };

  sink(structuredLogRecord);
  await sink[Symbol.asyncDispose]();

  assert.strictEqual(cwlMock.commandCalls(PutLogEventsCommand).length, 1);
  const call = cwlMock.commandCalls(PutLogEventsCommand)[0];
  const logMessage = call.args[0].input.logEvents?.[0].message;

  // Parse the JSON message to verify structure
  const parsedMessage = JSON.parse(logMessage!);

  // Check what fields are actually present in jsonLinesFormatter output
  assert.strictEqual(parsedMessage["@timestamp"], "2023-01-01T00:00:00.000Z");
  assert.strictEqual(parsedMessage.level, "ERROR"); // jsonLinesFormatter uses uppercase
  assert.strictEqual(parsedMessage.logger, "app.database"); // category becomes logger
  assert.strictEqual(
    parsedMessage.message,
    'User {"id":123,"name":"John"} failed to connect',
  ); // pre-formatted message
  assert.strictEqual(parsedMessage.properties.error, "Connection timeout");
  assert.strictEqual(parsedMessage.properties.retries, 3);
});

test("getCloudWatchLogsSink() uses default text formatter when no formatter provided", async () => {
  const cwlMock = mockClient(CloudWatchLogsClient);
  cwlMock.reset();
  cwlMock.on(PutLogEventsCommand).resolves({});

  const sink = getCloudWatchLogsSink({
    logGroupName: "/test/log-group",
    logStreamName: "test-stream",
    batchSize: 1,
    flushInterval: 0,
    // No formatter specified - should use default
  });

  sink(mockLogRecord);
  await sink[Symbol.asyncDispose]();

  assert.strictEqual(cwlMock.commandCalls(PutLogEventsCommand).length, 1);
  const call = cwlMock.commandCalls(PutLogEventsCommand)[0];
  const logMessage = call.args[0].input.logEvents?.[0].message;

  // Should be plain text, not JSON
  assert.strictEqual(logMessage, 'Hello, "world"!');
});
