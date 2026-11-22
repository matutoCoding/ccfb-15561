// 用料清单导出 CSV（带 BOM，Excel 直接打开不乱码）
import type { LayoutPlan, ProjectFace, Slab } from './types'
import { downloadTextFile } from './export_dxf'

const csvCell = (v: string | number): string => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export interface BomRow {
  seq: number
  faceName: string
  slabCode: string
  batchNo: string
  widthMm: number
  heightMm: number
  thicknessMm: number
  areaM2: number
  finish: string
  holes: number
  dropEdgeMm: number
}

export const buildBomRows = (
  plan: LayoutPlan,
  faces: ProjectFace[],
  slabs: Slab[],
): BomRow[] => {
  const faceMap = new Map(faces.map((f) => [f.id, f]))
  const slabMap = new Map(slabs.map((s) => [s.id, s]))
  const finishText: Record<string, string> = {
    polished: '亮光面',
    honed: '哑光面',
    leathered: '荔枝面',
  }
  return [...plan.pieces]
    .sort((a, b) => a.seq - b.seq)
    .map((piece) => {
      const face = faceMap.get(piece.faceId)
      const slab = slabMap.get(piece.slabId)
      return {
        seq: piece.seq,
        faceName: face?.name ?? '-',
        slabCode: slab?.code ?? '-',
        batchNo: slab?.batchNo ?? '-',
        widthMm: piece.placement.w,
        heightMm: piece.placement.h,
        thicknessMm: face?.thicknessMm ?? slab?.thicknessMm ?? 0,
        areaM2: (piece.placement.w * piece.placement.h) / 1e6,
        finish: finishText[face?.finish ?? 'polished'],
        holes: face?.holes.length ?? 0,
        dropEdgeMm: face?.dropEdgeMm ?? 0,
      }
    })
}

export const exportBomCsv = (
  plan: LayoutPlan,
  faces: ProjectFace[],
  slabs: Slab[],
  filename: string,
): void => {
  const rows = buildBomRows(plan, faces, slabs)
  const header = [
    '序号',
    '面名称',
    '大板编号',
    '批次',
    '宽(mm)',
    '高(mm)',
    '厚(mm)',
    '面积(m2)',
    '表面处理',
    '开孔数',
    '下垂边(mm)',
  ]
  const lines = [header.map(csvCell).join(',')]
  for (const row of rows) {
    lines.push(
      [
        row.seq,
        row.faceName,
        row.slabCode,
        row.batchNo,
        row.widthMm.toFixed(1),
        row.heightMm.toFixed(1),
        row.thicknessMm.toFixed(1),
        row.areaM2.toFixed(3),
        row.finish,
        row.holes,
        row.dropEdgeMm,
      ]
        .map(csvCell)
        .join(','),
    )
  }
  lines.push('')
  lines.push(`利用率,${(plan.utilization * 100).toFixed(1)}%`)
  // 显式 BOM 头保证 Excel 中文编码
  downloadTextFile('﻿' + lines.join('\n'), filename, 'text/csv;charset=utf-8')
}
