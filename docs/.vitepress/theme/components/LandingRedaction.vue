<script setup lang="ts">
import { withBase } from "vitepress";
import CodeCard from "./CodeCard.vue";

interface Row {
  key: string;
  before: string;
  after: string;
  mode: "drop" | "mask" | "pseudonym";
}

const rows: Row[] = [
  { key: "password", before: '"s3cr3t!"', after: "removed", mode: "drop" },
  {
    key: "contact",
    before: '"alice@corp.com"',
    after: "REDACTED@EMAIL.ADDRESS",
    mode: "mask",
  },
  {
    key: "userId",
    before: '"u_8f21"',
    after: "hmac-sha256:9Fx2aQ…",
    mode: "pseudonym",
  },
];

const tags: Record<Row["mode"], string> = {
  drop: "by field",
  mask: "by pattern",
  pseudonym: "pseudonym",
};

const code = `import {
  createHmacPseudonymizer,
  redactByFieldAsync,
} from "@logtape/redaction";

// same input, same token; the original is never logged
const pseudonymize = await createHmacPseudonymizer({ key });

const sink = redactByFieldAsync(getConsoleSink(), {
  fieldPatterns: [/userId/i, /email/i],
  action: pseudonymize,
});`;
</script>

<template>
  <section class="lt-section lt-red">
    <div class="lt-wrap lt-red__grid">
      <div class="lt-red__copy" v-reveal>
        <p class="lt-eyebrow">Security built in</p>
        <h2 class="lt-h2">Secrets never reach<br />your sinks.</h2>
        <p class="lt-lede">
          LogTape scrubs sensitive data three ways: <code>redactByField()</code>
          drops a field by name, <code>redactByPattern()</code> masks a value by
          its shape, and <code>createHmacPseudonymizer()</code> turns it into a
          stable token you can still correlate on, without ever logging the
          original. Each ships with sensible defaults.
        </p>
        <a class="lt-red__more" :href="withBase('/manual/redaction')">
          Data redaction guide →
        </a>
      </div>

      <div class="lt-red__stage" v-reveal>
        <div class="lt-redact">
          <div class="lt-redact__cap">field → redacted</div>
          <div class="lt-redact__rows">
            <template v-for="(r, i) in rows" :key="i">
              <span class="lt-redact__k">{{ r.key }}</span>
              <span class="lt-redact__b">{{ r.before }}</span>
              <span class="lt-redact__arr">→</span>
              <span class="lt-redact__a" :class="r.mode">{{ r.after }}</span>
              <span class="lt-redact__tag">{{ tags[r.mode] }}</span>
            </template>
          </div>
        </div>

        <CodeCard :code="code" filename="redaction.ts" note="stable pseudonyms" />
        <p class="lt-red__foot">
          Pseudonyms use keyed HMAC via Web Crypto, so the same value always maps
          to the same token across records, and back to nothing without the key.
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lt-red {
  background: var(--lt-paper);
  border-bottom: 1px solid var(--lt-hairline);
}

.lt-red__grid {
  display: grid;
  grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.14fr);
  gap: clamp(32px, 5vw, 72px);
  align-items: center;
}

.lt-red__copy,
.lt-red__stage {
  min-width: 0;
}

.lt-red__copy :deep(code) {
  font-family: var(--vp-font-family-mono);
  font-size: 0.88em;
  color: var(--lt-amber);
}

.lt-red__more {
  display: inline-block;
  margin-top: 1.3rem;
  font-weight: 600;
  color: var(--lt-amber);
}

.lt-redact {
  margin-bottom: 0.9rem;
  padding: 1rem 1.15rem 1.1rem;
  border: 1px solid var(--lt-hairline-strong);
  border-radius: 11px;
  background: var(--lt-card);
  overflow-x: auto;
}

.lt-redact__cap {
  font-family: var(--vp-font-family-mono);
  font-size: 0.66rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
  margin-bottom: 0.8rem;
}

.lt-redact__rows {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto auto;
  align-items: baseline;
  gap: 0.55rem 0.75rem;
  font-family: var(--vp-font-family-mono);
  font-size: 0.82rem;
  white-space: nowrap;
}

.lt-redact__k {
  color: var(--vp-c-text-2);
}

.lt-redact__b {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--vp-c-text-3);
  text-decoration: line-through;
  text-decoration-color: var(--lt-shell);
}

.lt-redact__arr {
  color: var(--lt-shell);
}

.lt-redact__a.drop {
  color: var(--vp-c-text-3);
  font-style: italic;
}

.lt-redact__a.mask,
.lt-redact__a.pseudonym {
  color: var(--lt-amber);
  font-weight: 600;
}

.lt-redact__tag {
  font-size: 0.66rem;
  color: var(--vp-c-text-3);
  text-align: right;
}

.lt-red__foot {
  margin: 0.95rem 0 0;
  font-size: 0.84rem;
  line-height: 1.6;
  color: var(--vp-c-text-3);
}

@media (max-width: 560px) {
  .lt-redact__b,
  .lt-redact__arr {
    display: none;
  }
  .lt-redact__rows {
    grid-template-columns: auto 1fr auto;
  }
}

@media (max-width: 860px) {
  .lt-red__grid {
    grid-template-columns: 1fr;
    gap: 28px;
  }
}
</style>
