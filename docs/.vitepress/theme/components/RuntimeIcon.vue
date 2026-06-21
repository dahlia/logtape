<script setup lang="ts">
// Monochrome brand logos, single-path SVGs from Simple Icons (CC0), kept in
// runtimeLogos.ts.
import { runtimeLogos as brand } from "../runtimeLogos";

defineProps<{
  name:
    | "node"
    | "deno"
    | "bun"
    | "chrome"
    | "firefox"
    | "safari"
    | "cloudflareworkers"
    | "vercel"
    | "netlify";
}>();
</script>

<template>
  <svg
    class="lt-rticon"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path :d="brand[name]" />
  </svg>
</template>

<style scoped>
.lt-rticon {
  width: 26px;
  height: 26px;
  display: block;
}
</style>
