<script setup lang="ts">
import { ref } from "vue";
import Console, { type LogLine } from "./Console.vue";
import CodeCard from "./CodeCard.vue";

const recording = ref(false);

const libCode = `// inside your library
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["shopkit", "checkout"]);

export function charge(orderId: string) {
  logger.debug("charging order {orderId}", { orderId });
  // ...
}`;

const appCode = `// inside the application, opt in when you want
import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: ["shopkit"], lowestLevel: "debug", sinks: ["console"] },
  ],
});`;

const lines: LogLine[] = [
  { level: "debug", cat: "shopkit·checkout", msg: "charging order [[#10293]]" },
  { level: "info", cat: "shopkit·checkout", msg: "captured [[$42.00]]" },
  { level: "debug", cat: "shopkit·email", msg: "queued receipt to [[u_8f21]]" },
  { level: "warning", cat: "shopkit·stock", msg: "low stock on [[SKU-7]]" },
];
</script>

<template>
  <section class="lt-section lt-unob">
    <div class="lt-wrap lt-unob__grid">
      <div class="lt-unob__copy" v-reveal>
        <p class="lt-eyebrow">The unobtrusive contract</p>
        <h2 class="lt-h2">No configuration?<br />No logs.</h2>
        <p class="lt-lede">
          A library built on LogTape stays completely silent until the
          application opts in. No setup means no output, no errors, no side
          effects, so your dependencies never spam a console or force a logger
          on anyone. The app stays in full control of if, where, and how logs
          play back.
        </p>

        <div class="lt-unob__codes">
          <CodeCard
            :code="libCode"
            filename="shopkit/checkout.ts"
            note="always present"
          />
          <CodeCard
            :code="appCode"
            filename="app/main.ts"
            note="this is what REC runs"
          />
        </div>
      </div>

      <div class="lt-unob__demo" v-reveal>
        <Console
          :lines="lines"
          label="shopkit.log"
          :recording="recording"
          :stream="true"
          silent-hint="// no configure() yet, so every logger call is a no-op"
        />
        <div class="lt-unob__controls">
          <button
            class="lt-rec-btn"
            :class="{ 'is-on': recording }"
            :aria-pressed="recording"
            @click="recording = !recording"
          >
            <span class="lt-rec-btn__dot" />
            {{ recording ? "Stop" : "Run configure()" }}
          </button>
          <span class="lt-unob__state">
            {{
              recording
                ? "recording: the app wired up a sink"
                : "idle: library logs are dropped"
            }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lt-unob {
  border-bottom: 1px solid var(--lt-hairline);
}

.lt-unob__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.92fr);
  gap: clamp(32px, 5vw, 72px);
  align-items: start;
}

.lt-unob__copy,
.lt-unob__demo {
  min-width: 0;
}

.lt-unob__codes {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.9rem;
  margin-top: 1.8rem;
}

.lt-unob__demo {
  position: sticky;
  top: 96px;
}

.lt-unob__controls {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  margin-top: 1.1rem;
}

.lt-rec-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  font-family: var(--vp-font-family-mono);
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  padding: 0.5rem 1rem;
  border: 1px solid var(--lt-hairline-strong);
  border-radius: 999px;
  background: var(--lt-card);
  transition:
    border-color 0.15s,
    background 0.15s,
    color 0.15s;
}

.lt-rec-btn__dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 2px solid currentColor;
  color: var(--vp-c-text-3);
  transition: all 0.15s;
}

.lt-rec-btn:hover {
  border-color: var(--lt-amber-line);
}

.lt-rec-btn.is-on {
  color: var(--lt-amber);
  border-color: var(--lt-amber-line);
  background: var(--lt-amber-soft);
}

.lt-rec-btn.is-on .lt-rec-btn__dot {
  background: var(--lt-rec);
  border-color: var(--lt-rec);
  color: var(--lt-rec);
}

.lt-unob__state {
  font-family: var(--vp-font-family-mono);
  font-size: 0.74rem;
  color: var(--vp-c-text-3);
}

@media (max-width: 860px) {
  .lt-unob__grid {
    grid-template-columns: 1fr;
    gap: 36px;
  }
  .lt-unob__demo {
    position: static;
  }
}
</style>
