// 排版编辑视图渲染器（2D 俯视）
// 相机：毫米世界坐标 -> 裁剪空间；件的旋转平移只改 uniform，拖动时零纹理重传
import type { GlContext } from './gl_context'
import { createProgram, createQuadVao } from './gl_context'
import type { GpuTexture } from './texture_pool'
import type { DefectZone, PlacedPiece, SurfaceFinish } from '@/core/types'
import { rectCorners } from '@/core/geometry'

const VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
uniform vec2 u_slabSize;
uniform vec2 u_camScale;
uniform vec2 u_camOffset;
uniform vec2 u_center;
uniform float u_angle;
uniform vec2 u_pieceSize;
uniform float u_mirrorU;
out vec2 v_slabMm;
void main() {
  // a_pos ∈ [-1,1]，先映射到件局部毫米坐标
  vec2 local = a_pos * u_pieceSize * 0.5;
  if (u_mirrorU > 0.5) local.x = -local.x;
  float c = cos(u_angle);
  float s = sin(u_angle);
  vec2 world = u_center + mat2(c, -s, s, c) * local;
  v_slabMm = world;
  vec2 clip = world * u_camScale + u_camOffset;
  gl_Position = vec4(clip, 0.0, 1.0);
}`

const FS = `#version 300 es
precision highp float;
in vec2 v_slabMm;
uniform sampler2D u_tex;
uniform vec2 u_slabSize;
uniform int u_finish;
uniform float u_selected;
uniform float u_violated;
out vec4 o_color;

// 三种表面处理的 BRDF 近似
vec3 applyFinish(vec3 albedo, int finish) {
  if (finish == 0) {
    // 亮光面：提对比、轻微饱和，模拟镜面反射基底
    float luma = dot(albedo, vec3(0.299, 0.587, 0.114));
    return mix(vec3(luma), albedo, 1.12) * 1.03;
  }
  if (finish == 1) {
    // 哑光面：压低对比与高光
    float luma = dot(albedo, vec3(0.299, 0.587, 0.114));
    return mix(albedo, vec3(luma), 0.18) * 0.96;
  }
  // 荔枝面：高频凹凸扰动亮度
  float n = fract(sin(dot(v_slabMm * 0.8, vec2(12.9898, 78.233))) * 43758.5453);
  return albedo * (0.9 + n * 0.16);
}

void main() {
  vec2 uv = v_slabMm / u_slabSize;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  vec3 albedo = texture(u_tex, uv).rgb;
  vec3 col = applyFinish(albedo, u_finish);
  if (u_violated > 0.5) col = mix(col, vec3(0.86, 0.15, 0.15), 0.35);
  if (u_selected > 0.5) col = mix(col, vec3(0.15, 0.39, 0.92), 0.18);
  o_color = vec4(col, 1.0);
}`

// 线框/缺陷区/留量框用纯色着色器
const LINE_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
uniform vec2 u_camScale;
uniform vec2 u_camOffset;
void main() {
  gl_Position = vec4(a_pos * u_camScale + u_camOffset, 0.0, 1.0);
}`

const LINE_FS = `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 o_color;
void main() { o_color = u_color; }`

export interface Camera {
  // 毫米 -> 裁剪空间的缩放与偏移
  scale: Vec2Like
  offset: Vec2Like
}

interface Vec2Like {
  x: number
  y: number
}

export interface PieceRenderItem {
  piece: PlacedPiece
  texture: GpuTexture
  finish: SurfaceFinish
  selected: boolean
  violated: boolean
}

export class LayoutRenderer {
  private ctx: GlContext
  private pieceProgram: ReturnType<typeof createProgram>
  private lineProgram: ReturnType<typeof createProgram>
  private quadVao: WebGLVertexArrayObject
  private lineVao: WebGLVertexArrayObject
  private lineBuffer: WebGLBuffer

  constructor(ctx: GlContext) {
    this.ctx = ctx
    this.pieceProgram = createProgram(
      ctx.gl,
      VS,
      FS,
      [
        'u_slabSize', 'u_camScale', 'u_camOffset', 'u_center',
        'u_angle', 'u_pieceSize', 'u_mirrorU', 'u_tex',
        'u_finish', 'u_selected', 'u_violated',
      ],
      ['a_pos'],
    )
    this.lineProgram = createProgram(
      ctx.gl,
      LINE_VS,
      LINE_FS,
      ['u_camScale', 'u_camOffset', 'u_color'],
      ['a_pos'],
    )
    this.quadVao = createQuadVao(ctx.gl)
    this.lineVao = ctx.gl.createVertexArray()!
    this.lineBuffer = ctx.gl.createBuffer()!
    ctx.gl.bindVertexArray(this.lineVao)
    ctx.gl.bindBuffer(ctx.gl.ARRAY_BUFFER, this.lineBuffer)
    ctx.gl.enableVertexAttribArray(0)
    ctx.gl.vertexAttribPointer(0, 2, ctx.gl.FLOAT, false, 0, 0)
    ctx.gl.bindVertexArray(null)
  }

  private bindCamera(cam: Camera): void {
    const gl = this.ctx.gl
    gl.uniform2f(this.pieceProgram.uniforms.u_camScale, cam.scale.x, cam.scale.y)
    gl.uniform2f(this.pieceProgram.uniforms.u_camOffset, cam.offset.x, cam.offset.y)
    gl.useProgram(this.lineProgram.program)
    gl.uniform2f(this.lineProgram.uniforms.u_camScale, cam.scale.x, cam.scale.y)
    gl.uniform2f(this.lineProgram.uniforms.u_camOffset, cam.offset.x, cam.offset.y)
    gl.useProgram(this.pieceProgram.program)
  }

  private drawLines(points: Vec2Like[], color: [number, number, number, number], mode: number): void {
    const gl = this.ctx.gl
    const data = new Float32Array(points.flatMap((p) => [p.x, p.y]))
    gl.bindVertexArray(this.lineVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
    gl.useProgram(this.lineProgram.program)
    gl.uniform4fv(this.lineProgram.uniforms.u_color, color)
    gl.drawArrays(mode, 0, points.length)
    gl.bindVertexArray(null)
  }

  render(
    cam: Camera,
    slab: { widthMm: number; heightMm: number; edgeMarginMm: number; defects: DefectZone[] },
    items: PieceRenderItem[],
  ): void {
    const gl = this.ctx.gl
    gl.viewport(0, 0, this.ctx.canvas.width, this.ctx.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    // 大板底色
    const bg = [
      { x: 0, y: 0 },
      { x: slab.widthMm, y: 0 },
      { x: slab.widthMm, y: slab.heightMm },
      { x: 0, y: slab.heightMm },
    ]
    this.drawLines(bg, [0.93, 0.94, 0.95, 1], gl.TRIANGLE_FAN)

    // 留量框（虚线感用细矩形线框表达）
    const m = slab.edgeMarginMm
    const margin = [
      { x: m, y: m },
      { x: slab.widthMm - m, y: m },
      { x: slab.widthMm - m, y: slab.heightMm - m },
      { x: m, y: slab.heightMm - m },
    ]
    this.drawLines([...margin, margin[0]], [0.7, 0.55, 0.1, 0.9], gl.LINE_STRIP)

    // 缺陷区
    for (const defect of slab.defects) {
      const pts = defect.polygon.points
      this.drawLines([...pts, pts[0]], [0.78, 0.18, 0.18, 0.85], gl.LINE_STRIP)
      this.drawLines(pts, [0.86, 0.3, 0.3, 0.18], gl.TRIANGLE_FAN)
    }

    // 切割件：每件一次 draw call，变换全在 uniform
    gl.useProgram(this.pieceProgram.program)
    this.bindCamera(cam)
    gl.uniform2f(
      this.pieceProgram.uniforms.u_slabSize,
      slab.widthMm,
      slab.heightMm,
    )
    const finishId: Record<SurfaceFinish, number> = {
      polished: 0,
      honed: 1,
      leathered: 2,
    }
    for (const item of items) {
      const p = item.piece
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, item.texture.texture)
      gl.uniform1i(this.pieceProgram.uniforms.u_tex, 0)
      gl.uniform2f(
        this.pieceProgram.uniforms.u_center,
        p.placement.cx,
        p.placement.cy,
      )
      gl.uniform1f(this.pieceProgram.uniforms.u_angle, p.placement.angle)
      gl.uniform2f(
        this.pieceProgram.uniforms.u_pieceSize,
        p.placement.w,
        p.placement.h,
      )
      gl.uniform1f(this.pieceProgram.uniforms.u_mirrorU, p.mirrorU ? 1 : 0)
      gl.uniform1i(this.pieceProgram.uniforms.u_finish, finishId[item.finish])
      gl.uniform1f(this.pieceProgram.uniforms.u_selected, item.selected ? 1 : 0)
      gl.uniform1f(this.pieceProgram.uniforms.u_violated, item.violated ? 1 : 0)
      gl.bindVertexArray(this.quadVao)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    // 件边框
    gl.bindVertexArray(this.lineVao)
    for (const item of items) {
      const corners = rectCorners(item.piece.placement)
      const color: [number, number, number, number] = item.selected
        ? [0.15, 0.39, 0.92, 1]
        : item.violated
          ? [0.78, 0.18, 0.18, 1]
          : [0.2, 0.24, 0.29, 0.7]
      this.drawLines([...corners, corners[0]], color, gl.LINE_STRIP)
    }
    gl.bindVertexArray(null)
    gl.disable(gl.BLEND)
  }
}
