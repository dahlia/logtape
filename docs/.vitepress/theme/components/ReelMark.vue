<script setup lang="ts">
// A cassette tape reel/spool, the recurring brand motif.
withDefaults(defineProps<{ size?: number; spin?: boolean }>(), {
  size: 22,
  spin: false,
});
</script>

<template>
  <svg
    class="lt-reel"
    :class="{ 'is-spin': spin }"
    :width="size"
    :height="size"
    viewBox="0 0 48 48"
    fill="none"
    aria-hidden="true"
  >
    <circle
      cx="24"
      cy="24"
      r="21"
      stroke="currentColor"
      stroke-width="2"
      opacity="0.45"
    />
    <g fill="currentColor">
      <circle cx="24" cy="11.5" r="2.3" opacity="0.85" />
      <circle cx="35.1" cy="17.75" r="2.3" opacity="0.85" />
      <circle cx="35.1" cy="30.25" r="2.3" opacity="0.85" />
      <circle cx="24" cy="36.5" r="2.3" opacity="0.85" />
      <circle cx="12.9" cy="30.25" r="2.3" opacity="0.85" />
      <circle cx="12.9" cy="17.75" r="2.3" opacity="0.85" />
      <circle cx="24" cy="24" r="6.2" />
    </g>
  </svg>
</template>

<style scoped>
.lt-reel {
  display: block;
  flex: none;
}

.lt-reel.is-spin {
  animation: lt-reel-spin 10s linear infinite;
  transform-origin: 50% 50%;
}

@keyframes lt-reel-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .lt-reel.is-spin {
    animation: none;
  }
}
</style>
