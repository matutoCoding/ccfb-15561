<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/ui/page_header.vue'
import BaseButton from '@/components/ui/base_button.vue'
import EmptyState from '@/components/ui/empty_state.vue'
import { usePlanStore } from '@/stores/plan_store'
import { useProjectStore } from '@/stores/project_store'
import { useSlabStore } from '@/stores/slab_store'
import { calcUtilization } from '@/core/constraints'
import { formatArea } from '@/core/util'

const props = defineProps<{ projectId: string }>()
const router = useRouter()
const planStore = usePlanStore()
const projectStore = useProjectStore()
const slabStore = useSlabStore()

onMounted(async () => {
  await Promise.all([projectStore.load(), slabStore.load(), planStore.load()])
})

const project = computed(() =>
  projectStore.projects.find((p) => p.id === props.projectId),
)

const plans = computed(() =>
  planStore.plans
    .filter((p) => p.projectId === props.projectId)
    .map((plan) => {
      const slabs = slabStore.slabs.filter((s) => plan.slabIds.includes(s.id))
      const util = calcUtilization(plan.pieces, slabs)
      const errorCount = plan.violations.filter((v) => v.level === 'error').length
      const seamFail = plan.seams.filter((s) => !s.passed).length
      return {
        plan,
        utilization: util.utilization,
        usedArea: util.usedAreaMm2,
        slabCount: plan.slabIds.length,
        pieceCount: plan.pieces.length,
        errorCount,
        seamFail,
        score: scorePlan(util.utilization, errorCount, seamFail, plan.slabIds.length),
      }
    })
    .sort((a, b) => b.score - a.score),
)

// 综合评分：利用率为主，违规和超差缝扣分，用板数少者优先
const scorePlan = (
  utilization: number,
  errors: number,
  seamFail: number,
  slabCount: number,
): number => {
  const base = utilization * 100
  const penalty = errors * 15 + seamFail * 10 + slabCount * 2
  return base - penalty
}

const bestId = computed(() => plans.value[0]?.plan.id)

const openPlan = (planId: string) => router.push(`/matching/${planId}`)

const remove = async (planId: string) => {
  if (!window.confirm('确认删除该方案？')) return
  await planStore.remove(planId)
}
</script>

<template>
  <div class="page">
    <PageHeader title="方案对比" subtitle="多套排版方案并排比较利用率、违规与对纹质量">
      <template #actions>
        <BaseButton @click="router.push(`/layout/${projectId}`)">返回排版</BaseButton>
      </template>
    </PageHeader>

    <EmptyState
      v-if="plans.length === 0"
      title="还没有可对比的方案"
      subtitle="在排版编辑页生成多套方案后，这里会自动按综合评分排序"
    >
      <BaseButton variant="primary" @click="router.push(`/layout/${projectId}`)">
        去排版编辑
      </BaseButton>
    </EmptyState>

    <div v-else class="compare-grid">
      <article
        v-for="item in plans"
        :key="item.plan.id"
        class="plan-card"
        :class="{ best: item.plan.id === bestId }"
      >
        <div class="card-head">
          <div>
            <p class="plan-name">{{ item.plan.name }}</p>
            <p v-if="item.plan.id === bestId" class="best-tag">推荐方案</p>
          </div>
          <p class="score">{{ item.score.toFixed(1) }} 分</p>
        </div>

        <div class="metric-grid">
          <div class="metric">
            <p class="metric-value">{{ (item.utilization * 100).toFixed(1) }}%</p>
            <p class="metric-label">利用率</p>
          </div>
          <div class="metric">
            <p class="metric-value">{{ item.slabCount }}</p>
            <p class="metric-label">投入大板</p>
          </div>
          <div class="metric">
            <p class="metric-value">{{ item.pieceCount }}</p>
            <p class="metric-label">切割件</p>
          </div>
          <div class="metric">
            <p class="metric-value">{{ formatArea(item.usedArea) }}</p>
            <p class="metric-label">用料面积</p>
          </div>
        </div>

        <!-- 利用率条形可视化 -->
        <div class="bar-track">
          <div class="bar-fill" :style="{ width: `${Math.min(100, item.utilization * 100)}%` }" />
        </div>

        <div class="status-row">
          <span class="chip" :class="item.errorCount === 0 ? 'ok' : 'bad'">
            违规 {{ item.errorCount }}
          </span>
          <span class="chip" :class="item.seamFail === 0 ? 'ok' : 'warn'">
            超差缝 {{ item.seamFail }}
          </span>
        </div>

        <div class="card-actions">
          <BaseButton size="sm" variant="primary" @click="openPlan(item.plan.id)">查看</BaseButton>
          <BaseButton size="sm" variant="danger" @click="remove(item.plan.id)">删除</BaseButton>
        </div>
      </article>
    </div>

    <div v-if="project" class="legend card">
      <p class="legend-title">评分规则</p>
      <p class="legend-text">
        综合分 = 利用率(%) − 违规×15 − 超差缝×10 − 用板数×2。利用率越高、约束违规和对纹超差越少、用板越省，排名越靠前。
      </p>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: var(--sp-6);
}
.compare-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--sp-4);
}
.plan-card {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-lg);
  padding: var(--sp-5);
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--t), border-color var(--t);
}
.plan-card.best {
  border-color: var(--c-primary);
  box-shadow: var(--shadow);
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.plan-name {
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
}
.best-tag {
  margin-top: var(--sp-1);
  font-size: var(--fs-xs);
  color: var(--c-primary);
  font-weight: var(--fw-medium);
}
.score {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  color: var(--c-primary);
}
.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--sp-3);
}
.metric {
  background: var(--c-surface-2);
  border-radius: var(--radius);
  padding: var(--sp-3);
}
.metric-value {
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
}
.metric-label {
  margin-top: 2px;
  font-size: var(--fs-xs);
  color: var(--c-text-3);
}
.bar-track {
  height: 8px;
  background: var(--c-surface-2);
  border-radius: 999px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  background: var(--c-primary);
  border-radius: 999px;
  transition: width var(--t);
}
.status-row {
  display: flex;
  gap: var(--sp-2);
}
.chip {
  padding: 2px var(--sp-3);
  border-radius: 999px;
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
}
.chip.ok {
  background: var(--c-success-soft);
  color: var(--c-success);
}
.chip.bad {
  background: var(--c-danger-soft);
  color: var(--c-danger);
}
.chip.warn {
  background: var(--c-warning-soft);
  color: var(--c-warning);
}
.card-actions {
  display: flex;
  gap: var(--sp-2);
}
.legend {
  margin-top: var(--sp-5);
  padding: var(--sp-4) var(--sp-5);
}
.legend-title {
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  margin-bottom: var(--sp-2);
}
.legend-text {
  font-size: var(--fs-xs);
  color: var(--c-text-2);
  line-height: 1.7;
}
.card {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-lg);
}
</style>
