<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/ui/page_header.vue'
import BaseButton from '@/components/ui/base_button.vue'
import BaseField from '@/components/ui/base_field.vue'
import EmptyState from '@/components/ui/empty_state.vue'
import { useProjectStore } from '@/stores/project_store'
import dayjs from '@/libs'

const router = useRouter()
const projectStore = useProjectStore()

const showCreate = ref(false)
const form = ref({ name: '', client: '', room: 'kitchen' as const })

const create = async () => {
  if (!form.value.name.trim()) return
  const project = await projectStore.create(
    form.value.name.trim(),
    form.value.client.trim(),
    form.value.room,
  )
  showCreate.value = false
  form.value = { name: '', client: '', room: 'kitchen' }
  router.push(`/projects/${project.id}/faces`)
}

const roomText: Record<string, string> = {
  kitchen: '厨房',
  'living-room': '客厅',
  bathroom: '卫浴',
  other: '其他',
}
</script>

<template>
  <div class="page">
    <PageHeader title="项目列表" subtitle="一个项目包含台面、岛台、背景墙等多个加工面">
      <template #actions>
        <BaseButton variant="primary" @click="showCreate = true">新建项目</BaseButton>
      </template>
    </PageHeader>

    <EmptyState
      v-if="projectStore.projects.length === 0"
      title="还没有项目"
      subtitle="新建项目后绘制台面、岛台和背景墙"
    >
      <BaseButton variant="primary" @click="showCreate = true">新建项目</BaseButton>
    </EmptyState>

    <div v-else class="list">
      <article
        v-for="project in projectStore.projects"
        :key="project.id"
        class="card"
        @click="router.push(`/projects/${project.id}/faces`)"
      >
        <div class="card-main">
          <p class="name">{{ project.name }}</p>
          <p class="sub">
            {{ project.client || '未填客户' }} · {{ roomText[project.room] }} ·
            {{ project.faces.length }} 个面
          </p>
        </div>
        <div class="card-side">
          <p class="time">{{ dayjs(project.updatedAt).format('YYYY-MM-DD HH:mm') }}</p>
          <BaseButton
            size="sm"
            variant="danger"
            @click.stop="projectStore.remove(project.id)"
          >
            删除
          </BaseButton>
        </div>
      </article>
    </div>

    <div v-if="showCreate" class="mask" @click.self="showCreate = false">
      <div class="dialog">
        <h2 class="dialog-title">新建项目</h2>
        <div class="form">
          <BaseField label="项目名称" v-model="form.name" placeholder="如：云庐 3-1801 厨房" />
          <BaseField label="客户" v-model="form.client" />
          <label class="field">
            <span class="field-label">空间</span>
            <select v-model="form.room" class="input">
              <option value="kitchen">厨房</option>
              <option value="living-room">客厅</option>
              <option value="bathroom">卫浴</option>
              <option value="other">其他</option>
            </select>
          </label>
        </div>
        <footer class="foot">
          <BaseButton @click="showCreate = false">取消</BaseButton>
          <BaseButton variant="primary" :disabled="!form.name.trim()" @click="create">
            创建并编辑
          </BaseButton>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: var(--sp-6);
}
.list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--sp-4) var(--sp-5);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: border-color var(--t-fast), box-shadow var(--t-fast);
}
.card:hover {
  border-color: var(--c-primary);
  box-shadow: var(--shadow);
}
.name {
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
}
.sub {
  margin-top: var(--sp-1);
  font-size: var(--fs-xs);
  color: var(--c-text-3);
}
.card-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--sp-2);
}
.time {
  font-size: var(--fs-xs);
  color: var(--c-text-3);
}
.mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: grid;
  place-items: center;
  z-index: 50;
}
.dialog {
  width: 440px;
  background: var(--c-surface);
  border-radius: var(--radius-lg);
  padding: var(--sp-5);
  box-shadow: var(--shadow-lg);
}
.dialog-title {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  margin-bottom: var(--sp-4);
}
.form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}
.field {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}
.field-label {
  font-size: var(--fs-xs);
  color: var(--c-text-2);
  font-weight: var(--fw-medium);
}
.input {
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  font-size: var(--fs-xs);
}
.foot {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-3);
  margin-top: var(--sp-5);
}
</style>
