<script setup lang="ts">
import type { HighlightFilter } from '../view-model'
import type { StatCardModel } from '../types'

defineProps<{
  visible: boolean
  statsCards: StatCardModel[]
  activeFilter?: HighlightFilter | null
}>()

const emit = defineEmits<{
  highlight: [filter: HighlightFilter | null]
}>()
</script>

<template>
  <section v-if="visible" class="panel">
    <div class="stats-grid">
      <button
        v-for="(card, index) in statsCards"
        :key="card.key"
        type="button"
        :class="['stat-card', `card-${card.key}`, { active: activeFilter === card.filter }]"
        :title="card.description"
        @click="card.onClick?.()"
        @mouseenter="emit('highlight', card.filter)"
        @mouseleave="emit('highlight', null)"
        @focus="emit('highlight', card.filter)"
        @blur="emit('highlight', null)"
      >
        <div class="stat-header">
          <span
            class="stat-dot"
            :class="`dot-${card.key}`"
            :style="{ animationDelay: `${index * 0.12}s` }"
            aria-hidden="true"
          ></span>
          <span class="stat-label">{{ card.label }}</span>
        </div>
        <strong class="stat-value">{{ card.value }}</strong>
        <small class="stat-desc">{{ card.description }}</small>
      </button>
    </div>
  </section>
</template>

<style scoped>
.panel {
  padding: 16px;
  transition: all var(--transition-normal);
}

.stats-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  padding: 12px 14px;
  cursor: pointer;
  text-align: left;
  transition: all var(--transition-normal);
  position: relative;
  overflow: hidden;
}

/* Subtle underlying colored glow for Vercel design */
.stat-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 120%, var(--accent-glow, rgba(0, 0, 0, 0.03)), transparent 70%);
  opacity: 0;
  transition: opacity var(--transition-normal);
  pointer-events: none;
  z-index: 0;
}

.stat-card:hover {
  border-color: var(--text-primary);
  background: var(--bg-subtle);
  transform: translateY(-2px);
  box-shadow: 
    0 6px 20px rgba(0, 0, 0, 0.04), 
    0 0 0 1px var(--text-muted);
}

.dark .stat-card:hover {
  box-shadow: 
    0 6px 20px rgba(0, 0, 0, 0.25), 
    0 0 0 1px rgba(255, 255, 255, 0.15);
}

.stat-card:hover::before {
  opacity: 1;
}

/* Persistent high-end glow active states for cards when selected */
.stat-card.active {
  border-color: var(--text-primary);
  background: var(--bg-subtle);
  transform: translateY(-2px);
  box-shadow: 
    0 8px 24px rgba(0, 0, 0, 0.06), 
    0 0 0 1.5px var(--text-primary);
}

.dark .stat-card.active {
  box-shadow: 
    0 8px 24px rgba(0, 0, 0, 0.35), 
    0 0 0 1.5px var(--text-primary);
}

.stat-card.active::before {
  opacity: 1;
}

.stat-card:active {
  transform: translateY(-0.5px);
}

.stat-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  position: relative;
  z-index: 1;
}

.stat-value,
.stat-desc {
  position: relative;
  z-index: 1;
}

.stat-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
  position: relative;
  animation: dot-pulse 3.5s infinite ease-in-out;
}

/* Faster breathing pulse for selected card dots */
.stat-card.active .stat-dot {
  animation: dot-pulse 1.8s infinite ease-in-out;
  transform: scale(1.2);
}

/* Staggered Pulsating breathing effect for dots */
@keyframes dot-pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 0.85;
  }
  50% {
    transform: scale(1.35);
    opacity: 1;
    filter: brightness(1.2) drop-shadow(0 0 3px currentColor);
  }
}

/* Specific Glowing Dots representing diff categories */
.dot-insert {
  background-color: var(--tone-insert-text);
  color: var(--tone-insert-text);
  box-shadow: 0 0 6px var(--tone-insert-text);
}
.dot-delete {
  background-color: var(--tone-delete-text);
  color: var(--tone-delete-text);
  box-shadow: 0 0 6px var(--tone-delete-text);
}
.dot-replace {
  background-color: var(--tone-replace-text);
  color: var(--tone-replace-text);
  box-shadow: 0 0 6px var(--tone-replace-text);
}
.dot-move {
  background-color: var(--tone-move-text);
  color: var(--tone-move-text);
  box-shadow: 0 0 6px var(--tone-move-text);
}
.dot-reorder {
  background-color: var(--tone-reorder-text);
  color: var(--tone-reorder-text);
  box-shadow: 0 0 6px var(--tone-reorder-text);
}
.dot-meta {
  background-color: var(--tone-meta-text);
  color: var(--tone-meta-text);
  box-shadow: 0 0 6px var(--tone-meta-text);
}
.dot-rename {
  background-color: var(--tone-rename-text);
  color: var(--tone-rename-text);
  box-shadow: 0 0 6px var(--tone-rename-text);
}
.dot-warning {
  background-color: var(--warning-text);
  color: var(--warning-text);
  box-shadow: 0 0 6px var(--warning-text);
}
.dot-degraded {
  background-color: var(--warning-text);
  color: var(--warning-text);
  box-shadow: 0 0 6px var(--warning-text);
}
.dot-deferred {
  background-color: var(--text-muted);
  color: var(--text-muted);
  box-shadow: 0 0 4px var(--text-muted);
}

/* Accent Glow Color Map */
.card-insert { --accent-glow: rgba(0, 224, 150, 0.08); }
.card-delete { --accent-glow: rgba(255, 77, 79, 0.08); }
.card-replace { --accent-glow: rgba(245, 166, 35, 0.07); }
.card-move { --accent-glow: rgba(0, 112, 243, 0.08); }
.card-reorder { --accent-glow: rgba(255, 255, 255, 0.04); }
.card-meta { --accent-glow: rgba(121, 40, 202, 0.08); }
.card-rename { --accent-glow: rgba(245, 166, 35, 0.07); }
.card-warning { --accent-glow: rgba(245, 166, 35, 0.07); }
.card-degraded { --accent-glow: rgba(245, 166, 35, 0.07); }
.card-deferred { --accent-glow: rgba(100, 100, 100, 0.04); }

.stat-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  transition: transform var(--transition-elastic);
}

.stat-card:hover .stat-value {
  transform: scale(1.03) translateX(1px);
}

.stat-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.3;
}
</style>
