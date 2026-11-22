// 对纹引擎：
// 1. 书本对纹/连续对纹的几何关系（镜像/平移 UV）
// 2. 缝两侧纹带 NCC 模板匹配，量化纹路错位像素
import type { MatchSeam, PlacedPiece, MatchMode } from './types'
import { uid } from './util'
import {
  localToWorld,
  worldToLocal,
  type RotatedRect,
  type Vec2,
} from './geometry'

// 大板局部毫米坐标 -> 纹理 UV（原点左下，v 向上；采样时再按纹理原点处理）
export const slabMmToUv = (
  p: Vec2,
  slabW: number,
  slabH: number,
): { u: number; v: number } => ({
  u: p.x / slabW,
  v: p.y / slabH,
})

// 件的局部坐标 -> 大板坐标，mirrorU 时沿件自身 u 轴镜像
export const pieceLocalToSlab = (piece: PlacedPiece, p: Vec2): Vec2 => {
  const local = piece.mirrorU ? { x: -p.x, y: p.y } : p
  return localToWorld(piece.placement, local)
}

// 沿缝采样：给定缝端点与偏移距离，取一条平行纹带的世界坐标点
const seamStripPoints = (
  a: Vec2,
  b: Vec2,
  offset: number,
  count: number,
): Vec2[] => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  const nx = -dy / len
  const ny = dx / len
  const pts: Vec2[] = []
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    pts.push({
      x: a.x + dx * t + nx * offset,
      y: a.y + dy * t + ny * offset,
    })
  }
  return pts
}

// 找两个相邻件之间的共享缝（边重合度最高的一对边）
export const findSharedSeam = (
  pa: PlacedPiece,
  pb: PlacedPiece,
): { a: Vec2; b: Vec2 } | undefined => {
  const cornersA = pieceCorners(pa)
  const cornersB = pieceCorners(pb)
  let best: { a: Vec2; b: Vec2; score: number } | undefined
  for (let i = 0; i < 4; i++) {
    const ea0 = cornersA[i]
    const ea1 = cornersA[(i + 1) % 4]
    for (let j = 0; j < 4; j++) {
      const eb0 = cornersB[j]
      const eb1 = cornersB[(j + 1) % 4]
      const score = seamEdgeScore(ea0, ea1, eb0, eb1)
      if (!best || score > best.score) best = { a: ea0, b: ea1, score }
    }
  }
  if (!best || best.score < 0.5) return undefined
  return { a: best.a, b: best.b }
}

const pieceCorners = (piece: PlacedPiece): Vec2[] => {
  const r: RotatedRect = piece.placement
  const hw = r.w / 2
  const hh = r.h / 2
  const local = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ]
  return local.map((p) => pieceLocalToSlab(piece, p))
}

// 两条边的重合评分：长度接近 + 中点接近
const seamEdgeScore = (a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): number => {
  const la = Math.hypot(a1.x - a0.x, a1.y - a0.y)
  const lb = Math.hypot(b1.x - b0.x, b1.y - b0.y)
  const lenRatio = Math.min(la, lb) / Math.max(la, lb)
  const ma = { x: (a0.x + a1.x) / 2, y: (a0.y + a1.y) / 2 }
  const mb = { x: (b0.x + b1.x) / 2, y: (b0.y + b1.y) / 2 }
  const centerDist = Math.hypot(ma.x - mb.x, ma.y - mb.y)
  const distScore = Math.max(0, 1 - centerDist / Math.max(la, 1))
  return lenRatio * 0.5 + distScore * 0.5
}

// 一维亮度序列（纹带）
type Strip = number[]

// 归一化互相关，返回最大相关系数与平移量（单位：采样点）
export const nccMatch = (ref: Strip, tpl: Strip): { shift: number; score: number } => {
  const mean = (arr: Strip) => arr.reduce((s, v) => s + v, 0) / arr.length
  const mr = mean(ref)
  const mt = mean(tpl)
  const cr = ref.map((v) => v - mr)
  const ct = tpl.map((v) => v - mt)
  const normR = Math.sqrt(cr.reduce((s, v) => s + v * v, 0))
  const normT = Math.sqrt(ct.reduce((s, v) => s + v * v, 0))
  if (normR < 1e-6 || normT < 1e-6) return { shift: 0, score: 0 }

  let bestShift = 0
  let bestScore = -1
  const maxShift = Math.floor(tpl.length / 2)
  for (let shift = -maxShift; shift <= maxShift; shift++) {
    let sum = 0
    let count = 0
    for (let i = 0; i < ref.length; i++) {
      const j = i + shift
      if (j < 0 || j >= tpl.length) continue
      sum += cr[i] * ct[j]
      count++
    }
    if (count < tpl.length / 2) continue
    const score = sum / (normR * normT)
    if (score > bestScore) {
      bestScore = score
      bestShift = shift
    }
  }
  return { shift: bestShift, score: bestScore }
}

// 从纹带像素亮度数组构建 strip（多行平均，压噪）
export const averageRows = (rows: number[][]): Strip => {
  const width = rows[0].length
  const out: Strip = new Array(width).fill(0)
  for (const row of rows) {
    for (let x = 0; x < width; x++) out[x] += row[x]
  }
  return out.map((v) => v / rows.length)
}

export interface SeamCheckOptions {
  // 纹带宽度 mm（距缝两侧各取一半）
  stripWidthMm: number
  // 沿缝采样点数
  sampleCount: number
  // 工作纹理 px/mm，用于把毫米错位折算成像素
  pxPerMm: number
  tolerancePx: number
}

// 对一条缝做完整检测：采样点由调用方通过 sampler 回调取亮度
export const evaluateSeam = (
  pa: PlacedPiece,
  pb: PlacedPiece,
  mode: MatchMode,
  sampler: (world: Vec2) => number,
  opts: SeamCheckOptions,
): Omit<MatchSeam, 'id'> | undefined => {
  const seam = findSharedSeam(pa, pb)
  if (!seam) return undefined

  const half = opts.stripWidthMm / 2
  const refPts = seamStripPoints(seam.a, seam.b, -half, opts.sampleCount)
  const tplPts = seamStripPoints(seam.a, seam.b, half, opts.sampleCount)
  const ref = refPts.map(sampler)
  const tpl = tplPts.map(sampler)

  const { shift, score } = nccMatch(ref, tpl)
  // 采样点间距（mm）
  const seamLen = Math.hypot(seam.b.x - seam.a.x, seam.b.y - seam.a.y)
  const stepMm = seamLen / (opts.sampleCount - 1)
  const mismatchMm = Math.abs(shift) * stepMm
  const mismatchPx = mismatchMm * opts.pxPerMm

  return {
    pieceA: pa.id,
    pieceB: pb.id,
    mode,
    a: seam.a,
    b: seam.b,
    mismatchPx,
    mismatchMm,
    confidence: Math.max(0, score),
    passed: mismatchPx <= opts.tolerancePx && score > 0.6,
  }
}

// 书本对纹：把相邻件的 mirrorU 配对（奇数次镜像）
export const applyBookMatch = (pieces: PlacedPiece[]): PlacedPiece[] =>
  pieces.map((p, idx) => ({ ...p, mirrorU: idx % 2 === 1 }))

// 连续对纹：全部不镜像，保持纹理走向连续
export const applySequenceMatch = (pieces: PlacedPiece[]): PlacedPiece[] =>
  pieces.map((p) => ({ ...p, mirrorU: false }))

// 件局部坐标转到自身纹理 UV（含镜像），供着色器使用
export const piecePlacementToUvTransform = (
  piece: PlacedPiece,
  slabW: number,
  slabH: number,
): { ox: number; oy: number; cos: number; sin: number; su: number; sv: number } => {
  const r: RotatedRect = piece.placement
  const c = Math.cos(r.angle)
  const s = Math.sin(r.angle)
  // 世界(大板毫米) -> 件局部 -> 纹理 UV
  return {
    ox: r.cx / slabW,
    oy: r.cy / slabH,
    cos: c,
    sin: s,
    su: (piece.mirrorU ? -1 : 1) / slabW,
    sv: 1 / slabH,
  }
}

export const createSeam = (data: Omit<MatchSeam, 'id'>): MatchSeam => ({
  id: uid('seam'),
  ...data,
})

export { worldToLocal }
