// 照片预处理：四点透视校正 + 白平衡/偏色校正，输出规整矩形位图
import type { ColorCorrection, PerspectiveQuad } from '@/core/types'
import { clamp } from '@/core/geometry'

// 单应矩阵（3x3，列主序风格的扁平数组）
export type Homography = number[]

// 由归一化四角点求到标准矩形 [0,1] 的单应矩阵（DLT）
export const computeHomography = (quad: PerspectiveQuad): Homography => {
  const src = [
    [quad.tl.x, quad.tl.y],
    [quad.tr.x, quad.tr.y],
    [quad.br.x, quad.br.y],
    [quad.bl.x, quad.bl.y],
  ]
  const dst = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]
  // A h = 0，8 个方程解 8 个未知量，h9=1
  const a: number[][] = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]
    const [u, v] = dst[i]
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }
  // 高斯消元
  const mat = a.map((row) => [...row])
  for (let col = 0; col < 8; col++) {
    let pivot = col
    for (let r = col + 1; r < 8; r++) {
      if (Math.abs(mat[r][col]) > Math.abs(mat[pivot][col])) pivot = r
    }
    ;[mat[col], mat[pivot]] = [mat[pivot], mat[col]]
    const piv = mat[col][col]
    if (Math.abs(piv) < 1e-10) throw new Error('透视角点退化，无法计算单应矩阵')
    for (let r = 0; r < 8; r++) {
      if (r === col) continue
      const factor = mat[r][col] / piv
      for (let c = col; c < 9; c++) mat[r][c] -= factor * mat[col][c]
    }
  }
  const h: number[] = []
  for (let i = 0; i < 8; i++) h.push(mat[i][8] / mat[i][i])
  h.push(1)
  return h
}

const applyH = (h: Homography, x: number, y: number): [number, number] => {
  const w = h[6] * x + h[7] * y + h[8]
  return [
    (h[0] * x + h[1] * y + h[2]) / w,
    (h[3] * x + h[4] * y + h[5]) / w,
  ]
}

export interface CorrectOptions {
  outWidth: number
  outHeight: number
  quad: PerspectiveQuad
  correction: ColorCorrection
}

// 透视重采样 + 色彩校正，双线性插值
export const correctPhoto = (
  source: ImageBitmap | HTMLCanvasElement,
  opts: CorrectOptions,
): HTMLCanvasElement => {
  const { outWidth, outHeight, quad, correction } = opts
  const h = computeHomography(quad)
  const out = document.createElement('canvas')
  out.width = outWidth
  out.height = outHeight
  const ctx = out.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('校正画布创建失败')

  const tmp = document.createElement('canvas')
  tmp.width = source.width
  tmp.height = source.height
  const sctx = tmp.getContext('2d', { willReadFrequently: true })
  if (!sctx) throw new Error('源画布创建失败')
  sctx.drawImage(source, 0, 0)
  const srcData = sctx.getImageData(0, 0, source.width, source.height)
  const src = srcData.data
  const sw = source.width
  const sh = source.height

  const image = ctx.createImageData(outWidth, outHeight)
  const dst = image.data
  const gain = correction.gain as unknown as { x: number; y: number; z?: number }
  const gR = gain.x
  const gG = gain.y
  const gB = gain.z ?? 1
  const exposure = correction.exposure
  const temp = correction.temperature

  const sample = (fx: number, fy: number): [number, number, number] => {
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const x1 = Math.min(sw - 1, x0 + 1)
    const y1 = Math.min(sh - 1, y0 + 1)
    const tx = fx - x0
    const ty = fy - y0
    const i00 = (y0 * sw + x0) * 4
    const i10 = (y0 * sw + x1) * 4
    const i01 = (y1 * sw + x0) * 4
    const i11 = (y1 * sw + x1) * 4
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t
    return [
      lerp(lerp(src[i00], src[i10], tx), lerp(src[i01], src[i11], tx), ty),
      lerp(lerp(src[i00 + 1], src[i10 + 1], tx), lerp(src[i01 + 1], src[i11 + 1], tx), ty),
      lerp(lerp(src[i00 + 2], src[i10 + 2], tx), lerp(src[i01 + 2], src[i11 + 2], tx), ty),
    ]
  }

  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      // 输出归一化坐标 -> 源图归一化坐标
      const [nx, ny] = applyH(h, x / outWidth, y / outHeight)
      const fx = clamp(nx, 0, 1) * (sw - 1)
      const fy = clamp(ny, 0, 1) * (sh - 1)
      const [r, g, b] = sample(fx, fy)
      const idx = (y * outWidth + x) * 4
      // 白平衡：通道增益 + 曝光 + 色温（暖增红减蓝）
      dst[idx] = clamp(r * gR * exposure + temp * 18, 0, 255)
      dst[idx + 1] = clamp(g * gG * exposure, 0, 255)
      dst[idx + 2] = clamp(b * gB * exposure - temp * 18, 0, 255)
      dst[idx + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return out
}

// 估算画面平均色，给出白平衡增益（灰世界假设）
export const estimateWhiteBalance = (
  bitmap: ImageBitmap,
): { gain: { x: number; y: number; z: number } } => {
  const maxW = 256
  const scale = Math.min(1, maxW / bitmap.width)
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return { gain: { x: 1, y: 1, z: 1 } }
  ctx.drawImage(bitmap, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data
  let r = 0
  let g = 0
  let b = 0
  const n = w * h
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]
    g += data[i + 1]
    b += data[i + 2]
  }
  const avg = (r + g + b) / 3 / n
  const ar = r / n
  const ag = g / n
  const ab = b / n
  return {
    gain: {
      x: avg / Math.max(1, ar),
      y: avg / Math.max(1, ag),
      z: avg / Math.max(1, ab),
    },
  }
}
