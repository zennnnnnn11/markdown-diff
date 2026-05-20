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
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px;
  background: var(--bg-surface);
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
  gap: 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  padding: 10px 12px;
  cursor: pointer;
  text-align: left;
}

.stat-card:hover {
  background: var(--bg-subtle);
}

.stat-card strong {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.1;
}

.stat-card span {
  font-size: 12px;
  color: var(--text-secondary);
}

.stat-card small {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}
</style>
