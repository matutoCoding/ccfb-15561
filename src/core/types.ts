import type { Polygon, Rect, RotatedRect, Vec2 } from './geometry'

// ============ 大板库 ============

export type SurfaceFinish = 'polished' | 'honed' | 'leathered'
export type StoneCategory = 'marble' | 'quartzite' | 'granite' | 'sintered'

export interface DefectZone {
  id: string
  name: string
  // 多边形顶点，大板局部坐标，原点在大板左下角，单位 mm
  polygon: Polygon
  severity: 'crack' | 'chip' | 'stain' | 'vein-gap'
}

// 照片透视校正用的四个角点（像素坐标，归一化 0~1）
export interface PerspectiveQuad {
  tl: Vec2
  tr: Vec2
  br: Vec2
  bl: Vec2
}

// 白平衡校正参数
export interface ColorCorrection {
  // 线性增益 rgb
  gain: Vec2 & { z?: number }
  exposure: number
  temperature: number
}

export interface SlabPhoto {
  // IndexedDB 中的 blob key
  blobKey: string
  widthPx: number
  heightPx: number
  quad: PerspectiveQuad
  correction: ColorCorrection
  // 编辑视图用的工作纹理最大边长（显存保护）
  workingMaxSize: number
}

export type SlabSource = 'photo' | 'procedural'

export interface ProceduralTextureSpec {
  kind: 'marble-flow' | 'marble-vein' | 'quartzite'
  seed: number
  baseColor: string
  veinColor: string
  scale: number
  turbulence: number
}

export interface Slab {
  id: string
  code: string
  category: StoneCategory
  source: SlabSource
  // 实际物理尺寸 mm
  widthMm: number
  heightMm: number
  thicknessMm: number
  batchNo: string
  seqInBatch: number
  photo?: SlabPhoto
  procedural?: ProceduralTextureSpec
  defects: DefectZone[]
  // 板边留量 mm，切割件不得进入
  edgeMarginMm: number
  createdAt: number
  note: string
}

// ============ 项目与面 ============

export type FaceKind = 'countertop' | 'island' | 'feature-wall' | 'other'

export interface HoleSpec {
  id: string
  name: string
  // 面局部坐标（原点面左下角），mm
  rect: Rect
  kind: 'sink' | 'cooktop' | 'faucet' | 'custom'
  cornerRadiusMm: number
}

export interface BevelSpec {
  // 四边倒角宽度 mm，0 表示直角
  top: number
  right: number
  bottom: number
  left: number
}

export interface ProjectFace {
  id: string
  name: string
  kind: FaceKind
  widthMm: number
  heightMm: number
  thicknessMm: number
  holes: HoleSpec[]
  bevel: BevelSpec
  // 下垂边高度 mm（台面前沿下挂），0 无下挂
  dropEdgeMm: number
  finish: SurfaceFinish
  note: string
}

export interface Project {
  id: string
  name: string
  client: string
  room: 'kitchen' | 'living-room' | 'bathroom' | 'other'
  faces: ProjectFace[]
  createdAt: number
  updatedAt: number
  note: string
}

// ============ 排版 ============

export type MatchMode = 'book' | 'sequence'

// 一个切割件在大板上的摆放
export interface PlacedPiece {
  id: string
  faceId: string
  slabId: string
  // 大板坐标系下的位置（原点板左下角），mm
  placement: RotatedRect
  // 纹理镜像：书本对纹时相邻件之一为 true
  mirrorU: boolean
  // 同批次顺序编号
  seq: number
}

// 对纹缝：两个相邻件之间的对齐关系
export interface MatchSeam {
  id: string
  pieceA: string
  pieceB: string
  mode: MatchMode
  // 缝在世界坐标的两个端点
  a: Vec2
  b: Vec2
  // 检测出的纹路错位（像素，按工作纹理分辨率折算）
  mismatchPx: number
  // 错位毫米
  mismatchMm: number
  // 匹配置信度 0~1
  confidence: number
  passed: boolean
}

export interface LayoutPlan {
  id: string
  projectId: string
  name: string
  pieces: PlacedPiece[]
  seams: MatchSeam[]
  slabIds: string[]
  // 利用率 = 件总面积 / 投入大板总面积
  utilization: number
  createdAt: number
  // 约束违规汇总
  violations: LayoutViolation[]
}

export interface LayoutViolation {
  id: string
  level: 'error' | 'warning'
  kind: 'defect-overlap' | 'edge-margin' | 'piece-overlap' | 'out-of-slab' | 'match-fail'
  pieceId?: string
  message: string
}

// ============ 应用设置 ============

export interface AppSettings {
  // 对纹合格阈值（工作纹理像素）
  matchTolerancePx: number
  // 默认板边留量
  defaultEdgeMarginMm: number
  // 工作纹理最大边长
  workingTextureMax: number
  // 编辑视图抗锯齿
  msaaSamples: number
  // 主题
  theme: 'light' | 'dark'
  // 网格间距 mm
  gridMm: number
  // 自动排样允许的旋转角
  autoRotateAngles: number[]
  // 8K 原图是否保留在 IndexedDB
  keepOriginalPhoto: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  matchTolerancePx: 1,
  defaultEdgeMarginMm: 20,
  workingTextureMax: 4096,
  msaaSamples: 4,
  theme: 'light',
  gridMm: 100,
  autoRotateAngles: [0, 90],
  keepOriginalPhoto: true,
}
