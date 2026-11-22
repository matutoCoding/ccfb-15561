import Dexie, { type Table } from 'dexie'
import type { LayoutPlan, Project, Slab, AppSettings } from '@/core/types'
import { DEFAULT_SETTINGS } from '@/core/types'

// 照片二进制单独建表，避免和结构化数据混在一条记录里拖慢查询
interface PhotoBlob {
  key: string
  blob: Blob
  createdAt: number
}

class StoneDb extends Dexie {
  slabs!: Table<Slab, string>
  projects!: Table<Project, string>
  plans!: Table<LayoutPlan, string>
  photos!: Table<PhotoBlob, string>
  settings!: Table<{ id: 'singleton'; value: AppSettings }, string>

  constructor() {
    super('stone_layout_studio')
    this.version(1).stores({
      slabs: 'id, code, batchNo, category',
      projects: 'id, name, createdAt',
      plans: 'id, projectId, createdAt',
      photos: 'key',
      settings: 'id',
    })
  }
}

export const db = new StoneDb()

export const loadSettings = async (): Promise<AppSettings> => {
  const row = await db.settings.get('singleton')
  // 用户未保存过时用内置默认值，缺失字段不做 || 兜底，逐键合并快速暴露结构问题
  if (!row) return { ...DEFAULT_SETTINGS }
  return { ...DEFAULT_SETTINGS, ...row.value }
}

export const saveSettings = async (value: AppSettings): Promise<void> => {
  await db.settings.put({ id: 'singleton', value })
}

export const putPhotoBlob = async (key: string, blob: Blob): Promise<void> => {
  await db.photos.put({ key, blob, createdAt: Date.now() })
}

export const getPhotoBlob = async (key: string): Promise<Blob | undefined> => {
  const row = await db.photos.get(key)
  return row?.blob
}

export const deletePhotoBlob = async (key: string): Promise<void> => {
  await db.photos.delete(key)
}
