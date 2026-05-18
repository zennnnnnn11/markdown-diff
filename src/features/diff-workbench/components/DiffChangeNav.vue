<script setup lang="ts">
defineProps<{
  current: number
  total: number
}>()

const emit = defineEmits<{
  prev: []
  next: []
}>()

function label(current: number): string {
  return current < 0 ? '—' : String(current + 1)
}
</script>

<template>
  <nav class="change-nav" data-testid="change-nav">
    <button
      type="button"
      class="nav-button"
      :disabled="current <= 0"
      @click="emit('prev')"
    >
      &larr; 上一个
    </button>
    <span class="change-position">{{ label(current) }} / {{ total }}</span>
    <button
      type="button"
      class="nav-button"
      :disabled="current >= total - 1"
      @click="emit('next')"
    >
      下一个 &rarr;
    </button>
  </nav>
</template>

<style scoped>
.change-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px 14px;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  box-shadow: var(--glass-shadow);
}

.nav-button {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--text-secondary);
  padding: 5px 12px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
}

.nav-button:hover:not(:disabled) {
  background: var(--bg-subtle);
}

.nav-button:active:not(:disabled) {
  transform: scale(0.95);
}

.nav-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.change-position {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  min-width: 60px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
</style>
