// 对纹检测的 GPU 采样器：把大板纹理按给定世界坐标点离屏渲染并读回亮度
import type { GlContext } from './gl_context'
import { createFullscreenVao, createProgram } from './gl_context'
import type { GpuTexture } from './texture_pool'
import type { Vec2 } from '@/core/geometry'

const VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

// 每个目标像素对应一个采样点（纹理坐标由 uniform 数组逐像素传入）
const FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_points[256];
uniform int u_count;
uniform vec2 u_slabSize;
out vec4 o_color;
void main() {
  int idx = int(floor(v_uv.x * float(u_count)));
  idx = clamp(idx, 0, u_count - 1);
  vec2 mm = u_points[idx];
  vec2 uv = mm / u_slabSize;
  o_color = texture(u_tex, uv);
}`

const MAX_POINTS = 256

export class SeamSampler {
  private ctx: GlContext
  private program: ReturnType<typeof createProgram>
  private vao: WebGLVertexArrayObject
  private fb: WebGLFramebuffer
  private tex: WebGLTexture
  private width = MAX_POINTS
  private height = 8

  constructor(ctx: GlContext) {
    this.ctx = ctx
    this.program = createProgram(
      ctx.gl,
      VS,
      FS,
      ['u_tex', 'u_points', 'u_count', 'u_slabSize'],
      ['a_pos'],
    )
    this.vao = createFullscreenVao(ctx.gl)
    this.fb = ctx.gl.createFramebuffer()!
    this.tex = ctx.gl.createTexture()!
    const gl = ctx.gl
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA8, this.width, this.height, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, null,
    )
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  // 采样一组世界坐标点，返回亮度序列（多行平均压噪）
  sample(texture: GpuTexture, points: Vec2[]): number[] {
    const gl = this.ctx.gl
    const count = Math.min(points.length, MAX_POINTS)
    const packed = new Float32Array(MAX_POINTS * 2)
    for (let i = 0; i < count; i++) {
      packed[i * 2] = points[i].x
      packed[i * 2 + 1] = points[i].y
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb)
    gl.viewport(0, 0, this.width, this.height)
    gl.useProgram(this.program.program)
    gl.bindVertexArray(this.vao)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture.texture)
    gl.uniform1i(this.program.uniforms.u_tex, 0)
    gl.uniform2fv(this.program.uniforms.u_points, packed)
    gl.uniform1i(this.program.uniforms.u_count, count)
    gl.uniform2f(
      this.program.uniforms.u_slabSize,
      texture.widthMm,
      texture.heightMm,
    )
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    const pixels = new Uint8Array(this.width * this.height * 4)
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    const out: number[] = []
    for (let x = 0; x < count; x++) {
      let sum = 0
      for (let y = 0; y < this.height; y++) {
        const idx = (y * this.width + x) * 4
        sum += pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114
      }
      out.push(sum / this.height / 255)
    }
    return out
  }

  dispose(): void {
    const gl = this.ctx.gl
    gl.deleteFramebuffer(this.fb)
    gl.deleteTexture(this.tex)
    gl.deleteVertexArray(this.vao)
    gl.deleteProgram(this.program.program)
  }
}
