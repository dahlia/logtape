<script setup lang="ts">
import { withBase } from "vitepress";
import InstallTabs from "./InstallTabs.vue";
import ReelMark from "./ReelMark.vue";
</script>

<template>
  <section class="lt-section lt-cta">
    <div class="lt-wrap lt-cta__inner" v-reveal>
      <div class="lt-cta__reels" aria-hidden="true">
        <ReelMark :size="34" :spin="true" />
        <span class="lt-cta__tape" />
        <ReelMark :size="34" :spin="true" />
      </div>
      <p class="lt-eyebrow">Press record</p>
      <h2 class="lt-cta__title">Start logging<br />in two minutes.</h2>
      <p class="lt-cta__lede">
        Add LogTape to a library or an application today. It stays silent until
        you ask for output, so there is nothing to undo if you change your mind.
      </p>

      <InstallTabs class="lt-cta__install" />

      <div class="lt-cta__actions">
        <a class="lt-btn lt-btn--primary" :href="withBase('/manual/start')">
          Get started
        </a>
        <a class="lt-btn lt-btn--ghost" :href="withBase('/manual/install')">
          Read the manual
        </a>
        <a class="lt-btn lt-btn--text" href="https://github.com/dahlia/logtape">
          Star on GitHub →
        </a>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lt-cta {
  background:
    radial-gradient(120% 90% at 50% 0%, var(--lt-amber-soft), transparent 55%),
    var(--lt-card-2);
  text-align: center;
}

.lt-cta__inner {
  max-width: 640px;
  margin-inline: auto;
}

.lt-cta__reels {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--lt-spool);
  margin-bottom: 1.4rem;
}

.lt-cta__tape {
  width: 56px;
  height: 8px;
  border-top: 1.5px solid var(--lt-spool);
  border-bottom: 1.5px solid var(--lt-spool);
  opacity: 0.5;
}

.lt-cta .lt-eyebrow {
  justify-content: center;
}

.lt-cta__title {
  margin: 0;
  font-family: var(--lt-font-display);
  font-size: clamp(2rem, 4.4vw, 3rem);
  font-weight: 600;
  line-height: 1.06;
  letter-spacing: -0.025em;
  color: var(--vp-c-text-1);
}

.lt-cta__lede {
  margin: 1.1rem auto 0;
  max-width: 44ch;
  font-size: 1.06rem;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}

.lt-cta__install {
  margin: 2rem auto 0;
  max-width: 30rem;
  text-align: left;
}

.lt-cta__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1.8rem;
}

/* Shared button styles (mirrors LandingHero) */
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
</style>
