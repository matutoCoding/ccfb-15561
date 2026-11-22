<script setup lang="ts">
import { RouterLink } from 'vue-router'
import IconSlab from '@/components/icons/icon_slab.vue'
import IconProject from '@/components/icons/icon_project.vue'
import IconLayout from '@/components/icons/icon_layout.vue'
import IconMatch from '@/components/icons/icon_match.vue'
import IconPreview from '@/components/icons/icon_preview.vue'
import IconSettings from '@/components/icons/icon_settings.vue'

const nav = [
  { to: '/slabs', label: '大板库', icon: IconSlab },
  { to: '/projects', label: '项目列表', icon: IconProject },
  { to: '/layout/stub', label: '排版编辑', icon: IconLayout, matchPrefix: '/layout' },
  { to: '/matching/stub', label: '对纹检查', icon: IconMatch, matchPrefix: '/matching' },
  { to: '/preview/stub', label: '渲染预览', icon: IconPreview, matchPrefix: '/preview' },
  { to: '/settings', label: '设置', icon: IconSettings },
]
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <span class="brand-mark">石</span>
      <div class="brand-text">
        <p class="brand-title">排版对纹台</p>
        <p class="brand-sub">Stone Layout Studio</p>
      </div>
    </div>
    <nav class="nav">
      <RouterLink
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        class="nav-item"
        :class="{ active: $route.path.startsWith(item.matchPrefix ?? item.to) }"
      >
        <component :is="item.icon" :size="18" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>
    <p class="sidebar-foot">物理单位 mm · WebGL2</p>
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-w);
  flex-shrink: 0;
  height: 100%;
  background: var(--c-surface);
  border-right: 1px solid var(--c-border);
  display: flex;
  flex-direction: column;
  padding: var(--sp-5) var(--sp-3);
}
.brand {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 0 var(--sp-2) var(--sp-5);
}
.brand-mark {
  width: 36px;
  height: 36px;
  border-radius: var(--radius);
  background: var(--c-primary);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
}
.brand-title {
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
}
.brand-sub {
  font-size: var(--fs-xs);
  color: var(--c-text-3);
  margin-top: 2px;
}
.nav {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  flex: 1;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-3);
  border-radius: var(--radius);
  color: var(--c-text-2);
  text-decoration: none;
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  transition: background var(--t-fast), color var(--t-fast);
}
.nav-item:hover {
  background: var(--c-surface-2);
  color: var(--c-text);
}
.nav-item.active {
  background: var(--c-primary-soft);
  color: var(--c-primary);
}
.sidebar-foot {
  font-size: var(--fs-xs);
  color: var(--c-text-3);
  padding: var(--sp-3) var(--sp-2);
}
</style>
