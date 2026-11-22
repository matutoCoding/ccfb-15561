import { defineStore } from 'pinia'
import { db } from '@/core/db'
import type {
  LayoutPlan,
  LayoutViolation,
  MatchSeam,
  PlacedPiece,
  Slab,
} from '@/core/types'
import { uid } from '@/core/util'
import { calcUtilization, validateLayout } from '@/core/constraints'

interface PlanState {
  plans: LayoutPlan[]
  current?: LayoutPlan
  loaded: boolean
}

export const usePlanStore = defineStore('plan', {
  state: (): PlanState => ({
    plans: [],
    loaded: false,
  }),
  actions: {
    async load() {
      this.plans = await db.plans.toArray()
      this.loaded = true
    },
    async listByProject(projectId: string): Promise<LayoutPlan[]> {
      return db.plans.where('projectId').equals(projectId).toArray()
    },
    async open(id: string) {
      this.current = await db.plans.get(id)
    },
    closeCurrent() {
      this.current = undefined
    },
    async create(projectId: string, name: string, pieces: PlacedPiece[], slabIds: string[]) {
      const plan: LayoutPlan = {
        id: uid('plan'),
        projectId,
        name,
        pieces,
        seams: [],
        slabIds,
        utilization: 0,
        createdAt: Date.now(),
        violations: [],
      }
      this.plans.unshift(plan)
      this.current = plan
      await db.plans.put(plan)
      return plan
    },
    async duplicate(): Promise<LayoutPlan | undefined> {
      if (!this.current) return undefined
      const src = this.current
      const copy: LayoutPlan = {
        ...structuredClone(src),
        id: uid('plan'),
        name: `${src.name} 副本`,
        createdAt: Date.now(),
      }
      this.plans.unshift(copy)
      await db.plans.put(copy)
      this.current = copy
      return copy
    },
    async persist(slabs: Slab[] = []) {
      if (!this.current) return
      const violations = validateLayout(this.current.pieces, slabs)
      this.current.violations = violations
      const used = calcUtilization(this.current.pieces, slabs)
      this.current.utilization = used.utilization
      await db.plans.put(this.current)
    },
    updatePiece(pieceId: string, patch: Partial<PlacedPiece>) {
      if (!this.current) return
      const piece = this.current.pieces.find((p) => p.id === pieceId)
      if (!piece) return
      Object.assign(piece, patch)
    },
    setSeams(seams: MatchSeam[]) {
      if (!this.current) return
      this.current.seams = seams
    },
    addViolation(v: LayoutViolation) {
      this.current?.violations.push(v)
    },
    async remove(id: string) {
      this.plans = this.plans.filter((p) => p.id !== id)
      await db.plans.delete(id)
      if (this.current?.id === id) this.current = undefined
    },
  },
})
