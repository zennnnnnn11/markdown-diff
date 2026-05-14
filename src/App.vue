<script setup lang="ts">
import DiffWorkbench from '@/features/diff-workbench/DiffWorkbench.vue'

import sampleNewMarkdown from '../new.md?raw'
import sampleOldMarkdown from '../old.md?raw'
</script>

<template>
  <DiffWorkbench
    :initial-old-markdown="sampleOldMarkdown"
    :initial-new-markdown="sampleNewMarkdown"
  />
</template>
