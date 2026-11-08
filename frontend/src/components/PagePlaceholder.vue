<script setup lang="ts">defineProps<{
    eyebrow: string;
    title: string;
    description: string;
    priority?: string;
}>();
</script>

<template>
  <section>
    <header class="page-heading">
      <div>
        <p class="page-eyebrow">{{ eyebrow }}</p>
        <h1>{{ title }}</h1>
        <p>{{ description }}</p>
      </div>
      <span v-if="priority" class="priority-badge">{{ priority }}</span>
    </header>

    <article class="panel placeholder-panel">
      <div class="placeholder-panel__icon">◫</div>
      <h2>页面路由已经建立</h2>
      <p>具体业务功能会按照实施顺序逐步接入。</p>
    </article>
  </section>
</template>

