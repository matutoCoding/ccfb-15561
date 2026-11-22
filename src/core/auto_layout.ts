// 自动排样：Max Rects Bin Packing（BSSF 启发式）+ 多板续板
import type { PlacedPiece, ProjectFace, Slab, LayoutViolation } from './types'
import { uid } from './util'
import type { Rect, RotatedRect } from './geometry'
import { validateLayout } from './constraints'

export interface AutoLayoutInput {
  faces: ProjectFace[]
  slabs: Slab[]
  allowedAngles: number[]
  // 面之间的对纹分组：同组按序相邻摆放
  matchGroups?: string[][]
}

export interface AutoLayoutResult {
  pieces: PlacedPiece[]
  violations: LayoutViolation[]
  slabIdsUsed: string[]
  // 未能排下的面 id
  unplacedFaceIds: string[]
}

interface FreeRect extends Rect {}

const rectFits = (free: Rect, w: number, h: number): boolean =>
  free.w >= w && free.h >= h

// 拆分空闲矩形
const splitFree = (free: FreeRect, used: Rect): FreeRect[] => {
  const result: FreeRect[] = []
  // 右剩
  if (used.x + used.w < free.x + free.w) {
    result.push({
      x: used.x + used.w,
      y: free.y,
      w: free.x + free.w - (used.x + used.w),
      h: free.h,
    })
  }
  // 上剩
  if (used.y + used.h < free.y + free.h) {
    result.push({
      x: free.x,
      y: used.y + used.h,
      w: free.w,
      h: free.y + free.h - (used.y + used.h),
    })
  }
  return result
}

const removeContained = (rects: FreeRect[]): FreeRect[] => {
  const kept: FreeRect[] = []
  for (let i = 0; i < rects.length; i++) {
    let contained = false
    for (let j = 0; j < rects.length; j++) {
      if (i === j) continue
      const a = rects[i]
      const b = rects[j]
      if (
        b.x <= a.x &&
        b.y <= a.y &&
        b.x + b.w >= a.x + a.w &&
        b.y + b.h >= a.y + a.h
      ) {
        contained = true
        break
      }
    }
    if (!contained) kept.push(rects[i])
  }
  return kept
}

// 在一块板的可用区域（扣除留量）内排，返回成功摆放与剩余
const packOneSlab = (
  slab: Slab,
  queue: { face: ProjectFace; groupIdx: number; orderInGroup: number }[],
  allowedAngles: number[],
  startSeq: number,
): { placed: PlacedPiece[]; remaining: typeof queue } => {
  const margin = slab.edgeMarginMm
  const usable: FreeRect = {
    x: margin,
    y: margin,
    w: slab.widthMm - margin * 2,
    h: slab.heightMm - margin * 2,
  }
  let freeRects: FreeRect[] = [usable]
  const placed: PlacedPiece[] = []
  const remaining = [...queue]
  let seq = startSeq

  let progressed = true
  while (progressed && remaining.length > 0) {
    progressed = false
    for (let qi = 0; qi < remaining.length; qi++) {
      const item = remaining[qi]
      const face = item.face
      let best:
        | { free: FreeRect; angle: number; score: number; w: number; h: number }
        | undefined

      for (const angleDeg of allowedAngles) {
        const rad = (angleDeg * Math.PI) / 180
        const rotated = angleDeg % 180 !== 0
        const w = rotated ? face.heightMm : face.widthMm
        const h = rotated ? face.widthMm : face.heightMm
        for (const free of freeRects) {
          if (!rectFits(free, w, h)) continue
          // BSSF：选贴合后剩余最短边最大的位置
          const score = Math.min(free.w - w, free.h - h)
          if (!best || score > best.score) {
            best = { free, angle: rad, score, w, h }
          }
        }
      }
      if (!best) continue

      const used: Rect = { x: best.free.x, y: best.free.y, w: best.w, h: best.h }
      const next: FreeRect[] = []
      for (const free of freeRects) {
        const overlaps =
          used.x < free.x + free.w &&
          used.y < free.y + free.h &&
          used.x + used.w > free.x &&
          used.y + used.h > free.y
        if (overlaps) {
          next.push(...splitFree(free, used))
        } else {
          next.push(free)
        }
      }
      freeRects = removeContained(next)

      const placement: RotatedRect = {
        cx: used.x + used.w / 2,
        cy: used.y + used.h / 2,
        w: face.widthMm,
        h: face.heightMm,
        angle: best.angle,
      }
      placed.push({
        id: uid('piece'),
        faceId: face.id,
        slabId: slab.id,
        placement,
        mirrorU: false,
        seq: seq++,
      })
      remaining.splice(qi, 1)
      qi--
      progressed = true
    }
  }
  return { placed, remaining }
}

// 自动排样主入口：按批次顺序选板，板不够时明确返回未排面
export const autoLayout = (input: AutoLayoutInput): AutoLayoutResult => {
  const { faces, slabs, allowedAngles } = input
  // 大板按批次+序号排序，保证同批次顺序编号
  const orderedSlabs = [...slabs].sort((a, b) => {
    if (a.batchNo !== b.batchNo) return a.batchNo.localeCompare(b.batchNo)
    return a.seqInBatch - b.seqInBatch
  })

  // 面按对纹分组顺序展开，组内保持相邻
  const queue = faces.map((face, idx) => ({
    face,
    groupIdx: idx,
    orderInGroup: 0,
  }))

  const pieces: PlacedPiece[] = []
  const slabIdsUsed: string[] = []
  let work = [...queue]
  let seq = 1

  for (const slab of orderedSlabs) {
    if (work.length === 0) break
    const { placed, remaining } = packOneSlab(slab, work, allowedAngles, seq)
    seq += placed.length
    if (placed.length > 0) slabIdsUsed.push(slab.id)
    pieces.push(...placed)
    work = remaining
  }

  const violations = validateLayout(
    pieces,
    orderedSlabs.filter((s) => slabIdsUsed.includes(s.id)),
  )
  if (work.length > 0) {
    violations.push({
      id: uid('v'),
      level: 'warning',
      kind: 'out-of-slab',
      message: `大板不足，还有 ${work.length} 个面未能排下，请补充同批次大板`,
    })
  }

  return {
    pieces,
    violations,
    slabIdsUsed,
    unplacedFaceIds: work.map((w) => w.face.id),
  }
}
