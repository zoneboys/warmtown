import { describe, expect, it } from 'vitest'
import { buildingsToFloorplanDesign, FLOORPLAN_PROTOCOL_VERSION, floorplanDesignToBuildings, readFloorplanDesign } from '../src/game/floorplan-adapter'
import { normalizeTownState } from '../src/game/town-model'

describe('floorplan-3d bridge', () => {
  it('imports walls, doors, windows, room floors and furniture as interior entities', () => {
    const design = {
      source: 'warmtown-floorplan', version: 1,
      state: { furniture: [
        { id: 'sofa-1', type: 'sofa', name: '三人沙发', cx: 7600, cy: 9000, w: 2400, d: 900, rot: 0 },
        { id: 'chair-1', type: 'chair', name: '椅子', cx: 8200, cy: 9000, w: 450, d: 480, rot: 90 },
      ], demolished: [] },
      walls: [[0, 0, 3000, 0, 'e']],
      windows: [[3000, 0, 4200, 0]],
      doors: [{ name: '入户门', rect: [4200, 0, 5100, 0] }],
      rooms: [{ id: 'living', name: '客厅', poly: [[0, 0], [5000, 0], [5000, 4000], [0, 4000]] }],
    }
    const normalized = readFloorplanDesign(design)
    expect(normalized).not.toBeNull()
    const buildings = floorplanDesignToBuildings(normalized!)
    expect(buildings.some(item => item.kind === '室内墙体')).toBe(true)
    expect(buildings.some(item => item.kind === '室内窗')).toBe(true)
    expect(buildings.some(item => item.kind === '室内门')).toBe(true)
    expect(buildings.some(item => item.kind === '室内地板')).toBe(true)
    expect(buildings.some(item => item.kind === '室内沙发')).toBe(true)
    expect(buildings.some(item => item.kind === '室内椅子')).toBe(true)
    expect(buildings.every(item => item.zone === 'interior')).toBe(true)
    expect(buildings.every(item => item.floorplan?.sourceId || item.floorplan?.type === 'room-floor')).toBe(true)
  })

  it('skips demolished walls while retaining source metadata', () => {
    const design = readFloorplanDesign({
      state: { furniture: [], demolished: ['w0'] },
      walls: [[0, 0, 3000, 0, 'e'], [0, 1000, 3000, 1000, 'n']],
      windows: [], doors: [], rooms: [],
    })!
    const buildings = floorplanDesignToBuildings(design)
    expect(buildings.some(item => item.floorplan?.sourceId === 'w0')).toBe(false)
    expect(buildings.some(item => item.floorplan?.sourceId === 'w1')).toBe(true)
  })

  it('uses the centerline of rectangular wall bounds and preserves real wall length', () => {
    const design = readFloorplanDesign({
      state: { furniture: [] },
      // The editor stores a 240 mm thick horizontal wall as a rectangle.
      walls: [[1000, 2000, 5000, 2240, 'e']],
      windows: [], doors: [], rooms: [],
    })!
    const [wall] = floorplanDesignToBuildings(design)
    expect(wall.kind).toBe('室内墙体')
    expect(wall.rotation).toBe(0)
    expect(wall.floorplan?.widthMm).toBe(4000)
    // The centerline maps to the midpoint of the rectangle, not its corner.
    expect(wall.floorplan?.depthMm).toBe(140)
    expect(wall.scale).toBeCloseTo(4 / 3.35, 2)
  })

  it('maps a vertical window by its long edge rather than the rectangle diagonal', () => {
    const design = readFloorplanDesign({
      state: { furniture: [] }, walls: [],
      windows: [[1200, 1000, 1440, 3000]], doors: [], rooms: [],
    })!
    const [window] = floorplanDesignToBuildings(design)
    expect(window.kind).toBe('室内窗')
    expect(window.rotation).toBeCloseTo(Math.PI / 2)
    expect(window.floorplan?.widthMm).toBe(2000)
  })

  it('imports sliding-door openings from the editor as interior door entities', () => {
    const design = readFloorplanDesign({
      state: { furniture: [] }, walls: [], windows: [], doors: [],
      slides: [[1275, 4950, 2090, 5190]], rooms: [],
    })!
    const [door] = floorplanDesignToBuildings(design)
    expect(door.kind).toBe('室内门')
    expect(door.floorplan?.type).toBe('slide')
    expect(door.floorplan?.name).toBe('推拉门')
    expect(door.floorplan?.widthMm).toBe(815)
    expect(door.rotation).toBe(0)
  })

  it('retains imported room, wall and furniture entities through game save normalization', () => {
    const design = readFloorplanDesign({
      state: { furniture: [{ id: 'sofa-main', type: 'sofa', name: '主沙发', cx: 7600, cy: 9000, w: 2400, d: 900 }] },
      walls: [[0, 0, 3200, 240, 'e']], windows: [], doors: [],
      rooms: [{ id: 'living', name: '客厅', poly: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]] }],
    })!
    const imported = floorplanDesignToBuildings(design)
    const restored = normalizeTownState({ buildings: imported }).buildings
    expect(restored).toHaveLength(imported.length)
    expect(restored.some(item => item.floorplan?.sourceId === 'w0')).toBe(true)
    expect(restored.some(item => item.floorplan?.sourceId === 'living')).toBe(true)
    expect(restored.some(item => item.floorplan?.sourceId === 'sofa-main')).toBe(true)
    expect(restored.every(item => item.zone === 'interior')).toBe(true)
  })

  it('opens on the current habitat footprint with its real airlock and window openings', () => {
    const design = buildingsToFloorplanDesign([])
    expect(design.version).toBe(FLOORPLAN_PROTOCOL_VERSION)
    expect(design.rooms).toHaveLength(1)
    expect(design.rooms[0].name).toBe('居住舱')
    expect(design.windows).toHaveLength(1)
    expect(design.doors.some(door => door.entry)).toBe(true)
    expect(design.walls.some(([x0, y0, x1, y1]) => y0 === 8530 && y1 === 8770 && x0 <= 4000 && x1 >= 6800)).toBe(false)
  })

  it('maps plan coordinates to game metres without stretching and preserves the doorway', () => {
    const design = readFloorplanDesign({
      state: { furniture: [{ id: 'center', type: 'table', name: '中心台', cx: 5400, cy: 4550, w: 1580, d: 920 }] },
      walls: [[-120, 8530, 4000, 8770, 'e'], [6800, 8530, 10920, 8770, 'e']],
      windows: [], doors: [{ name: '气闸', rect: [4000, 8530, 6800, 8770], entry: true }],
      rooms: [{ id: 'cabin', name: '居住舱', poly: [[120, 570], [10680, 570], [10680, 8530], [120, 8530]] }],
    })!
    const buildings = floorplanDesignToBuildings(design)
    const table = buildings.find(building => building.floorplan?.sourceId === 'center')!
    expect(table.x).toBe(-7)
    expect(table.z).toBe(6.45)
    expect(buildings.some(building => building.kind === '室内门')).toBe(false)
    expect(buildings.some(building => building.floorplan?.sourceId === 'cabin')).toBe(true)
  })
})
