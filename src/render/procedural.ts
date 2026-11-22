// 程序化石材纹理：GLSL FBM 噪声，离屏渲染到纹理
import type { GlContext } from './gl_context'
import { createFullscreenVao, createProgram } from './gl_context'
import { uploadPixelsTexture, type GpuTexture } from './texture_pool'
import type { ProceduralTextureSpec } from '@/core/types'

const VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o_color;

uniform int u_kind;
uniform float u_seed;
uniform float u_scale;
uniform float u_turbulence;
uniform vec3 u_baseColor;
uniform vec3 u_veinColor;

// 哈希与值噪声
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 6; i++) {
    v += amp * vnoise(p);
    p = rot * p * 2.02;
    amp *= 0.5;
  }
  return v;
}

// 域扭曲的流线，模拟大理石矿脉走向
float marbleField(vec2 p) {
  vec2 q = vec2(fbm(p + u_seed), fbm(p + vec2(5.2, 1.3) - u_seed));
  vec2 r = vec2(
    fbm(p + u_turbulence * q + vec2(1.7, 9.2)),
    fbm(p + u_turbulence * q + vec2(8.3, 2.8))
  );
  return fbm(p + u_turbulence * r);
}

void main() {
  vec2 p = v_uv * u_scale;
  vec3 col;
  if (u_kind == 0) {
    // 流动大理石：正弦条纹 + 域扭曲
    float f = marbleField(p * 2.0);
    float vein = sin((p.x * 0.8 + f * 2.2) * 3.14159);
    float line = smoothstep(0.82, 1.0, 1.0 - abs(vein));
    float soft = smoothstep(0.4, 1.0, 1.0 - abs(vein)) * 0.35;
    col = u_baseColor + (u_veinColor - u_baseColor) * clamp(line + soft, 0.0, 1.0);
  } else if (u_kind == 1) {
    // 粗脉大理石：少量宽矿脉
    float f = marbleField(p * 1.4);
    float vein = smoothstep(0.55, 0.78, f);
    float crack = smoothstep(0.86, 0.95, f) * 1.4;
    col = u_baseColor + (u_veinColor - u_baseColor) * clamp(vein * 0.8 + crack, 0.0, 1.0);
  } else {
    // 石英岩：细密颗粒 + 闪光晶点
    float grain = fbm(p * 6.0);
    float sparkle = step(0.985, hash21(floor(v_uv * 1400.0))) * 0.5;
    float band = smoothstep(0.45, 0.7, fbm(p * 1.2));
    col = u_baseColor + (u_veinColor - u_baseColor) * band * 0.6;
    col += vec3(grain * 0.12 + sparkle);
  }
  // 轻微压暗四角，增加板面质感
  float vig = 1.0 - 0.08 * length(v_uv - 0.5);
  o_color = vec4(col * vig, 1.0);
}`

const KIND_MAP: Record<ProceduralTextureSpec['kind'], number> = {
  'marble-flow': 0,
  'marble-vein': 1,
  quartzite: 2,
}

const hexToRgb01 = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// 生成指定像素尺寸的程序纹理
export const generateProceduralTexture = (
  ctx: GlContext,
  spec: ProceduralTextureSpec,
  width: number,
  height: number,
  widthMm: number,
  heightMm: number,
): GpuTexture => {
  const { gl } = ctx
  const program = createProgram(
    gl,
    VS,
    FS,
    ['u_kind', 'u_seed', 'u_scale', 'u_turbulence', 'u_baseColor', 'u_veinColor'],
    ['a_pos'],
  )
  const vao = createFullscreenVao(gl)

  // 用 FBO 离屏渲染，再 readPixels 走标准上传通道（自动生成 mipmap）
  const fb = gl.createFramebuffer()
  const colorTex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, colorTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0)
  gl.viewport(0, 0, width, height)

  gl.useProgram(program.program)
  gl.bindVertexArray(vao)
  gl.uniform1i(program.uniforms.u_kind, KIND_MAP[spec.kind])
  gl.uniform1f(program.uniforms.u_seed, (spec.seed % 997) / 997)
  gl.uniform1f(program.uniforms.u_scale, spec.scale)
  gl.uniform1f(program.uniforms.u_turbulence, spec.turbulence)
  gl.uniform3fv(program.uniforms.u_baseColor, hexToRgb01(spec.baseColor))
  gl.uniform3fv(program.uniforms.u_veinColor, hexToRgb01(spec.veinColor))
  gl.drawArrays(gl.TRIANGLES, 0, 3)

  const pixels = new Uint8Array(width * height * 4)
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
  // 必须先解绑 FBO 纹理再删除，否则 binding point 残留已删除对象，污染后续所有 bindTexture
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.bindTexture(gl.TEXTURE_2D, null)
  gl.deleteFramebuffer(fb)
  gl.deleteTexture(colorTex)
  gl.deleteProgram(program.program)
  gl.deleteVertexArray(vao)

  // readPixels 原点在左下，上传时翻转 Y
  const flipped = new Uint8Array(pixels.length)
  const rowBytes = width * 4
  for (let y = 0; y < height; y++) {
    flipped.set(pixels.subarray(y * rowBytes, (y + 1) * rowBytes), (height - 1 - y) * rowBytes)
  }
  return uploadPixelsTexture(ctx, flipped, width, height, widthMm, heightMm)
}
