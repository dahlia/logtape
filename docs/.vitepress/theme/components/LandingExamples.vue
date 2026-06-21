<script setup lang="ts">
import { ref } from "vue";
import CodeCard from "./CodeCard.vue";

interface Tab {
  id: string;
  label: string;
  filename: string;
  note: string;
  code: string;
}

const tabs: Tab[] = [
  {
    id: "library",
    label: "In a library",
    filename: "auth.ts",
    note: "no config required",
    code: `import { getLogger } from "@logtape/logtape";

const logger = getLogger(["my-app", "auth"]);

export function signIn(userId: string) {
  logger.info("user {userId} signed in", { userId });
}`,
  },
  {
    id: "app",
    label: "In your app",
    filename: "main.ts",
    note: "opt in once",
    code: `import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: "my-app", lowestLevel: "debug", sinks: ["console"] },
  ],
});`,
  },
  {
    id: "structured",
    label: "Structured & lazy",
    filename: "query.ts",
    note: "values stay data",
    code: `// placeholders keep their values structured, not stringified
logger.info("query took {ms} ms", { ms });

// defer expensive work until a sink actually wants it
logger.debug(l => l\`payload \${JSON.stringify(big)}\`);`,
  },
  {
    id: "context",
    label: "Implicit context",
    filename: "handler.ts",
    note: "flows through the stack",
    code: `import { getLogger, withContext } from "@logtape/logtape";

const logger = getLogger(["my-app", "http"]);

withContext({ requestId }, () => {
  // every log inside carries requestId automatically
  logger.info("handling request");
});`,
  },
];

const active = ref(0);
</script>

<template>
  <section class="lt-section lt-ex">
    <div class="lt-wrap lt-ex__grid">
      <div class="lt-ex__lead" v-reveal>
        <p class="lt-eyebrow">How it feels</p>
        <h2 class="lt-h2">An API that reads<br />the way you think.</h2>
        <p class="lt-lede">
          Small, composable functions, no class hierarchies or ceremony. The
          same call site works whether or not anyone is listening.
        </p>
        <div class="lt-ex__tabs" role="tablist" aria-label="Code examples">
          <button
            v-for="(t, i) in tabs"
            :key="t.id"
            role="tab"
            :aria-selected="active === i"
            :class="{ 'is-active': active === i }"
            @click="active = i"
          >
            {{ t.label }}
          </button>
        </div>
      </div>

      <div class="lt-ex__stage" v-reveal>
        <CodeCard
          :key="tabs[active].id"
          :code="tabs[active].code"
          :filename="tabs[active].filename"
          :note="tabs[active].note"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.lt-ex {
  background: var(--lt-paper);
  border-bottom: 1px solid var(--lt-hairline);
}

.lt-ex__grid {
  display: grid;
  grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
  gap: clamp(32px, 5vw, 72px);
  align-items: center;
}

.lt-ex__lead,
.lt-ex__stage {
  min-width: 0;
}

.lt-ex__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 1.6rem;
}

.lt-ex__tabs button {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
  padding: 0.45rem 0.85rem;
  border: 1px solid var(--lt-hairline-strong);
  border-radius: 8px;
  background: var(--lt-card);
  transition:
    color 0.14s,
    border-color 0.14s,
    background 0.14s;
}

.lt-ex__tabs button:hover {
  color: var(--vp-c-text-1);
}

.lt-ex__tabs button.is-active {
  color: var(--lt-amber);
  border-color: var(--lt-amber-line);
  background: var(--lt-amber-soft);
}

.lt-ex__stage :deep(.lt-code pre) {
  min-height: 11rem;
}

@media (max-width: 860px) {
  .lt-ex__grid {
    grid-template-columns: 1fr;
    gap: 28px;
  }
}
</style>
