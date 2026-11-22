<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import BaseButton from '@/components/ui/base_button.vue'
import BaseField from '@/components/ui/base_field.vue'
import { useSlabStore } from '@/stores/slab_store'
import { useSettingsStore } from '@/stores/settings_store'
import type { ProceduralTextureSpec, Slab } from '@/core/types'
import { uid } from '@/core/util'
import { correctPhoto, estimateWhiteBalance } from '@/core/photo_correction'

const props = defineProps<{ slab?: Slab }>()
const emit = defineEmits<{ close: [] }>()

const slabStore = useSlabStore()
const settingsStore = useSettingsStore()

const isEdit = computed(() => Boolean(props.slab))

const form = reactive<Slab>(
  props.slab
    ? structuredClone(props.slab)
    : slabStore.newSlab({
        edgeMarginMm: settingsStore.settings.defaultEdgeMarginMm,
      }),
)

const proc = reactive<ProceduralTextureSpec>(
  form.procedural ?? {
    kind: 'marble-flow',
    seed: 7,
    baseColor: '#e8e4dc',
    veinColor: '#6b6f76',
    scale: 3,
    turbulence: 1.2,
  },
)

const photoFile = ref<File>()
const previewUrl = ref<string>()
const correcting = ref(false)
const correctionMsg = ref('')

const pickPhoto = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  photoFile.value = file
  previewUrl.value = URL.createObjectURL(file)
  form.source = 'photo'
  correctionMsg.value = '已选择照片，保存时执行透视与白平衡校正'
}

const runAutoWb = async () => {
  if (!photoFile.value) return
  correcting.value = true
  const bitmap = await createImageBitmap(photoFile.value)
  const wb = estimateWhiteBalance(bitmap)
  form.photo = {
    blobKey: uid('photo'),
    widthPx: bitmap.width,
    heightPx: bitmap.height,
    quad: {
      tl: { x: 0, y: 0 },
      tr: { x: 1, y: 0 },
      br: { x: 1, y: 1 },
      bl: { x: 0, y: 1 },
    },
    correction: {
      gain: { x: wb.gain.x, y: wb.gain.y, z: wb.gain.z },
      exposure: 1,
      temperature: 0,
    },
    workingMaxSize: settingsStore.settings.workingTextureMax,
  }
  correcting.value = false
  correctionMsg.value = '白平衡已按灰世界假设自动估算，可微调四角点后保存'
  bitmap.close()
}

const addDefect = () => {
  form.defects.push({
    id: uid('defect'),
    name: `缺陷 ${form.defects.length + 1}`,
    severity: 'crack',
    polygon: {
      // 默认在板面中心放一个 200mm 方框，用户可在排版页进一步调整
      points: [
        { x: form.widthMm / 2 - 100, y: form.heightMm / 2 - 100 },
        { x: form.widthMm / 2 + 100, y: form.heightMm / 2 - 100 },
        { x: form.widthMm / 2 + 100, y: form.heightMm / 2 + 100 },
        { x: form.widthMm / 2 - 100, y: form.heightMm / 2 + 100 },
      ],
    },
  })
}

const removeDefect = (id: string) => {
  form.defects = form.defects.filter((d) => d.id !== id)
}

const save = async () => {
  if (form.source === 'procedural') form.procedural = { ...proc }
  if (photoFile.value && form.photo) {
    correcting.value = true
    const bitmap = await createImageBitmap(photoFile.value)
    const maxEdge = settingsStore.settings.workingTextureMax
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const outW = Math.round(bitmap.width * scale)
    const outH = Math.round(bitmap.height * scale)
    const canvas = correctPhoto(bitmap, {
      outWidth: outW,
      outHeight: outH,
      quad: form.photo.quad,
      correction: form.photo.correction,
    })
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    )
    await slabStore.attachPhoto(form.id, blob, {
      ...form.photo,
      widthPx: outW,
      heightPx: outH,
    })
    bitmap.close()
  }
  await slabStore.save(form)
  emit('close')
}
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="dialog">
      <header class="dialog-head">
        <h2>{{ isEdit ? '编辑大板' : '新增大板' }}</h2>
      </header>
      <div class="dialog-body">
        <section class="section">
          <p class="section-title">基础信息</p>
          <div class="grid-2">
            <BaseField label="大板编号" v-model="form.code" />
            <BaseField label="批次号" v-model="form.batchNo" />
            <BaseField label="宽度" v-model="form.widthMm" type="number" suffix="mm" />
            <BaseField label="高度" v-model="form.heightMm" type="number" suffix="mm" />
            <BaseField label="厚度" v-model="form.thicknessMm" type="number" suffix="mm" />
            <BaseField label="板内序号" v-model="form.seqInBatch" type="number" />
            <BaseField label="板边留量" v-model="form.edgeMarginMm" type="number" suffix="mm" />
            <label class="field">
              <span class="field-label">石材类别</span>
              <select v-model="form.category" class="input">
                <option value="marble">大理石</option>
                <option value="quartzite">石英岩</option>
                <option value="granite">花岗岩</option>
                <option value="sintered">岩板</option>
              </select>
            </label>
          </div>
        </section>

        <section class="section">
          <p class="section-title">纹理来源</p>
          <div class="source-tabs">
            <button
              class="tab"
              :class="{ active: form.source === 'procedural' }"
              @click="form.source = 'procedural'"
            >
              程序生成
            </button>
            <button
              class="tab"
              :class="{ active: form.source === 'photo' }"
              @click="form.source = 'photo'"
            >
              照片入库
            </button>
          </div>

          <div v-if="form.source === 'procedural'" class="grid-2">
            <label class="field">
              <span class="field-label">纹理类型</span>
              <select v-model="proc.kind" class="input">
                <option value="marble-flow">流动大理石</option>
                <option value="marble-vein">粗脉大理石</option>
                <option value="quartzite">石英岩晶粒</option>
              </select>
            </label>
            <BaseField label="随机种子" v-model="proc.seed" type="number" />
            <BaseField label="纹理尺度" v-model="proc.scale" type="number" :step="0.1" />
            <BaseField label="扭曲强度" v-model="proc.turbulence" type="number" :step="0.1" />
            <BaseField label="底色" v-model="proc.baseColor" type="color" />
            <BaseField label="矿脉色" v-model="proc.veinColor" type="color" />
          </div>

          <div v-else class="photo-block">
            <input type="file" accept="image/*" @change="pickPhoto" />
            <img v-if="previewUrl" :src="previewUrl" class="preview" alt="照片预览" />
            <BaseButton size="sm" :disabled="!photoFile || correcting" @click="runAutoWb">
              自动白平衡估算
            </BaseButton>
            <p class="msg">{{ correctionMsg }}</p>
            <div v-if="form.photo" class="grid-2">
              <BaseField
                label="曝光补偿"
                :model-value="form.photo.correction.exposure"
                type="number"
                :step="0.05"
                @update:model-value="(v) => (form.photo!.correction.exposure = Number(v))"
              />
              <BaseField
                label="色温偏移"
                :model-value="form.photo.correction.temperature"
                type="number"
                :step="0.05"
                @update:model-value="(v) => (form.photo!.correction.temperature = Number(v))"
              />
            </div>
          </div>
        </section>

        <section class="section">
          <div class="section-head">
            <p class="section-title">缺陷区</p>
            <BaseButton size="sm" @click="addDefect">添加缺陷区</BaseButton>
          </div>
          <div v-for="defect in form.defects" :key="defect.id" class="defect-row">
            <input v-model="defect.name" class="input grow" />
            <select v-model="defect.severity" class="input">
              <option value="crack">裂纹</option>
              <option value="chip">崩边</option>
              <option value="stain">色斑</option>
              <option value="vein-gap">断纹</option>
            </select>
            <BaseButton size="sm" variant="danger" @click="removeDefect(defect.id)">移除</BaseButton>
          </div>
        </section>
      </div>
      <footer class="dialog-foot">
        <BaseButton @click="emit('close')">取消</BaseButton>
        <BaseButton variant="primary" :disabled="correcting" @click="save">保存</BaseButton>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: grid;
  place-items: center;
  z-index: 50;
  padding: var(--sp-5);
}
.dialog {
  width: min(760px, 100%);
  max-height: 88vh;
  overflow: auto;
  background: var(--c-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
.dialog-head {
  padding: var(--sp-5);
  border-bottom: 1px solid var(--c-border);
}
.dialog-head h2 {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
}
.dialog-body {
  padding: var(--sp-5);
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
}
.section {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.section-title {
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
}
.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-3) var(--sp-4);
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
  background: var(--c-surface);
  font-size: var(--fs-xs);
}
.source-tabs {
  display: flex;
  gap: var(--sp-1);
  background: var(--c-surface-2);
  padding: 3px;
  border-radius: var(--radius);
  width: fit-content;
}
.tab {
  border: none;
  background: transparent;
  padding: var(--sp-1) var(--sp-4);
  border-radius: var(--radius-sm);
  font-size: var(--fs-xs);
  color: var(--c-text-2);
}
.tab.active {
  background: var(--c-surface);
  color: var(--c-primary);
  font-weight: var(--fw-medium);
  box-shadow: var(--shadow-sm);
}
.photo-block {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.preview {
  max-height: 220px;
  object-fit: contain;
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
}
.msg {
  font-size: var(--fs-xs);
  color: var(--c-text-3);
}
.defect-row {
  display: flex;
  gap: var(--sp-3);
  align-items: center;
}
.grow {
  flex: 1;
}
.dialog-foot {
  padding: var(--sp-4) var(--sp-5);
  border-top: 1px solid var(--c-border);
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-3);
}
</style>
