// WebGL2 上下文与通用工具封装

export interface GlContext {
  gl: WebGL2RenderingContext
  canvas: HTMLCanvasElement
  maxTextureSize: number
  max3dTextureSize: number
  maxArrayLayers: number
  maxAnisotropy: number
  msaaSamples: number
}

export const createGlContext = (
  canvas: HTMLCanvasElement,
  msaaSamples = 4,
): GlContext => {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    alpha: true,
    depth: true,
  })
  if (!gl) throw new Error('当前浏览器不支持 WebGL2，请使用最新版 Chrome/Edge')

  const extAniso = gl.getExtension('EXT_texture_filter_anisotropic')
  const maxAnisotropy = extAniso
    ? (gl.getParameter(extAniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number)
    : 1

  const supportedSamples = gl.getParameter(gl.SAMPLES) as number
  const samples = Math.min(msaaSamples, Math.max(1, supportedSamples))

  return {
    gl,
    canvas,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    max3dTextureSize: gl.getParameter(gl.MAX_3D_TEXTURE_SIZE) as number,
    maxArrayLayers: gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) as number,
    maxAnisotropy,
    msaaSamples: samples,
  }
}

export const compileShader = (
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader => {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('着色器对象创建失败')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`着色器编译失败: ${log}`)
  }
  return shader
}

export interface Program {
  program: WebGLProgram
  uniforms: Record<string, WebGLUniformLocation | null>
  attribs: Record<string, number>
}

export const createProgram = (
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string,
  uniformNames: string[],
  attribNames: string[],
): Program => {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource)
  const program = gl.createProgram()
  if (!program) throw new Error('程序对象创建失败')
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`着色器链接失败: ${log}`)
  }
  const uniforms: Record<string, WebGLUniformLocation | null> = {}
  for (const name of uniformNames) uniforms[name] = gl.getUniformLocation(program, name)
  const attribs: Record<string, number> = {}
  for (const name of attribNames) attribs[name] = gl.getAttribLocation(program, name)
  return { program, uniforms, attribs }
}

// 全屏三角形（覆盖裁剪空间），配合动态纹理坐标
export const FULLSCREEN_VS = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

export const createFullscreenVao = (gl: WebGL2RenderingContext): WebGLVertexArrayObject => {
  const vao = gl.createVertexArray()
  if (!vao) throw new Error('VAO 创建失败')
  const vbo = gl.createBuffer()
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  )
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)
  return vao
}

// 普通四边形 VAO，属性位置 0 = vec2 顶点
export const createQuadVao = (gl: WebGL2RenderingContext): WebGLVertexArrayObject => {
  const vao = gl.createVertexArray()
  if (!vao) throw new Error('VAO 创建失败')
  const vbo = gl.createBuffer()
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  )
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)
  return vao
}

// 根据可用显存约束选择工作纹理尺寸（2 的幂，且不超过 GL 上限）
export const chooseWorkingSize = (
  nativeWidth: number,
  nativeHeight: number,
  maxEdge: number,
  glLimit: number,
): { width: number; height: number } => {
  const cap = Math.min(maxEdge, glLimit)
  const longest = Math.max(nativeWidth, nativeHeight)
  if (longest <= cap) return { width: nativeWidth, height: nativeHeight }
  const ratio = cap / longest
  const w = Math.max(1, Math.round(nativeWidth * ratio))
  const h = Math.max(1, Math.round(nativeHeight * ratio))
  return { width: w, height: h }
}

export const isPowerOfTwo = (v: number): boolean => (v & (v - 1)) === 0

// 缩放到 2 的幂尺寸，mipmap 完备性需要
export const nextPowerOfTwo = (v: number): number => {
  let p = 1
  while (p < v) p *= 2
  return p
}
