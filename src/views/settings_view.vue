<script setup lang="ts">
import { storeToRefs } from 'pinia'
import PageHeader from '@/components/ui/page_header.vue'
import BaseField from '@/components/ui/base_field.vue'
import BaseButton from '@/components/ui/base_button.vue'
import { useSettingsStore } from '@/stores/settings_store'

const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)

const update = <K extends keyof typeof settings.value>(
  key: K,
  value: (typeof settings.value)[K],
) => settingsStore.update({ [key]: value })
</script>

<template>
  <div class="page">
    <PageHeader title="设置" subtitle="对纹阈值、纹理显存与编辑器默认参数" />
    <div class="card form-grid">
      <BaseField
        label="对纹合格阈值（工作纹理像素）"
        :model-value="settings.matchTolerancePx"
        type="number"
        :min="0"
        :step="0.1"
        suffix="px"
        @update:model-value="(v) => update('matchTolerancePx', Number(v))"
      />
      <BaseField
        label="默认板边留量"
        :model-value="settings.defaultEdgeMarginMm"
        type="number"
        :min="0"
        suffix="mm"
        @update:model-value="(v) => update('defaultEdgeMarginMm', Number(v))"
      />
      <BaseField
        label="工作纹理最大边长"
        :model-value="settings.workingTextureMax"
        type="number"
        :step="512"
        :min="1024"
        suffix="px"
        @update:model-value="(v) => update('workingTextureMax', Number(v))"
      />
      <BaseField
        label="编辑器网格间距"
        :model-value="settings.gridMm"
        type="number"
        :min="10"
        suffix="mm"
        @update:model-value="(v) => update('gridMm', Number(v))"
      />
      <BaseField
        label="MSAA 采样数"
        :model-value="settings.msaaSamples"
        type="number"
        :min="1"
        :max="16"
        @update:model-value="(v) => update('msaaSamples', Number(v))"
      />
      <label class="field">
        <span class="field-label">界面主题</span>
        <select
          class="field-input"
          :value="settings.theme"
          @change="update('theme', ($event.target as HTMLSelectElement).value as 'light' | 'dark')"
        >
          <option value="light">浅色</option>
          <option value="dark">深色</option>
        </select>
      </label>
      <label class="field switch-field">
        <span class="field-label">在本地库保留 8K 原始照片</span>
        <input
          type="checkbox"
          :checked="settings.keepOriginalPhoto"
          @change="update('keepOriginalPhoto', ($event.target as HTMLInputElement).checked)"
        />
      </label>
    </div>
    <div class="card hint">
      <p class="hint-title">性能说明</p>
      <p class="hint-text">
        排版编辑使用工作纹理（受最大边长约束），原始 8K 照片保留在 IndexedDB，
        导出切割图与渲染出图时才按原分辨率采样。4 张 8K 同时排版时，拖动过程只更新 GPU uniform，
        不重新上传纹理，可保持流畅。
      </p>
      <BaseButton
        variant="ghost"
        size="sm"
        @click="settingsStore.update({ ...settings })"
      >
        立即应用全部参数
      </BaseButton>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: var(--sp-6);
  max-width: 880px;
}
.card {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-lg);
  padding: var(--sp-5);
  box-shadow: var(--shadow-sm);
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-4) var(--sp-5);
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
.field-input {
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  background: var(--c-surface);
  font-size: var(--fs-xs);
}
.switch-field {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.hint {
  margin-top: var(--sp-5);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  align-items: flex-start;
}
.hint-title {
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
}
.hint-text {
  font-size: var(--fs-xs);
  color: var(--c-text-2);
  line-height: 1.7;
}
</style>
