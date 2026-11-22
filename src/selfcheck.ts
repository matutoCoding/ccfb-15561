// WebGL 运行时自检：在 SwiftShader/真实 GPU 上编译所有着色器并跑核心流程
import { createGlContext, createProgram, createQuadVao } from './render/gl_context'
import { generateProceduralTexture } from './render/procedural'
import { LayoutRenderer } from './render/layout_renderer'
import { SceneRenderer } from './render/scene_renderer'
import { SeamSampler } from './render/seam_sampler'
import { autoLayout } from './core/auto_layout'
import { validateLayout, calcUtilization } from './core/constraints'
import {
  applyBookMatch,
  evaluateSeam,
  nccMatch,
  findSharedSeam,
} from './core/matching'
import { buildDxf } from './core/export_dxf'
import { buildBomRows } from './core/export_bom'
import { correctPhoto, computeHomography } from './core/photo_correction'
import { verifySeamPrecision } from './core/precision_test'
import type { ProceduralTextureSpec, Slab, Project, ProjectFace, PlacedPiece } from './core/types'
import { uid } from './core/util'

type CheckFn = (name: string, fn: () => void) => void
type LogFn = (msg: string) => void

const spec: ProceduralTextureSpec = {
  kind: 'marble-flow',
  seed: 11,
  baseColor: '#e8e4dc',
  veinColor: '#6b6f76',
  scale: 3,
  turbulence: 1.2,
}

const makeSlab = (seq: number): Slab => ({
  id: uid('slab'),
  code: `T-${seq}`,
  category: 'marble',
  source: 'procedural',
  widthMm: 3200,
  heightMm: 1600,
  thicknessMm: 18,
  batchNo: 'B001',
  seqInBatch: seq,
  procedural: { ...spec, seed: seq * 3 },
  defects: [],
  edgeMarginMm: 20,
  createdAt: Date.now(),
  note: '',
})

const makeFace = (name: string, w: number, h: number): ProjectFace => ({
  id: uid('face'),
  name,
  kind: 'countertop',
  widthMm: w,
  heightMm: h,
  thicknessMm: 18,
  holes: [],
  bevel: { top: 0, right: 0, bottom: 0, left: 0 },
  dropEdgeMm: 40,
  finish: 'polished',
  note: '',
})

const assertNoGlError = (gl: WebGL2RenderingContext, label: string) => {
  const err = gl.getError()
  if (err !== gl.NO_ERROR) throw new Error(`${label} 产生 GL 错误码 ${err}`)
}

export const runSelfCheck = (rawGl: WebGL2RenderingContext, check: CheckFn, log: LogFn) => {
  const canvas = rawGl.canvas as HTMLCanvasElement
  const ctx = createGlContext(canvas, 1)
  const gl = ctx.gl
  log(`GL 上限: tex=${ctx.maxTextureSize} layers=${ctx.maxArrayLayers}`)

  let slabA: Slab
  let slabB: Slab
  let texA: ReturnType<typeof generateProceduralTexture>
  let project: Project

  check('程序纹理生成（三类石材着色器编译）', () => {
    for (const kind of ['marble-flow', 'marble-vein', 'quartzite'] as const) {
      const t = generateProceduralTexture(
        ctx,
        { ...spec, kind },
        256,
        128,
        3200,
        1600,
      )
      assertNoGlError(gl, `procedural ${kind}`)
      gl.deleteTexture(t.texture)
    }
  })

  check('基础着色器与 VAO', () => {
    const prog = createProgram(
      gl,
      `#version 300 es
       in vec2 a_pos; void main(){ gl_Position = vec4(a_pos,0.0,1.0); }`,
      `#version 300 es
       precision highp float; out vec4 o; void main(){ o = vec4(1.0); }`,
      [],
      ['a_pos'],
    )
    const vao = createQuadVao(gl)
    gl.useProgram(prog.program)
    gl.bindVertexArray(vao)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    assertNoGlError(gl, 'basic program')
    gl.deleteProgram(prog.program)
    gl.deleteVertexArray(vao)
  })

  check('自动排样 + 约束 + 利用率', () => {
    slabA = makeSlab(1)
    slabB = makeSlab(2)
    project = {
      id: uid('proj'),
      name: '自检项目',
      client: '',
      room: 'kitchen',
      faces: [
        makeFace('台面', 2400, 600),
        makeFace('岛台', 1800, 900),
        makeFace('背景墙', 2600, 800),
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      note: '',
    }
    const result = autoLayout({
      faces: project.faces,
      slabs: [slabA, slabB],
      allowedAngles: [0, 90],
    })
    if (result.pieces.length !== 3) throw new Error('应排下 3 件，实际 ' + result.pieces.length)
    if (result.unplacedFaceIds.length !== 0) throw new Error('不应有未排面')
    const violations = validateLayout(result.pieces, [slabA, slabB])
    if (violations.length !== 0) throw new Error('无缺陷板不应有违规: ' + violations.map((v) => v.message).join(';'))
    const util = calcUtilization(result.pieces, [slabA, slabB])
    if (!(util.utilization > 0 && util.utilization < 1)) throw new Error('利用率越界 ' + util.utilization)
    log(`排样 ${result.pieces.length} 件，用板 ${result.slabIdsUsed.length} 张，利用率 ${(util.utilization * 100).toFixed(1)}%`)
  })

  check('排版编辑渲染器（含三种表面处理）', () => {
    texA = generateProceduralTexture(ctx, { ...spec, seed: 5 }, 512, 256, slabA.widthMm, slabA.heightMm)
    const renderer = new LayoutRenderer(ctx)
    const cam = { scale: { x: 0.00055, y: 0.00055 }, offset: { x: -0.9, y: -0.45 } }
    const pieces: PlacedPiece[] = [
      {
        id: uid('piece'),
        faceId: project.faces[0].id,
        slabId: slabA.id,
        placement: { cx: 1200, cy: 800, w: 2400, h: 600, angle: 0 },
        mirrorU: false,
        seq: 1,
      },
    ]
    for (const finish of ['polished', 'honed', 'leathered'] as const) {
      renderer.render(
        cam,
        { widthMm: slabA.widthMm, heightMm: slabA.heightMm, edgeMarginMm: 20, defects: [] },
        [{ piece: pieces[0], texture: texA, finish, selected: false, violated: false }],
      )
      assertNoGlError(gl, `layout render ${finish}`)
    }
    // 镜像件也要能画
    pieces[0].mirrorU = true
    renderer.render(
      cam,
      { widthMm: slabA.widthMm, heightMm: slabA.heightMm, edgeMarginMm: 20, defects: [] },
      [{ piece: pieces[0], texture: texA, finish: 'polished', selected: true, violated: false }],
    )
    assertNoGlError(gl, 'layout render mirrored')
  })

  check('对纹缝查找 + NCC + GPU 采样全流程', () => {
    const sampler = new SeamSampler(ctx)
    // 两块并排共享一条竖缝
    const pa: PlacedPiece = {
      id: uid('piece'),
      faceId: project.faces[0].id,
      slabId: slabA.id,
      placement: { cx: 800, cy: 800, w: 1600, h: 600, angle: 0 },
      mirrorU: false,
      seq: 1,
    }
    const pb: PlacedPiece = {
      id: uid('piece'),
      faceId: project.faces[1].id,
      slabId: slabA.id,
      placement: { cx: 2400, cy: 800, w: 1600, h: 600, angle: 0 },
      mirrorU: false,
      seq: 2,
    }
    const seam = findSharedSeam(pa, pb)
    if (!seam) throw new Error('应找到共享缝')
    const brightness = sampler.sample(texA, [seam.a, seam.b, { x: 100, y: 100 }])
    if (brightness.length !== 3) throw new Error('采样点数不对')
    const worldSampler = (w: { x: number; y: number }) => sampler.sample(texA, [w])[0]
    const result = evaluateSeam(pa, pb, 'sequence', worldSampler, {
      stripWidthMm: 30,
      sampleCount: 64,
      pxPerMm: texA.width / slabA.widthMm,
      tolerancePx: 1,
    })
    if (!result) throw new Error('evaluateSeam 返回空')
    log(`缝检测: 错位 ${result.mismatchPx.toFixed(2)}px 置信度 ${result.confidence.toFixed(2)}`)
    // NCC 自匹配应为 0 平移且高相关
    const self = nccMatch([0.1, 0.4, 0.9, 0.2, 0.6], [0.1, 0.4, 0.9, 0.2, 0.6])
    if (self.shift !== 0 || self.score < 0.99) throw new Error('NCC 自匹配失败')
    sampler.dispose()
  })

  check('书本对纹镜像变换', () => {
    const pieces = [
      { mirrorU: false },
      { mirrorU: false },
      { mirrorU: false },
    ] as PlacedPiece[]
    const book = applyBookMatch(pieces)
    if (book[0].mirrorU !== false || book[1].mirrorU !== true || book[2].mirrorU !== false) {
      throw new Error('书本对纹奇偶镜像不对')
    }
  })

  check('对纹 1 像素精度（同板切开拼回）', () => {
    // 3200mm 大板，4096 工作纹理，缝两侧物理 UV 必须严格重合
    const result = verifySeamPrecision(3200, 1600, 4096)
    log(`缝两侧最大 UV 偏差 ${result.maxUvDelta.toExponential(3)}，折合 ${result.mismatchAt4k.toExponential(3)} 纹理像素，镜像偏差 ${result.mirrorDeltaMm.toExponential(3)}mm，passed=${result.passed}`)
    if (!result.passed) {
      throw new Error(`对纹精度不达标：${result.mismatchAt4k} px，要求 < 1px`)
    }
  })

  check('3D 台面网格（顶+侧+下垂边）与渲染', () => {
    const scene = new SceneRenderer(ctx)
    const piece: PlacedPiece = {
      id: uid('piece'),
      faceId: project.faces[0].id,
      slabId: slabA.id,
      placement: { cx: 0, cy: 0, w: 2400, h: 600, angle: 0 },
      mirrorU: false,
      seq: 1,
    }
    scene.buildCountertopMesh(piece, texA, 40)
    scene.setCamera([2600, -2200, 2400], [0, 0, 0])
    scene.setFinish('leathered')
    scene.render()
    assertNoGlError(gl, 'scene render')
    scene.dispose()
  })

  check('DXF / BOM 导出内容', () => {
    const result = autoLayout({ faces: project.faces, slabs: [slabA, slabB], allowedAngles: [0, 90] })
    const dxf = buildDxf({ slabs: [slabA, slabB], pieces: result.pieces, faces: project.faces })
    if (!dxf.includes('ENTITIES') || !dxf.includes('EOF')) throw new Error('DXF 结构不完整')
    if (!dxf.includes(slabA.code)) throw new Error('DXF 缺大板编号')
    const plan = {
      id: uid('plan'),
      projectId: project.id,
      name: '自检方案',
      pieces: result.pieces,
      seams: [],
      slabIds: result.slabIdsUsed,
      utilization: 0.5,
      createdAt: Date.now(),
      violations: [],
    }
    const rows = buildBomRows(plan, project.faces, [slabA, slabB])
    if (rows.length !== 3) throw new Error('BOM 行数不对')
  })

  check('透视单应矩阵与照片校正', () => {
    const h = computeHomography({
      tl: { x: 0.05, y: 0.08 },
      tr: { x: 0.95, y: 0.02 },
      br: { x: 0.92, y: 0.96 },
      bl: { x: 0.03, y: 0.92 },
    })
    if (h.length !== 9) throw new Error('单应矩阵应为 9 元素')
    const src = document.createElement('canvas')
    src.width = 64
    src.height = 32
    const sctx = src.getContext('2d')!
    sctx.fillStyle = '#888'
    sctx.fillRect(0, 0, 64, 32)
    const out = correctPhoto(src, {
      outWidth: 64,
      outHeight: 32,
      quad: {
        tl: { x: 0, y: 0 },
        tr: { x: 1, y: 0 },
        br: { x: 1, y: 1 },
        bl: { x: 0, y: 1 },
      },
      correction: { gain: { x: 1, y: 1 }, exposure: 1, temperature: 0 },
    })
    if (out.width !== 64 || out.height !== 32) throw new Error('校正输出尺寸不对')
  })

  check('缺陷区与留量违规能被检出', () => {
    slabA.defects = [
      {
        id: uid('defect'),
        name: '中心裂纹',
        severity: 'crack',
        polygon: {
          points: [
            { x: 1500, y: 700 },
            { x: 1700, y: 700 },
            { x: 1700, y: 900 },
            { x: 1500, y: 900 },
          ],
        },
      },
    ]
    const bad: PlacedPiece = {
      id: uid('piece'),
      faceId: project.faces[0].id,
      slabId: slabA.id,
      placement: { cx: 1600, cy: 800, w: 1000, h: 500, angle: 0 },
      mirrorU: false,
      seq: 9,
    }
    const violations = validateLayout([bad], [slabA])
    if (!violations.some((v) => v.kind === 'defect-overlap')) throw new Error('应检出缺陷重叠')
    const edge: PlacedPiece = {
      ...bad,
      id: uid('piece'),
      placement: { cx: 30, cy: 30, w: 100, h: 100, angle: 0 },
    }
    const edgeViolations = validateLayout([edge], [slabA])
    if (!edgeViolations.some((v) => v.kind === 'out-of-slab')) throw new Error('应检出留量越界')
  })
}
