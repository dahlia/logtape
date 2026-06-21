<script setup lang="ts">
import { withBase } from "vitepress";
import ReelMark from "./ReelMark.vue";

interface Item {
  name: string;
  link: string;
}
interface Group {
  label: string;
  blurb: string;
  items: Item[];
}

const groups: Group[] = [
  {
    label: "Sinks",
    blurb: "Send records anywhere",
    items: [
      { name: "Console", link: "/manual/sinks#console-sink" },
      { name: "Stream", link: "/manual/sinks#stream-sink" },
      { name: "File", link: "/sinks/file" },
      { name: "Rotating file", link: "/sinks/file#rotating-file-sink" },
      { name: "OpenTelemetry", link: "/sinks/otel" },
      { name: "Sentry", link: "/sinks/sentry" },
      { name: "Syslog", link: "/sinks/syslog" },
      { name: "CloudWatch Logs", link: "/sinks/cloudwatch-logs" },
      { name: "Windows Event Log", link: "/sinks/windows-eventlog" },
    ],
  },
  {
    label: "Framework integrations",
    blurb: "Drop-in request logging",
    items: [
      { name: "Express", link: "/manual/integrations" },
      { name: "Fastify", link: "/manual/integrations" },
      { name: "Hono", link: "/manual/integrations" },
      { name: "Koa", link: "/manual/integrations" },
      { name: "Elysia", link: "/manual/integrations" },
      { name: "Drizzle ORM", link: "/manual/integrations" },
    ],
  },
  {
    label: "Adapters",
    blurb: "Already on another logger?",
    items: [
      { name: "Pino", link: "/manual/adaptors" },
      { name: "winston", link: "/manual/adaptors" },
      { name: "bunyan", link: "/manual/adaptors" },
      { name: "log4js", link: "/manual/adaptors" },
    ],
  },
  {
    label: "Toolkit",
    blurb: "Beyond the core",
    items: [
      { name: "Redaction", link: "/manual/redaction" },
      { name: "Pretty formatter", link: "/manual/formatters" },
      { name: "Lint rules", link: "/lint/" },
      { name: "Testing", link: "/manual/testing" },
    ],
  },
];

const total = groups.reduce((n, g) => n + g.items.length, 0);
</script>

<template>
  <section class="lt-section lt-eco">
    <div class="lt-wrap">
      <header class="lt-eco__head" v-reveal>
        <p class="lt-eyebrow"><ReelMark :size="15" /> One package family</p>
        <h2 class="lt-h2">{{ total }} ways to route,<br />render, and ship logs.</h2>
        <p class="lt-lede">
          A small, sharp core surrounded by official packages for the sinks,
          frameworks, and loggers you already use. Add only what you need.
        </p>
      </header>

      <div class="lt-eco__groups">
        <div v-for="g in groups" :key="g.label" class="lt-eco__group" v-reveal>
          <div class="lt-eco__grouphead">
            <h3>{{ g.label }}</h3>
            <span>{{ g.blurb }}</span>
          </div>
          <ul>
            <li v-for="it in g.items" :key="it.name">
              <a :href="withBase(it.link)">{{ it.name }}</a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lt-eco {
  background: var(--lt-paper);
  border-bottom: 1px solid var(--lt-hairline);
}

.lt-eco__head {
  max-width: 50ch;
}

.lt-eco__groups {
  margin-top: clamp(32px, 4vw, 52px);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 1.1rem;
}

.lt-eco__group {
  padding: 1.25rem 1.3rem 1.4rem;
  border: 1px solid var(--lt-hairline);
  border-radius: 13px;
  background: var(--lt-card);
}

.lt-eco__grouphead {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding-bottom: 0.85rem;
  margin-bottom: 0.9rem;
  border-bottom: 1px solid var(--lt-hairline);
}

.lt-eco__grouphead h3 {
  margin: 0;
  font-family: var(--lt-font-display);
  font-size: 1.02rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.lt-eco__grouphead span {
  font-family: var(--vp-font-family-mono);
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  color: var(--vp-c-text-3);
}

.lt-eco__group ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.lt-eco__group li a {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.55rem;
  margin-inline: -0.55rem;
  border-radius: 7px;
  font-size: 0.92rem;
  color: var(--vp-c-text-2);
  transition:
    background 0.14s,
    color 0.14s;
}

.lt-eco__group li a::before {
  content: "";
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--lt-shell);
  transition: background 0.14s;
  flex: none;
}

.lt-eco__group li a:hover {
  color: var(--lt-amber);
  background: var(--lt-amber-soft);
}

.lt-eco__group li a:hover::before {
  background: var(--lt-rec);
}
</style>
