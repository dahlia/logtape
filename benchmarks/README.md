LogTape Benchmarks
==================

This document contains comprehensive benchmark results for LogTape compared to
other popular logging libraries across different JavaScript runtimes.


Test environment
----------------

 -  *OS*: Linux (Fedora 44) 7.0.10-201.fc44.x86\_64

 -  *CPU*: AMD Ryzen 7 7700X 8-Core Processor

 -  *Runtime versions*:

     -  Node.js: v24.16.0
     -  Bun: 1.3.14
     -  Deno: 2.8.2 (V8 14.9.207.2-rusty, TypeScript 6.0.3)

 -  *Library versions*:

     -  LogTape: 2.2.0
     -  winston: 3.19.0
     -  pino: 10.3.1
     -  bunyan: 1.8.15
     -  log4js: 6.9.1
     -  Signale: 1.4.0
     -  Hive Logger: 1.1.0


Benchmark results
-----------------

### Null benchmark (no output)

This benchmark measures logging overhead when log calls are enabled but
routed to output that does not write anywhere.

#### Node.js results

| Rank | Library     | Time (ns/iter) | Relative Speed  |
| ---- | ----------- | -------------: | --------------- |
| 1    | Hive Logger |         157.25 | 1.00x (fastest) |
| 2    | log4js      |         293.62 | 1.87x slower    |
| 3    | LogTape     |         381.27 | 2.42x slower    |
| 4    | pino        |         585.30 | 3.72x slower    |
| 5    | winston     |         733.54 | 4.66x slower    |
| 6    | bunyan      |       1,430.00 | 9.11x slower    |
| 7    | Signale     |       2,770.00 | 17.64x slower   |

#### Bun results

| Rank | Library     | Time (ns/iter) | Relative Speed  |
| ---- | ----------- | -------------: | --------------- |
| 1    | Hive Logger |          89.00 | 1.00x (fastest) |
| 2    | LogTape     |         201.83 | 2.27x slower    |
| 3    | log4js      |         276.14 | 3.10x slower    |
| 4    | winston     |         662.53 | 7.44x slower    |
| 5    | pino        |         773.05 | 8.69x slower    |
| 6    | Signale     |       1,190.00 | 13.33x slower   |
| 7    | bunyan      |       1,340.00 | 15.10x slower   |

#### Deno results

| Rank | Library     | Time (ns/iter) | Relative Speed  |
| ---- | ----------- | -------------: | --------------- |
| 1    | log4js      |         289.40 | 1.00x (fastest) |
| 2    | LogTape     |         321.31 | 1.11x slower    |
| 3    | Hive Logger |         388.21 | 1.34x slower    |
| 4    | winston     |         833.17 | 2.88x slower    |
| 5    | pino        |         892.80 | 3.08x slower    |
| 6    | bunyan      |       1,600.00 | 5.53x slower    |
| 7    | Signale     |       2,380.00 | 8.22x slower    |

### Console benchmark (console output)

This benchmark measures logging performance when outputting to the console.

#### Node.js results

| Rank | Library     | Time (ns/iter) | Relative Speed  |
| ---- | ----------- | -------------: | --------------- |
| 1    | pino        |         338.74 | 1.00x (fastest) |
| 2    | LogTape     |         450.59 | 1.33x slower    |
| 3    | winston     |       2,130.00 | 6.28x slower    |
| 4    | Hive Logger |       2,200.00 | 6.50x slower    |
| 5    | bunyan      |       2,320.00 | 6.84x slower    |
| 6    | log4js      |       3,400.00 | 10.05x slower   |
| 7    | Signale     |       4,360.00 | 12.86x slower   |

#### Bun results

| Rank | Library     | Time (ns/iter) | Relative Speed  |
| ---- | ----------- | -------------: | --------------- |
| 1    | LogTape     |         215.39 | 1.00x (fastest) |
| 2    | pino        |         943.81 | 4.38x slower    |
| 3    | Hive Logger |       1,550.00 | 7.20x slower    |
| 4    | winston     |       1,880.00 | 8.73x slower    |
| 5    | Signale     |       1,980.00 | 9.17x slower    |
| 6    | bunyan      |       2,060.00 | 9.55x slower    |
| 7    | log4js      |       3,820.00 | 17.73x slower   |

#### Deno results

| Rank | Library     | Time (ns/iter) | Relative Speed  |
| ---- | ----------- | -------------: | --------------- |
| 1    | pino        |         376.76 | 1.00x (fastest) |
| 2    | LogTape     |         391.43 | 1.04x slower    |
| 3    | Hive Logger |       3,450.00 | 9.15x slower    |
| 4    | winston     |       3,630.00 | 9.64x slower    |
| 5    | log4js      |       3,770.00 | 10.00x slower   |
| 6    | bunyan      |       3,870.00 | 10.28x slower   |
| 7    | Signale     |       4,370.00 | 11.60x slower   |

### File benchmark (file output)

This benchmark measures logging performance when writing to files.

#### Node.js results

| Rank | Library          | Time (ns/iter) | Relative Speed  |
| ---- | ---------------- | -------------: | --------------- |
| 1    | winston          |         159.68 | 1.00x (fastest) |
| 2    | pino             |         331.67 | 2.08x slower    |
| 3    | LogTape (stream) |       1,240.00 | 7.75x slower    |
| 4    | LogTape          |       1,390.00 | 8.72x slower    |
| 5    | bunyan           |       1,670.00 | 10.49x slower   |
| 6    | log4js           |       1,800.00 | 11.25x slower   |
| 7    | Signale          |       2,990.00 | 18.70x slower   |

#### Bun results

| Rank | Library          | Time (ns/iter) | Relative Speed  |
| ---- | ---------------- | -------------: | --------------- |
| 1    | winston          |         164.66 | 1.00x (fastest) |
| 2    | pino             |         179.12 | 1.09x slower    |
| 3    | LogTape          |         801.54 | 4.87x slower    |
| 4    | LogTape (stream) |       1,040.00 | 6.29x slower    |
| 5    | bunyan           |       1,500.00 | 9.13x slower    |
| 6    | Signale          |       1,560.00 | 9.47x slower    |
| 7    | log4js           |       3,770.00 | 22.87x slower   |

#### Deno results

| Rank | Library          | Time (ns/iter) | Relative Speed  |
| ---- | ---------------- | -------------: | --------------- |
| 1    | winston          |         249.18 | 1.00x (fastest) |
| 2    | pino             |         366.29 | 1.47x slower    |
| 3    | LogTape          |       1,310.00 | 5.24x slower    |
| 4    | LogTape (stream) |       1,390.00 | 5.56x slower    |
| 5    | bunyan           |       1,920.00 | 7.69x slower    |
| 6    | log4js           |       2,010.00 | 8.08x slower    |
| 7    | Signale          |       2,520.00 | 10.13x slower   |

### JSON benchmark (JSON output)

This benchmark measures logging performance when outputting structured JSON
logs.

#### Node.js results

| Rank | Library | Time (ns/iter) | Relative Speed  |
| ---- | ------- | -------------: | --------------- |
| 1    | winston |         327.56 | 1.00x (fastest) |
| 2    | pino    |         831.21 | 2.54x slower    |
| 3    | bunyan  |       2,370.00 | 7.23x slower    |
| 4    | LogTape |       2,970.00 | 9.07x slower    |

#### Bun results

| Rank | Library | Time (ns/iter) | Relative Speed  |
| ---- | ------- | -------------: | --------------- |
| 1    | winston |         444.20 | 1.00x (fastest) |
| 2    | pino    |         585.74 | 1.32x slower    |
| 3    | LogTape |       2,320.00 | 5.22x slower    |
| 4    | bunyan  |       4,150.00 | 9.35x slower    |

#### Deno results

| Rank | Library | Time (ns/iter) | Relative Speed  |
| ---- | ------- | -------------: | --------------- |
| 1    | winston |         472.49 | 1.00x (fastest) |
| 2    | pino    |         888.79 | 1.88x slower    |
| 3    | LogTape |       2,890.00 | 6.12x slower    |
| 4    | bunyan  |       3,690.00 | 7.81x slower    |


Summary
-------

### Performance notes

 -  *Null benchmark*: Hive Logger and log4js had the lowest overhead in this
    no-op output benchmark.  LogTape is now close to the fastest no-op
    appenders, ranking second on Bun and Deno and third on Node.js.
 -  *Console benchmark*: LogTape had the best result on Bun and the best
    average across runtimes.  Pino remained fastest on Node.js and Deno.
 -  *File benchmark*: winston remained fastest across all runtimes.  LogTape's
    standard and stream file sinks improved substantially, but were still
    slower than the fastest enqueue-heavy file paths in this synthetic
    benchmark.
 -  *JSON benchmark*: winston and pino were fastest.  LogTape's structured
    formatting overhead improved, but remains above the fastest JSON paths.

### Key observations

1.  *Runtime performance varies*: Different libraries perform differently across
    runtimes, indicating optimization strategies vary
2.  *LogTape overhead changed*: Core hot-path optimizations moved LogTape's
    no-op and console overhead into the leading group
3.  *Winston file performance*: Winston shows exceptional file writing
    performance across all runtimes
4.  *Null vs real output*: Performance characteristics change significantly
    when actual output is involved
5.  *Stream vs standard LogTape*: The stream file sink was close to the
    standard file sink in this run, with no consistent winner across runtimes

### Running the benchmarks

To run these benchmarks yourself:

~~~~ bash
# Node.js benchmarks
pnpm run null
pnpm run console
pnpm run file
pnpm run json

# Bun benchmarks
pnpm run null:bun
pnpm run console:bun
pnpm run file:bun
pnpm run json:bun

# Deno benchmarks
deno task null
deno task console
deno task file
deno task json
~~~~

> [!NOTE]
> Console benchmarks filter out actual log messages using
> `grep -v 'Test log message.'` to focus on performance measurement rather
> than output display.
