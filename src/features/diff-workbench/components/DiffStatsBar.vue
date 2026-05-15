<script setup lang="ts">
import type { HighlightFilter } from '../view-model'
import type { StatCardModel } from '../types'
import { toneLabels } from '../view-model'

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
    <div class="panel-header">
      <h2>统计条</h2>
      <details class="legend">
        <summary>图例</summary>
        <ul>
          <li v-for="(label, tone) in toneLabels" :key="tone">
            {{ tone }} = {{ label }}
          </li>
        </ul>
      </details>
    </div>

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
  border: 1px solid #d0d7de;
  border-radius: 8px;
  padding: 16px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.stats-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  border: 1px solid #c4cbd3;
  border-radius: 6px;
  background: #fff;
  padding: 8px 12px;
  cursor: pointer;
}

.stat-card small {
  color: #57606a;
  font-size: 12px;
}
</style>
