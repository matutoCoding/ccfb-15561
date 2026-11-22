// 排版约束检测：板边留量、缺陷区、件间重叠、越界
import type { LayoutViolation, PlacedPiece, Slab } from '@/core/types'
import { uid } from './util'
import {
  pointInRotatedRect,
  pointToPolygonBoundary,
  polygonArea,
  rectCorners,
  rotatedRectsIntersect,
  type RotatedRect,
  type Vec2,
} from './geometry'

export interface PieceShape {
  piece: PlacedPiece
  // 件在大板坐标系下的角点
  corners: Vec2[]
  areaMm2: number
}

export const buildPieceShape = (piece: PlacedPiece): PieceShape => ({
  piece,
  corners: rectCorners(piece.placement),
  areaMm2: piece.placement.w * piece.placement.h,
})

// 采样网格密度：每 25mm 一个采样点，兼顾精度与性能
const SAMPLE_STEP_MM = 25

const samplePoints = (r: RotatedRect): Vec2[] => {
  const pts: Vec2[] = []
  const nx = Math.max(2, Math.round(r.w / SAMPLE_STEP_MM))
  const ny = Math.max(2, Math.round(r.h / SAMPLE_STEP_MM))
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= ny; j++) {
      const lx = -r.w / 2 + (i / nx) * r.w
      const ly = -r.h / 2 + (j / ny) * r.h
      const c = Math.cos(r.angle)
      const s = Math.sin(r.angle)
      pts.push({
        x: r.cx + lx * c - ly * s,
        y: r.cy + lx * s + ly * c,
      })
    }
  }
  return pts
}

// 单件对一块大板的约束检查
export const checkPieceOnSlab = (
  piece: PlacedPiece,
  slab: Slab,
): LayoutViolation[] => {
  const violations: LayoutViolation[] = []
  const r = piece.placement
  const margin = slab.edgeMarginMm

  // 越界 + 留量：角点与采样点都要在留量框内
  const inner = {
    x: margin,
    y: margin,
    w: slab.widthMm - margin * 2,
    h: slab.heightMm - margin * 2,
  }
  const outside = samplePoints(r).some(
    (p) => p.x < inner.x || p.y < inner.y || p.x > inner.x + inner.w || p.y > inner.y + inner.h,
  )
  if (outside) {
    violations.push({
      id: uid('v'),
      level: 'error',
      kind: 'out-of-slab',
      pieceId: piece.id,
      message: `件 ${piece.seq} 超出大板可用范围（含 ${margin}mm 板边留量）`,
    })
  }

  // 缺陷区：采样点进入任意缺陷多边形即违规，附带侵入深度
  for (const defect of slab.defects) {
    let worst = 0
    for (const p of samplePoints(r)) {
      const d = pointToPolygonBoundary(p, defect.polygon)
      if (d < 0) worst = Math.max(worst, -d)
    }
    if (worst > 0) {
      violations.push({
        id: uid('v'),
        level: 'error',
        kind: 'defect-overlap',
        pieceId: piece.id,
        message: `件 ${piece.seq} 侵入缺陷区「${defect.name}」，最深 ${Math.round(worst)}mm`,
      })
    }
  }
  return violations
}

// 件间重叠
export const checkPiecesOverlap = (pieces: PlacedPiece[]): LayoutViolation[] => {
  const violations: LayoutViolation[] = []
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      if (pieces[i].slabId !== pieces[j].slabId) continue
      if (rotatedRectsIntersect(pieces[i].placement, pieces[j].placement)) {
        violations.push({
          id: uid('v'),
          level: 'error',
          kind: 'piece-overlap',
          pieceId: pieces[i].id,
          message: `件 ${pieces[i].seq} 与件 ${pieces[j].seq} 重叠`,
        })
      }
    }
  }
  return violations
}

export interface UtilizationResult {
  usedAreaMm2: number
  totalAreaMm2: number
  utilization: number
}

export const calcUtilization = (
  pieces: PlacedPiece[],
  slabs: Slab[],
): UtilizationResult => {
  const used = pieces.reduce((sum, p) => sum + p.placement.w * p.placement.h, 0)
  const usedSlabIds = new Set(pieces.map((p) => p.slabId))
  const total = slabs
    .filter((s) => usedSlabIds.has(s.id))
    .reduce((sum, s) => sum + s.widthMm * s.heightMm, 0)
  return {
    usedAreaMm2: used,
    totalAreaMm2: total,
    utilization: total > 0 ? used / total : 0,
  }
}

// 全套约束检查入口
export const validateLayout = (
  pieces: PlacedPiece[],
  slabs: Slab[],
): LayoutViolation[] => {
  const slabMap = new Map(slabs.map((s) => [s.id, s]))
  const violations: LayoutViolation[] = []
  for (const piece of pieces) {
    const slab = slabMap.get(piece.slabId)
    if (!slab) {
      violations.push({
        id: uid('v'),
        level: 'error',
        kind: 'out-of-slab',
        pieceId: piece.id,
        message: `件 ${piece.seq} 引用了不存在的大板`,
      })
      continue
    }
    violations.push(...checkPieceOnSlab(piece, slab))
  }
  violations.push(...checkPiecesOverlap(pieces))
  return violations
}

// 判断点是否落在任何件上（命中检测用）
export const hitTestPiece = (pieces: PlacedPiece[], p: Vec2): PlacedPiece | undefined => {
  for (let i = pieces.length - 1; i >= 0; i--) {
    if (pointInRotatedRect(pieces[i].placement, p)) return pieces[i]
  }
  return undefined
}

export { polygonArea }
