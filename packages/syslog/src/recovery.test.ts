import assert from "node:assert/strict";
import test from "node:test";
import {
  configureSync,
  type LogRecord,
  resetSync,
  type Sink,
  withCategoryPrefix,
} from "@logtape/logtape";
import { AsyncLocalStorage } from "node:async_hooks";
import { createServer, type Socket } from "node:net";
import { once } from "node:events";
import { setImmediate } from "node:timers/promises";
import {
  DenoTcpSyslogConnection,
  getSyslogSink,
  NodeTcpSyslogConnection,
  type SyslogConnection,
} from "./syslog.ts";

type TestSink = Sink & AsyncDisposable & {
  readonly _internal_lastPromise: Promise<void>;
};

function record(message: string): LogRecord {
  return {
    category: ["test"],
    level: "info",
    timestamp: 0,
    rawMessage: message,
    message: [message],
    properties: {},
  };
}

async function withConnection(
  connection: SyslogConnection,
  run: (sink: TestSink, errors: LogRecord[]) => Promise<void>,
  shared = false,
): Promise<void> {
  const prototype = typeof Deno === "undefined"
    ? NodeTcpSyslogConnection.prototype
    : DenoTcpSyslogConnection.prototype;
  const original = {
    connect: prototype.connect,
    send: prototype.send,
    close: prototype.close,
  };
  Object.assign(prototype, connection);
  const sink = getSyslogSink({ protocol: "tcp" }) as TestSink;
  const errors: LogRecord[] = [];
  configureSync({
    contextLocalStorage: new AsyncLocalStorage(),
    sinks: {
      capture: (r) => errors.push(r),
      shared: (r) => sink(r),
    },
    loggers: [{
      category: ["logtape", "meta"],
      lowestLevel: "error",
      sinks: shared ? ["capture", "shared"] : ["capture"],
    }],
  });
  try {
    await run(sink, errors);
  } finally {
    try {
      await sink[Symbol.asyncDispose]();
    } finally {
      resetSync();
      Object.assign(prototype, original);
    }
  }
}

test("getSyslogSink() preserves queued records after a connection failure", async () => {
  const gate = Promise.withResolvers<void>();
  const failure = new Error("unreachable");
  let connects = 0;
  let closes = 0;
  const messages: string[] = [];
  await withConnection({
    async connect() {
      connects++;
      if (connects === 1) {
        await gate.promise;
        throw failure;
      }
    },
    send(message) {
      messages.push(message);
      return Promise.resolve();
    },
    close() {
      closes++;
    },
  }, async (sink, errors) => {
    sink(record("failed"));
    sink(record("second"));
    sink(record("third"));
    gate.resolve();
    await sink[Symbol.asyncDispose]();
    assert.strictEqual(connects, 2);
    assert.strictEqual(closes, 2);
    assert.deepStrictEqual(messages.map((m) => m.split(" ").at(-1)), [
      "second",
      "third",
    ]);
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].properties.error, failure);
  });
});

test("getSyslogSink() does not retry a failed send and reconnects for the next record", async () => {
  let connects = 0;
  const messages: string[] = [];
  await withConnection({
    connect() {
      connects++;
    },
    send(message) {
      const text = message.split(" ").at(-1)!;
      messages.push(text);
      return text === "failed"
        ? Promise.reject(new Error("send failed"))
        : Promise.resolve();
    },
    close() {},
  }, async (sink, errors) => {
    for (const message of ["first", "failed", "third", "fourth"]) {
      sink(record(message));
    }
    await sink[Symbol.asyncDispose]();
    assert.strictEqual(connects, 2);
    assert.deepStrictEqual(messages, ["first", "failed", "third", "fourth"]);
    assert.strictEqual(errors.length, 1);
  });
});

test("getSyslogSink() reports failed records without unhandled rejections", async () => {
  let failing = true;
  await withConnection({
    connect() {
      if (failing) throw new Error("unreachable");
    },
    send() {
      return failing
        ? Promise.reject(new Error("unreachable"))
        : Promise.resolve();
    },
    close() {},
  }, async (sink, errors) => {
    withCategoryPrefix(["request"], () => sink(record("first failure")));
    // No consumer handles the internal promise: the sink must do so itself.
    await setImmediate();
    assert.strictEqual(errors.length, 1);
    assert.deepStrictEqual(errors[0].category, ["logtape", "meta"]);
    sink(record("second failure"));
    await assert.rejects(sink._internal_lastPromise, /unreachable/);
    assert.strictEqual(errors.length, 2);
    failing = false;
    sink(record("recovered"));
    await sink._internal_lastPromise;
    failing = true;
    sink(record("new failure"));
    await assert.rejects(sink._internal_lastPromise, /unreachable/);
    assert.strictEqual(errors.length, 3);
    assert.deepStrictEqual(
      errors.map((r) => (r.properties.record as LogRecord).rawMessage),
      [
        "first failure",
        "second failure",
        "new failure",
      ],
    );
  });
});

test("getSyslogSink() drains failures reported through the same meta sink", async () => {
  let connects = 0;
  await withConnection({
    connect() {
      connects++;
      throw new Error("unreachable");
    },
    send() {
      return Promise.resolve();
    },
    close() {},
  }, async (sink, errors) => {
    withCategoryPrefix(["request"], () => sink(record("failed")));
    await sink[Symbol.asyncDispose]();
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(connects, 2);
    await setImmediate();
    assert.strictEqual(connects, 2);
  }, true);
});

test("getSyslogSink() reconnects when a TCP server becomes reachable", async () => {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  const sink = getSyslogSink({
    hostname: "127.0.0.1",
    port,
    protocol: "tcp",
    timeout: 500,
  }) as TestSink;
  const sockets = new Set<Socket>();
  const delivered = Promise.withResolvers<string>();
  server.on("connection", (socket: Socket) => {
    sockets.add(socket);
    let message = "";
    socket.on("data", (data) => {
      message += data;
      if (message.includes("delivered\n")) delivered.resolve(message);
    });
  });
  try {
    sink(record("failed"));
    await assert.rejects(sink._internal_lastPromise);
    server.listen(port, "127.0.0.1");
    await once(server, "listening");
    sink(record("delivered"));
    await sink._internal_lastPromise;
    assert.ok((await within(delivered.promise)).includes("delivered"));
  } finally {
    await sink[Symbol.asyncDispose]();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function within<T>(promise: Promise<T>): Promise<T> {
  const expired = Promise.withResolvers<never>();
  const timeout = setTimeout(
    () => expired.reject(new Error("Timed out")),
    5000,
  );
  try {
    return await Promise.race([promise, expired.promise]);
  } finally {
    clearTimeout(timeout);
  }
}

test("NodeTcpSyslogConnection forgets a closed socket and reconnects", async () => {
  const server = createServer();
  const sockets = new Set<Socket>();
  const accepted = Promise.withResolvers<Socket>();
  server.on("connection", (socket: Socket) => {
    sockets.add(socket);
    accepted.resolve(socket);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const connection = new NodeTcpSyslogConnection(
    "127.0.0.1",
    port,
    1000,
    false,
  );
  try {
    await connection.connect();
    // Observe the actual client close event rather than waiting an arbitrary delay.
    const socket = Reflect.get(connection, "connection") as Socket;
    const closed = once(socket, "close");
    (await within(accepted.promise)).destroy();
    await within(closed);
    await connection.send("reconnected");
    const current = Reflect.get(connection, "connection") as Socket;
    assert.notStrictEqual(current, socket);
    connection.close();
    assert.throws(
      () => connection.send("after close"),
      /Connection not established/,
    );
  } finally {
    connection.close();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("getSyslogSink() recovers even when meta error reporting throws", async () => {
  let connects = 0;
  const messages: string[] = [];
  await withConnection({
    connect() {
      if (++connects === 1) throw new Error("unreachable");
    },
    send(message) {
      messages.push(message);
      return Promise.resolve();
    },
    close() {},
  }, async (sink) => {
    configureSync({
      reset: true,
      sinks: {},
      filters: {
        broken: () => {
          throw new Error("meta filter failed");
        },
      },
      loggers: [{
        category: ["logtape", "meta"],
        lowestLevel: "error",
        filters: ["broken"],
      }],
    });
    sink(record("failed"));
    sink(record("delivered"));
    await sink[Symbol.asyncDispose]();
    assert.strictEqual(connects, 2);
    assert.strictEqual(messages.length, 1);
    assert.ok(messages[0].endsWith("delivered"));
  });
});

const skipNodeRecovery = typeof Deno !== "undefined";
test("getSyslogSink() reconnects before sending after an idle peer close", {
  skip: skipNodeRecovery,
}, async () => {
  if (skipNodeRecovery) return;
  const originalConnect = NodeTcpSyslogConnection.prototype.connect;
  let connection: NodeTcpSyslogConnection | undefined;
  NodeTcpSyslogConnection.prototype.connect = function () {
    connection = this;
    return originalConnect.call(this);
  };
  const server = createServer();
  const sockets = new Set<Socket>();
  const received: string[] = [];
  const first = Promise.withResolvers<Socket>();
  const second = Promise.withResolvers<void>();
  server.on("connection", (socket: Socket) => {
    sockets.add(socket);
    let pending = "";
    socket.on("data", (data) => {
      pending += data;
      while (pending.includes("\n")) {
        const end = pending.indexOf("\n");
        received.push(pending.slice(0, end));
        pending = pending.slice(end + 1);
        if (received.length === 1) first.resolve(socket);
        if (received.length === 2) second.resolve();
      }
    });
  });
  let sink: TestSink | undefined;
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = (server.address() as { port: number }).port;
    sink = getSyslogSink({
      hostname: "127.0.0.1",
      port,
      protocol: "tcp",
    }) as TestSink;
    sink(record("first"));
    await sink._internal_lastPromise;
    const peer = await within(first.promise);
    const socket = Reflect.get(connection!, "connection") as Socket;
    const closed = once(socket, "close");
    peer.destroy();
    await within(closed);
    sink(record("second"));
    await sink._internal_lastPromise;
    await within(second.promise);
    assert.deepStrictEqual(received.map((m) => m.split(" ").at(-1)), [
      "first",
      "second",
    ]);
    assert.strictEqual(sockets.size, 2);
  } finally {
    try {
      await sink?.[Symbol.asyncDispose]();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    } finally {
      NodeTcpSyslogConnection.prototype.connect = originalConnect;
    }
  }
});
