<script setup lang="ts">
import { withBase } from "vitepress";

interface Bar {
  name: string;
  value: number;
  unit: string;
  note?: string;
  us?: boolean;
}

// Minified + gzipped, via Bundlephobia (see /comparison).
const size: Bar[] = [
  { name: "Pino", value: 3.1, unit: "KB", note: "1 dep" },
  { name: "LogTape", value: 5.3, unit: "KB", note: "0 deps", us: true },
  { name: "bunyan", value: 5.7, unit: "KB", note: "0 deps" },
  { name: "log4js", value: 12.9, unit: "KB", note: "5 deps" },
  { name: "Signale", value: 16.4, unit: "KB", note: "23 deps" },
  { name: "winston", value: 38.3, unit: "KB", note: "17 deps" },
];

// Console-output overhead on Node.js, ns/iter (see /comparison and
// benchmarks/). LogTape is fastest on Bun and best on average across runtimes.
const perf: Bar[] = [
  { name: "Pino", value: 339, unit: "ns" },
  { name: "LogTape", value: 451, unit: "ns", us: true },
  { name: "winston", value: 2130, unit: "ns" },
  { name: "bunyan", value: 2320, unit: "ns" },
  { name: "log4js", value: 3400, unit: "ns" },
  { name: "Signale", value: 4360, unit: "ns" },
];

const sizeMax = Math.max(...size.map((r) => r.value));
const perfMax = Math.max(...perf.map((r) => r.value));

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
</script>

<template>
  <section class="lt-section lt-bz">
    <div class="lt-wrap lt-bz__grid">
      <div class="lt-bz__lead" v-reveal>
        <p class="lt-eyebrow">What you ship</p>
        <h2 class="lt-h2">Small, fast, and<br />dependency-free.</h2>
        <p class="lt-lede">
          5.3&nbsp;KB, zero dependencies, fully tree-shakable, and quick: on real
          console output LogTape sits with Pino at the top, several times ahead
          of winston, bunyan, and log4js. You pay for it once at install and
          again at run time, and both bills are small.
        </p>
        <a class="lt-bz__more" :href="withBase('/comparison')">
          See the full comparison →
        </a>
      </div>

      <div class="lt-bz__charts">
        <p class="lt-bz__cap">Bundle size · min + gzip</p>
        <ul class="lt-bz__chart">
          <li
            v-for="r in size"
            :key="r.name"
            class="lt-bz__row"
            :class="{ 'is-us': r.us }"
            v-reveal
          >
            <span class="lt-bz__name">{{ r.name }}</span>
            <span class="lt-bz__track">
              <span
                class="lt-bz__fill"
                :style="{ '--w': `${(r.value / sizeMax) * 100}%` }"
              />
            </span>
            <span class="lt-bz__val">
              {{ r.value }}<span class="lt-bz__unit">{{ r.unit }}</span>
            </span>
            <span class="lt-bz__note">{{ r.note }}</span>
          </li>
        </ul>

        <p class="lt-bz__cap lt-bz__cap--gap">Console overhead · Node.js</p>
        <ul class="lt-bz__chart">
          <li
            v-for="r in perf"
            :key="r.name"
            class="lt-bz__row lt-bz__row--perf"
            :class="{ 'is-us': r.us }"
            v-reveal
          >
            <span class="lt-bz__name">{{ r.name }}</span>
            <span class="lt-bz__track">
              <span
                class="lt-bz__fill"
                :style="{ '--w': `${(r.value / perfMax) * 100}%` }"
              />
            </span>
            <span class="lt-bz__val">
              {{ fmt(r.value) }}<span class="lt-bz__unit">{{ r.unit }}</span>
            </span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lt-bz {
  background: var(--lt-card-2);
  border-bottom: 1px solid var(--lt-hairline);
}

.lt-bz__grid {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
  gap: clamp(32px, 5vw, 72px);
  align-items: center;
}

.lt-bz__lead,
.lt-bz__charts {
  min-width: 0;
}

.lt-bz__more {
  display: inline-block;
  margin-top: 1.3rem;
  font-weight: 600;
  color: var(--lt-amber);
}

.lt-bz__cap {
  margin: 0 0 0.85rem;
  font-family: var(--vp-font-family-mono);
  font-size: 0.66rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
}

.lt-bz__cap--gap {
  margin-top: 1.8rem;
}

.lt-bz__chart {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.lt-bz__row {
  display: grid;
  grid-template-columns: 4.6rem 1fr auto auto;
  align-items: center;
  gap: 0.85rem;
  font-family: var(--vp-font-family-mono);
}

.lt-bz__row--perf {
  grid-template-columns: 4.6rem 1fr auto;
}

.lt-bz__name {
  font-size: 0.84rem;
  color: var(--vp-c-text-2);
  text-align: right;
}

.is-us .lt-bz__name {
  color: var(--lt-amber);
  font-weight: 700;
}

.lt-bz__track {
  position: relative;
  height: 0.72rem;
  background: var(--lt-hairline);
  border-radius: 999px;
  overflow: hidden;
}

.lt-bz__fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: 0;
  border-radius: 999px;
  background: var(--lt-shell);
  transition: width 0.9s cubic-bezier(0.16, 1, 0.3, 1);
}

.lt-bz__row.is-visible .lt-bz__fill {
  width: var(--w);
}

.is-us .lt-bz__fill {
  background: linear-gradient(90deg, var(--lt-amber-strong), var(--lt-rec));
}

.lt-bz__val {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  min-width: 4.2rem;
  text-align: right;
}

.lt-bz__unit {
  font-size: 0.66rem;
  color: var(--vp-c-text-3);
  margin-left: 0.15rem;
}

.lt-bz__note {
  font-size: 0.7rem;
  color: var(--vp-c-text-3);
  min-width: 3.8rem;
  text-align: right;
}

@media (prefers-reduced-motion: reduce) {
  .lt-bz__fill {
    transition: none;
  }
}

@media (max-width: 860px) {
  .lt-bz__grid {
    grid-template-columns: 1fr;
    gap: 32px;
  }
}

@media (max-width: 520px) {
  .lt-bz__row {
    grid-template-columns: 3.6rem 1fr auto;
  }
  .lt-bz__note {
    display: none;
  }
}
</style>
