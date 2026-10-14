import {
  HOME_INTERIOR_BUILD_BOUNDS,
  type BuildingKind,
  type BuildingStyle,
  type PlacedBuilding,
} from './town-model'

/** Storage key shared by the game and the standalone floorplan-3d editor. */
export const FLOORPLAN_STORAGE_KEY = 'warmtown-floorplan-v1'
export const FLOORPLAN_MESSAGE_SOURCE = 'warmtown-floorplan'
export const FLOORPLAN_PROTOCOL_VERSION = 2

export type FloorplanFurniture = {
  id?: string
  type: string
  name: string
  cx: number
  cy: number
  w: number
  d: number
  rot?: number
  color?: string
}

export type FloorplanWall = [number, number, number, number, string?]
export type FloorplanWindow = [number, number, number, number]
export type FloorplanDoor = {
  name?: string
  rect: [number, number, number, number]
  h?: [number, number]
  c?: [number, number]
  o?: [number, number]
  len?: number
  entry?: boolean
}

export type FloorplanRoom = {
  id: string
  name: string
  poly: [number, number][]
  mat?: string
  counted?: boolean
}

export type FloorplanState = {
  furniture: FloorplanFurniture[]
  rooms?: Record<string, { name?: string; mat?: string }>
  demolished?: string[]
  measures?: unknown[]
}

/** Serializable payload exchanged through window.postMessage. */
export type FloorplanDesign = {
  source: typeof FLOORPLAN_MESSAGE_SOURCE
  version: number
  exportedAt?: string
  state: FloorplanState
  walls: FloorplanWall[]
  windows: FloorplanWindow[]
  doors: FloorplanDoor[]
  slides?: FloorplanWindow[]
  rooms: FloorplanRoom[]
}

export type FloorplanMessage = {
  source: typeof FLOORPLAN_MESSAGE_SOURCE
  type: 'floorplan-ready' | 'floorplan-import' | 'floorplan-export' | 'floorplan-apply'
  design?: unknown
}

const PLAN_ORIGIN_X = 5400
const PLAN_ORIGIN_Y = 4550
const GAME_UNITS_PER_MM = 0.001
const HOME_PLAN_WALLS: FloorplanWall[] = [
  [-120, 330, 4080, 570, 'e'], [6720, 330, 10920, 570, 'e'],
  [-120, 450, 120, 8650, 'e'], [10680, 450, 10920, 8650, 'e'],
  [-120, 8530, 4000, 8770, 'e'], [6800, 8530, 10920, 8770, 'e'],
]
const HOME_PLAN_WINDOWS: FloorplanWindow[] = [[4080, 330, 6720, 570]]
const HOME_PLAN_DOORS: FloorplanDoor[] = [{ name: '气闸入口', rect: [4000, 8530, 6800, 8770], entry: true }]
const HOME_PLAN_ROOMS: FloorplanRoom[] = [{
  id: 'home-cabin', name: '居住舱', poly: [[120, 570], [10680, 570], [10680, 8530], [120, 8530]], mat: 'wood',
}]

function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function mapPoint(x: number, y: number): { x: number; z: number } {
  return {
    x: clamp(-7 + (finite(x) - PLAN_ORIGIN_X) * GAME_UNITS_PER_MM, HOME_INTERIOR_BUILD_BOUNDS.minX, HOME_INTERIOR_BUILD_BOUNDS.maxX),
    z: clamp(6.45 + (finite(y) - PLAN_ORIGIN_Y) * GAME_UNITS_PER_MM, HOME_INTERIOR_BUILD_BOUNDS.minZ, HOME_INTERIOR_BUILD_BOUNDS.maxZ),
  }
}

function mapScale(widthMm: number, depthMm: number, baseWidth: number, baseDepth = baseWidth): number {
  const width = Math.max(0.1, finite(widthMm, baseWidth * 1000) / 1000)
  const depth = Math.max(0.1, finite(depthMm, baseDepth * 1000) / 1000)
  // PlacedBuilding has a uniform scale. Preserve the larger dimension while
  // keeping imported models inside the editor's safe scale range.
  return clamp(Math.max(width / baseWidth, depth / baseDepth), 0.65, 1.8)
}

function idPart(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim().replace(/[^\w-]/g, '_').slice(0, 48) : fallback
}

function kindForFurniture(type: string): { kind: BuildingKind; baseWidth: number; baseDepth: number } {
  const t = type.toLowerCase()
  if (['bed', 'crib'].includes(t)) return { kind: '床铺', baseWidth: 1.55, baseDepth: 2.2 }
  if (['wardrobe', 'dresser', 'shoecab', 'bookshelf', 'cabinet'].includes(t)) return { kind: '室内衣柜', baseWidth: 1.56, baseDepth: 0.56 }
  if (['sofa', 'cornersofa', 'armchair', 'beanbag', 'coffeetable', 'sidetable', 'rug'].includes(t)) return { kind: '室内沙发', baseWidth: 2.05, baseDepth: 0.90 }
  if (['table', 'roundtable', 'island', 'counter'].includes(t)) return { kind: '室内桌子', baseWidth: 1.58, baseDepth: 0.92 }
  if (['chair', 'officechair', 'barstool'].includes(t)) return { kind: '室内椅子', baseWidth: 0.58, baseDepth: 0.58 }
  if (['floorlamp', 'lamp', 'light'].includes(t)) return { kind: '室内灯', baseWidth: 0.68, baseDepth: 0.68 }
  if (['plant'].includes(t)) return { kind: '花盆', baseWidth: 0.62, baseDepth: 0.62 }
  if (['tv', 'aircon', 'acwall', 'fridge', 'stove', 'ksink', 'washer', 'waterheater', 'dishwasher', 'ovencol', 'dryer', 'purifier', 'vanity', 'toilet', 'shower', 'bathtub'].includes(t)) {
    return { kind: '厨房', baseWidth: 1.65, baseDepth: 0.68 }
  }
  return { kind: '室内桌子', baseWidth: 1.58, baseDepth: 0.92 }
}

function segmentParts(startX: number, startY: number, endX: number, endY: number, kind: BuildingKind, style: BuildingStyle, id: string, floorplan: NonNullable<PlacedBuilding['floorplan']>[]): PlacedBuilding[] {
  const dx = endX - startX
  const dy = endY - startY
  const lengthMm = Math.hypot(dx, dy)
  if (lengthMm < 80) return []
  const maxLength = (kind === '室内墙体' ? 3.35 : 1.9) * 1.8 * 1000
  const count = Math.max(1, Math.ceil(lengthMm / maxLength))
  const segmentLength = lengthMm / count
  const rotation = Math.abs(dx) >= Math.abs(dy) ? 0 : Math.PI / 2
  const result: PlacedBuilding[] = []
  for (let i = 0; i < count; i += 1) {
    const t0 = i / count
    const t1 = (i + 1) / count
    const x0 = startX + dx * t0
    const y0 = startY + dy * t0
    const x1 = startX + dx * t1
    const y1 = startY + dy * t1
    const center = mapPoint((x0 + x1) / 2, (y0 + y1) / 2)
    const source = floorplan[0] ?? { type: 'wall', name: '墙体' }
    const baseWidth = kind === '室内墙体' ? 3.35 : 1.9
    result.push({
      id: `${id}-${i + 1}`,
      kind,
      x: center.x,
      z: center.z,
      rotation,
      style,
      zone: 'interior',
      scale: clamp(segmentLength / 1000 / baseWidth, 0.65, 1.8),
      floorplan: { ...source, widthMm: segmentLength, depthMm: 140 },
    })
  }
  return result
}

function pointInPolygon(x: number, y: number, polygon: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1]
    const xj = polygon[j][0], yj = polygon[j][1]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function addRoomFloors(room: FloorplanRoom, style: BuildingStyle, result: PlacedBuilding[], index: number): void {
  if (!Array.isArray(room.poly) || room.poly.length < 3) return
  const xs = room.poly.map(p => finite(p[0])), ys = room.poly.map(p => finite(p[1]))
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  // A floor tile is 1.62m × 1.18m in the in-game editor. A 1.08m grid
  // keeps the imported room surface continuous without a huge single mesh.
  const step = 1080
  let tile = 0
  for (let y = minY + step / 2; y < maxY; y += step) {
    for (let x = minX + step / 2; x < maxX; x += step) {
      if (!pointInPolygon(x, y, room.poly)) continue
      const center = mapPoint(x, y)
      result.push({
        id: `floor-${idPart(room.id, String(index))}-${tile++}`,
        kind: '室内地板', x: center.x, z: center.z, rotation: 0, style, zone: 'interior', scale: 0.92,
        floorplan: { type: 'room-floor', name: room.name, sourceId: room.id },
      })
    }
  }
}

function safeDesign(input: unknown): FloorplanDesign | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Partial<FloorplanDesign> & { state?: Partial<FloorplanState> }
  const source = raw.source === FLOORPLAN_MESSAGE_SOURCE ? raw.source : FLOORPLAN_MESSAGE_SOURCE
  const stateRaw = raw.state && typeof raw.state === 'object' ? raw.state : input as Partial<FloorplanState>
  const furniture = Array.isArray(stateRaw.furniture) ? stateRaw.furniture.filter(item => item && typeof item === 'object').map(item => {
    const f = item as Partial<FloorplanFurniture>
    return {
      id: typeof f.id === 'string' ? f.id : undefined, type: typeof f.type === 'string' ? f.type : 'table', name: typeof f.name === 'string' ? f.name : '家具',
      cx: finite(f.cx), cy: finite(f.cy), w: Math.max(1, finite(f.w, 1000)), d: Math.max(1, finite(f.d, 1000)), rot: finite(f.rot), color: typeof f.color === 'string' ? f.color : undefined,
    }
  }) : []
  const rooms = Array.isArray(raw.rooms) ? raw.rooms.flatMap(room => {
    if (!room || typeof room !== 'object') return []
    const item = room as Partial<FloorplanRoom>
    const poly = Array.isArray(item.poly) ? item.poly.filter(point => Array.isArray(point) && point.length >= 2).map(point => [finite(point[0]), finite(point[1])] as [number, number]) : []
    if (poly.length < 3) return []
    return [{ id: typeof item.id === 'string' ? item.id.slice(0, 80) : 'room', name: typeof item.name === 'string' ? item.name.slice(0, 120) : '房间', poly, mat: typeof item.mat === 'string' ? item.mat : undefined, counted: item.counted !== false }]
  }) : []
  const walls = Array.isArray(raw.walls) ? raw.walls.flatMap(wall => Array.isArray(wall) && wall.length >= 4 ? [[finite(wall[0]), finite(wall[1]), finite(wall[2]), finite(wall[3]), typeof wall[4] === 'string' ? wall[4] : undefined] as FloorplanWall] : []) : []
  const windows = Array.isArray(raw.windows) ? raw.windows.flatMap(item => Array.isArray(item) && item.length >= 4 ? [[finite(item[0]), finite(item[1]), finite(item[2]), finite(item[3])] as FloorplanWindow] : []) : []
  const slides = Array.isArray(raw.slides) ? raw.slides.flatMap(item => Array.isArray(item) && item.length >= 4 ? [[finite(item[0]), finite(item[1]), finite(item[2]), finite(item[3])] as FloorplanWindow] : []) : []
  const doors = Array.isArray(raw.doors) ? raw.doors.flatMap(item => {
    if (!item || typeof item !== 'object' || !Array.isArray((item as FloorplanDoor).rect)) return []
    const door = item as FloorplanDoor
    const rect = door.rect
    if (rect.length < 4) return []
    return [{ ...door, name: typeof door.name === 'string' ? door.name.slice(0, 100) : '门', rect: [finite(rect[0]), finite(rect[1]), finite(rect[2]), finite(rect[3])] as [number, number, number, number] }]
  }) : []
  return { source, version: Number.isFinite(Number(raw.version)) ? Number(raw.version) : FLOORPLAN_PROTOCOL_VERSION, exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : undefined, state: { furniture, rooms: stateRaw.rooms, demolished: Array.isArray(stateRaw.demolished) ? stateRaw.demolished.filter(value => typeof value === 'string') : [], measures: Array.isArray(stateRaw.measures) ? stateRaw.measures : [] }, walls, windows, doors, slides, rooms }
}

export function readFloorplanDesign(value: unknown): FloorplanDesign | null {
  return safeDesign(value)
}

export function storeFloorplanDesign(design: FloorplanDesign): void {
  try { localStorage.setItem(FLOORPLAN_STORAGE_KEY, JSON.stringify(design)) } catch { /* storage can be disabled */ }
}

export function loadStoredFloorplanDesign(): FloorplanDesign | null {
  try {
    const design = safeDesign(JSON.parse(localStorage.getItem(FLOORPLAN_STORAGE_KEY) ?? 'null'))
    return design?.version === FLOORPLAN_PROTOCOL_VERSION ? design : null
  } catch { return null }
}

function unmapPoint(x: number, z: number): { x: number; y: number } {
  return {
    x: PLAN_ORIGIN_X + (clamp(x, HOME_INTERIOR_BUILD_BOUNDS.minX, HOME_INTERIOR_BUILD_BOUNDS.maxX) + 7) / GAME_UNITS_PER_MM,
    y: PLAN_ORIGIN_Y + (clamp(z, HOME_INTERIOR_BUILD_BOUNDS.minZ, HOME_INTERIOR_BUILD_BOUNDS.maxZ) - 6.45) / GAME_UNITS_PER_MM,
  }
}

/** Create an editor payload from game entities when no previous editor file exists. */
export function buildingsToFloorplanDesign(buildings: readonly PlacedBuilding[]): FloorplanDesign {
  const furniture: FloorplanFurniture[] = buildings.filter(building => building.zone === 'interior' && building.kind !== '室内墙体' && building.kind !== '室内隔断' && building.kind !== '室内窗' && building.kind !== '室内门' && building.kind !== '室内地板').map((building, index) => {
    const point = unmapPoint(building.x, building.z)
    const type = building.floorplan?.type ?? (building.kind === '室内衣柜' ? 'wardrobe' : building.kind === '室内沙发' ? 'sofa' : building.kind === '室内桌子' ? 'table' : building.kind === '室内椅子' ? 'chair' : building.kind === '室内灯' ? 'floorlamp' : building.kind === '床铺' ? 'bed' : building.kind === '厨房' ? 'counter' : 'table')
    return {
      id: building.floorplan?.sourceId ?? building.id ?? `building-${index}`,
      type,
      name: building.floorplan?.name ?? building.kind,
      cx: point.x,
      cy: point.y,
      w: building.floorplan?.widthMm ?? 1200 * building.scale,
      d: building.floorplan?.depthMm ?? 700 * building.scale,
      rot: (building.rotation * 180) / Math.PI,
      color: building.floorplan?.color,
    }
  })
  const includedIds = new Set(furniture.map(item => item.id))
  const starterFurniture: FloorplanFurniture[] = [
    { id: 'home-bed', type: 'bed', name: '舱内床铺', ...(() => { const point = unmapPoint(-9.55, 4.55); return { cx: point.x, cy: point.y } })(), w: 1550, d: 2050, rot: 0, color: '#d9b7a8' },
    { id: 'home-side-table', type: 'table', name: '床边小桌', ...(() => { const point = unmapPoint(-8.0, 3.85); return { cx: point.x, cy: point.y } })(), w: 720, d: 620, rot: 0, color: '#ba928b' },
    { id: 'home-counter', type: 'counter', name: '生命维持台', ...(() => { const point = unmapPoint(-4.95, 4.05); return { cx: point.x, cy: point.y } })(), w: 1850, d: 720, rot: 0, color: '#ba928b' },
  ].filter(item => !includedIds.has(item.id))
  const structural = buildings.filter(building => building.zone === 'interior' && ['室内墙体', '室内隔断', '室内窗', '室内门'].includes(building.kind))
  const walls: FloorplanWall[] = []
  const windows: FloorplanWindow[] = []
  const doors: FloorplanDoor[] = HOME_PLAN_DOORS.map(door => ({ ...door, rect: [...door.rect] as FloorplanDoor['rect'] }))
  structural.forEach(building => {
    const center = unmapPoint(building.x, building.z)
    const baseWidth = building.kind === '室内墙体' ? 3.35 : building.kind === '室内隔断' ? 1.9 : building.kind === '室内窗' ? 1.55 : 1.38
    const width = Math.max(120, building.floorplan?.widthMm ?? baseWidth * building.scale * 1000)
    const half = width / 2
    const thickness = building.kind === '室内墙体' ? 140 : 120
    const horizontal = Math.abs(Math.sin(building.rotation)) < 0.5
    const rect: FloorplanWindow = horizontal
      ? [center.x - half, center.y - thickness / 2, center.x + half, center.y + thickness / 2]
      : [center.x - thickness / 2, center.y - half, center.x + thickness / 2, center.y + half]
    if (building.kind === '室内窗') windows.push(rect)
    else if (building.kind === '室内门') doors.push({ name: building.floorplan?.name ?? '门', rect, entry: false })
    else walls.push([...rect, building.kind === '室内隔断' ? 'n' : 'e'])
  })
  const persistedLayout = structural.length > 0
  return {
    source: FLOORPLAN_MESSAGE_SOURCE,
    version: FLOORPLAN_PROTOCOL_VERSION,
    exportedAt: new Date().toISOString(),
    state: { furniture: [...starterFurniture, ...furniture], rooms: {}, demolished: [], measures: [] },
    walls: persistedLayout ? walls : HOME_PLAN_WALLS.map(wall => [...wall]),
    windows: persistedLayout ? windows : HOME_PLAN_WINDOWS.map(window => [...window]),
    doors,
    slides: [],
    rooms: HOME_PLAN_ROOMS.map(room => ({ ...room, poly: room.poly.map(point => [...point] as [number, number]) })),
  }
}

export function floorplanDesignToBuildings(input: unknown, style: BuildingStyle = '海风奶油'): PlacedBuilding[] {
  const design = safeDesign(input)
  if (!design) return []
  const result: PlacedBuilding[] = []
  const demolished = new Set(design.state.demolished ?? [])
  design.walls.forEach((wall, index) => {
    if (demolished.has(`w${index}`)) return
    const [x0, y0, x1, y1, type] = wall
    const kind: BuildingKind = type === 'n' || type === 'low' ? '室内隔断' : '室内墙体'
    // floorplan-3d stores walls as rectangle bounds, including their thickness.
    // Use the rectangle's centerline so the game does not import its diagonal.
    const horizontal = Math.abs(x1 - x0) >= Math.abs(y1 - y0)
    const startX = horizontal ? x0 : (x0 + x1) / 2
    const endX = horizontal ? x1 : (x0 + x1) / 2
    const startY = horizontal ? (y0 + y1) / 2 : y0
    const endY = horizontal ? (y0 + y1) / 2 : y1
    result.push(...segmentParts(finite(startX), finite(startY), finite(endX), finite(endY), kind, style, `wall-${index}`, [{ type: 'wall', name: type === 'b' ? '承重墙' : '墙体', sourceId: `w${index}` }]))
  })
  design.windows.forEach((window, index) => {
    const [x0, y0, x1, y1] = window
    const dx = x1 - x0, dy = y1 - y0
    const center = mapPoint((x0 + x1) / 2, (y0 + y1) / 2)
    const width = Math.max(Math.abs(dx), Math.abs(dy))
    result.push({ id: `window-${index}`, kind: '室内窗', x: center.x, z: center.z, rotation: Math.abs(dx) >= Math.abs(dy) ? 0 : Math.PI / 2, style, zone: 'interior', scale: mapScale(width, 120, 1.55, 0.12), floorplan: { type: 'window', name: '窗', widthMm: width, depthMm: 120, sourceId: `win${index}` } })
  })
  design.doors.forEach((door, index) => {
    if (door.entry) return
    const [x0, y0, x1, y1] = door.rect
    const dx = x1 - x0, dy = y1 - y0
    const center = mapPoint((x0 + x1) / 2, (y0 + y1) / 2)
    result.push({ id: `door-${index}`, kind: '室内门', x: center.x, z: center.z, rotation: Math.abs(dx) >= Math.abs(dy) ? 0 : Math.PI / 2, style, zone: 'interior', scale: mapScale(Math.max(Math.abs(dx), Math.abs(dy)), 120, 1.38, 0.14), floorplan: { type: 'door', name: door.name ?? '门', widthMm: Math.max(Math.abs(dx), Math.abs(dy)), depthMm: 120, sourceId: `door${index}` } })
  })
  design.slides?.forEach((slide, index) => {
    const [x0, y0, x1, y1] = slide
    const dx = x1 - x0, dy = y1 - y0
    const center = mapPoint((x0 + x1) / 2, (y0 + y1) / 2)
    result.push({ id: `slide-${index}`, kind: '室内门', x: center.x, z: center.z, rotation: Math.abs(dx) >= Math.abs(dy) ? 0 : Math.PI / 2, style, zone: 'interior', scale: mapScale(Math.max(Math.abs(dx), Math.abs(dy)), 120, 1.38, 0.14), floorplan: { type: 'slide', name: '推拉门', widthMm: Math.max(Math.abs(dx), Math.abs(dy)), depthMm: 120, sourceId: `slide${index}` } })
  })
  design.rooms.forEach((room, index) => addRoomFloors(room, style, result, index))
  design.state.furniture.forEach((furniture, index) => {
    const { kind, baseWidth, baseDepth } = kindForFurniture(furniture.type)
    const center = mapPoint(furniture.cx, furniture.cy)
    result.push({ id: `furniture-${idPart(furniture.id, String(index))}`, kind, x: center.x, z: center.z, rotation: (finite(furniture.rot) * Math.PI) / 180, style, zone: 'interior', scale: mapScale(furniture.w, furniture.d, baseWidth, baseDepth), floorplan: { type: furniture.type, name: furniture.name, widthMm: furniture.w, depthMm: furniture.d, sourceId: furniture.id, color: furniture.color } })
  })
  return result
}

