<script setup lang="ts">
import { withBase } from "vitepress";
import Console, { type LogLine } from "./Console.vue";
import InstallTabs from "./InstallTabs.vue";
import ReelMark from "./ReelMark.vue";
import RuntimeIcon from "./RuntimeIcon.vue";

const lines: LogLine[] = [
  { level: "info", cat: "app·server", msg: "Listening on port [[3000]]." },
  { level: "debug", cat: "app·db", msg: "Loaded user in [[12 ms]]." },
  { level: "info", cat: "app·auth", msg: "User [[u_8f21]] signed in." },
  { level: "warning", cat: "app·cache", msg: "Cache miss for [[session:42]]." },
  {
    level: "error",
    cat: "app·payment",
    msg: "Charge [[card_declined]] on order [[#10293]].",
  },
];
</script>

<template>
  <section class="lt-hero lt-section">
    <div class="lt-hero__grid lt-wrap">
      <div class="lt-hero__copy">
        <p class="lt-eyebrow">
          <ReelMark :size="15" />
          Zero-dependency logging
        </p>
        <h1 class="lt-hero__title">
          Logging that stays<br />out of your way
        </h1>
        <p class="lt-hero__lede">
          LogTape is a logging library built library-first. Your code records
          freely; the application decides if, where, and how those logs play
          back. Zero dependencies, every runtime, 5.3&nbsp;KB.
        </p>

        <ul class="lt-hero__chips">
          <li>0 dependencies</li>
          <li>every JavaScript runtime</li>
          <li>5.3 KB min+gzip</li>
          <li>TypeScript-native</li>
        </ul>

        <div class="lt-hero__actions">
          <a class="lt-btn lt-btn--primary" :href="withBase('/manual/start')">
            Get started
          </a>
          <a class="lt-btn lt-btn--ghost" :href="withBase('/intro')">
            Why LogTape?
          </a>
          <a class="lt-btn lt-btn--text" :href="withBase('/comparison')">
            Compare libraries →
          </a>
        </div>

        <InstallTabs class="lt-hero__install" />

        <div class="lt-hero__runson">
          <span class="lt-hero__runson-label">Runs on</span>
          <div class="lt-hero__runson-items">
            <span class="lt-rt"><RuntimeIcon name="node" /> Node.js</span>
            <span class="lt-rt"><RuntimeIcon name="deno" /> Deno</span>
            <span class="lt-rt"><RuntimeIcon name="bun" /> Bun</span>
            <span class="lt-rt">
              <span class="lt-rt__cluster">
                <RuntimeIcon name="chrome" />
                <RuntimeIcon name="firefox" />
                <RuntimeIcon name="safari" />
              </span>
              Browsers
            </span>
            <span class="lt-rt">
              <span class="lt-rt__cluster">
                <RuntimeIcon name="cloudflareworkers" />
                <RuntimeIcon name="vercel" />
                <RuntimeIcon name="netlify" />
              </span>
              Edge
            </span>
          </div>
        </div>
      </div>

      <div class="lt-hero__stage" v-reveal>
        <Console :lines="lines" label="my-app.log" />
        <p class="lt-hero__caption">
          Real LogTape output: leveled, categorized, and
          <span>structured</span>. Values stay first-class, not stringified.
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lt-hero {
  position: relative;
  padding-top: clamp(48px, 7vw, 88px);
  background:
    radial-gradient(
      120% 80% at 78% 0%,
      var(--lt-amber-soft),
      transparent 60%
    ),
    var(--lt-paper);
  border-bottom: 1px solid var(--lt-hairline);
}

.lt-hero__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  gap: clamp(32px, 5vw, 72px);
  align-items: center;
}

.lt-hero__copy,
.lt-hero__stage {
  min-width: 0;
}

.lt-hero__title {
  margin: 0;
  font-family: var(--lt-font-display);
  font-weight: 600;
  font-size: clamp(2.4rem, 5.6vw, 4rem);
  line-height: 1.04;
  letter-spacing: -0.03em;
  color: var(--vp-c-text-1);
}

.lt-hero__lede {
  margin: 1.35rem 0 0;
  max-width: 40ch;
  font-size: 1.12rem;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}

.lt-hero__chips {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 1.7rem 0 0;
  padding: 0;
}

.lt-hero__chips li {
  font-family: var(--vp-font-family-mono);
  font-size: 0.74rem;
  letter-spacing: 0.01em;
  color: var(--vp-c-text-2);
  padding: 0.32rem 0.66rem;
  border: 1px solid var(--lt-hairline-strong);
  border-radius: 999px;
  background: var(--lt-card);
}

.lt-hero__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1.9rem;
}

.lt-btn {
  display: inline-flex;
  align-items: center;
  font-weight: 600;
  font-size: 0.95rem;
  border-radius: 9px;
  padding: 0.62rem 1.15rem;
  transition:
    transform 0.12s ease,
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}

.lt-btn--primary {
  color: #fff;
  background: var(--lt-amber-strong);
}

.dark .lt-btn--primary {
  color: #1d1208;
}

.lt-btn--primary:hover {
  transform: translateY(-1px);
  background: #874d17;
}

.dark .lt-btn--primary:hover {
  background: #ecaa6c;
}

.lt-btn--ghost {
  color: var(--vp-c-text-1);
  border: 1px solid var(--lt-hairline-strong);
  background: var(--lt-card);
}

.lt-btn--ghost:hover {
  border-color: var(--lt-amber-line);
  color: var(--lt-amber);
}

.lt-btn--text {
  color: var(--vp-c-text-2);
  padding-inline: 0.4rem;
}

.lt-btn--text:hover {
  color: var(--lt-amber);
}

.lt-hero__install {
  margin-top: 1.9rem;
  max-width: min(30rem, 100%);
}

.lt-hero__runson {
  display: flex;
  align-items: baseline;
  gap: 1.15rem;
  margin-top: 1.5rem;
}

.lt-hero__runson-label {
  flex: none;
  font-family: var(--vp-font-family-mono);
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
}

.lt-hero__runson-items {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem 1.15rem;
}

.lt-rt {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
}

.lt-rt__cluster {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

.lt-hero__runson :deep(.lt-rticon) {
  width: 17px;
  height: 17px;
}

.lt-hero__caption {
  margin: 1rem 0 0;
  font-size: 0.84rem;
  line-height: 1.55;
  color: var(--vp-c-text-3);
}

.lt-hero__caption span {
  color: var(--lt-amber);
  font-weight: 600;
}

@media (max-width: 860px) {
  .lt-hero__grid {
    grid-template-columns: 1fr;
    gap: 40px;
  }
  .lt-hero__stage {
    order: -1;
  }
}
</style>
