// 3D 场景预览渲染器
// 关键点：台面顶/侧/下垂边共用同一套毫米->UV 映射，侧边纹理由正面物理坐标延续，
// 不存在独立贴图拉伸；三种表面处理走不同 BRDF 参数
import type { GlContext } from './gl_context'
import { createProgram } from './gl_context'
import type { GpuTexture } from './texture_pool'
import type { PlacedPiece, SurfaceFinish } from '@/core/types'

const VS = `#version 300 es
layout(location = 0) in vec3 a_pos;       // 场景世界坐标，毫米
layout(location = 1) in vec2 a_slabMm;    // 该顶点对应的大板毫米坐标（侧边同样延续此坐标）
layout(location = 2) in vec3 a_normal;
uniform mat4 u_viewProj;
out vec2 v_slabMm;
out vec3 v_normal;
out vec3 v_worldPos;
void main() {
  v_slabMm = a_slabMm;
  v_normal = a_normal;
  v_worldPos = a_pos;
  gl_Position = u_viewProj * vec4(a_pos, 1.0);
}`

const FS = `#version 300 es
precision highp float;
in vec2 v_slabMm;
in vec3 v_normal;
in vec3 v_worldPos;
uniform sampler2D u_tex;
uniform vec2 u_slabSize;
uniform int u_finish;
uniform vec3 u_camPos;
uniform vec3 u_lightDir;
out vec4 o_color;

// 简化 Cook-Torrance 风格：粗糙度按表面处理分级
float distribution(float ndh, float rough) {
  float a = rough * rough;
  float a2 = a * a;
  float d = ndh * ndh * (a2 - 1.0) + 1.0;
  return a2 / max(0.0001, 3.14159 * d * d);
}

void main() {
  vec2 uv = v_slabMm / u_slabSize;
  vec3 albedo = texture(u_tex, uv).rgb;
  vec3 n = normalize(v_normal);
  vec3 l = normalize(u_lightDir);
  vec3 v = normalize(u_camPos - v_worldPos);
  vec3 h = normalize(l + v);
  float ndl = max(dot(n, l), 0.0);
  float ndh = max(dot(n, h), 0.0);
  float ndv = max(dot(n, v), 0.0);

  float rough;
  float specStrength;
  if (u_finish == 0) {        // 亮光面：低粗糙，强镜面
    rough = 0.12;
    specStrength = 0.9;
  } else if (u_finish == 1) { // 哑光面：高粗糙，弱镜面
    rough = 0.55;
    specStrength = 0.35;
  } else {                    // 荔枝面：微凹凸，漫反射为主
    rough = 0.75;
    specStrength = 0.18;
    float bump = fract(sin(dot(v_slabMm * 1.2, vec2(12.9898, 78.233))) * 43758.5453);
    n = normalize(n + vec3(bump - 0.5) * 0.12);
  }

  float d = distribution(ndh, rough);
  vec3 fresnel = mix(vec3(0.04), albedo, pow(1.0 - ndv, 5.0));
  vec3 spec = fresnel * d * specStrength;
  vec3 diffuse = albedo * (1.0 - specStrength * 0.5) * ndl;
  vec3 ambient = albedo * 0.32;
  vec3 col = ambient + diffuse + spec;
  o_color = vec4(col, 1.0);
}`

export interface SceneMesh {
  vao: WebGLVertexArrayObject
  vertexCount: number
  texture: GpuTexture
  slabSize: { w: number; h: number }
  finish: SurfaceFinish
}

// 正交/透视视图投影矩阵（列主序）
const perspective = (fovy: number, aspect: number, near: number, far: number): number[] => {
  const f = 1 / Math.tan(fovy / 2)
  const nf = 1 / (near - far)
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]
}

const lookAt = (eye: number[], target: number[], up: number[]): number[] => {
  const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  const cross = (a: number[], b: number[]) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
  const norm = (a: number[]) => {
    const l = Math.hypot(a[0], a[1], a[2])
    return [a[0] / l, a[1] / l, a[2] / l]
  }
  const z = norm(sub(eye, target))
  const x = norm(cross(up, z))
  const y = cross(z, x)
  return [
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -x[0] * eye[0] - x[1] * eye[1] - x[2] * eye[2],
    -y[0] * eye[0] - y[1] * eye[1] - y[2] * eye[2],
    -z[0] * eye[0] - z[1] * eye[1] - z[2] * eye[2],
    1,
  ]
}

const mul4 = (a: number[], b: number[]): number[] => {
  const out = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3]
    }
  }
  return out
}

export class SceneRenderer {
  private ctx: GlContext
  private program: ReturnType<typeof createProgram>
  private meshes: SceneMesh[] = []
  private camera = {
    eye: [2600, 2200, 2600],
    target: [0, 0, 0],
  }

  constructor(ctx: GlContext) {
    this.ctx = ctx
    this.program = createProgram(
      ctx.gl,
      VS,
      FS,
      ['u_viewProj', 'u_tex', 'u_slabSize', 'u_finish', 'u_camPos', 'u_lightDir'],
      ['a_pos', 'a_slabMm', 'a_normal'],
    )
  }

  setCamera(eye: number[], target: number[]): void {
    this.camera = { eye, target }
  }

  // 由排版件生成台面网格：顶面 + 四个侧面 + 可选下垂边，纹理坐标全部延续大板物理坐标
  buildCountertopMesh(piece: PlacedPiece, texture: GpuTexture, dropEdgeMm: number): void {
    const gl = this.ctx.gl
    const r = piece.placement
    const hw = r.w / 2
    const hh = r.h / 2
    const thick = 40
    const drop = dropEdgeMm
    const c = Math.cos(r.angle)
    const s = Math.sin(r.angle)

    // 局部毫米 -> 大板毫米（与 2D 编辑器同一映射，保证纹路接上）
    const toSlab = (lx: number, ly: number): [number, number] => {
      const x = piece.mirrorU ? -lx : lx
      return [r.cx + x * c - ly * s, r.cy + x * s + ly * c]
    }

    // 顶点：pos(3) + slabMm(2) + normal(3)
    const verts: number[] = []
    const tri = (i: number, j: number, k: number, base: number[]) => {
      for (const idx of [i, j, k]) verts.push(...base.slice(idx * 8, idx * 8 + 8))
    }

    // 顶面（4 顶点），z=0
    const top: number[] = []
    const corners: Array<[number, number]> = [
      [-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh],
    ]
    for (const [lx, ly] of corners) {
      const [sx, sy] = toSlab(lx, ly)
      top.push(lx, ly, 0, sx, sy, 0, 0, 1)
    }
    tri(0, 1, 2, top)
    tri(0, 2, 3, top)

    // 四个侧面，每个面 4 顶点；下垂边沿前沿向下延伸 drop
    const sides: Array<{ idx: [number, number]; n: [number, number]; dropHere: number }> = [
      { idx: [0, 1], n: [0, -1], dropHere: drop },
      { idx: [1, 2], n: [1, 0], dropHere: 0 },
      { idx: [2, 3], n: [0, 1], dropHere: 0 },
      { idx: [3, 0], n: [-1, 0], dropHere: 0 },
    ]
    for (const side of sides) {
      const [i0, i1] = side.idx
      const [nx, ny] = side.n
      const a = corners[i0]
      const b = corners[i1]
      const depth = thick + side.dropHere
      const face: number[] = []
      const pushFace = (
        px: number, py: number, pz: number,
        lx: number, ly: number,
      ) => {
        const [sx, sy] = toSlab(lx, ly)
        face.push(px, py, pz, sx, sy, nx, ny, 0)
      }
      // 上沿两点（与顶面共享物理纹理坐标）
      pushFace(a[0], a[1], 0, a[0], a[1])
      pushFace(b[0], b[1], 0, b[0], b[1])
      // 下沿两点：纹理坐标沿法线方向平移物理距离，纹路从正面连续走到侧边
      pushFace(b[0], b[1], -depth, b[0] + nx * depth, b[1] + ny * depth)
      pushFace(a[0], a[1], -depth, a[0] + nx * depth, a[1] + ny * depth)
      tri(0, 1, 2, face)
      tri(0, 2, 3, face)
      verts.push(...face)
    }

    const vao = gl.createVertexArray()
    const vbo = gl.createBuffer()
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW)
    const stride = 8 * 4
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 3 * 4)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 5 * 4)
    gl.bindVertexArray(null)

    this.meshes.push({
      vao: vao!,
      vertexCount: verts.length / 8,
      texture,
      slabSize: { w: texture.widthMm, h: texture.heightMm },
      finish: 'polished',
    })
  }

  setFinish(finish: SurfaceFinish): void {
    for (const m of this.meshes) m.finish = finish
  }

  clearMeshes(): void {
    const gl = this.ctx.gl
    for (const m of this.meshes) gl.deleteVertexArray(m.vao)
    this.meshes = []
  }

  render(): void {
    const gl = this.ctx.gl
    gl.viewport(0, 0, this.ctx.canvas.width, this.ctx.canvas.height)
    gl.clearColor(0.96, 0.96, 0.95, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)

    const aspect = this.ctx.canvas.width / this.ctx.canvas.height
    const proj = perspective(Math.PI / 5, aspect, 10, 20000)
    const view = lookAt(this.camera.eye, this.camera.target, [0, 0, 1])
    const vp = mul4(proj, view)

    gl.useProgram(this.program.program)
    gl.uniformMatrix4fv(this.program.uniforms.u_viewProj, false, new Float32Array(vp))
    gl.uniform3fv(this.program.uniforms.u_camPos, this.camera.eye)
    gl.uniform3fv(this.program.uniforms.u_lightDir, [0.4, 0.6, 0.8])
    const finishId: Record<SurfaceFinish, number> = {
      polished: 0,
      honed: 1,
      leathered: 2,
    }
    for (const mesh of this.meshes) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, mesh.texture.texture)
      gl.uniform1i(this.program.uniforms.u_tex, 0)
      gl.uniform2f(
        this.program.uniforms.u_slabSize,
        mesh.slabSize.w,
        mesh.slabSize.h,
      )
      gl.uniform1i(this.program.uniforms.u_finish, finishId[mesh.finish])
      gl.bindVertexArray(mesh.vao)
      gl.drawArrays(gl.TRIANGLES, 0, mesh.vertexCount)
    }
    gl.bindVertexArray(null)
    gl.disable(gl.DEPTH_TEST)
  }

  dispose(): void {
    this.clearMeshes()
  }
}
