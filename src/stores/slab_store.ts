import { defineStore } from 'pinia'
import { db, deletePhotoBlob, putPhotoBlob } from '@/core/db'
import type { Slab } from '@/core/types'
import { uid } from '@/core/util'

interface SlabState {
  slabs: Slab[]
  loaded: boolean
}

export const useSlabStore = defineStore('slab', {
  state: (): SlabState => ({
    slabs: [],
    loaded: false,
  }),
  getters: {
    byId: (state) => (id: string) => state.slabs.find((s) => s.id === id),
    batches: (state) => {
      const map = new Map<string, Slab[]>()
      for (const slab of state.slabs) {
        const list = map.get(slab.batchNo) ?? []
        list.push(slab)
        map.set(slab.batchNo, list)
      }
      return map
    },
  },
  actions: {
    async load() {
      this.slabs = await db.slabs.toArray()
      this.loaded = true
    },
    async save(slab: Slab) {
      const idx = this.slabs.findIndex((s) => s.id === slab.id)
      if (idx >= 0) this.slabs[idx] = slab
      else this.slabs.unshift(slab)
      await db.slabs.put(slab)
    },
    async remove(id: string) {
      const slab = this.slabs.find((s) => s.id === id)
      if (slab?.photo) await deletePhotoBlob(slab.photo.blobKey)
      this.slabs = this.slabs.filter((s) => s.id !== id)
      await db.slabs.delete(id)
    },
    async attachPhoto(id: string, blob: Blob, meta: Slab['photo']) {
      const slab = this.slabs.find((s) => s.id === id)
      if (!slab || !meta) return
      if (slab.photo) await deletePhotoBlob(slab.photo.blobKey)
      await putPhotoBlob(meta.blobKey, blob)
      slab.photo = { ...meta }
      await db.slabs.put(slab)
    },
    newSlab(partial: Partial<Slab>): Slab {
      const now = Date.now()
      return {
        id: uid('slab'),
        code: partial.code ?? `SLAB-${this.slabs.length + 1}`,
        category: partial.category ?? 'marble',
        source: partial.source ?? 'procedural',
        widthMm: partial.widthMm ?? 3200,
        heightMm: partial.heightMm ?? 1600,
        thicknessMm: partial.thicknessMm ?? 18,
        batchNo: partial.batchNo ?? 'B001',
        seqInBatch: partial.seqInBatch ?? this.slabs.length + 1,
        defects: partial.defects ?? [],
        edgeMarginMm: partial.edgeMarginMm ?? 20,
        createdAt: now,
        note: partial.note ?? '',
        procedural: partial.procedural,
        photo: partial.photo,
      }
    },
  },
})
