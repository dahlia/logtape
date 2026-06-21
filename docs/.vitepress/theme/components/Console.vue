<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { inBrowser } from "vitepress";
import ReelMark from "./ReelMark.vue";

export interface LogLine {
  level: "trace" | "debug" | "info" | "warning" | "error" | "fatal";
  cat: string;
  /** Message text; wrap interpolated values in `[[ ]]` to highlight them. */
  msg: string;
}

const props = withDefaults(
  defineProps<{
    lines: LogLine[];
    label?: string;
    recording?: boolean;
    stream?: boolean;
    silentHint?: string;
  }>(),
  {
    label: "app.log",
    recording: true,
    stream: false,
    silentHint: "// logging not configured — every call is a no-op",
  },
);

const levelLabel: Record<LogLine["level"], string> = {
  trace: "TRC",
  debug: "DBG",
  info: "INF",
  warning: "WRN",
  error: "ERR",
  fatal: "FTL",
};

interface Seg {
  v: boolean;
  s: string;
}

function parse(msg: string): Seg[] {
  const out: Seg[] = [];
  const re = /\[\[(.+?)\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(msg)) !== null) {
    if (m.index > last) out.push({ v: false, s: msg.slice(last, m.index) });
    out.push({ v: true, s: m[1] });
    last = m.index + m[0].length;
  }
  if (last < msg.length) out.push({ v: false, s: msg.slice(last) });
  return out;
}

const parsed = computed(() => props.lines.map((l) => ({ ...l, segs: parse(l.msg) })));

const reduced =
  inBrowser &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// SSR renders the full output; streaming only kicks in on client interaction.
const visible = ref(props.lines.length);
let timers: ReturnType<typeof setTimeout>[] = [];

function clearTimers() {
  for (const t of timers) clearTimeout(t);
  timers = [];
}

function runStream() {
  clearTimers();
  if (reduced || !props.stream) {
    visible.value = props.lines.length;
    return;
  }
  visible.value = 0;
  props.lines.forEach((_, i) => {
    timers.push(
      setTimeout(() => {
        visible.value = i + 1;
      }, 120 + i * 300),
    );
  });
}

watch(
  () => props.recording,
  (on) => {
    if (on) runStream();
    else clearTimers();
  },
);

onBeforeUnmount(clearTimers);
</script>

<template>
  <div class="lt-console" :class="{ 'is-recording': recording }">
    <div class="lt-console__bar">
      <div class="lt-console__reels">
        <ReelMark :size="16" :spin="recording" />
        <span class="lt-console__tape" />
        <ReelMark :size="16" :spin="recording" />
      </div>
      <span class="lt-console__label">{{ label }}</span>
      <span class="lt-console__rec">
        <span class="lt-console__dot" />
        {{ recording ? "REC" : "IDLE" }}
      </span>
    </div>

    <div class="lt-console__body">
      <template v-if="recording">
        <div
          v-for="(line, i) in parsed"
          v-show="i < visible"
          :key="i"
          class="lt-line"
        >
          <span class="lt-line__lv" :data-lv="line.level">{{
            levelLabel[line.level]
          }}</span>
          <span class="lt-line__cat">{{ line.cat }}</span>
          <span class="lt-line__msg">
            <template v-for="(seg, j) in line.segs" :key="j">
              <span v-if="seg.v" class="lt-line__val">{{ seg.s }}</span>
              <template v-else>{{ seg.s }}</template>
            </template>
          </span>
        </div>
      </template>
      <div v-else class="lt-console__silent">{{ silentHint }}</div>
    </div>
  </div>
</template>

<style scoped>
.lt-console {
  --c-bg: var(--lt-console-bg);
  font-family: var(--vp-font-family-mono);
  background: var(--c-bg);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  overflow: hidden;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.04) inset,
    0 24px 50px -28px rgba(0, 0, 0, 0.55);
}

.lt-console__bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.85rem;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid var(--lt-console-line);
  color: var(--lt-console-dim);
}

.lt-console__reels {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--lt-spool);
}

.lt-console__tape {
  width: 16px;
  height: 5px;
  border-top: 1px solid var(--lt-spool);
  border-bottom: 1px solid var(--lt-spool);
  opacity: 0.6;
}

.lt-console__label {
  font-size: 0.72rem;
  letter-spacing: 0.04em;
}

.lt-console__rec {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--lt-console-dim);
}

.lt-console__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--lt-spool);
}

.is-recording .lt-console__rec {
  color: var(--lt-rec);
}

.is-recording .lt-console__dot {
  background: var(--lt-rec);
  box-shadow: 0 0 0 0 rgba(194, 98, 14, 0.5);
  animation: lt-rec-pulse 1.8s ease-out infinite;
}

@keyframes lt-rec-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(224, 152, 90, 0.45);
  }
  70% {
    box-shadow: 0 0 0 7px rgba(224, 152, 90, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(224, 152, 90, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-recording .lt-console__dot {
    animation: none;
  }
}

.lt-console__body {
  padding: 0.85rem 0.95rem 1rem;
  font-size: 0.82rem;
  line-height: 1.85;
  color: var(--lt-console-fg);
  min-height: 11.5rem;
}

.lt-line {
  display: grid;
  grid-template-columns: 2.4rem minmax(0, auto) 1fr;
  gap: 0.7rem;
  align-items: baseline;
  white-space: nowrap;
}

.lt-line__lv {
  font-weight: 700;
  letter-spacing: 0.06em;
  font-size: 0.74rem;
}

.lt-line__lv[data-lv="trace"] {
  color: var(--lt-lv-trace);
}
.lt-line__lv[data-lv="debug"] {
  color: var(--lt-lv-debug);
}
.lt-line__lv[data-lv="info"] {
  color: var(--lt-lv-info);
}
.lt-line__lv[data-lv="warning"] {
  color: var(--lt-lv-warning);
}
.lt-line__lv[data-lv="error"] {
  color: var(--lt-lv-error);
}
.lt-line__lv[data-lv="fatal"] {
  color: var(--lt-lv-fatal);
}

.lt-line__cat {
  color: var(--lt-spool);
}

.lt-line__msg {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--lt-console-fg);
}

.lt-line__val {
  color: var(--lt-rec);
}

.lt-console__silent {
  display: flex;
  align-items: center;
  min-height: 9.5rem;
  color: var(--lt-console-dim);
  font-size: 0.82rem;
  opacity: 0.75;
}

@media (max-width: 520px) {
  .lt-line {
    grid-template-columns: 2.2rem 1fr;
  }
  .lt-line__cat {
    display: none;
  }
}
</style>
