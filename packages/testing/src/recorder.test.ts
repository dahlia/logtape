import assert from "node:assert/strict";
import test from "node:test";

import { configure, getLogger, type LogRecord, reset } from "@logtape/logtape";
import type { LogRecorderWaitOptions } from "@logtape/testing";
import {
  createLogRecorder,
  type LogRecordMatch,
} from "@logtape/testing/recorder";

test("LogRecorder.waitFor() returns the first retained match without consuming", async () => {
  const recorder = createLogRecorder();
  const first = record("done");
  recorder.sink(record("pending"));
  recorder.sink(first);
  recorder.sink(record("done"));

  assert.strictEqual(await recorder.waitFor({ message: "done" }), first);
  assert.strictEqual(await recorder.waitFor({ message: "done" }), first);
  assert.strictEqual(recorder.records.length, 3);
});

test("LogRecorder.waitFor() observes immediate future records independently", async () => {
  const recorder = createLogRecorder();
  const first = recorder.waitFor({ message: "done" });
  const second = recorder.waitFor({ message: "done" });
  const expected = record("done");
  recorder.sink(record("pending"));
  recorder.sink(expected);
  recorder.sink(record("done"));

  assert.strictEqual(await first, expected);
  assert.strictEqual(await second, expected);
  assert.strictEqual(recorder.records.length, 3);
});

test("LogRecorder.waitFor() uses existing matcher semantics", async () => {
  const recorder = createLogRecorder();
  const date = new Date("2026-01-01T00:00:00Z");
  const expected = record("Job completed", { jobId: "job-123", date });
  recorder.sink(expected);
  const category = /app.jobs/g;
  const message = /Job/y;
  const jobId = /job-123/g;
  category.lastIndex = message.lastIndex = jobId.lastIndex = 1;
  const match: LogRecordMatch = {
    category,
    categoryPrefix: ["app"],
    level: "info",
    message,
    rawMessage: "Job completed",
    properties: { jobId, date: new Date(date.getTime()) },
    predicate: (candidate) => candidate === expected,
  };

  assert.strictEqual(await recorder.waitFor(match), expected);
  assert.strictEqual(category.lastIndex, 1);
  assert.strictEqual(message.lastIndex, 1);
  assert.strictEqual(jobId.lastIndex, 1);
  assert.strictEqual(
    await recorder.waitFor({
      message: (candidate) => candidate === expected,
      properties: (properties) => properties.jobId === "job-123",
    }),
    expected,
  );
});

test("LogRecorder.waitFor() validates timeout before cancellation", async () => {
  const recorder = createLogRecorder();
  const controller = new AbortController();
  controller.abort("cancelled");
  for (const timeout of [-1, 0.5, NaN, Infinity, 2147483648, "10", null]) {
    await assert.rejects(
      recorder.waitFor({}, {
        timeout: timeout as number,
        signal: controller.signal,
      }),
      RangeError,
    );
  }
});

test("LogRecorder.waitFor() zero timeout only checks retained records", async () => {
  const recorder = createLogRecorder();
  const absent = recorder.waitFor({ message: "done" }, { timeout: 0 });
  const expected = record("done");
  recorder.sink(expected);

  await assert.rejects(absent, { name: "TimeoutError" });
  assert.strictEqual(
    await recorder.waitFor({ message: "done" }, { timeout: 0 }),
    expected,
  );
});

test("LogRecorder.waitFor() accepts the inclusive maximum timeout", async () => {
  const recorder = createLogRecorder();
  const expected = record("done");
  recorder.sink(expected);

  assert.strictEqual(
    await recorder.waitFor({ message: "done" }, { timeout: 2147483647 }),
    expected,
  );
});

test("LogRecorder.waitFor() rejects when a real timeout elapses", async () => {
  const recorder = createLogRecorder();
  await assert.rejects(recorder.waitFor({ message: "done" }, { timeout: 1 }), {
    name: "TimeoutError",
  });
});

test("LogRecorder.waitFor() pre-abort wins a retained match", async () => {
  const recorder = createLogRecorder();
  recorder.sink(record("done"));
  const controller = new AbortController();
  const reason = new Error("cancelled");
  controller.abort(reason);

  await assert.rejects(
    recorder.waitFor({}, { signal: controller.signal }),
    (error) => error === reason,
  );
});

test("LogRecorder.waitFor() abort affects only its own waiter", async () => {
  const recorder = createLogRecorder();
  const controller = new AbortController();
  let checks = 0;
  const cancelled = recorder.waitFor({
    predicate: () => {
      checks++;
      return true;
    },
  }, { signal: controller.signal });
  const remaining = recorder.waitFor({ message: "done" });
  controller.abort("cancelled");
  const expected = record("done");
  recorder.sink(expected);

  await assert.rejects(cancelled, (error) => error === "cancelled");
  assert.strictEqual(await remaining, expected);
  assert.strictEqual(checks, 0);
});

test("LogRecorder.waitFor() clear and take leave pending waiters active", async () => {
  for (const operation of ["clear", "take"] as const) {
    const recorder = createLogRecorder();
    recorder.sink(record("pending"));
    const waiting = recorder.waitFor({ message: "done" });
    recorder[operation]();
    const expected = record("done");
    recorder.sink(expected);
    recorder[operation]();

    assert.strictEqual(await waiting, expected);
    assert.deepStrictEqual(recorder.records, []);
    await assert.rejects(recorder.waitFor({}, { timeout: 0 }), {
      name: "TimeoutError",
    });
  }
});

test("LogRecorder.waitFor() predicate failures never escape the sink", async () => {
  for (const field of ["message", "properties", "predicate"] as const) {
    const recorder = createLogRecorder();
    const failure = new Error(`${field} failed`);
    const failed = recorder.waitFor({
      [field]: () => {
        throw failure;
      },
    });
    const healthy = recorder.waitFor({ message: "done" });
    const expected = record("done");

    assert.doesNotThrow(() => recorder.sink(expected));
    await assert.rejects(failed, (error) => error === failure);
    assert.strictEqual(await healthy, expected);
    assert.deepStrictEqual(recorder.records, [expected]);
  }
});

test("LogRecorder.waitFor() contains message rendering failures", async () => {
  const recorder = createLogRecorder();
  const failure = new Error("inspect failed");
  const value = {
    [Symbol.for("Deno.customInspect")](): string {
      throw failure;
    },
    [Symbol.for("nodejs.util.inspect.custom")](): string {
      throw failure;
    },
  };
  const expected = { ...record("raw"), message: ["Value ", value, "."] };
  const failed = recorder.waitFor({ message: "absent" });
  const healthy = recorder.waitFor({ rawMessage: "raw" });
  assert.doesNotThrow(() => recorder.sink(expected));
  await assert.rejects(failed, (error) => error === failure);
  assert.strictEqual(await healthy, expected);
});

test("LogRecorder.waitFor() restores matching after every predicate exit", async () => {
  for (const timeout of [0, 1000]) {
    for (const retained of [false, true]) {
      for (const cancel of [false, true]) {
        const recorder = createLogRecorder();
        const controller = new AbortController();
        const failure = new Error("predicate failed");
        if (retained) recorder.sink(record("trigger"));
        const failed = recorder.waitFor({
          predicate: () => {
            if (cancel) controller.abort("cancelled");
            throw failure;
          },
        }, { timeout, signal: controller.signal });
        if (!retained) recorder.sink(record("trigger"));
        await assert.rejects(
          failed,
          (error) =>
            timeout === 0 && !retained
              ? error instanceof Error && error.name === "TimeoutError"
              : error === (cancel ? "cancelled" : failure),
        );
        recorder.clear();
        const healthy = recorder.waitFor({ message: "later" });
        const expected = record("later");
        recorder.sink(expected);
        assert.strictEqual(await healthy, expected);
      }
    }
  }
});

test("LogRecorder.waitFor() abort inside a predicate wins a matching result", async () => {
  for (const timeout of [0, 1000]) {
    const recorder = createLogRecorder();
    recorder.sink(record("done"));
    const controller = new AbortController();
    await assert.rejects(
      recorder.waitFor({
        predicate: () => {
          controller.abort("cancelled");
          return true;
        },
      }, { timeout, signal: controller.signal }),
      (error) => error === "cancelled",
    );
  }
});

test("LogRecorder.waitFor() suppresses recursive matching while retaining logs", async () => {
  const recorder = createLogRecorder();
  const controller = new AbortController();
  let checks = 0;
  const recursive = recorder.waitFor({
    predicate: () => {
      checks++;
      recorder.sink(record("recursive"));
      return false;
    },
  }, { signal: controller.signal });
  const healthy = recorder.waitFor({ message: "first" });
  const expected = record("first");
  assert.doesNotThrow(() => recorder.sink(expected));
  controller.abort("finished");

  await assert.rejects(recursive, (error) => error === "finished");
  assert.strictEqual(await healthy, expected);
  assert.strictEqual(checks, 1);
  assert.deepStrictEqual(recorder.records.map((r) => r.rawMessage), [
    "first",
    "recursive",
  ]);
  assert.strictEqual(
    (await recorder.waitFor({ message: "recursive" })).rawMessage,
    "recursive",
  );
});

test("LogRecorder.waitFor() suppresses sibling matches but observes recursive logs", async () => {
  const recorder = createLogRecorder();
  let emitting!: Promise<LogRecord>;
  let siblingRejected!: Promise<void>;
  withTimers((timers) => {
    emitting = recorder.waitFor({
      predicate: (candidate) => {
        recorder.sink(record("recursive"));
        return candidate.rawMessage === "first";
      },
    });
    const sibling = recorder.waitFor({ message: "recursive" });
    siblingRejected = assert.rejects(sibling, (error) => {
      assert.ok(error instanceof Error);
      assert.strictEqual(error.name, "TimeoutError");
      assert.match(error.message, /Observed 2 records/);
      assert.ok(error.message.includes("\n  [info] app.jobs: recursive"));
      return true;
    });
    recorder.sink(record("first"));
    timers.fire();
  });

  assert.strictEqual((await emitting).rawMessage, "first");
  await siblingRejected;
});

test("LogRecorder.waitFor() initial scan is a stable retained snapshot", async () => {
  const recorder = createLogRecorder();
  recorder.sink(record("first"));
  const expected = record("done");
  recorder.sink(expected);
  const waiting = recorder.waitFor({
    predicate: (candidate) => {
      recorder.clear();
      recorder.sink(record("recursive"));
      return candidate.rawMessage === "done";
    },
  });

  assert.strictEqual(await waiting, expected);
  assert.strictEqual(recorder.records[0].rawMessage, "recursive");
});

test("LogRecorder.waitFor() a waiter created inside a predicate observes once", async () => {
  const recorder = createLogRecorder();
  let inner: Promise<LogRecord> | undefined;
  let checks = 0;
  const outer = recorder.waitFor({
    predicate: () => {
      inner = recorder.waitFor({
        predicate: () => {
          checks++;
          return true;
        },
      });
      return true;
    },
  });
  const expected = record("done");
  recorder.sink(expected);
  assert.strictEqual(await outer, expected);
  assert.strictEqual(await inner, expected);
  assert.strictEqual(checks, 1);
});

test("LogRecorder.waitFor() cleans timer and listener on every outcome", async () => {
  const outcomes = ["retained", "future", "abort", "throw", "timeout"] as const;
  for (const outcome of outcomes) {
    const recorder = createLogRecorder();
    const controller = new AbortController();
    const listeners = trackListeners(controller.signal);
    if (outcome === "retained") recorder.sink(record("done"));
    let checks = 0;
    let waiting!: Promise<LogRecord>;
    withTimers((timers) => {
      const options: LogRecorderWaitOptions = { signal: controller.signal };
      waiting = recorder.waitFor({
        predicate: () => {
          checks++;
          if (outcome === "throw") throw new Error("failed");
          return true;
        },
      }, options);
      assert.strictEqual(timers.delays[0], 1000);
      if (outcome === "future" || outcome === "throw") {
        recorder.sink(record("done"));
      } else if (outcome === "abort") controller.abort("cancelled");
      else if (outcome === "timeout") timers.fire();
      assert.strictEqual(timers.active.size, 0);
      assert.strictEqual(listeners.size, 0);
      const before = checks;
      recorder.sink(record("later"));
      assert.strictEqual(checks, before);
    });
    if (outcome === "retained" || outcome === "future") await waiting;
    else {await assert.rejects(waiting, (error) =>
        outcome === "abort" ? error === "cancelled" : error instanceof Error);}
  }
});

test("LogRecorder.waitFor() immediate failures and zero arm no resources", async () => {
  const recorder = createLogRecorder();
  const controller = new AbortController();
  controller.abort("cancelled");
  const waits: Promise<LogRecord>[] = [];
  withTimers((timers) => {
    waits.push(recorder.waitFor({}, { timeout: 0 }));
    waits.push(recorder.waitFor({}, { timeout: -1 }));
    waits.push(recorder.waitFor({}, { signal: controller.signal }));
    assert.strictEqual(timers.delays.length, 0);
  });
  for (const waiting of waits) await assert.rejects(waiting, () => true);
});

test("LogRecorder.waitFor() setup failure releases earlier resources", async () => {
  const recorder = createLogRecorder();
  const controller = new AbortController();
  const listeners = trackListeners(controller.signal);
  const original = globalThis.setTimeout;
  const failure = new Error("timer setup failed");
  let checks = 0;
  let waiting!: Promise<LogRecord>;
  try {
    globalThis.setTimeout = (() => {
      throw failure;
    }) as unknown as typeof setTimeout;
    waiting = recorder.waitFor({
      predicate: () => {
        checks++;
        return true;
      },
    }, { signal: controller.signal });
  } finally {
    globalThis.setTimeout = original;
  }
  await assert.rejects(waiting, (error) => error === failure);
  assert.strictEqual(listeners.size, 0);
  recorder.sink(record("later"));
  assert.strictEqual(checks, 0);
});

test("LogRecorder.waitFor() timeout diagnostics survive clear and take", async () => {
  const recorder = createLogRecorder();
  recorder.sink(record("before"));
  let waiting!: Promise<LogRecord>;
  withTimers((timers) => {
    waiting = recorder.waitFor({ message: "done" }, { timeout: 25 });
    recorder.clear();
    recorder.sink(record("middle"));
    recorder.take();
    recorder.sink(record("after"));
    recorder.sink(record("fourth"));
    timers.fire();
  });
  await assert.rejects(waiting, (error) => {
    assert.ok(error instanceof Error);
    assert.strictEqual(error.name, "TimeoutError");
    assert.match(error.message, /25 ms/);
    assert.match(error.message, /message: "done"/);
    assert.match(error.message, /Observed 4 records/);
    for (const message of ["before", "middle", "after"]) {
      assert.ok(error.message.includes(message));
    }
    assert.match(error.message, /1 more/);
    assert.ok(!error.message.includes("fourth"));
    return true;
  });
});

test("LogRecorder.waitFor() bounds and contains timeout formatting", async () => {
  const recorder = createLogRecorder();
  const circular: Record<string, unknown> = { big: 1n };
  circular.self = circular;
  recorder.sink(record("x".repeat(10000), { circular }));
  recorder.sink(record(
    "second",
    new Proxy({}, {
      ownKeys() {
        throw new Error("cannot enumerate");
      },
    }),
  ));
  let waiting!: Promise<LogRecord>;
  withTimers((timers) => {
    waiting = recorder.waitFor({ rawMessage: "y".repeat(10000) });
    timers.fire();
  });
  await assert.rejects(waiting, (error) => {
    assert.ok(error instanceof Error);
    assert.strictEqual(error.name, "TimeoutError");
    assert.ok(error.message.length <= 3000);
    assert.match(error.message, /\.\.\./);
    assert.match(error.message, /<unavailable>/);
    return true;
  });
});

test("LogRecorder.waitFor() contains matcher diagnostic failures", async () => {
  const recorder = createLogRecorder();
  const match: LogRecordMatch = {
    get message(): string {
      throw new Error("matcher unavailable");
    },
  };
  await assert.rejects(recorder.waitFor(match, { timeout: 0 }), (error) => {
    assert.ok(error instanceof Error);
    assert.strictEqual(error.name, "TimeoutError");
    assert.match(error.message, /<unavailable>/);
    assert.match(error.message, /Observed 0 records/);
    return true;
  });
});

test("LogRecorder.waitFor() settles timeout before diagnostic reentrancy", async () => {
  const recorder = createLogRecorder();
  const controller = new AbortController();
  const expected = record("done");
  const properties = {
    value: {
      toJSON() {
        recorder.sink(expected);
        controller.abort("late cancellation");
        return "diagnostic";
      },
    },
  };
  recorder.sink(record("pending", properties));
  let waiting!: Promise<LogRecord>;
  let sibling!: Promise<LogRecord>;
  withTimers((timers) => {
    sibling = recorder.waitFor({ message: "done" });
    waiting = recorder.waitFor({ rawMessage: "absent" }, {
      signal: controller.signal,
    });
    timers.fire();
  });
  await assert.rejects(waiting, { name: "TimeoutError" });
  assert.strictEqual(await sibling, expected);
});

test("LogRecorder.waitFor() observes background logger and lazy message", async () => {
  const recorder = createLogRecorder();
  const meta: LogRecord[] = [];
  await configure({
    sinks: { recorder: recorder.sink, meta: (r) => meta.push(r) },
    loggers: [
      { category: ["app"], lowestLevel: "debug", sinks: ["recorder"] },
      { category: ["logtape", "meta"], sinks: ["meta"] },
    ],
  });
  try {
    const failed = recorder.waitFor({
      predicate: () => {
        throw new Error("predicate failed");
      },
    });
    const failureObserved = assert.rejects(failed, /predicate failed/);
    let state = "completed";
    void Promise.resolve().then(() => {
      getLogger(["app", "jobs"]).with({ jobId: 42 }).info(
        (l) => l`Job ${state}`,
      );
      state = "changed";
    });
    const observed = await recorder.waitFor({
      message: /^Job ["']completed["']$/,
      properties: { jobId: 42 },
    });
    await failureObserved;
    assert.strictEqual(observed.properties.jobId, 42);
    assert.deepStrictEqual(observed.message, ["Job ", "completed", ""]);
    assert.ok(
      !meta.some((r) => String(r.rawMessage).includes("Failed to emit")),
    );
  } finally {
    await reset();
  }
});

// Helpers

function record(
  message: string,
  properties: Readonly<Record<string, unknown>> = {},
): LogRecord {
  return {
    category: ["app", "jobs"],
    level: "info",
    message: [message],
    rawMessage: message,
    timestamp: 0,
    properties,
  };
}

function trackListeners(
  signal: AbortSignal,
): Set<EventListenerOrEventListenerObject> {
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const add = signal.addEventListener.bind(signal);
  const remove = signal.removeEventListener.bind(signal);
  signal.addEventListener = (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void => {
    if (type === "abort" && listener != null) listeners.add(listener);
    add(type, listener, options);
  };
  signal.removeEventListener = (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void => {
    if (type === "abort" && listener != null) listeners.delete(listener);
    remove(type, listener, options);
  };
  return listeners;
}

function withTimers(
  run: (timers: {
    active: Set<ReturnType<typeof setTimeout>>;
    delays: number[];
    fire(): void;
  }) => void,
): void {
  const set = globalThis.setTimeout;
  const clear = globalThis.clearTimeout;
  const active = new Set<ReturnType<typeof setTimeout>>();
  const delays: number[] = [];
  let callback: (() => void) | undefined;
  try {
    globalThis.setTimeout = ((handler: () => void, timeout?: number) => {
      const handle = {} as ReturnType<typeof setTimeout>;
      active.add(handle);
      delays.push(timeout ?? 0);
      callback = handler;
      return handle;
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((handle: ReturnType<typeof setTimeout>) => {
      active.delete(handle);
    }) as typeof clearTimeout;
    run({
      active,
      delays,
      fire: () => {
        assert.ok(callback);
        callback();
      },
    });
  } finally {
    globalThis.setTimeout = set;
    globalThis.clearTimeout = clear;
  }
}
