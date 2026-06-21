<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  code: string;
  filename?: string;
  /** Optional caption shown under the filename tab. */
  note?: string;
}>();

const keywords = new Set([
  "import",
  "from",
  "export",
  "const",
  "let",
  "await",
  "async",
  "function",
  "return",
  "if",
  "else",
  "new",
  "void",
  "for",
  "of",
]);

const apis = new Set([
  "configure",
  "getLogger",
  "getConsoleSink",
  "getStreamSink",
  "getFileSink",
  "getRotatingFileSink",
  "install",
  "withContext",
  "getContextLocalStorage",
  "reset",
]);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Single-pass highlighter for short, curated snippets (trusted, static input).
function highlight(code: string): string {
  let out = "";
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i];
    if (ch === "/" && code[i + 1] === "/") {
      let j = code.indexOf("\n", i);
      if (j < 0) j = n;
      out += `<span class="t-com">${esc(code.slice(i, j))}</span>`;
      i = j;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const q = ch;
      let j = i + 1;
      while (j < n && code[j] !== q) {
        if (code[j] === "\\") j++;
        j++;
      }
      j = Math.min(j + 1, n);
      out += `<span class="t-str">${esc(code.slice(i, j))}</span>`;
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$]/.test(code[j])) j++;
      const w = code.slice(i, j);
      if (keywords.has(w)) out += `<span class="t-kw">${w}</span>`;
      else if (apis.has(w)) out += `<span class="t-fn">${w}</span>`;
      else out += esc(w);
      i = j;
      continue;
    }
    out += esc(ch);
    i++;
  }
  return out;
}

const html = computed(() => highlight(props.code));
</script>

<template>
  <figure class="lt-code">
    <figcaption v-if="filename" class="lt-code__head">
      <span class="lt-code__file">{{ filename }}</span>
      <span v-if="note" class="lt-code__note">{{ note }}</span>
    </figcaption>
    <pre><code v-html="html" /></pre>
  </figure>
</template>

<style scoped>
.lt-code {
  margin: 0;
  min-width: 0;
  max-width: 100%;
  border: 1px solid var(--lt-hairline-strong);
  border-radius: 11px;
  background: var(--lt-card);
  overflow: hidden;
}

.lt-code__head {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  padding: 0.5rem 0.85rem;
  border-bottom: 1px solid var(--lt-hairline);
  background: var(--lt-card-2);
  font-family: var(--vp-font-family-mono);
}

.lt-code__file {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--vp-c-text-2);
}

.lt-code__note {
  font-size: 0.68rem;
  color: var(--vp-c-text-3);
}

.lt-code pre {
  margin: 0;
  padding: 0.9rem 1rem 1rem;
  overflow-x: auto;
}

.lt-code code {
  font-family: var(--vp-font-family-mono);
  font-size: 0.82rem;
  line-height: 1.75;
  color: var(--vp-c-text-1);
  white-space: pre;
}

.lt-code :deep(.t-com) {
  color: var(--lt-syn-com);
  font-style: italic;
}
.lt-code :deep(.t-str) {
  color: var(--lt-syn-str);
}
.lt-code :deep(.t-kw) {
  color: var(--lt-syn-kw);
}
.lt-code :deep(.t-fn) {
  color: var(--lt-syn-fn);
  font-weight: 600;
}
</style>
