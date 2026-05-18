<script setup lang="ts">
import type { HighlightFilter } from '../view-model'
import type { StatCardModel } from '../types'

defineProps<{
  visible: boolean
  statsCards: StatCardModel[]
}>()

const emit = defineEmits<{
  highlight: [filter: HighlightFilter | null]
}>()
</script>

<template>
  <section v-if="visible" class="panel">
    <div class="stats-grid">
      <button
        v-for="card in statsCards"
        :key="card.key"
        type="button"
        class="stat-card"
        :title="card.description"
        @click="card.onClick?.()"
        @mouseenter="emit('highlight', card.filter)"
        @mouseleave="emit('highlight', null)"
        @focus="emit('highlight', card.filter)"
        @blur="emit('highlight', null)"
      >
        <strong>{{ card.value }}</strong>
        <span>{{ card.label }}</span>
        <small>{{ card.description }}</small>
      </button>
    </div>
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  padding: 16px;
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  box-shadow: var(--glass-shadow);
}

.stats-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  padding: 10px 14px;
  cursor: pointer;
  text-align: left;
  box-shadow: var(--shadow-sm);
  transition: border-color var(--transition-fast), box-shadow var(--transition-smooth), transform var(--transition-fast);
}

.stat-card:hover {
  border-color: rgba(0, 112, 243, 0.3);
  box-shadow: var(--glow-accent);
}

.stat-card:active {
  transform: scale(0.98);
}

.stat-card strong {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.stat-card span {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.stat-card small {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}
</style>
