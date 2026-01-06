LogTape Benchmarks
==================

This document contains comprehensive benchmark results for LogTape compared to
other popular logging libraries across different JavaScript runtimes.


Test environment
----------------

 -  *OS*: Linux (Fedora 42) 6.14.9-300.fc42.x86_64

 -  *CPU*: AMD Ryzen 7 7700X 8-Core Processor

 -  *Runtime versions*:

     -  Node.js: v24.2.0
     -  Bun: 1.2.16
     -  Deno: 2.3.6 (V8 13.7.152.6-rusty, TypeScript 5.8.3)

 -  *Library versions*:

     -  LogTape: 1.0.0
     -  winston: 3.17.0
     -  pino: 9.7.0
     -  bunyan: 1.8.15
     -  log4js: 6.9.1
     -  Signale: 1.4.0
     -  Hive Logger: 1.0.0


Benchmark results
-----------------

### Null benchmark (no output)

This benchmark measures the pure logging overhead when logs are not actually
written anywhere.

#### Node.js results

| Rank | Library     | Time (ns/iter) | Relative Speed      |
|------|-------------|---------------:|---------------------|
| 1    | Hive Logger |         157.64 | 1.00x (fastest)     |
| 2    | LogTape     |         162.64 | 1.03x slower        |
| 3    | log4js      |         278.50 | 1.77x slower        |
| 4    | pino        |         570.24 | 3.62x slower        |
| 5    | winston     |         700.67 | 4.44x slower        |
| 6    | bunyan      |       1,460.00 | 9.24x slower        |
| 7    | Signale     |       2,700.00 | 17.13x slower       |

#### Bun results

| Rank | Library     | Time (ns/iter) | Relative Speed      |
|------|-------------|---------------:|---------------------|
| 1    | Hive Logger |         156.90 | 1.00x (fastest)     |
| 2    | LogTape     |         187.30 | 1.19x slower        |
| 3    | log4js      |         260.62 | 1.66x slower        |
| 4    | winston     |         569.12 | 3.63x slower        |
| 5    | pino        |         715.33 | 4.56x slower        |
| 6    | Signale     |       1,120.00 | 7.17x slower        |
| 7    | bunyan      |       1,270.00 | 8.07x slower        |

#### Deno results

| Rank | Library     | Time (ns/iter) | Relative Speed      |
|------|-------------|---------------:|---------------------|
| 1    | LogTape     |         178.40 | 1.00x (fastest)     |
| 2    | log4js      |         273.95 | 1.54x slower        |
| 3    | winston     |         756.68 | 4.24x slower        |
| 4    | pino        |       1,060.00 | 5.94x slower        |
| 5    | bunyan      |       1,570.00 | 8.80x slower        |
| 6    | Signale     |       2,250.00 | 12.64x slower       |
| 7    | Hive Logger |       2,390.00 | 13.38x slower       |

### Console benchmark (console output)

This benchmark measures logging performance when outputting to the console.

#### Node.js results

| Rank | Library     | Time (ns/iter) | Relative Speed      |
|------|-------------|---------------:|---------------------|
| 1    | LogTape     |         213.63 | 1.00x (fastest)     |
| 2    | pino        |         325.88 | 1.53x slower        |
| 3    | winston     |       2,050.00 | 9.61x slower        |
| 4    | Hive Logger |       2,340.00 | 10.95x slower       |
| 5    | bunyan      |       2,390.00 | 11.18x slower       |
| 6    | log4js      |       3,600.00 | 16.87x slower       |
| 7    | Signale     |       4,110.00 | 19.24x slower       |

#### Bun results

| Rank | Library     | Time (ns/iter) | Relative Speed      |
|------|-------------|---------------:|---------------------|
| 1    | LogTape     |         224.88 | 1.00x (fastest)     |
| 2    | pino        |         873.89 | 3.89x slower        |
| 3    | Hive Logger |       1,510.00 | 6.73x slower        |
| 4    | winston     |       1,770.00 | 7.87x slower        |
| 5    | bunyan      |       2,020.00 | 8.97x slower        |
| 6    | Signale     |       2,110.00 | 9.38x slower        |
| 7    | log4js      |       3,540.00 | 15.74x slower       |

#### Deno results

| Rank | Library     | Time (ns/iter) | Relative Speed      |
|------|-------------|---------------:|---------------------|
| 1    | LogTape     |         236.14 | 1.00x (fastest)     |
| 2    | pino        |         301.66 | 1.28x slower        |
| 3    | Signale     |       3,020.00 | 12.78x slower       |
| 4    | bunyan      |       3,260.00 | 13.81x slower       |
| 5    | winston     |       3,370.00 | 14.25x slower       |
| 6    | log4js      |       4,430.00 | 18.74x slower       |
| 7    | Hive Logger |       4,810.00 | 20.38x slower       |

### File benchmark (file output)

This benchmark measures logging performance when writing to files.

#### Node.js results

| Rank | Library          | Time (ns/iter) | Relative Speed      |
|------|------------------|---------------:|---------------------|
| 1    | winston          |         175.09 | 1.00x (fastest)     |
| 2    | pino             |         326.25 | 1.86x slower        |
| 3    | LogTape (stream) |         718.87 | 4.11x slower        |
| 4    | LogTape          |         952.08 | 5.44x slower        |
| 5    | bunyan           |       1,550.00 | 8.83x slower        |
| 6    | log4js           |       1,790.00 | 10.22x slower       |
| 7    | Signale          |       2,900.00 | 16.56x slower       |

#### Bun results

| Rank | Library          | Time (ns/iter) | Relative Speed      |
|------|------------------|---------------:|---------------------|
| 1    | winston          |         166.34 | 1.00x (fastest)     |
| 2    | pino             |         182.07 | 1.09x slower        |
| 3    | LogTape          |         617.50 | 3.71x slower        |
| 4    | LogTape (stream) |         941.07 | 5.66x slower        |
| 5    | bunyan           |       1,390.00 | 8.35x slower        |
| 6    | Signale          |       1,590.00 | 9.55x slower        |
| 7    | log4js           |       3,800.00 | 22.84x slower       |

#### Deno results

| Rank | Library          | Time (ns/iter) | Relative Speed      |
|------|------------------|---------------:|---------------------|
| 1    | winston          |         230.25 | 1.00x (fastest)     |
| 2    | pino             |         299.75 | 1.30x slower        |
| 3    | LogTape (stream) |         980.78 | 4.26x slower        |
| 4    | LogTape          |       1,110.00 | 4.81x slower        |
| 5    | bunyan           |       1,710.00 | 7.42x slower        |
| 6    | log4js           |       2,040.00 | 8.85x slower        |
| 7    | Signale          |       2,560.00 | 11.13x slower       |

### JSON benchmark (JSON output)

This benchmark measures logging performance when outputting structured JSON logs.

#### Node.js results

| Rank | Library | Time (ns/iter) | Relative Speed      |
|------|---------|---------------:|---------------------|
| 1    | winston |         331.29 | 1.00x (fastest)     |
| 2    | pino    |         804.53 | 2.43x slower        |
| 3    | LogTape |       1,670.00 | 5.04x slower        |
| 4    | bunyan  |       2,430.00 | 7.35x slower        |

#### Bun results

| Rank | Library | Time (ns/iter) | Relative Speed      |
|------|---------|---------------:|---------------------|
| 1    | winston |         409.47 | 1.00x (fastest)     |
| 2    | pino    |         569.14 | 1.39x slower        |
| 3    | LogTape |       1,550.00 | 3.78x slower        |
| 4    | bunyan  |       3,820.00 | 9.34x slower        |

#### Deno results

| Rank | Library | Time (ns/iter) | Relative Speed      |
|------|---------|---------------:|---------------------|
| 1    | winston |         396.76 | 1.00x (fastest)     |
| 2    | pino    |         723.19 | 1.82x slower        |
| 3    | LogTape |       1,890.00 | 4.77x slower        |
| 4    | bunyan  |       3,760.00 | 9.48x slower        |


Summary
-------

### LogTape performance highlights

 -  *Null benchmark*: LogTape performs exceptionally well across all runtimes,
    ranking 1st in Deno and 2nd in Node.js and Bun
 -  *Console benchmark*: LogTape consistently ranks 1st across all three
    runtimes, showing excellent console logging performance
 -  *File benchmark*: LogTape performs moderately well, with the stream version
    generally performing better than the standard version
 -  *JSON benchmark*: LogTape shows moderate performance in structured logging
    scenarios

### Key observations

 1. *Runtime performance varies*: Different libraries perform differently across
    runtimes, indicating optimization strategies vary
 2. *LogTape consistency*: LogTape maintains consistent performance
    characteristics across different runtimes
 3. *Winston file performance*: Winston shows exceptional file writing
    performance across all runtimes
 4. *Null vs real output*: Performance characteristics change significantly
    when actual output is involved
 5. *Stream vs standard LogTape*: The stream version of LogTape generally
    performs better for file operations

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
