// 全局物理单位：毫米(mm)，角度内部统一弧度，UI 层再转角度

export interface Vec2 {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

// 带旋转的矩形：cx/cy 中心，angle 弧度
export interface RotatedRect {
  cx: number
  cy: number
  w: number
  h: number
  angle: number
}

export interface Polygon {
  points: Vec2[]
}

export const vec = (x: number, y: number): Vec2 => ({ x, y })

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })

export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s })

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y

export const len = (a: Vec2): number => Math.hypot(a.x, a.y)

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)

// 局部坐标 -> 世界坐标（绕中心旋转 + 平移）
export const localToWorld = (r: RotatedRect, p: Vec2): Vec2 => {
  const c = Math.cos(r.angle)
  const s = Math.sin(r.angle)
  return {
    x: r.cx + p.x * c - p.y * s,
    y: r.cy + p.x * s + p.y * c,
  }
}

// 世界坐标 -> 局部坐标
export const worldToLocal = (r: RotatedRect, p: Vec2): Vec2 => {
  const dx = p.x - r.cx
  const dy = p.y - r.cy
  const c = Math.cos(r.angle)
  const s = Math.sin(r.angle)
  return {
    x: dx * c + dy * s,
    y: -dx * s + dy * c,
  }
}

// 旋转矩形的四个角点（世界坐标）
export const rectCorners = (r: RotatedRect): Vec2[] => {
  const hw = r.w / 2
  const hh = r.h / 2
  return [
    localToWorld(r, { x: -hw, y: -hh }),
    localToWorld(r, { x: hw, y: -hh }),
    localToWorld(r, { x: hw, y: hh }),
    localToWorld(r, { x: -hw, y: hh }),
  ]
}

// 轴对齐矩形的角点
export const aabbCorners = (r: Rect): Vec2[] => [
  { x: r.x, y: r.y },
  { x: r.x + r.w, y: r.y },
  { x: r.x + r.w, y: r.y + r.h },
  { x: r.x, y: r.y + r.h },
]

export const pointInRect = (r: Rect, p: Vec2): boolean =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

// 点是否在旋转矩形内部
export const pointInRotatedRect = (r: RotatedRect, p: Vec2): boolean => {
  const lp = worldToLocal(r, p)
  return Math.abs(lp.x) <= r.w / 2 && Math.abs(lp.y) <= r.h / 2
}

// 凸多边形包含点（射线法，凹多边形也适用）
export const pointInPolygon = (poly: Polygon, p: Vec2): boolean => {
  const pts = poly.points
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x
    const yi = pts[i].y
    const xj = pts[j].x
    const yj = pts[j].y
    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

// 线段相交检测
export const segmentsIntersect = (p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean => {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x)
  if (Math.abs(d) < 1e-9) return false
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

// 两个旋转矩形是否相交（SAT 分离轴）；共边贴合不算重叠
export const rotatedRectsIntersect = (a: RotatedRect, b: RotatedRect): boolean => {
  const ca = rectCorners(a)
  const cb = rectCorners(b)
  const axes: Vec2[] = []
  for (const corners of [ca, cb]) {
    for (let i = 0; i < corners.length; i++) {
      const p = corners[i]
      const q = corners[(i + 1) % corners.length]
      const edge = sub(q, p)
      axes.push({ x: -edge.y, y: edge.x })
    }
  }
  const eps = 1e-6
  for (const axis of axes) {
    let minA = Infinity
    let maxA = -Infinity
    let minB = Infinity
    let maxB = -Infinity
    for (const p of ca) {
      const proj = dot(p, axis)
      minA = Math.min(minA, proj)
      maxA = Math.max(maxA, proj)
    }
    for (const p of cb) {
      const proj = dot(p, axis)
      minB = Math.min(minB, proj)
      maxB = Math.max(maxB, proj)
    }
    // 轴上投影区间不重叠（含刚好贴合）即分离
    if (maxA <= minB + eps || maxB <= minA + eps) return false
  }
  return true
}

// 点到线段距离
export const pointToSegmentDist = (p: Vec2, a: Vec2, b: Vec2): number => {
  const ab = sub(b, a)
  const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / dot(ab, ab)))
  return dist(p, add(a, scale(ab, t)))
}

// 点到多边形边界的最小距离，内部返回负值
export const pointToPolygonBoundary = (p: Vec2, poly: Polygon): number => {
  const pts = poly.points
  let minD = Infinity
  for (let i = 0; i < pts.length; i++) {
    minD = Math.min(minD, pointToSegmentDist(p, pts[i], pts[(i + 1) % pts.length]))
  }
  return pointInPolygon(poly, p) ? -minD : minD
}

// 多边形面积（绝对值）
export const polygonArea = (poly: Polygon): number => {
  const pts = poly.points
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    sum += p.x * q.y - q.x * p.y
  }
  return Math.abs(sum) / 2
}

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v))

export const degToRad = (deg: number): number => (deg * Math.PI) / 180

export const radToDeg = (rad: number): number => (rad * 180) / Math.PI

// 角度归一化到 [0, 2π)
export const normalizeAngle = (rad: number): number => {
  const twoPi = Math.PI * 2
  return ((rad % twoPi) + twoPi) % twoPi
}
