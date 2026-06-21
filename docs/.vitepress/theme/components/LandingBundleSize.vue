<script setup lang="ts">
import { withBase } from "vitepress";

interface Row {
  name: string;
  kb: number;
  deps: number;
  shake: boolean;
  us?: boolean;
}

// Minified + gzipped, via Bundlephobia (see /comparison).
const rows: Row[] = [
  { name: "Pino", kb: 3.1, deps: 1, shake: false },
  { name: "LogTape", kb: 5.3, deps: 0, shake: true, us: true },
  { name: "bunyan", kb: 5.7, deps: 0, shake: false },
  { name: "log4js", kb: 12.9, deps: 5, shake: false },
  { name: "Signale", kb: 16.4, deps: 23, shake: false },
  { name: "winston", kb: 38.3, deps: 17, shake: false },
];

const max = Math.max(...rows.map((r) => r.kb));
</script>

<template>
  <section class="lt-section lt-bz">
    <div class="lt-wrap lt-bz__grid">
      <div class="lt-bz__lead" v-reveal>
        <p class="lt-eyebrow">What you ship</p>
        <h2 class="lt-h2">Tiny, tree-shakable,<br />and dependency-free.</h2>
        <p class="lt-lede">
          5.3&nbsp;KB, zero dependencies, and fully tree-shakable, so what you
          import is all you pay for. No transitive packages to audit, patch, or
          worry about.
        </p>
        <a class="lt-bz__more" :href="withBase('/comparison')">
          See the full comparison →
        </a>
      </div>

      <ul class="lt-bz__chart">
        <li
          v-for="r in rows"
          :key="r.name"
          class="lt-bz__row"
          :class="{ 'is-us': r.us }"
          v-reveal
        >
          <span class="lt-bz__name">{{ r.name }}</span>
          <span class="lt-bz__track">
            <span class="lt-bz__fill" :style="{ '--w': `${(r.kb / max) * 100}%` }" />
          </span>
          <span class="lt-bz__val">
            {{ r.kb }}<span class="lt-bz__unit">KB</span>
          </span>
          <span class="lt-bz__deps">
            {{ r.deps }} {{ r.deps === 1 ? "dep" : "deps" }}
          </span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.lt-bz {
  background: var(--lt-paper);
  border-bottom: 1px solid var(--lt-hairline);
}

.lt-bz__grid {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
  gap: clamp(32px, 5vw, 72px);
  align-items: center;
}

.lt-bz__lead,
.lt-bz__chart {
  min-width: 0;
}

.lt-bz__more {
  display: inline-block;
  margin-top: 1.3rem;
  font-weight: 600;
  color: var(--lt-amber);
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
  min-width: 3.4rem;
  text-align: right;
}

.lt-bz__unit {
  font-size: 0.66rem;
  color: var(--vp-c-text-3);
  margin-left: 0.15rem;
}

.lt-bz__deps {
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
  .lt-bz__deps {
    display: none;
  }
}
</style>
