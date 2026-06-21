<script setup lang="ts">
interface Spec {
  k: string;
  vals: string[];
  join?: "+";
  accent?: boolean;
}

const spec: Spec[] = [
  { k: "Module formats", vals: ["ESM", "CommonJS"], join: "+" },
  { k: "Published to", vals: ["npm", "JSR"], join: "+" },
  { k: "Types", vals: ["bundled .d.ts"] },
  { k: "Runtimes", vals: ["Deno", "Node.js", "Bun", "Browsers", "Edge"] },
  { k: "Dependencies", vals: ["0"], accent: true },
];
</script>

<template>
  <section class="lt-section lt-pkg-sec">
    <div class="lt-wrap lt-pkg-sec__grid">
      <div class="lt-pkg-sec__copy" v-reveal>
        <p class="lt-eyebrow">Modern by default</p>
        <h2 class="lt-h2">Packaged for the way<br />you build today.</h2>
        <p class="lt-lede">
          Dual ESM and CommonJS, published to both npm and JSR, with first-class
          TypeScript types bundled in: no <code>@types</code> side-package, no
          transitive dependencies. LogTape follows today's packaging standards,
          so it installs clean and behaves the same everywhere.
        </p>
      </div>

      <div class="lt-pkg-sec__stage" v-reveal>
        <div class="lt-pkg">
          <div class="lt-pkg__cap">package</div>
          <dl class="lt-pkg__rows">
            <template v-for="(row, i) in spec" :key="i">
              <dt class="lt-pkg__k">{{ row.k }}</dt>
              <dd class="lt-pkg__v">
                <template v-for="(v, j) in row.vals" :key="j">
                  <span v-if="j > 0 && row.join === '+'" class="lt-pkg__plus"
                    >+</span
                  >
                  <span class="lt-pkg__b" :class="{ accent: row.accent }">{{
                    v
                  }}</span>
                </template>
              </dd>
            </template>
          </dl>
        </div>
        <p class="lt-pkg-sec__foot">
          One TypeScript source, built once, shipped to ESM, CommonJS, and JSR
          alike.
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lt-pkg-sec {
  background: var(--lt-card-2);
  border-bottom: 1px solid var(--lt-hairline);
}

.lt-pkg-sec__grid {
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  gap: clamp(32px, 5vw, 72px);
  align-items: center;
}

.lt-pkg-sec__copy,
.lt-pkg-sec__stage {
  min-width: 0;
}

.lt-pkg-sec__copy :deep(code) {
  font-family: var(--vp-font-family-mono);
  font-size: 0.88em;
  color: var(--lt-amber);
}

.lt-pkg {
  padding: 1.1rem 1.3rem 1.25rem;
  border: 1px solid var(--lt-hairline-strong);
  border-radius: 12px;
  background: var(--lt-card);
}

.lt-pkg__cap {
  font-family: var(--vp-font-family-mono);
  font-size: 0.66rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
  padding-bottom: 0.9rem;
  margin-bottom: 0.4rem;
  border-bottom: 1px solid var(--lt-hairline);
}

.lt-pkg__rows {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.75rem 1.4rem;
  align-items: center;
}

.lt-pkg__k {
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
}

.lt-pkg__v {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  justify-content: flex-end;
  text-align: right;
}

.lt-pkg__plus {
  font-family: var(--vp-font-family-mono);
  font-size: 0.78rem;
  color: var(--vp-c-text-3);
}

.lt-pkg__b {
  font-family: var(--vp-font-family-mono);
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  background: var(--lt-card-2);
  border: 1px solid var(--lt-hairline-strong);
  border-radius: 7px;
  padding: 0.18rem 0.55rem;
  white-space: nowrap;
}

.lt-pkg__b.accent {
  color: var(--lt-amber);
  background: var(--lt-amber-soft);
  border-color: var(--lt-amber-line);
}

.lt-pkg-sec__foot {
  margin: 0.95rem 0 0;
  font-size: 0.84rem;
  line-height: 1.6;
  color: var(--vp-c-text-3);
}

@media (max-width: 860px) {
  .lt-pkg-sec__grid {
    grid-template-columns: 1fr;
    gap: 28px;
  }
}
</style>
