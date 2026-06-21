<script setup lang="ts">
import CodeCard from "./CodeCard.vue";

const config = `await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: ["app"], lowestLevel: "info", sinks: ["console"] },
    { category: ["app", "db"], lowestLevel: "debug" },
  ],
});`;

interface Node {
  // Connector glyphs drawn before the label, one per ancestor depth.
  // "v" = pass-through vertical, "tee" = branch with siblings below,
  // "corner" = last child.
  guides: ("v" | "tee" | "corner")[];
  seg: string;
  level: "info" | "debug";
  hot: boolean;
  set: boolean;
}

// The effective lowest level after the two settings above cascade down.
const tree: Node[] = [
  { guides: [], seg: '"app"', level: "info", hot: false, set: true },
  { guides: ["tee"], seg: '"server"', level: "info", hot: false, set: false },
  { guides: ["tee"], seg: '"db"', level: "debug", hot: true, set: true },
  { guides: ["v", "corner"], seg: '"pool"', level: "debug", hot: true, set: false },
  { guides: ["corner"], seg: '"http"', level: "info", hot: false, set: false },
];
</script>

<template>
  <section class="lt-section lt-cat">
    <div class="lt-wrap lt-cat__grid">
      <div class="lt-cat__copy" v-reveal>
        <p class="lt-eyebrow">Hierarchical by design</p>
        <h2 class="lt-h2">Turn up the logs<br />right where you need them.</h2>
        <p class="lt-lede">
          Most JavaScript loggers give every logger a flat name. LogTape
          arranges them in a tree: a category like
          <code>["app", "db"]</code> is a child of <code>["app"]</code>, and
          configuration flows from parent to child. Raise one subtree to
          <code>debug</code> while the rest stays at <code>info</code>, and give
          each library its own namespace so their logs never collide.
        </p>
      </div>

      <div class="lt-cat__stage" v-reveal>
        <CodeCard :code="config" filename="logging.ts" note="two settings" />
        <div class="lt-tree" aria-hidden="true">
          <div class="lt-tree__cap">effective lowest level</div>
          <div
            v-for="(n, i) in tree"
            :key="i"
            class="lt-trow"
            :class="{ hot: n.hot }"
          >
            <span
              v-for="(g, gi) in n.guides"
              :key="gi"
              class="lt-guide"
              :class="g"
            />
            <span class="lt-node">
              <span class="lt-node__seg">{{ n.seg }}</span>
              <span class="lt-node__lvl" :class="{ hot: n.hot }">{{
                n.level
              }}</span>
              <span class="lt-node__note">{{
                n.set ? "set" : "inherited"
              }}</span>
            </span>
          </div>
        </div>
        <p class="lt-cat__foot">
          One setting on <code>["app", "db"]</code> turns the whole database
          subtree verbose; siblings keep inheriting <code>info</code>.
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lt-cat {
  background: var(--lt-card-2);
  border-bottom: 1px solid var(--lt-hairline);
}

.lt-cat__grid {
  display: grid;
  grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.14fr);
  gap: clamp(32px, 5vw, 72px);
  align-items: center;
}

.lt-cat__copy,
.lt-cat__stage {
  min-width: 0;
}

.lt-cat__copy :deep(code),
.lt-cat__foot code {
  font-family: var(--vp-font-family-mono);
  font-size: 0.88em;
  color: var(--lt-amber);
}

.lt-tree {
  margin-top: 0.9rem;
  padding: 1rem 1.15rem 1.1rem;
  border: 1px solid var(--lt-hairline-strong);
  border-radius: 11px;
  background: var(--lt-card);
  overflow-x: auto;
}

.lt-tree__cap {
  font-family: var(--vp-font-family-mono);
  font-size: 0.66rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
  margin-bottom: 0.6rem;
}

.lt-trow {
  display: flex;
  align-items: stretch;
  min-height: 1.95rem;
}

/* Drawn tree connectors (one guide cell per ancestor depth) */
.lt-guide {
  position: relative;
  width: 1.4rem;
  flex: none;
}

.lt-guide::before,
.lt-guide::after {
  content: "";
  position: absolute;
}

/* vertical pass-through (a sibling line continuing past this row) */
.lt-guide.v::before {
  left: 50%;
  top: 0;
  bottom: 0;
  border-left: 1.5px solid var(--lt-tree-line);
}

/* tee: a sibling vertical plus a horizontal stub into the node */
.lt-guide.tee::before {
  left: 50%;
  top: 0;
  bottom: 0;
  border-left: 1.5px solid var(--lt-tree-line);
}

.lt-guide.tee::after {
  left: 50%;
  right: 0;
  top: 50%;
  border-top: 1.5px solid var(--lt-tree-line);
}

/* corner: a rounded elbow into the last child */
.lt-guide.corner::before {
  left: 50%;
  right: 0;
  top: 0;
  height: 50%;
  border-left: 1.5px solid var(--lt-tree-line);
  border-bottom: 1.5px solid var(--lt-tree-line);
  border-bottom-left-radius: 6px;
}

/* highlight the branch carrying the raised level */
.lt-trow.hot .lt-guide.tee::after {
  border-color: var(--lt-rec);
}

.lt-trow.hot .lt-guide.corner::before {
  border-left-color: var(--lt-rec);
  border-bottom-color: var(--lt-rec);
}

.lt-node {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.32rem 0.5rem;
  border-radius: 6px;
  white-space: nowrap;
}

.lt-trow.hot .lt-node {
  background: var(--lt-amber-soft);
}

.lt-node__seg {
  flex: 1;
  font-family: var(--vp-font-family-mono);
  font-size: 0.84rem;
  color: var(--vp-c-text-1);
}

.lt-node__lvl {
  font-family: var(--vp-font-family-mono);
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
  background: var(--lt-card-2);
  border: 1px solid var(--lt-hairline-strong);
  border-radius: 999px;
  padding: 0.06rem 0.5rem;
}

.lt-node__lvl.hot {
  color: var(--lt-amber);
  background: var(--lt-amber-soft);
  border-color: var(--lt-amber-line);
}

.lt-node__note {
  font-family: var(--vp-font-family-mono);
  font-size: 0.66rem;
  font-style: italic;
  color: var(--vp-c-text-3);
  min-width: 4.4rem;
  text-align: right;
}

.lt-cat__foot {
  margin: 0.95rem 0 0;
  font-size: 0.84rem;
  line-height: 1.6;
  color: var(--vp-c-text-3);
}

@media (max-width: 560px) {
  .lt-node__note {
    display: none;
  }
}

@media (max-width: 860px) {
  .lt-cat__grid {
    grid-template-columns: 1fr;
    gap: 28px;
  }
}
</style>
