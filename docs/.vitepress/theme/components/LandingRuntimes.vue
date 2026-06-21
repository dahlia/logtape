<script setup lang="ts">
const runtimes = [
  { name: "Deno", note: "native, via JSR" },
  { name: "Node.js", note: "ESM + CommonJS" },
  { name: "Bun", note: "first-class" },
  { name: "Browsers", note: "styled console" },
  { name: "Edge", note: "Workers & functions" },
];
</script>

<template>
  <section class="lt-section lt-rt">
    <div class="lt-wrap lt-rt__inner" v-reveal>
      <div class="lt-rt__lead">
        <p class="lt-eyebrow">Write once</p>
        <h2 class="lt-h2">One import,<br />every runtime.</h2>
        <p class="lt-lede">
          The same code runs unchanged across the JavaScript ecosystem. No
          polyfills, no runtime checks, no platform-specific builds.
        </p>
      </div>
      <ul class="lt-rt__list">
        <li v-for="r in runtimes" :key="r.name">
          <span class="lt-rt__name">{{ r.name }}</span>
          <span class="lt-rt__note">{{ r.note }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.lt-rt {
  background: var(--lt-card-2);
  border-bottom: 1px solid var(--lt-hairline);
}

.lt-rt__inner {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: clamp(28px, 4vw, 64px);
  align-items: center;
}

.lt-rt__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.8rem;
}

.lt-rt__list li {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 1rem 1rem 1.05rem;
  border: 1px solid var(--lt-hairline);
  border-radius: 11px;
  background: var(--lt-card);
}

.lt-rt__name {
  font-family: var(--lt-font-display);
  font-size: 1.18rem;
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--vp-c-text-1);
}

.lt-rt__note {
  font-family: var(--vp-font-family-mono);
  font-size: 0.7rem;
  color: var(--vp-c-text-3);
}

@media (max-width: 760px) {
  .lt-rt__inner {
    grid-template-columns: 1fr;
    gap: 28px;
  }
}
</style>
