<script setup lang="ts">
import { withBase } from "vitepress";

interface Feature {
  cue: string;
  title: string;
  desc: string;
  link: string;
}

const features: Feature[] = [
  {
    cue: 'info("sold {n}", { n })',
    title: "Structured logging",
    desc: "Record values as first-class data, kept intact for downstream sinks instead of flattened into a string.",
    link: "/manual/struct",
  },
  {
    cue: "info`hello ${name}`",
    title: "Template literals",
    desc: "A terse tagged-template form for when you just want a quick, readable line.",
    link: "/manual/start",
  },
  {
    cue: "withContext({ requestId })",
    title: "Implicit contexts",
    desc: "Bind request or user data once and it follows every log emitted within that scope.",
    link: "/manual/contexts",
  },
  {
    cue: "debug(l => l`…${heavy()}`)",
    title: "Lazy evaluation",
    desc: "Defer expensive work so it runs only when a sink is actually going to use it.",
    link: "/manual/lazy",
  },
  {
    cue: "trace · debug · … · fatal",
    title: "Six severity levels",
    desc: "From trace to fatal, with per-category lowest-level thresholds.",
    link: "/manual/levels",
  },
  {
    cue: "sinks: [withFilter(sink, f)]",
    title: "Filters",
    desc: "Decide exactly which records reach each sink, by level, category, or your own predicate.",
    link: "/manual/filters",
  },
  {
    cue: "getTextFormatter({ … })",
    title: "Text formatters",
    desc: "Shape console and file output down to each field, or plug in your own renderer.",
    link: "/manual/formatters",
  },
  {
    cue: "no-message-interpolation",
    title: "Lint rules",
    desc: "Catch logging anti-patterns at development time with dedicated lint rules.",
    link: "/lint/",
  },
  {
    cue: "recorder.assertLogged({ … })",
    title: "Testing utilities",
    desc: "Capture and assert on emitted logs so your logging itself stays under test.",
    link: "/manual/testing",
  },
  {
    cue: "ESM · CJS · .d.ts",
    title: "Modern, typed, dual",
    desc: "Ships ESM and CommonJS with bundled TypeScript types. No extra @types package.",
    link: "/manual/install",
  },
];
</script>

<template>
  <section class="lt-section lt-feat">
    <div class="lt-wrap">
      <header class="lt-feat__head" v-reveal>
        <p class="lt-eyebrow">Everything in the box</p>
        <h2 class="lt-h2">A complete logging toolkit,<br />not just a writer.</h2>
        <p class="lt-lede">
          LogTape covers the whole lifecycle of a log line, from how you write
          it to how it is filtered, formatted, redacted, and tested.
        </p>
      </header>

      <ul class="lt-feat__grid">
        <li v-for="(f, i) in features" :key="f.title" v-reveal :style="{ '--lt-delay': `${(i % 3) * 60}ms` }">
          <a :href="withBase(f.link)" class="lt-feat__card">
            <code class="lt-feat__cue">{{ f.cue }}</code>
            <h3 class="lt-feat__title">{{ f.title }}</h3>
            <p class="lt-feat__desc">{{ f.desc }}</p>
          </a>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.lt-feat {
  background: var(--lt-card-2);
  border-bottom: 1px solid var(--lt-hairline);
}

.lt-feat__head {
  max-width: 52ch;
}

.lt-feat__grid {
  list-style: none;
  margin: clamp(32px, 4vw, 52px) 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
  gap: 1rem;
}

.lt-feat__card {
  display: block;
  height: 100%;
  padding: 1.15rem 1.2rem 1.3rem;
  border: 1px solid var(--lt-hairline);
  border-radius: 12px;
  background: var(--lt-card);
  transition:
    border-color 0.16s,
    transform 0.16s,
    box-shadow 0.16s;
}

.lt-feat__card:hover {
  border-color: var(--lt-amber-line);
  transform: translateY(-2px);
  box-shadow: 0 16px 30px -24px rgba(43, 42, 44, 0.5);
}

.lt-feat__cue {
  display: inline-block;
  font-family: var(--vp-font-family-mono);
  font-size: 0.74rem;
  color: var(--lt-amber);
  background: var(--lt-amber-soft);
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  margin-bottom: 0.85rem;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lt-feat__title {
  margin: 0 0 0.4rem;
  font-family: var(--lt-font-display);
  font-size: 1.06rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--vp-c-text-1);
}

.lt-feat__desc {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.55;
  color: var(--vp-c-text-2);
}
</style>
