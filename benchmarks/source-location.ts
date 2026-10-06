/**
 * Measures what source location capture costs, and what it costs when it is
 * not used.
 *
 * Each scenario is timed in the same process as an enabled `info()` call
 * that reaches a no-op sink while no configuration enables source location
 * capture, and reported as a ratio to it.  The scenarios cover:
 *
 *  -  the default configuration, where capture is disabled everywhere;
 *  -  loggers that do not capture while the global configuration or a scoped
 *     configuration enables capture for another category, which pay for
 *     resolving the setting but never build a stack trace;
 *  -  loggers that capture, which build and parse a stack trace for every
 *     call that is not dropped by its level.
 *
 * Unlike *disabled.ts*, this is not a gate; it only reports the numbers.  Run
 * it with `pnpm source-location` (Node.js), `pnpm source-location:bun`, or
 * `deno task source-location` after building *@logtape/logtape* with
 * `pnpm --filter @logtape/logtape build`.
 */
import * as logtape from "@logtape/logtape";
import { AsyncLocalStorage } from "node:async_hooks";

interface Scenario {
  readonly name: string;
  readonly run: (iterations: number) => void;
}

interface Group {
  readonly name: string;
  readonly config: (
    sinks: Record<"null", logtape.Sink>,
  ) => logtape.Config<"null", string>;
  readonly scope?: logtape.ScopedConfig<"null", string>;
  readonly scenarios: readonly Scenario[];
}

const iterations = 100_000;
const rounds = 11;

const meta: logtape.LoggerConfig<"null", string> = {
  category: ["logtape", "meta"],
  lowestLevel: "warning",
  sinks: [],
};

function scenariosFor(label: string): Scenario[] {
  const logger = logtape.getLogger("app");
  const contextLogger = logger.with({ requestId: "req-1" });
  return [
    {
      name: `${label}: info()`,
      run(n) {
        for (let i = 0; i < n; i++) logger.info("Enabled message.");
      },
    },
    {
      name: `${label}: info() through with()`,
      run(n) {
        for (let i = 0; i < n; i++) contextLogger.info("Enabled message.");
      },
    },
    {
      name: `${label}: info() with a template`,
      run(n) {
        for (let i = 0; i < n; i++) logger.info`Enabled message ${i}.`;
      },
    },
    {
      name: `${label}: disabled debug()`,
      run(n) {
        for (let i = 0; i < n; i++) logger.debug("Disabled message.");
      },
    },
  ];
}

const groups: readonly Group[] = [
  {
    name: "Capture disabled (default)",
    config: (sinks) => ({
      sinks,
      loggers: [meta, {
        category: "app",
        lowestLevel: "info",
        sinks: ["null"],
      }],
    }),
    scenarios: scenariosFor("Default"),
  },
  {
    name: "Capture enabled for another category",
    config: (sinks) => ({
      sinks,
      loggers: [
        meta,
        { category: "app", lowestLevel: "info", sinks: ["null"] },
        { category: "other", captureSourceLocation: true },
      ],
    }),
    scenarios: scenariosFor("Other category"),
  },
  {
    name: "Capture enabled for another category by a scoped configuration",
    config: (sinks) => ({
      sinks,
      loggers: [meta, {
        category: "app",
        lowestLevel: "info",
        sinks: ["null"],
      }],
      contextLocalStorage: new AsyncLocalStorage(),
    }),
    scope: {
      sinks: { null() {} },
      loggers: [
        { category: "app", lowestLevel: "info", sinks: ["null"] },
        { category: "other", captureSourceLocation: true },
      ],
    },
    scenarios: scenariosFor("Scoped, other category"),
  },
  {
    name: "Capture enabled",
    config: (sinks) => ({
      sinks,
      loggers: [
        meta,
        {
          category: "app",
          lowestLevel: "info",
          sinks: ["null"],
          captureSourceLocation: true,
        },
      ],
    }),
    scenarios: scenariosFor("Capture"),
  },
];

function measure(scenario: Scenario): number {
  const started = performance.now();
  scenario.run(iterations);
  return (performance.now() - started) * 1e6 / iterations;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function measureGroup(group: Group): Map<Scenario, number> {
  // Warm up so that every scenario is optimized before it is measured:
  for (const scenario of group.scenarios) scenario.run(iterations);
  // Interleave the scenarios so that a noisy moment affects all of them:
  const samples = new Map<Scenario, number[]>(
    group.scenarios.map((s) => [s, []]),
  );
  for (let round = 0; round < rounds; round++) {
    for (const scenario of group.scenarios) {
      samples.get(scenario)!.push(measure(scenario));
    }
  }
  return new Map(
    [...samples].map(([scenario, times]) => [scenario, median(times)]),
  );
}

const results: [string, Map<Scenario, number>][] = [];
for (const group of groups) {
  logtape.configureSync({ ...group.config({ null() {} }), reset: true });
  const result = group.scope == null
    ? measureGroup(group)
    : logtape.withConfigSync(group.scope, () => measureGroup(group));
  results.push([group.name, result]);
}
logtape.resetSync();

const baseline = results[0][1].values().next().value!;
console.log(`${"Scenario".padEnd(44)} ${"ns/op".padStart(8)}  ratio`);
for (const [name, result] of results) {
  console.log(`\n${name}`);
  for (const [scenario, time] of result) {
    console.log(
      `${scenario.name.padEnd(44)} ${time.toFixed(1).padStart(8)} ` +
        `${(time / baseline).toFixed(2).padStart(6)}`,
    );
  }
}
