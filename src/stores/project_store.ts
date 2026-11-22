import { defineStore } from 'pinia'
import { db } from '@/core/db'
import type { Project, ProjectFace } from '@/core/types'
import { uid } from '@/core/util'

interface ProjectState {
  projects: Project[]
  current?: Project
  loaded: boolean
}

const newFace = (name: string, kind: ProjectFace['kind']): ProjectFace => ({
  id: uid('face'),
  name,
  kind,
  widthMm: 2400,
  heightMm: 600,
  thicknessMm: 18,
  holes: [],
  bevel: { top: 0, right: 0, bottom: 0, left: 0 },
  dropEdgeMm: 0,
  finish: 'polished',
  note: '',
})

export const useProjectStore = defineStore('project', {
  state: (): ProjectState => ({
    projects: [],
    loaded: false,
  }),
  actions: {
    async load() {
      this.projects = await db.projects.toArray()
      this.loaded = true
    },
    async open(id: string) {
      this.current = await db.projects.get(id)
    },
    closeCurrent() {
      this.current = undefined
    },
    async create(name: string, client: string, room: Project['room']): Promise<Project> {
      const now = Date.now()
      const project: Project = {
        id: uid('proj'),
        name,
        client,
        room,
        faces: [newFace('台面-1', 'countertop')],
        createdAt: now,
        updatedAt: now,
        note: '',
      }
      this.projects.unshift(project)
      await db.projects.put(project)
      this.current = project
      return project
    },
    async persist() {
      if (!this.current) return
      this.current.updatedAt = Date.now()
      const idx = this.projects.findIndex((p) => p.id === this.current!.id)
      if (idx >= 0) this.projects[idx] = this.current
      await db.projects.put(this.current)
    },
    async remove(id: string) {
      this.projects = this.projects.filter((p) => p.id !== id)
      await db.projects.delete(id)
      const planKeys = await db.plans.where('projectId').equals(id).primaryKeys()
      await db.plans.bulkDelete(planKeys)
      if (this.current?.id === id) this.current = undefined
    },
    addFace(kind: ProjectFace['kind']) {
      if (!this.current) return
      const names: Record<ProjectFace['kind'], string> = {
        countertop: '台面',
        island: '岛台',
        'feature-wall': '背景墙',
        other: '构件',
      }
      const count = this.current.faces.filter((f) => f.kind === kind).length + 1
      this.current.faces.push(newFace(`${names[kind]}-${count}`, kind))
      this.persist()
    },
    removeFace(faceId: string) {
      if (!this.current || this.current.faces.length <= 1) return
      this.current.faces = this.current.faces.filter((f) => f.id !== faceId)
      this.persist()
    },
  },
})
