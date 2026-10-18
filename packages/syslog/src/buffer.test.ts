import { configure, type LogRecord, reset } from "@logtape/logtape";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import test from "node:test";
import {
  DenoTcpSyslogConnection,
  DenoUdpSyslogConnection,
  getSyslogSink,
  NodeTcpSyslogConnection,
  NodeUdpSyslogConnection,
  type SyslogProtocol,
  type SyslogSinkOptions,
} from "./syslog.ts";

const fixedOptions = {
  syslogHostname: "host",
  appName: "app",
  processId: "1",
};
const header = "<134>1 1970-01-01T00:00:00.000Z host app 1 - ";
const encoder = new TextEncoder();

for (const protocol of ["udp", "tcp"] as const) {
  test(`getSyslogSink() ${protocol} admits exact fits and drops newest`, async () => {
    const gate = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const sent: string[] = [];
    const record = makeRecord("first");
    const bytes = encoder.encode(header + "- first").length;
    await withConnection(protocol, async (message) => {
      sent.push(message);
      started.resolve();
      await gate.promise;
    }, async () => {
      const sink = makeSink(protocol, { maxBufferedBytes: bytes * 2 });
      try {
        sink(record);
        // Reservations include messages that have not started connecting yet.
        sink(makeRecord("other"));
        const pending = (sink as typeof sink & {
          _internal_lastPromise: Promise<void>;
        })._internal_lastPromise;
        sink(makeRecord("dropped"));
        assert.strictEqual(
          (sink as typeof sink & { _internal_lastPromise: Promise<void> })
            ._internal_lastPromise,
          pending,
        );
        await started.promise;
        // The first send remains counted while it is in flight.
        sink(makeRecord("third"));
        gate.resolve();
        await sink[Symbol.asyncDispose]();
        assert.deepStrictEqual(sent, [header + "- first", header + "- other"]);
        // All reservations have now been released.
        sink(makeRecord("later"));
        await sink[Symbol.asyncDispose]();
        assert.strictEqual(sent.at(-1), header + "- later");
      } finally {
        gate.resolve();
        await sink[Symbol.asyncDispose]();
      }
    });
  });

  for (const text of ["ASCII", "한글", "😀", "\ud800", "\udc00", "\ud800A"]) {
    test(`getSyslogSink() ${protocol} counts UTF-8 bytes for ${JSON.stringify(text)}`, async () => {
      const sent: string[] = [];
      const expected = header + "- " + text;
      const bytes = encoder.encode(expected).length;
      await withConnection(protocol, (message) => {
        sent.push(message);
        return Promise.resolve();
      }, async () => {
        const exact = makeSink(protocol, { maxBufferedBytes: bytes });
        const tooSmall = makeSink(protocol, { maxBufferedBytes: bytes - 1 });
        try {
          exact(makeRecord(text));
          await exact[Symbol.asyncDispose]();
          tooSmall(makeRecord(text));
          await tooSmall[Symbol.asyncDispose]();
          assert.deepStrictEqual(sent, [expected]);
        } finally {
          await exact[Symbol.asyncDispose]();
          await tooSmall[Symbol.asyncDispose]();
        }
      });
    });
  }

  test(`getSyslogSink() ${protocol} counts headers and structured data`, async () => {
    const sent: string[] = [];
    const expected = header + '[logtape@32473 key="한"] text#010';
    const bytes = encoder.encode(expected).length;
    await withConnection(protocol, (message) => {
      sent.push(message);
      return Promise.resolve();
    }, async () => {
      const record = makeRecord("text\n", { key: "한" });
      const exact = makeSink(protocol, {
        maxBufferedBytes: bytes,
        includeStructuredData: true,
      });
      const tooSmall = makeSink(protocol, {
        maxBufferedBytes: bytes - 1,
        includeStructuredData: true,
      });
      try {
        exact(record);
        tooSmall(record);
        await exact[Symbol.asyncDispose]();
        await tooSmall[Symbol.asyncDispose]();
        assert.deepStrictEqual(sent, [expected]);
      } finally {
        await exact[Symbol.asyncDispose]();
        await tooSmall[Symbol.asyncDispose]();
      }
    });
  });

  test(`getSyslogSink() ${protocol} defaults to unlimited buffering`, async () => {
    const sent: string[] = [];
    const gate = Promise.withResolvers<void>();
    await withConnection(protocol, async (message) => {
      sent.push(message);
      await gate.promise;
    }, async () => {
      for (const options of [{}, { maxBufferedBytes: Infinity }]) {
        const sink = makeSink(protocol, options);
        try {
          for (let i = 0; i < 100; i++) sink(makeRecord(String(i)));
          gate.resolve();
          await sink[Symbol.asyncDispose]();
        } finally {
          gate.resolve();
          await sink[Symbol.asyncDispose]();
        }
      }
      assert.strictEqual(sent.length, 200);
    });
  });
}

test("getSyslogSink() warns once until the entire buffer drains", async () => {
  const gates = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
  const started = [
    Promise.withResolvers<void>(),
    Promise.withResolvers<void>(),
  ];
  let sends = 0;
  const record = makeRecord("small");
  const bytes = encoder.encode(header + "- small").length;
  const oversized = makeRecord("x".repeat(bytes * 2));
  await captureWarnings(async (warnings) => {
    await withConnection("tcp", async () => {
      const i = sends++;
      if (i < gates.length) {
        started[i].resolve();
        await gates[i].promise;
      }
    }, async () => {
      const sink = makeSink("tcp", { maxBufferedBytes: bytes * 2 });
      try {
        sink(record);
        sink(record);
        sink(oversized);
        sink(oversized);
        assert.strictEqual(warnings.length, 1);
        assert.strictEqual(warnings[0].level, "warning");
        assert.deepStrictEqual(warnings[0].properties, {
          messageBytes: encoder.encode(header + "- " + "x".repeat(bytes * 2))
            .length,
          bufferedBytes: bytes * 2,
          maxBufferedBytes: bytes * 2,
        });
        await started[0].promise;
        gates[0].resolve();
        await started[1].promise;
        sink(oversized);
        // One completion does not end an overflow episode.
        assert.strictEqual(warnings.length, 1);
        gates[1].resolve();
        await sink[Symbol.asyncDispose]();
        sink(oversized);
        sink(oversized);
        assert.strictEqual(warnings.length, 2);
        assert.strictEqual(warnings[1].properties.bufferedBytes, 0);
      } finally {
        for (const gate of gates) gate.resolve();
        await sink[Symbol.asyncDispose]();
      }
    });
  });
});

for (const failure of ["connect", "send"] as const) {
  test(`getSyslogSink() releases reservations after ${failure} failure`, async () => {
    const gate = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const bytes = encoder.encode(header + "- small").length;
    const oversized = makeRecord("x".repeat(bytes * 2));
    await captureWarnings(async (warnings) => {
      const fail = async (): Promise<void> => {
        started.resolve();
        await gate.promise;
      };
      await withConnection(
        "tcp",
        failure === "send" ? fail : async () => {},
        async () => {
          const sink = makeSink("tcp", { maxBufferedBytes: bytes * 2 });
          try {
            sink(makeRecord("small"));
            sink(makeRecord("small"));
            sink(oversized);
            assert.strictEqual(warnings.length, 1);
            await started.promise;
            // Attach disposal's rejection handler before rejecting the send.
            const disposing = sink[Symbol.asyncDispose]();
            gate.reject(new Error("send failed"));
            await disposing;
            sink(oversized);
            assert.strictEqual(warnings.length, 2);
            assert.strictEqual(warnings[1].properties.bufferedBytes, 0);
          } finally {
            gate.resolve();
            await sink[Symbol.asyncDispose]();
          }
        },
        failure === "connect" ? fail : undefined,
      );
    });
  });
}

for (const forwarding of ["direct", "async"] as const) {
  for (const limit of [1, 1024]) {
    test(`getSyslogSink() bounds ${forwarding} reflected warnings at limit ${limit}`, async () => {
      const sent: string[] = [];
      let sink: ReturnType<typeof getSyslogSink>;
      const forwarded = Promise.withResolvers<void>();
      await withConnection("udp", (message) => {
        sent.push(message);
        return Promise.resolve();
      }, async () => {
        sink = makeSink("udp", { maxBufferedBytes: limit });
        await captureWarnings(async (warnings) => {
          try {
            sink(makeRecord("x".repeat(2048)));
            if (forwarding === "async") await forwarded.promise;
            await sink[Symbol.asyncDispose]();
            assert.strictEqual(warnings.length, 1);
            assert.strictEqual(sent.length, limit === 1 ? 0 : 1);
            assert.ok(sent.every((message) => message.includes("Dropped a")));
          } finally {
            await sink[Symbol.asyncDispose]();
          }
        }, (record) => {
          if (forwarding === "direct") sink(record);
          else {
            queueMicrotask(() => {
              sink(record);
              forwarded.resolve();
            });
          }
        });
      });
    });
  }
}

test("getSyslogSink() suppresses meta filter failures on overflow", async () => {
  await configure({
    sinks: { unused: () => {} },
    filters: {
      broken: () => {
        throw new Error("meta filter failed");
      },
    },
    loggers: [{
      category: ["logtape", "meta"],
      lowestLevel: "warning",
      sinks: ["unused"],
      filters: ["broken"],
    }],
  });
  try {
    const sink = makeSink("udp", { maxBufferedBytes: 1 });
    assert.doesNotThrow(() => sink(makeRecord("oversized")));
    assert.doesNotThrow(() => sink(makeRecord("oversized again")));
    await sink[Symbol.asyncDispose]();
  } finally {
    await reset();
  }
});

test("getSyslogSink() validates maxBufferedBytes", () => {
  for (
    const value of [0, -0, -1, 1.5, NaN, -Infinity, 2 ** 53, "1024", Symbol()]
  ) {
    assert.throws(
      () => getSyslogSink({ maxBufferedBytes: value as number }),
      { name: "RangeError", message: /maxBufferedBytes/ },
    );
  }
  for (const value of [1, Number.MAX_SAFE_INTEGER, Infinity]) {
    assert.doesNotThrow(() => getSyslogSink({ maxBufferedBytes: value }));
  }
});

test("getSyslogSink() disposal drains only admitted messages", async () => {
  const gate = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const sent: string[] = [];
  const bytes = encoder.encode(header + "- small").length;
  await withConnection("tcp", async (message) => {
    sent.push(message);
    started.resolve();
    await gate.promise;
  }, async () => {
    const sink = makeSink("tcp", { maxBufferedBytes: bytes });
    try {
      sink(makeRecord("small"));
      sink(makeRecord("other"));
      await started.promise;
      let disposed = false;
      const disposing = sink[Symbol.asyncDispose]().then(() => {
        disposed = true;
      });
      await Promise.resolve();
      assert.strictEqual(disposed, false);
      gate.resolve();
      await disposing;
      assert.deepStrictEqual(sent, [header + "- small"]);
    } finally {
      gate.resolve();
      await sink[Symbol.asyncDispose]();
    }
  });
});

test("getSyslogSink() finite byte limit preserves real TCP framing", {
  timeout: 10000,
}, async () => {
  const received = Promise.withResolvers<string>();
  const server = createServer((socket) => {
    let data = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      data += chunk;
      if (data.endsWith("\n")) received.resolve(data);
    });
    socket.on("error", received.reject);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const expected = header + "- 한글😀";
  const sink = makeSink("tcp", {
    hostname: "127.0.0.1",
    port: address.port,
    maxBufferedBytes: encoder.encode(expected).length,
  });
  try {
    sink(makeRecord("한글😀"));
    assert.strictEqual(await received.promise, expected + "\n");
    await sink[Symbol.asyncDispose]();
  } finally {
    await sink[Symbol.asyncDispose]();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

function makeRecord(
  message: string,
  properties: Record<string, unknown> = {},
): LogRecord {
  return {
    category: ["test"],
    level: "info",
    timestamp: 0,
    message: [message],
    rawMessage: message,
    properties,
  };
}

function makeSink(
  protocol: SyslogProtocol,
  options: SyslogSinkOptions,
): ReturnType<typeof getSyslogSink> {
  return getSyslogSink({ ...fixedOptions, protocol, ...options });
}

async function withConnection(
  protocol: SyslogProtocol,
  send: (message: string) => Promise<void>,
  run: () => Promise<void>,
  connect: () => Promise<void> = () => Promise.resolve(),
): Promise<void> {
  const connection = typeof Deno !== "undefined"
    ? protocol === "tcp" ? DenoTcpSyslogConnection : DenoUdpSyslogConnection
    : protocol === "tcp"
    ? NodeTcpSyslogConnection
    : NodeUdpSyslogConnection;
  const original = {
    connect: connection.prototype.connect,
    send: connection.prototype.send,
    close: connection.prototype.close,
  };
  connection.prototype.connect = connect;
  connection.prototype.send = send;
  connection.prototype.close = () => {};
  try {
    await run();
  } finally {
    Object.assign(connection.prototype, original);
  }
}

async function captureWarnings(
  run: (warnings: LogRecord[]) => Promise<void>,
  forward?: (record: LogRecord) => void,
): Promise<void> {
  const warnings: LogRecord[] = [];
  await configure({
    sinks: {
      capture: (record) => {
        warnings.push(record);
        forward?.(record);
      },
    },
    loggers: [{
      category: ["logtape", "meta", "syslog"],
      lowestLevel: "warning",
      sinks: ["capture"],
    }, {
      category: ["logtape", "meta"],
      lowestLevel: "warning",
      sinks: [],
    }],
  });
  try {
    await run(warnings);
  } finally {
    await reset();
  }
}
