// 轻量 id 生成，前缀标识实体类型，方便日志排查
export const uid = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export const round1 = (v: number): number => Math.round(v * 10) / 10

export const formatMm = (mm: number): string => `${round1(mm)} mm`

export const formatArea = (mm2: number): string => `${(mm2 / 1e6).toFixed(3)} m²`
