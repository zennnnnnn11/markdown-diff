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
      aria-label="上一个变更"
    >
      <svg
        class="arrow-left-icon"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <line x1="19" y1="12" x2="5" y2="12"></line>
        <polyline points="12 19 5 12 12 5"></polyline>
      </svg>
      上一个
    </button>
    <span class="change-position">
      <transition name="count-fade" mode="out-in">
        <span :key="current" class="current-idx">{{ label(current) }}</span>
      </transition>
      <span class="separator">/</span>
      <span class="total-idx">{{ total }}</span>
    </span>
    <button
      type="button"
      class="nav-button"
      :disabled="current >= total - 1"
      @click="emit('next')"
      aria-label="下一个变更"
    >
      下一个
      <svg
        class="arrow-right-icon"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <line x1="5" y1="12" x2="19" y2="12"></line>
        <polyline points="12 5 19 12 12 19"></polyline>
      </svg>
    </button>
  </nav>
</template>

<style scoped>
.change-nav {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.08),
    0 0 0 1px rgba(0, 0, 0, 0.02),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
  z-index: 999;
  animation: slideUpFloat 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  transition:
    background-color var(--transition-elastic),
    border-color var(--transition-elastic),
    box-shadow var(--transition-elastic),
    transform 0.2s ease;
}

.dark .change-nav {
  background: rgba(10, 10, 10, 0.75);
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.change-nav:hover {
  transform: translateX(-50%) translateY(-2px);
  box-shadow:
    0 20px 48px rgba(0, 0, 0, 0.12),
    0 0 0 1px rgba(0, 0, 0, 0.02);
}

.dark .change-nav:hover {
  box-shadow:
    0 20px 48px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.08);
}

.nav-button {
  border: 1px solid var(--border);
  border-radius: 9999px;
  background: var(--bg-surface);
  color: var(--text-primary);
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: var(--shadow-sm);
  transition: all var(--transition-fast);
}

.dark .nav-button {
  border-color: rgba(255, 255, 255, 0.1);
  background: #111;
}

.nav-button:hover:not(:disabled) {
  background: var(--text-primary);
  color: var(--bg-surface);
  border-color: var(--text-primary);
  transform: scale(1.02);
}

.nav-button:active:not(:disabled) {
  transform: scale(0.98);
}

.nav-button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  box-shadow: none;
}

/* Nav Button Arrow Hover Transitions */
.nav-button svg {
  transition: transform var(--transition-fast);
}

.nav-button:hover:not(:disabled) .arrow-left-icon {
  transform: translateX(-3px);
}

.nav-button:hover:not(:disabled) .arrow-right-icon {
  transform: translateX(3px);
}

.change-position {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-family: var(--font-sans);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  user-select: none;
  padding: 0 4px;
}

.current-idx {
  display: inline-block;
  font-weight: 700;
  color: var(--text-primary);
}

.separator {
  color: var(--text-muted);
  font-size: 11px;
}

.total-idx {
  font-weight: 500;
}

/* Rolling digit out-in transitions */
.count-fade-enter-active,
.count-fade-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.count-fade-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.count-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@keyframes slideUpFloat {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
</style>
