/**
 * A coarse performance gate for logging calls that are disabled, run in CI.
 *
 * Absolute timings are meaningless on shared CI runners, so each disabled call
 * is timed against an enabled `info()` call that reaches a no-op sink, in the
 * same process, and the gate fails only when a ratio exceeds a generous limit.
 * It is meant to catch regressions of an order of magnitude, like
 * dahlia/logtape#227, where disabled calls built a whole log record before
 * discarding it, not to track small changes.
 *
 * Another logger's disabled call would be a tempting baseline, but JIT
 * compilers optimize such a no-op call away to different degrees: Pino's
 * disabled `debug()` took 4 ns on Node.js, 1 ns on Deno, and 0.1 ns on Bun.
 *
 * The limits hold on Node.js and Deno.  Bun is left out because even after
 * the fix, its disabled calls cost 13–23% of an enabled one, which overlaps
 * with what the template-literal scenario cost on Node.js before the fix.
 *
 * Run it with `mise run bench:disabled`, which builds *@logtape/logtape* first
 * so that Node.js does not measure a stale build.
 */
import * as logtape from "@logtape/logtape";
import process from "node:process";

interface Scenario {
  readonly name: string;
  /** The largest allowed ratio to the enabled baseline call. */
  readonly limit: number;
  readonly run: (iterations: number) => void;
}

const iterations = 300_000;
const rounds = 15;

await logtape.configure({
  sinks: {
    null() {},
  },
  loggers: [
    { category: ["logtape", "meta"], lowestLevel: "warning", sinks: [] },
    { category: "app", lowestLevel: "info", sinks: ["null"] },
  ],
});

const appLogger = logtape.getLogger("app");
const contextLogger = appLogger.with({ requestId: "req-1" });
// A library logging under a category the application never configured:
const libraryLogger = logtape.getLogger(["some-library", "module"]);

const baseline: Scenario = {
  name: "Enabled info() (baseline)",
  limit: 1,
  run(n) {
    for (let i = 0; i < n; i++) appLogger.info("Enabled message.");
  },
};

// The ratios measured on Node.js and Deno before dahlia/logtape#227 was fixed
// and after it are noted next to each limit.
const scenarios: readonly Scenario[] = [
  {
    name: "Disabled debug() with a string",
    limit: 0.35, // Before: 0.70–0.76; after: 0.07–0.09.
    run(n) {
      for (let i = 0; i < n; i++) appLogger.debug("Disabled message.");
    },
  },
  {
    name: "Disabled debug() through with()",
    limit: 0.35, // Before: 1.2–3.0; after: 0.04–0.05.
    run(n) {
      for (let i = 0; i < n; i++) contextLogger.debug("Disabled message.");
    },
  },
  {
    name: "Disabled debug() with a template",
    limit: 0.12, // Before: 0.21–0.29; after: 0.03.
    run(n) {
      for (let i = 0; i < n; i++) appLogger.debug`Disabled message ${i}.`;
    },
  },
  {
    name: "info() without sinks",
    limit: 0.7, // Before: 1.0–1.1; after: 0.24–0.40.
    run(n) {
      for (let i = 0; i < n; i++) libraryLogger.info("Dropped message.");
    },
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

const all = [baseline, ...scenarios];
// Warm up so that every scenario is optimized before it is measured:
for (const scenario of all) scenario.run(iterations);

// Interleave the scenarios so that a noisy moment on the runner affects all
// of them rather than one:
const samples = new Map<Scenario, number[]>(all.map((s) => [s, []]));
for (let round = 0; round < rounds; round++) {
  for (const scenario of all) samples.get(scenario)!.push(measure(scenario));
}

const baselineTime = median(samples.get(baseline)!);
let failed = false;
console.log(`${"Scenario".padEnd(34)} ${"ns/op".padStart(8)}  ratio  limit`);
for (const scenario of all) {
  const time = median(samples.get(scenario)!);
  const ratio = time / baselineTime;
  const over = scenario !== baseline && ratio > scenario.limit;
  if (over) failed = true;
  console.log(
    `${scenario.name.padEnd(34)} ${time.toFixed(1).padStart(8)} ` +
      `${ratio.toFixed(2).padStart(6)} ${
        scenario.limit.toFixed(2).padStart(6)
      }` +
      (over ? "  FAILED" : ""),
  );
}

await logtape.dispose();
if (failed) {
  console.error(
    "\nA disabled logging call is much slower than expected.  It probably " +
      "builds a log record before checking whether the record is dropped; " +
      "see https://github.com/dahlia/logtape/issues/227.",
  );
  process.exit(1);
}
