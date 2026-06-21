<script setup lang="ts">
import { withBase } from "vitepress";
import CodeCard from "./CodeCard.vue";

const sigs = [
  { name: "Sink", ret: "void", note: "where each record goes" },
  { name: "Filter", ret: "boolean", note: "whether it passes" },
  { name: "TextFormatter", ret: "string", note: "how it reads" },
];

const example = `import type { Sink } from "@logtape/logtape";

// batch records, then flush; it is just a function
const sink: Sink = (record) => {
  buffer.push(record);
  if (buffer.length >= 100) flush(buffer);
};`;
</script>

<template>
  <section class="lt-section lt-ext">
    <div class="lt-wrap lt-ext__grid">
      <div class="lt-ext__lead" v-reveal>
        <p class="lt-eyebrow">Bring your own</p>
        <h2 class="lt-h2">Extending it is<br />just a function.</h2>
        <p class="lt-lede">
          No base classes, no plugins to register, no lifecycle to learn. A
          sink, a filter, and a text formatter are each one function of a log
          record. The only thing that changes is what you return.
        </p>
      </div>

      <div class="lt-ext__stage" v-reveal>
        <div class="lt-sig">
          <div v-for="s in sigs" :key="s.name" class="lt-sig__row">
            <code class="lt-sig__code"><span class="kw">type</span> <span
              class="nm"
            >{{ s.name }}</span> = (record: <span class="ty">LogRecord</span>) =>
              <span class="ret">{{ s.ret }}</span></code>
            <span class="lt-sig__note">{{ s.note }}</span>
          </div>
        </div>
        <CodeCard :code="example" filename="my-sink.ts" note="a real sink" />
        <p class="lt-ext__aside">
          Need to <code>await</code> inside a sink? Sinks stay synchronous by
          design, but an <code>AsyncSink</code> returns
          <code>Promise&lt;void&gt;</code> and <code>fromAsyncSink()</code>
          adapts it into a regular sink, preserving order and catching errors.
          <a :href="withBase('/manual/sinks#async-sink-adapter')">Async sinks →</a>
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lt-ext {
  background: var(--lt-card-2);
  border-bottom: 1px solid var(--lt-hairline);
}

.lt-ext__grid {
  display: grid;
  grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
  gap: clamp(32px, 5vw, 72px);
  align-items: center;
}

.lt-ext__lead,
.lt-ext__stage {
  min-width: 0;
}

.lt-ext__aside {
  margin: 0.95rem 0 0;
  font-size: 0.82rem;
  line-height: 1.6;
  color: var(--vp-c-text-3);
}

.lt-ext__aside code {
  font-family: var(--vp-font-family-mono);
  font-size: 0.92em;
  color: var(--vp-c-text-2);
}

.lt-ext__aside a {
  white-space: nowrap;
  font-weight: 600;
  color: var(--lt-amber);
}

.lt-sig {
  margin-bottom: 1rem;
  padding: 1.2rem 1.3rem;
  border: 1px solid var(--lt-hairline-strong);
  border-radius: 11px;
  background: var(--lt-card);
  overflow-x: auto;
}

.lt-sig__row {
  display: flex;
  align-items: baseline;
  gap: 1.2rem;
  line-height: 2;
  white-space: nowrap;
}

.lt-sig__code {
  font-family: var(--vp-font-family-mono);
  font-size: 0.86rem;
  color: var(--vp-c-text-1);
  background: none;
  padding: 0;
}

.lt-sig__code .kw {
  color: var(--lt-syn-kw);
}

.lt-sig__code .nm {
  display: inline-block;
  min-width: 8.6em;
  color: var(--vp-c-text-1);
  font-weight: 600;
}

.lt-sig__code .ty {
  color: var(--lt-syn-kw);
}

.lt-sig__code .ret {
  color: var(--lt-amber);
  font-weight: 600;
}

.lt-sig__note {
  margin-left: auto;
  font-family: var(--vp-font-family-mono);
  font-size: 0.72rem;
  font-style: italic;
  color: var(--vp-c-text-3);
}

@media (max-width: 620px) {
  .lt-sig__note {
    display: none;
  }
}

@media (max-width: 860px) {
  .lt-ext__grid {
    grid-template-columns: 1fr;
    gap: 28px;
  }
}
</style>
