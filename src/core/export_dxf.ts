// DXF R12 ASCII 导出：切割轮廓 + 开孔 + 标注文字
// 坐标单位毫米，原点取大板左下角
import type { PlacedPiece, ProjectFace, Slab } from './types'
import { rectCorners } from './geometry'

interface DxfEntity {
  lines: string[]
}

const dxfLine = (code: number, value: string | number): string => `${code}\n${value}`

const entityPolyline = (points: { x: number; y: number }[], layer: string): DxfEntity => {
  const lines: string[] = []
  lines.push(dxfLine(0, 'POLYLINE'))
  lines.push(dxfLine(8, layer))
  lines.push(dxfLine(66, 1))
  lines.push(dxfLine(70, 1)) // 闭合
  for (const p of points) {
    lines.push(dxfLine(0, 'VERTEX'))
    lines.push(dxfLine(8, layer))
    lines.push(dxfLine(10, p.x.toFixed(2)))
    lines.push(dxfLine(20, p.y.toFixed(2)))
  }
  lines.push(dxfLine(0, 'SEQEND'))
  lines.push(dxfLine(8, layer))
  return { lines }
}

const entityText = (
  x: number,
  y: number,
  text: string,
  layer: string,
  height = 18,
): DxfEntity => ({
  lines: [
    dxfLine(0, 'TEXT'),
    dxfLine(8, layer),
    dxfLine(10, x.toFixed(2)),
    dxfLine(20, y.toFixed(2)),
    dxfLine(40, height),
    dxfLine(1, text),
  ],
})

const entityCircle = (
  x: number,
  y: number,
  radius: number,
  layer: string,
): DxfEntity => ({
  lines: [
    dxfLine(0, 'CIRCLE'),
    dxfLine(8, layer),
    dxfLine(10, x.toFixed(2)),
    dxfLine(20, y.toFixed(2)),
    dxfLine(40, radius.toFixed(2)),
  ],
})

export interface DxfExportData {
  slabs: Slab[]
  pieces: PlacedPiece[]
  faces: ProjectFace[]
}

export const buildDxf = (data: DxfExportData): string => {
  const { slabs, pieces, faces } = data
  const faceMap = new Map(faces.map((f) => [f.id, f]))
  const entities: DxfEntity[] = []
  const header: string[] = []

  header.push(dxfLine(0, 'SECTION'))
  header.push(dxfLine(2, 'HEADER'))
  header.push(dxfLine(9, '$ACADVER'))
  header.push(dxfLine(1, 'AC1009'))
  header.push(dxfLine(9, '$INSUNITS'))
  header.push(dxfLine(70, 4)) // 毫米
  header.push(dxfLine(0, 'ENDSEC'))

  // 图层定义
  header.push(dxfLine(0, 'SECTION'))
  header.push(dxfLine(2, 'TABLES'))
  header.push(dxfLine(0, 'TABLE'))
  header.push(dxfLine(2, 'LAYER'))
  header.push(dxfLine(70, 4))
  const layers = [
    { name: 'SLAB_OUTLINE', color: 8 },
    { name: 'CUT_LINE', color: 1 },
    { name: 'HOLE', color: 3 },
    { name: 'LABEL', color: 5 },
  ]
  for (const layer of layers) {
    header.push(dxfLine(0, 'LAYER'))
    header.push(dxfLine(2, layer.name))
    header.push(dxfLine(70, 0))
    header.push(dxfLine(62, layer.color))
    header.push(dxfLine(6, 'CONTINUOUS'))
  }
  header.push(dxfLine(0, 'ENDTAB'))
  header.push(dxfLine(0, 'ENDSEC'))
  header.push(dxfLine(0, 'SECTION'))
  header.push(dxfLine(2, 'ENTITIES'))

  const footer = [dxfLine(0, 'ENDSEC'), dxfLine(0, 'EOF')]

  for (const slab of slabs) {
    // 大板外框
    entities.push(
      entityPolyline(
        [
          { x: 0, y: 0 },
          { x: slab.widthMm, y: 0 },
          { x: slab.widthMm, y: slab.heightMm },
          { x: 0, y: slab.heightMm },
        ],
        'SLAB_OUTLINE',
      ),
    )
    entities.push(entityText(10, slab.heightMm - 25, slab.code, 'LABEL', 22))

    const slabPieces = pieces.filter((p) => p.slabId === slab.id)
    for (const piece of slabPieces) {
      const face = faceMap.get(piece.faceId)
      // 切割外轮廓（大板坐标系角点）
      entities.push(entityPolyline(rectCorners(piece.placement), 'CUT_LINE'))
      const label = face ? `${face.name} #${piece.seq}` : `#${piece.seq}`
      entities.push(
        entityText(piece.placement.cx - 30, piece.placement.cy, label, 'LABEL'),
      )
      // 开孔：变换到世界坐标，圆孔转圆、其余转矩形多段线
      if (face) {
        for (const hole of face.holes) {
          const hx = piece.placement.cx + (hole.rect.x + hole.rect.w / 2 - face.widthMm / 2)
          const hy = piece.placement.cy + (hole.rect.y + hole.rect.h / 2 - face.heightMm / 2)
          if (hole.kind === 'faucet') {
            entities.push(entityCircle(hx, hy, hole.rect.w / 2, 'HOLE'))
          } else {
            const hw = hole.rect.w / 2
            const hh = hole.rect.h / 2
            entities.push(
              entityPolyline(
                [
                  { x: hx - hw, y: hy - hh },
                  { x: hx + hw, y: hy - hh },
                  { x: hx + hw, y: hy + hh },
                  { x: hx - hw, y: hy + hh },
                ],
                'HOLE',
              ),
            )
          }
        }
      }
    }
  }

  const body = entities.flatMap((e) => e.lines)
  return [...header, ...body, ...footer].join('\n')
}

export const downloadTextFile = (content: string, filename: string, mime: string): void => {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
