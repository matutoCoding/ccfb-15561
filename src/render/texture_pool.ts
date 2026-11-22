import type { GlContext } from './gl_context'
import { isPowerOfTwo, nextPowerOfTwo } from './gl_context'

export interface GpuTexture {
  texture: WebGLTexture
  width: number
  height: number
  // 纹理覆盖的物理尺寸 mm，用于毫米->UV 换算
  widthMm: number
  heightMm: number
  byteSize: number
}

// 纹理池：4 张 8K 约 1GB 显存，超出时按 LRU 回收工作纹理（原图仍在 IndexedDB）
export class TexturePool {
  private ctx: GlContext
  private cache = new Map<string, GpuTexture>()
  private lru: string[] = []
  private totalBytes = 0
  private maxBytes: number

  constructor(ctx: GlContext, maxBytes = 1536 * 1024 * 1024) {
    this.ctx = ctx
    this.maxBytes = maxBytes
  }

  has(key: string): boolean {
    return this.cache.has(key)
  }

  get(key: string): GpuTexture | undefined {
    const tex = this.cache.get(key)
    if (tex) {
      this.lru = this.lru.filter((k) => k !== key)
      this.lru.push(key)
    }
    return tex
  }

  set(key: string, tex: GpuTexture): void {
    const old = this.cache.get(key)
    if (old) {
      this.totalBytes -= old.byteSize
      this.ctx.gl.deleteTexture(old.texture)
      this.lru = this.lru.filter((k) => k !== key)
    }
    this.cache.set(key, tex)
    this.lru.push(key)
    this.totalBytes += tex.byteSize
    this.evict()
  }

  private evict(): void {
    while (this.totalBytes > this.maxBytes && this.lru.length > 1) {
      const victim = this.lru.shift()
      if (!victim) break
      const tex = this.cache.get(victim)
      if (!tex) continue
      this.totalBytes -= tex.byteSize
      this.ctx.gl.deleteTexture(tex.texture)
      this.cache.delete(victim)
    }
  }

  dispose(): void {
    const gl = this.ctx.gl
    for (const tex of this.cache.values()) gl.deleteTexture(tex.texture)
    this.cache.clear()
    this.lru = []
    this.totalBytes = 0
  }
}

// 从 ImageBitmap 创建工作纹理，内部转 2 的幂并生成 mipmap
export const uploadSlabTexture = (
  ctx: GlContext,
  bitmap: ImageBitmap,
  widthMm: number,
  heightMm: number,
  targetMaxEdge: number,
): GpuTexture => {
  const { gl, maxTextureSize, maxAnisotropy } = ctx
  const srcW = bitmap.width
  const srcH = bitmap.height
  const cap = Math.min(targetMaxEdge, maxTextureSize)
  const scale = Math.min(1, cap / Math.max(srcW, srcH))
  const drawW = Math.max(1, Math.round(srcW * scale))
  const drawH = Math.max(1, Math.round(srcH * scale))
  const texW = nextPowerOfTwo(drawW)
  const texH = nextPowerOfTwo(drawH)

  const tmp = document.createElement('canvas')
  tmp.width = texW
  tmp.height = texH
  const tctx = tmp.getContext('2d', { willReadFrequently: false })
  if (!tctx) throw new Error('2D 临时画布创建失败')
  tctx.drawImage(bitmap, 0, 0, texW, texH)

  const texture = gl.createTexture()
  if (!texture) throw new Error('纹理对象创建失败')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, tmp)
  gl.generateMipmap(gl.TEXTURE_2D)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const ext = gl.getExtension('EXT_texture_filter_anisotropic')
  if (ext) {
    gl.texParameterf(
      gl.TEXTURE_2D,
      ext.TEXTURE_MAX_ANISOTROPY_EXT,
      Math.min(8, maxAnisotropy),
    )
  }

  return {
    texture,
    width: texW,
    height: texH,
    widthMm,
    heightMm,
    byteSize: texW * texH * 4 * 1.33,
  }
}

// 直接从浮点像素数据创建纹理（程序生成纹理用）
// 非 2 的幂尺寸会先重采样到 POT，保证 mipmap 完备性，否则部分驱动采样报错
export const uploadPixelsTexture = (
  ctx: GlContext,
  pixels: Uint8Array,
  width: number,
  height: number,
  widthMm: number,
  heightMm: number,
): GpuTexture => {
  const { gl, maxAnisotropy } = ctx
  let finalW = width
  let finalH = height
  let finalPixels = pixels
  if (!isPowerOfTwo(width) || !isPowerOfTwo(height)) {
    finalW = nextPowerOfTwo(width)
    finalH = nextPowerOfTwo(height)
    finalPixels = resampleNearest(pixels, width, height, finalW, finalH)
  }
  const texture = gl.createTexture()
  if (!texture) throw new Error('纹理对象创建失败')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    finalW,
    finalH,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    finalPixels,
  )
  gl.generateMipmap(gl.TEXTURE_2D)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const ext = gl.getExtension('EXT_texture_filter_anisotropic')
  if (ext) {
    gl.texParameterf(
      gl.TEXTURE_2D,
      ext.TEXTURE_MAX_ANISOTROPY_EXT,
      Math.min(8, maxAnisotropy),
    )
  }
  return {
    texture,
    width: finalW,
    height: finalH,
    widthMm,
    heightMm,
    byteSize: finalW * finalH * 4 * 1.33,
  }
}

// 最近邻重采样到目标尺寸（RGBA 像素）
const resampleNearest = (
  src: Uint8Array,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Uint8Array => {
  const out = new Uint8Array(dw * dh * 4)
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor((y * sh) / dh))
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x * sw) / dw))
      const si = (sy * sw + sx) * 4
      const di = (y * dw + x) * 4
      out[di] = src[si]
      out[di + 1] = src[si + 1]
      out[di + 2] = src[si + 2]
      out[di + 3] = src[si + 3]
    }
  }
  return out
}
