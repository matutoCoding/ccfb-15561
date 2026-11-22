// 对纹精度验证：同一块板切成左右两件，拼回后缝两侧采样点的物理 UV 必须严格一致
// 理论错位 = 0 纹理像素（GPU 浮点误差量级），验证 1px 阈值有充足余量
import { pieceLocalToSlab, slabMmToUv } from './matching'
import type { PlacedPiece } from './types'

export interface PrecisionResult {
  maxUvDelta: number
  maxTexelDelta: number
  // 以 4096 工作纹理折算的错位像素
  mismatchAt4k: number
  mirrorDeltaMm: number
  passed: boolean
}

export const verifySeamPrecision = (
  slabW: number,
  slabH: number,
  workingTexWidth: number,
): PrecisionResult => {
  // 左件占板左半，右件占板右半，缝在板正中 x = slabW/2
  const seamX = slabW / 2
  const pieceW = slabW / 2
  const pieceH = slabH

  const left: PlacedPiece = {
    id: 'left',
    faceId: 'f1',
    slabId: 's1',
    placement: { cx: pieceW / 2, cy: slabH / 2, w: pieceW, h: pieceH, angle: 0 },
    mirrorU: false,
    seq: 1,
  }
  const right: PlacedPiece = {
    id: 'right',
    faceId: 'f2',
    slabId: 's1',
    placement: { cx: seamX + pieceW / 2, cy: slabH / 2, w: pieceW, h: pieceH, angle: 0 },
    mirrorU: false,
    seq: 2,
  }

  let maxUvDelta = 0
  // 沿缝取 100 个高度点，比较左件右边缘与右件左边缘映射到的板坐标
  for (let i = 0; i <= 100; i++) {
    const yLocal = -pieceH / 2 + (i / 100) * pieceH
    // 左件局部右边缘
    const leftEdge = pieceLocalToSlab(left, { x: pieceW / 2, y: yLocal })
    // 右件局部左边缘
    const rightEdge = pieceLocalToSlab(right, { x: -pieceW / 2, y: yLocal })
    const uvL = slabMmToUv(leftEdge, slabW, slabH)
    const uvR = slabMmToUv(rightEdge, slabW, slabH)
    const du = Math.abs(uvL.u - uvR.u)
    const dv = Math.abs(uvL.v - uvR.v)
    maxUvDelta = Math.max(maxUvDelta, Math.hypot(du, dv))
  }

  // UV 增量折算成纹理像素
  const maxTexelDelta = maxUvDelta * workingTexWidth

  // 书本对纹：镜像只翻转件局部 u，不改变 v（纹理走向）。
  // 验证镜像确定性：同一件镜像前后，同高度点的 y 板坐标必须一致，x 关于件中心对称
  const sample = right
  const mirrored: PlacedPiece = { ...sample, mirrorU: true }
  const plain: PlacedPiece = { ...sample, mirrorU: false }
  let vDriftMax = 0
  let symmetryErrorMax = 0
  for (let i = 0; i <= 50; i++) {
    const ly = -pieceH / 2 + (i / 50) * pieceH
    const lx = pieceW / 4
    const pPlain = pieceLocalToSlab(plain, { x: lx, y: ly })
    const pMirror = pieceLocalToSlab(mirrored, { x: lx, y: ly })
    // v 走向不能因镜像漂移
    vDriftMax = Math.max(vDriftMax, Math.abs(pPlain.y - pMirror.y))
    // 镜像点 x 应关于件中心 cx 对称
    const expectedX = 2 * sample.placement.cx - pPlain.x
    symmetryErrorMax = Math.max(symmetryErrorMax, Math.abs(pMirror.x - expectedX))
  }

  const texelOk = maxTexelDelta < 1
  const mirrorOk = vDriftMax <= 0.001 && symmetryErrorMax <= 0.001

  return {
    maxUvDelta,
    maxTexelDelta,
    mismatchAt4k: maxTexelDelta,
    mirrorDeltaMm: Math.max(vDriftMax, symmetryErrorMax),
    passed: texelOk && mirrorOk,
  }
}
