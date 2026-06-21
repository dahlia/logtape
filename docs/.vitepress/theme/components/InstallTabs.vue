<script setup lang="ts">
import { ref } from "vue";
import { inBrowser } from "vitepress";

const tabs = [
  { id: "deno", label: "Deno", cmd: "deno add jsr:@logtape/logtape" },
  { id: "npm", label: "npm", cmd: "npm add @logtape/logtape" },
  { id: "pnpm", label: "pnpm", cmd: "pnpm add @logtape/logtape" },
  { id: "bun", label: "Bun", cmd: "bun add @logtape/logtape" },
  { id: "yarn", label: "Yarn", cmd: "yarn add @logtape/logtape" },
];

const active = ref(0);
const copied = ref(false);

function copy() {
  if (!inBrowser || !navigator.clipboard) return;
  navigator.clipboard.writeText(tabs[active.value].cmd).then(() => {
    copied.value = true;
    setTimeout(() => (copied.value = false), 1600);
  });
}
</script>

<template>
  <div class="lt-install">
    <div class="lt-install__tabs" role="tablist" aria-label="Install LogTape">
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
    <div class="lt-install__cmd">
      <span class="lt-install__prompt">$</span>
      <code>{{ tabs[active].cmd }}</code>
      <button class="lt-install__copy" :aria-label="copied ? 'Copied' : 'Copy command'" @click="copy">
        {{ copied ? "copied" : "copy" }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.lt-install {
  border: 1px solid var(--lt-hairline-strong);
  border-radius: 11px;
  overflow: hidden;
  background: var(--lt-card);
}

.lt-install__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem;
  padding: 0.35rem 0.4rem;
  border-bottom: 1px solid var(--lt-hairline);
  background: var(--lt-card-2);
}

.lt-install__tabs button {
  padding: 0.28rem 0.7rem;
  font-family: var(--vp-font-family-mono);
  font-size: 0.76rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
  border-radius: 6px;
  transition:
    color 0.15s,
    background 0.15s;
}

.lt-install__tabs button:hover {
  color: var(--vp-c-text-1);
}

.lt-install__tabs button.is-active {
  color: var(--lt-amber);
  background: var(--lt-amber-soft);
}

.lt-install__cmd {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.7rem 0.9rem;
  font-family: var(--vp-font-family-mono);
  font-size: 0.84rem;
}

.lt-install__prompt {
  color: var(--lt-amber);
  font-weight: 700;
}

.lt-install__cmd code {
  flex: 1;
  min-width: 0;
  color: var(--vp-c-text-1);
  background: none;
  white-space: nowrap;
  overflow-x: auto;
}

.lt-install__copy {
  font-family: var(--vp-font-family-mono);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
  padding: 0.22rem 0.5rem;
  border: 1px solid var(--lt-hairline);
  border-radius: 6px;
  transition:
    color 0.15s,
    border-color 0.15s;
}

.lt-install__copy:hover {
  color: var(--lt-amber);
  border-color: var(--lt-amber-line);
}
</style>
