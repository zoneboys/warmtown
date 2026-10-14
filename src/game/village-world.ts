import * as THREE from 'three'
import type { Assets } from '../engine/assets'
import { createBlenderHumanoid } from './blender-avatar'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createAssetLod, WorldAssetRegistry, type WorldAssetLoadResult } from './world-assets'
import { DEFAULT_APPEARANCE, DEFAULT_HOME_COLORS, DEFAULT_INTERIOR_COLORS, type AvatarAppearance, type BirdSpecies, type BuildingKind, type BuildingStyle, type CropStage, type HomeColors, type InteriorColors, type ItemId, type PetKind, type PlacedBuilding, type QuestId, type RegionId, type UnknownCreatureSpecies } from './town-model'
import { createHumanoid, type HumanoidRig } from './character'
import { WorldTimeController, type WorldTimeSnapshot } from './world-time'

export const HOME_ROTATION = 0
const PLAYER_HOME_SCALE = { x: 2.42, y: 1.62, z: 2.42 }
const HOME_DOOR_LOCAL_Z = 2.03 * PLAYER_HOME_SCALE.z
const HOME_FRONT = new THREE.Vector3(Math.sin(HOME_ROTATION), 0, Math.cos(HOME_ROTATION))

export const HOME_ENTRY_RADIUS = 7

export const LOCATIONS = {
  start: new THREE.Vector3(1.8, 0, 7.8),
  home: new THREE.Vector3(-7, 0, 6),
  // The porch and doorway are sized from the 2.35-unit avatar height rather
  // than the old toy-sized shell, leaving room for two characters to pass.
  homeDoor: new THREE.Vector3(
    -7 + HOME_FRONT.x * HOME_DOOR_LOCAL_Z,
    0,
    6 + HOME_FRONT.z * HOME_DOOR_LOCAL_Z,
  ),
  farm: new THREE.Vector3(-3, 0, 5),
  pond: new THREE.Vector3(10, 0, -1.8),
  plaza: new THREE.Vector3(0, 0, -1),
  board: new THREE.Vector3(4, 0, -2),
  vehicle: new THREE.Vector3(1, 0, 9),
  kitchen: new THREE.Vector3(-4, 0, -3),
  wardrobe: new THREE.Vector3(-1, 0, -3),
  lookout: new THREE.Vector3(2, 0, -18),
}
const VEHICLE_PARKING = {
  bicycle: new THREE.Vector3(3.2, 0, 11.4),
  car: new THREE.Vector3(8.2, 0, 10.8),
  rover: new THREE.Vector3(-20.5, 0, 12.2),
  ship: new THREE.Vector3(13.5, 0, -20.5),
} satisfies Record<VehicleKind, THREE.Vector3>
export const HOME_INTERIOR_ORIGIN = new THREE.Vector3(-7, 0, 6)
export const HOME_INTERIOR_EXIT = LOCATIONS.homeDoor.clone()
export const HABITAT_DOOR_LOCAL = new THREE.Vector3(0, 0.82, 2.03)
// The indoor shell stays inside the exterior pod's footprint. Floorplan
// coordinates use the same doorway and usable bounds as this room.
const INTERIOR_ROOM = {
  width: 10.8,
  depth: 8.2,
  halfWidth: 5.4,
  front: 4.55,
  back: 3.65,
  centerZ: 0.45,
}

export type Pickup = {
  id: string
  item: Extract<ItemId, '贝壳' | '蓝莓' | '野花' | '木材' | '石料' | '香草'>
  position: THREE.Vector3
  object: THREE.Group
  active: boolean
}

export type HiddenFind = {
  id: string
  item: Extract<ItemId, '星砂' | '荧光菌'>
  position: THREE.Vector3
  object: THREE.Group
}

export type Bird = {
  id: string
  species: BirdSpecies
  position: THREE.Vector3
  object: THREE.Group
}

export type UnknownCreature = {
  id: string
  species: UnknownCreatureSpecies
  position: THREE.Vector3
  object: THREE.Group
  anchor: THREE.Vector3
  patrolRadius: number
  patrolSpeed: number
  phase: number
}

export type VehicleKind = 'bicycle' | 'car' | 'rover' | 'ship'

export type VehicleInfo = {
  kind: VehicleKind
  name: string
  object: THREE.Group
}

type AirTraffic = {
  object: THREE.Group
  anchor: THREE.Vector3
  radius: number
  speed: number
  phase: number
  altitude: number
}

export type Resident = {
  id: string
  name: string
  greeting: string
  position: THREE.Vector3
  object: THREE.Group
  role: 'neighbor' | 'quest' | 'merchant' | 'fisher' | 'mayor' | 'scientist' | 'doctor' | 'musician' | 'chef' | 'child' | 'native'
  appearance: AvatarAppearance
  rig: HumanoidRig
}

export type WaterState = 'dry' | 'shallow' | 'deep'

const mat = (color: THREE.ColorRepresentation, roughness = 0.92) => new THREE.MeshStandardMaterial({ color, roughness })
const clay = {
  // Muted base materials keep the authored glow and sky readable. Saturation is reserved for
  // focal flora, windows and navigation accents rather than every surface in the frame.
  grass: mat('#668f82'), grassLight: mat('#a8cdb1'), sand: mat('#b99783'), water: mat('#3b9fa4', 0.22),
  wall: mat('#b48798'), peach: mat('#d58a83'), roof: mat('#5e537f'), wood: mat('#ad806c'),
  bark: mat('#65505a'), leaf: mat('#4f8c78'), leafLight: mat('#a9d19f'), flower: mat('#d786b1'),
  cream: mat('#e7dcc0'), dark: mat('#293e58'), window: mat('#69c9c5'), soil: mat('#76596f'),
}

const cloudNightColor = new THREE.Color('#8d83d8')
const cloudTwilightColor = new THREE.Color('#ffb4d2')
const cloudDayColor = new THREE.Color('#fff3cf')
const cloudColorTemp = new THREE.Color()
const RIVER_ROUTE = [
  [-30, -18], [-22, -13], [-15, -7], [-7, -5], [2, -5.6], [10, -5], [19, -1.5], [30, 2],
] as const

function distanceToSegment2d(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax
  const dz = bz - az
  const lengthSq = dx * dx + dz * dz
  const t = lengthSq > 0 ? THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / lengthSq, 0, 1) : 0
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t))
}

export function getRollingTerrainHeight(x: number, z: number, radius = 54.5): number {
  const distance = Math.hypot(x, z)
  const edgeLift = THREE.MathUtils.smoothstep(distance, radius * 0.44, radius) * 0.12
  const lowHills = Math.exp(-((x + 22) ** 2 + (z + 18) ** 2) / 360) * 0.42
    + Math.exp(-((x - 25) ** 2 + (z - 12) ** 2) / 300) * 0.36
    + Math.exp(-((x + 31) ** 2 + (z - 13) ** 2) / 260) * 0.32
  const softNoise = Math.sin(x * 0.17 + z * 0.09) * Math.cos(z * 0.14 - x * 0.04) * 0.085
  let riverDistance = Infinity
  for (let i = 0; i < RIVER_ROUTE.length - 1; i += 1) {
    const start = RIVER_ROUTE[i]
    const end = RIVER_ROUTE[i + 1]
    riverDistance = Math.min(riverDistance, distanceToSegment2d(x, z, start[0], start[1], end[0], end[1]))
  }
  const riverCut = Math.exp(-(riverDistance ** 2) / (2 * 1.9 ** 2)) * 0.16
  return 0.14 + edgeLift * 0.45 + lowHills * 0.20 + softNoise * 0.65 - riverCut
}

export function createRollingTerrainGeometry(radius = 54.5, segments = 84): THREE.BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const side = segments + 1
  for (let row = 0; row <= segments; row += 1) {
    const z = ((row / segments) * 2 - 1) * radius
    for (let column = 0; column <= segments; column += 1) {
      const x = ((column / segments) * 2 - 1) * radius
      const height = getRollingTerrainHeight(x, z, radius)
      const variation = (Math.sin(x * 0.22 + z * 0.11) + Math.cos(z * 0.18 - x * 0.08) + 2) * 0.25
      const terrainColor = new THREE.Color().setHSL(0.35 + variation * 0.008, 0.38, 0.61 + height * 0.08 + variation * 0.018)
      positions.push(x, height, z)
      colors.push(terrainColor.r, terrainColor.g, terrainColor.b)
      uvs.push(column / segments * 14, row / segments * 14)
    }
  }
  for (let row = 0; row < segments; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const a = row * side + column
      const b = a + 1
      const c = a + side
      const d = c + 1
      const triangleInside = (i0: number, i1: number, i2: number): boolean => {
        const inside = (index: number): boolean => {
          const offset = index * 3
          return Math.hypot(positions[offset], positions[offset + 2]) <= radius
        }
        return inside(i0) && inside(i1) && inside(i2)
      }
      if (triangleInside(a, c, b)) indices.push(a, c, b)
      if (triangleInside(b, c, d)) indices.push(b, c, d)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

function box(parent: THREE.Object3D, size: [number, number, number], color: THREE.Material, pos: [number, number, number]): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), color)
  mesh.position.set(...pos)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function sphere(parent: THREE.Object3D, radius: number, color: THREE.Material, pos: [number, number, number], scale: [number, number, number] = [1, 1, 1]): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), color)
  mesh.position.set(...pos)
  mesh.scale.set(...scale)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function capsule(parent: THREE.Object3D, color: THREE.Material, pos: [number, number, number], radius: number, length: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 8), color)
  mesh.position.set(...pos)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function addTree(scene: THREE.Scene, x: number, z: number, size = 1): THREE.Group {
  const tree = new THREE.Group()
  tree.userData.worldAssetFallback = 'alien-tree'
  tree.userData.sourceScale = size
  tree.position.set(x, 0, z)
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.05 * size, 0),
    new THREE.Vector3(0.16 * size, 0.85 * size, 0.06 * size),
    new THREE.Vector3(-0.14 * size, 1.65 * size, -0.04 * size),
    new THREE.Vector3(0.04 * size, 2.48 * size, 0),
  ])
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(trunkCurve, 18, 0.18 * size, 10, false), clay.bark)
  trunk.castShadow = true
  tree.add(trunk)
  const barkGlow = new THREE.MeshStandardMaterial({ color: '#35515c', emissive: '#1f8e91', emissiveIntensity: 0.28, roughness: 0.72 })
  for (const side of [-1, 1]) {
    const branch = new THREE.Mesh(new THREE.CapsuleGeometry(0.10 * size, 0.88 * size, 5, 8), barkGlow)
    branch.position.set(side * 0.39 * size, 1.32 * size, 0.03 * size)
    branch.rotation.z = side * -0.48
    tree.add(branch)
  }
  const crownMaterial = new THREE.MeshStandardMaterial({ color: '#398f84', emissive: '#185f5f', emissiveIntensity: 0.18, roughness: 0.56 })
  const leafMaterial = new THREE.MeshStandardMaterial({ color: '#76c8a4', emissive: '#2b8d76', emissiveIntensity: 0.28, roughness: 0.44 })
  const crownGeometry = new THREE.SphereGeometry(1, 20, 14)
  for (const [xOffset, yOffset, zOffset, xScale, yScale, zScale, material] of [
    [-0.72, 2.18, 0.04, 1.12, 0.46, 0.66, crownMaterial],
    [0.62, 2.30, -0.18, 0.92, 0.42, 0.62, leafMaterial],
    [0.05, 2.75, 0.10, 1.00, 0.52, 0.70, crownMaterial],
  ] as const) {
    const crown = new THREE.Mesh(crownGeometry, material)
    crown.position.set(xOffset * size, yOffset * size, zOffset * size)
    crown.scale.set(xScale * size, yScale * size, zScale * size)
    crown.rotation.y = xOffset * 0.6
    crown.castShadow = true
    tree.add(crown)
  }
  // Small bioluminescent fruit make the silhouette feel alive at a distance.
  const fruitMaterial = new THREE.MeshStandardMaterial({ color: '#a9f5df', emissive: '#37d4c0', emissiveIntensity: 0.9, roughness: 0.24 })
  for (const [fx, fy, fz] of [[-0.62, 1.84, 0.25], [0.42, 2.10, 0.30], [0.08, 2.44, -0.18]] as const) {
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.11 * size, 10, 8), fruitMaterial)
    fruit.position.set(fx * size, fy * size, fz * size)
    fruit.userData.glow = true
    tree.add(fruit)
  }
  scene.add(tree)
  return tree
}

function addHouse(scene: THREE.Scene, x: number, z: number, scale: number, wall: THREE.Material, roof: THREE.Material, angle = 0): THREE.Group {
  const home = new THREE.Group()
  home.userData.worldAssetFallback = 'habitat-pod'
  home.position.set(x, 0, z)
  home.rotation.y = angle
  home.scale.setScalar(scale)
  // Homes are pressure-rated habitat pods rather than Earth-like cottages.
  // The capsule body gives the silhouette a clear sci-fi read even before the
  // emissive trim and portholes catch the light.
  const shell = new THREE.Mesh(new THREE.CapsuleGeometry(1, 1.12, 8, 24), wall)
  shell.position.set(0, 1.45, 0)
  shell.scale.set(2.2, 1.02, 1.82)
  shell.castShadow = true
  shell.receiveShadow = true
  home.add(shell)
  shell.userData.homePart = 'wall'
  const roofMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), roof)
  roofMesh.position.set(0, 2.65, 0)
  roofMesh.scale.set(2.52, 1.12, 2.2)
  roofMesh.castShadow = true
  roofMesh.userData.homePart = 'roof'
  home.add(roofMesh)
  const entry = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.09, 10, 32), clay.cream)
  entry.position.set(0, 0.92, 2.03)
  entry.userData.homePart = 'trim'
  home.add(entry)
  const door = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), clay.wood)
  door.scale.set(0.63, 0.88, 0.16)
  door.position.set(0, 0.82, 1.98)
  door.userData.homePart = 'door'
  home.add(door)
  const threshold = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.11, 8, 24, Math.PI), clay.roof)
  threshold.rotation.z = Math.PI
  threshold.position.set(0, 0.14, 2.04)
  threshold.userData.homePart = 'roof'
  home.add(threshold)
  for (const wx of [-1.2, 1.2]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.075, 8, 20), clay.cream)
    ring.position.set(wx, 1.65, 1.78)
    ring.userData.homePart = 'trim'
    home.add(ring)
    const window = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), clay.window)
    window.scale.z = 0.16
    window.position.set(wx, 1.65, 1.75)
    window.userData.homePart = 'window'
    home.add(window)
  }
  const crown = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.065, 8, 44), clay.cream)
  crown.rotation.x = Math.PI / 2
  crown.position.y = 2.72
  crown.userData.homePart = 'trim'
  home.add(crown)
  const holo = new THREE.MeshStandardMaterial({ color: '#a8fff1', emissive: '#38cfc2', emissiveIntensity: 2.2, roughness: 0.18, metalness: 0.35 })
  const energyRing = new THREE.Mesh(new THREE.TorusGeometry(2.18, 0.045, 8, 56), holo)
  energyRing.rotation.x = Math.PI / 2
  energyRing.position.y = 2.95
  energyRing.userData.homePart = 'trim'
  home.add(energyRing)
  for (const y of [0.62, 2.18]) {
    const seam = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.032, 7, 48), holo)
    seam.rotation.x = Math.PI / 2
    seam.position.y = y
    seam.userData.homePart = 'trim'
    home.add(seam)
  }
  // A shallow airlock collar and three landing struts anchor the pod to the
  // landscape, making the front door legible from the playable camera.
  const airlock = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.07, 10, 32), holo)
  airlock.position.set(0, 0.94, 2.08)
  airlock.rotation.x = Math.PI / 2
  airlock.userData.homePart = 'trim'
  home.add(airlock)
  for (const [px, pz] of [[-1.35, -0.78], [1.35, -0.78], [0, 1.25]] as const) {
    const strut = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.45, 4, 8), holo)
    strut.position.set(px, 0.25, pz)
    strut.rotation.z = px === 0 ? 0 : px < 0 ? -0.22 : 0.22
    strut.userData.homePart = 'trim'
    home.add(strut)
  }
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 1.42, 4, 8), holo)
    fin.position.set(side * 1.83, 1.55, -0.28)
    fin.rotation.z = side * -0.14
    fin.userData.homePart = 'trim'
    home.add(fin)
    const windowBand = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.045, 7, 28), holo)
    windowBand.rotation.x = Math.PI / 2
    windowBand.position.set(side * 1.28, 1.67, 1.82)
    windowBand.userData.homePart = 'trim'
    home.add(windowBand)
  }
  const antenna = new THREE.Group()
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.065, 0.82, 8), holo)
  mast.position.y = 3.38
  antenna.add(mast)
  const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 1), new THREE.MeshStandardMaterial({ color: '#ffe6a6', emissive: '#ffb95c', emissiveIntensity: 2.8, roughness: 0.2 }))
  beacon.position.y = 3.86
  antenna.add(beacon)
  home.add(antenna)
  scene.add(home)
  return home
}

function applyHomePalette(home: THREE.Group, style: BuildingStyle): void {
  const palette: Record<BuildingStyle, { wall: string; roof: string; door: string; trim: string; window: string }> = {
    海风奶油: { wall: '#255a70', roof: '#3f2474', door: '#112d49', trim: '#95fff0', window: '#63eaf3' },
    花园薄荷: { wall: '#246b68', roof: '#1f5f78', door: '#102f4c', trim: '#a2ffe0', window: '#70f2de' },
    暮光珊瑚: { wall: '#6a3e78', roof: '#4b205c', door: '#25163f', trim: '#ffb3e8', window: '#d98cff' },
  }
  const colors = palette[style]
  home.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return
    const part = node.userData.homePart as string | undefined
    const color = part === 'wall' ? colors.wall : part === 'roof' ? colors.roof : part === 'door' ? colors.door : part === 'window' ? colors.window : part === 'trim' ? colors.trim : undefined
    if (!color) return
    const material = Array.isArray(node.material) ? node.material[0] : node.material
    if (material instanceof THREE.MeshStandardMaterial) material.color.set(color)
  })
}

function addFlower(scene: THREE.Scene, x: number, z: number, petal: THREE.Material): void {
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.48, 5), clay.leaf)
  stem.position.set(x, 0.24, z)
  scene.add(stem)
  sphere(scene, 0.15, petal, [x, 0.53, z], [1, 0.72, 1])
  sphere(scene, 0.06, mat('#f4d37c'), [x, 0.54, z], [1, 1, 1])
}

function makePickup(id: string, item: Pickup['item'], x: number, z: number): Pickup {
  const group = new THREE.Group()
  group.position.set(x, 0.1, z)
  if (item === '贝壳') {
    const shell = sphere(group, 0.28, mat('#fff0df'), [0, 0.18, 0], [1.15, 0.65, 0.82])
    shell.rotation.z = -0.16
    for (let i = -1; i <= 1; i += 1) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 5, 12, Math.PI), mat('#e9b99e'))
      rib.rotation.x = Math.PI / 2
      rib.rotation.z = i * 0.32
      rib.position.set(i * 0.09, 0.28, -0.08)
      group.add(rib)
    }
  } else if (item === '蓝莓') {
    sphere(group, 0.19, mat('#537997'), [-0.12, 0.22, 0], [1, 1, 1])
    sphere(group, 0.17, mat('#718eb0'), [0.13, 0.28, 0.06], [1, 1, 1])
    sphere(group, 0.15, mat('#445f82'), [0, 0.43, -0.03], [1, 1, 1])
    sphere(group, 0.06, clay.leaf, [0.08, 0.62, 0], [0.45, 1.2, 0.45])
  } else if (item === '野花') {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.35, 5), clay.leaf)
    stem.position.y = 0.23
    group.add(stem)
    sphere(group, 0.14, mat('#ef9cad'), [0, 0.46, 0], [1, 0.8, 1])
    sphere(group, 0.06, mat('#f4d37c'), [0, 0.48, 0], [1, 1, 1])
  } else if (item === '木材') {
    const log = box(group, [0.72, 0.18, 0.2], mat('#a97851'), [0, 0.22, 0])
    log.rotation.z = -0.16
    const cut = sphere(group, 0.11, mat('#e0b281'), [0.34, 0.27, 0.015], [1, 0.78, 0.2])
    cut.rotation.z = -0.16
  } else if (item === '香草') {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.55, 5), clay.leaf)
    stem.position.y = 0.3
    group.add(stem)
    for (const angle of [-0.6, 0, 0.6]) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), clay.leafLight)
      leaf.scale.set(0.45, 0.85, 0.25)
      leaf.position.set(Math.sin(angle) * 0.12, 0.35 + Math.cos(angle) * 0.11, 0)
      leaf.rotation.z = angle
      group.add(leaf)
    }
  } else {
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.27, 0), mat('#9b9d91'))
    stone.position.y = 0.26
    stone.scale.set(1.15, 0.85, 0.95)
    group.add(stone)
    sphere(group, 0.055, mat('#d7d3c5'), [-0.08, 0.39, 0.19], [1, 0.45, 0.5])
  }
  sceneAddShadow(group)
  return { id, item, position: new THREE.Vector3(x, 0, z), object: group, active: true }
}

function sceneAddShadow(object: THREE.Object3D): void {
  object.traverse(node => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = true
      node.receiveShadow = true
    }
  })
}

function addResident(scene: THREE.Scene, id: string, name: string, greeting: string, x: number, z: number, role: Resident['role'], appearance: AvatarAppearance): Resident {
  const group = new THREE.Group()
  group.position.set(x, 0, z)
  const rig = createHumanoid(appearance)
  group.add(rig.root)
  if (role === 'child') group.scale.setScalar(0.78)
  addResidentRoleProp(rig.root, role)
  const marker = new THREE.Group()
  const halo = new THREE.Mesh(new THREE.TorusGeometry(role === 'merchant' ? 0.38 : 0.30, 0.055, 7, 20), mat(role === 'merchant' ? '#e3b85f' : '#f3c968'))
  halo.position.y = 2.56
  marker.add(halo)
  sphere(marker, 0.11, mat('#f9efcd'), [0, 2.56, 0], [1, 1, 1])
  group.add(marker)
  scene.add(group)
  return { id, name, greeting, position: new THREE.Vector3(x, 0, z), object: group, role, appearance, rig }
}

function buildModel(kind: BuildingKind, ghost = false, style: BuildingStyle = '海风奶油'): THREE.Group {
  const group = new THREE.Group()
  const choose = (color: string) => ghost
    ? new THREE.MeshStandardMaterial({ color: '#88b39b', roughness: 1, transparent: true, opacity: 0.5, depthWrite: false })
    : mat(color)
  const stylePalette: Record<BuildingStyle, { wood: string; wall: string; roof: string; pot: string }> = {
    海风奶油: { wood: '#496e78', wall: '#78b9ad', roof: '#7156a6', pot: '#c778a9' },
    花园薄荷: { wood: '#356c69', wall: '#8fd0b0', roof: '#3d9b90', pot: '#7fd3c0' },
    暮光珊瑚: { wood: '#5b477e', wall: '#cf8ec1', roof: '#b76393', pot: '#e68eaa' },
  }
  const selected = stylePalette[style]
  const wood = choose(selected.wood)
  const pale = choose(selected.wall)
  const pot = choose(selected.pot)
  if (kind === '小屋') {
    const shell = new THREE.Mesh(new THREE.CapsuleGeometry(1, 0.88, 8, 20), pale)
    shell.position.y = 1.24
    shell.scale.set(2.02, 0.94, 1.72)
    group.add(shell)
    const roof = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), choose(selected.roof))
    roof.position.y = 2.16
    roof.scale.set(2.14, 1.05, 1.88)
    roof.castShadow = true
    group.add(roof)
    const door = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), wood)
    door.position.set(0, 0.73, 1.73)
    door.scale.set(0.64, 0.88, 0.16)
    group.add(door)
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.08, 8, 24), choose('#9debdc'))
    arch.position.set(0, 0.82, 1.78)
    group.add(arch)
    for (const x of [-1.05, 1.05]) {
      const porthole = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), choose('#80dbe5'))
      porthole.position.set(x, 1.38, 1.57)
      porthole.scale.z = 0.2
      group.add(porthole)
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 7, 18), wood)
      rim.position.copy(porthole.position)
      group.add(rim)
    }
    const landing = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.08, 7, 32), choose('#73d8cc'))
    landing.rotation.x = Math.PI / 2
    landing.position.y = 0.12
    group.add(landing)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.68, 0.045, 7, 40), choose('#a9fff0'))
    ring.rotation.x = Math.PI / 2
    ring.position.y = 2.58
    group.add(ring)
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.72, 4, 8), choose('#a9fff0'))
      fin.position.set(side * 1.72, 1.45, -0.30)
      fin.rotation.z = side * -0.18
      group.add(fin)
    }
  } else if (kind === '厨房') {
    box(group, [1.65, 0.8, 0.68], wood, [0, 0.55, 0])
    box(group, [1.45, 0.12, 0.62], pale, [0, 1.0, 0])
    for (const x of [-0.48, 0.48]) sphere(group, 0.13, choose('#df9c79'), [x, 1.17, 0])
  } else if (kind === '床铺') {
    box(group, [1.55, 0.35, 2.2], wood, [0, 0.25, 0])
    box(group, [1.45, 0.22, 1.55], choose('#d9b7a8'), [0, 0.55, 0.18])
    box(group, [1.45, 0.55, 0.14], wood, [0, 0.72, -0.9])
  } else if (kind === '室内墙体') {
    box(group, [3.35, 2.75, 0.14], pale, [0, 1.38, 0])
    box(group, [0.10, 2.92, 0.20], wood, [-1.56, 1.46, 0])
    box(group, [0.10, 2.92, 0.20], wood, [1.56, 1.46, 0])
    box(group, [3.48, 0.10, 0.20], wood, [0, 2.84, 0])
  } else if (kind === '室内隔断') {
    box(group, [1.9, 2.15, 0.12], pale, [0, 1.08, 0])
    for (const x of [-0.72, -0.24, 0.24, 0.72]) box(group, [0.07, 2.42, 0.16], wood, [x, 1.21, 0.04])
    box(group, [2.05, 0.10, 0.18], wood, [0, 2.28, 0])
  } else if (kind === '室内地板') {
    box(group, [1.62, 0.07, 1.18], choose('#b89472'), [0, 0.04, 0])
    box(group, [1.48, 0.025, 0.035], wood, [0, 0.09, -0.54])
    box(group, [1.48, 0.025, 0.035], wood, [0, 0.09, 0.54])
  } else if (kind === '室内窗') {
    box(group, [1.55, 2.05, 0.12], pale, [0, 1.03, 0])
    box(group, [1.16, 1.30, 0.08], choose('#82b9bd'), [0, 1.08, 0.09])
    box(group, [0.08, 1.38, 0.12], wood, [0, 1.08, 0.15])
    box(group, [1.30, 0.08, 0.12], wood, [0, 1.08, 0.15])
  } else if (kind === '室内门') {
    // A full-height portal: the arch and cyan inset keep an imported door
    // visually distinct from a non-bearing partition.
    box(group, [1.38, 2.72, 0.14], wood, [0, 1.36, 0])
    box(group, [1.08, 2.38, 0.08], choose('#4b7180'), [0, 1.26, 0.10])
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), choose('#e4c981'))
    handle.position.set(0.34, 1.32, 0.18)
    group.add(handle)
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.06, 7, 20, Math.PI), choose('#8de8dc'))
    arch.position.set(0, 2.48, 0.17)
    arch.rotation.z = Math.PI
    group.add(arch)
  } else if (kind === '室内衣柜') {
    box(group, [1.56, 2.30, 0.56], wood, [0, 1.16, 0])
    box(group, [0.68, 2.06, 0.06], pale, [-0.40, 1.16, 0.30])
    box(group, [0.68, 2.06, 0.06], pale, [0.40, 1.16, 0.30])
    for (const x of [-0.08, 0.08]) sphere(group, 0.045, choose('#d8c27d'), [x, 1.16, 0.36])
  } else if (kind === '室内沙发') {
    box(group, [2.05, 0.42, 0.90], choose('#739da4'), [0, 0.43, 0])
    box(group, [2.05, 0.86, 0.20], pale, [0, 0.93, -0.36])
    box(group, [0.18, 0.75, 0.98], wood, [-0.94, 0.68, 0])
    box(group, [0.18, 0.75, 0.98], wood, [0.94, 0.68, 0])
    for (const x of [-0.55, 0.55]) box(group, [0.46, 0.14, 0.46], choose('#a8d6cf'), [x, 0.72, 0.04])
  } else if (kind === '室内桌子') {
    box(group, [1.58, 0.16, 0.92], wood, [0, 1.03, 0])
    for (const x of [-0.62, 0.62]) for (const z of [-0.32, 0.32]) box(group, [0.10, 0.98, 0.10], wood, [x, 0.52, z])
    box(group, [1.20, 0.06, 0.08], pale, [0, 1.15, 0])
  } else if (kind === '室内椅子') {
    box(group, [0.58, 0.14, 0.58], wood, [0, 0.72, 0])
    box(group, [0.58, 0.72, 0.12], pale, [0, 1.08, -0.22])
    for (const x of [-0.21, 0.21]) for (const z of [-0.21, 0.21]) box(group, [0.07, 0.62, 0.07], wood, [x, 0.34, z])
  } else if (kind === '室内灯') {
    const glow = choose('#d9f6cb')
    if (glow instanceof THREE.MeshStandardMaterial) { glow.emissive.set('#c1f2aa'); glow.emissiveIntensity = ghost ? 0.5 : 2.4 }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.34, 8), wood)
    stem.position.y = 0.78
    group.add(stem)
    const shade = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), glow)
    shade.scale.y = 0.55
    shade.position.y = 1.45
    group.add(shade)
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.035, 7, 24), choose('#a7fff0'))
    halo.rotation.x = Math.PI / 2
    halo.position.y = 1.44
    group.add(halo)
  } else if (kind === '花盆') {
    const vessel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.31, 0.38, 8), pot)
    vessel.position.y = 0.42
    group.add(vessel)
    sphere(group, 0.22, choose('#6f9a73'), [0, 0.72, 0], [0.7, 1.2, 0.7])
    sphere(group, 0.22, choose('#ed9a9d'), [0.10, 0.87, 0.02], [0.8, 0.66, 0.75])
  } else if (kind === '长椅') {
    box(group, [1.25, 0.16, 0.42], wood, [0, 0.62, 0])
    box(group, [1.25, 0.16, 0.16], wood, [0, 0.98, -0.15])
    for (const x of [-0.48, 0.48]) {
      box(group, [0.12, 0.57, 0.12], wood, [x, 0.33, -0.08])
      box(group, [0.12, 0.57, 0.12], wood, [x, 0.33, 0.18])
    }
    for (const x of [-0.58, 0.58]) box(group, [0.12, 0.54, 0.12], wood, [x, 0.78, -0.15])
  } else if (kind === '路灯') {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.11, 1.55, 7), wood)
    stem.position.y = 0.93
    group.add(stem)
    sphere(group, 0.28, choose('#f4dc9e'), [0, 1.83, 0], [0.82, 0.9, 0.82])
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.2, 8), pale)
    cap.position.y = 2.06
    group.add(cap)
  } else if (kind === '木栅栏') {
    for (const x of [-0.62, 0, 0.62]) {
      box(group, [0.11, 0.82, 0.12], wood, [x, 0.54, 0])
      sphere(group, 0.07, pale, [x, 0.98, 0], [1, 0.65, 1])
    }
    box(group, [1.36, 0.12, 0.12], wood, [0, 0.42, 0])
    box(group, [1.36, 0.12, 0.12], wood, [0, 0.76, 0])
  } else {
    box(group, [0.16, 0.70, 0.16], wood, [0, 0.43, 0])
    box(group, [0.48, 0.42, 0.31], choose('#e1aa76'), [0, 0.88, 0.06])
    box(group, [0.34, 0.06, 0.35], pale, [0, 1.13, 0.05])
    box(group, [0.08, 0.08, 0.03], choose('#785b4c'), [0.12, 0.9, 0.23])
  }
  return group
}

function makeBicycle(): { root: THREE.Group; wheels: THREE.Mesh[] } {
  const root = new THREE.Group()
  // The authored bike points toward local -Z while the character's authored
  // front is +Z. Flip the bicycle once so both front ends share the same
  // heading when the rider mounts and the vehicle receives the player's yaw.
  root.rotation.y = Math.PI
  const rubber = mat('#53635c')
  const frame = mat('#d98566')
  const metal = mat('#e8d7b5')
  const wheels: THREE.Mesh[] = []
  for (const z of [-0.58, 0.58]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.055, 8, 18), rubber)
    wheel.rotation.y = Math.PI / 2
    wheel.position.set(0, 0.42, z)
    wheel.castShadow = true
    root.add(wheel)
    wheels.push(wheel)
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.72, 8), metal)
    axle.rotation.z = Math.PI / 2
    axle.position.set(0, 0.42, z)
    root.add(axle)
  }
  const beam = (a: THREE.Vector3, b: THREE.Vector3, radius: number, color: THREE.Material) => {
    const delta = b.clone().sub(a)
    const piece = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 7), color)
    piece.position.copy(a).add(b).multiplyScalar(0.5)
    piece.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize())
    piece.castShadow = true
    root.add(piece)
  }
  const rear = new THREE.Vector3(0, 0.42, 0.58)
  const front = new THREE.Vector3(0, 0.42, -0.58)
  const crank = new THREE.Vector3(0, 0.50, 0.05)
  const seat = new THREE.Vector3(0, 0.94, 0.37)
  const handle = new THREE.Vector3(0, 1.08, -0.50)
  beam(rear, crank, 0.04, frame)
  beam(crank, seat, 0.04, frame)
  beam(seat, rear, 0.04, frame)
  beam(crank, front, 0.04, frame)
  beam(front, handle, 0.04, frame)
  beam(seat, handle, 0.035, frame)
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.32), mat('#775b4b'))
  saddle.position.set(0, 0.98, 0.39)
  root.add(saddle)
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.07), metal)
  bar.position.copy(handle)
  root.add(bar)
  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.28, 0.36), mat('#d6b887'))
  basket.position.set(0, 1.05, -0.72)
  root.add(basket)
  return { root, wheels }
}

function makeFutureCar(): { root: THREE.Group; wheels: THREE.Mesh[] } {
  const root = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.58, 3.35), mat('#314d69', 0.28))
  body.position.y = 0.58
  body.castShadow = true
  root.add(body)
  const cabin = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshStandardMaterial({ color: '#7cd4df', metalness: 0.42, roughness: 0.18, transparent: true, opacity: 0.82 }))
  cabin.scale.set(0.82, 0.42, 1.05)
  cabin.position.set(0, 1.02, -0.08)
  root.add(cabin)
  const light = new THREE.MeshStandardMaterial({ color: '#a7f5ea', emissive: '#43d6ce', emissiveIntensity: 2.6, roughness: 0.2 })
  for (const z of [-1.45, 1.45]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.08), light)
    bumper.position.set(0, 0.55, z)
    root.add(bumper)
  }
  const wheels: THREE.Mesh[] = []
  for (const x of [-0.93, 0.93]) for (const z of [-1.05, 1.05]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.18, 14), mat('#182936', 0.4))
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(x, 0.36, z)
    root.add(wheel)
    wheels.push(wheel)
  }
  return { root, wheels }
}

function makeRover(): { root: THREE.Group; wheels: THREE.Mesh[]; thrusters: THREE.Mesh[] } {
  const root = new THREE.Group()
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.72, 3.5), new THREE.MeshStandardMaterial({ color: '#8b6d55', metalness: 0.34, roughness: 0.5 }))
  hull.position.y = 0.78
  hull.castShadow = true
  root.add(hull)
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshStandardMaterial({ color: '#9fe9ef', emissive: '#245e74', emissiveIntensity: 0.4, metalness: 0.35, roughness: 0.16, transparent: true, opacity: 0.86 }))
  canopy.scale.set(0.92, 0.48, 0.86)
  canopy.position.set(0, 1.35, -0.18)
  root.add(canopy)
  const panel = mat('#d7b27a', 0.34)
  for (const x of [-1.2, 1.2]) {
    for (const z of [-1.1, 1.1]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 10), panel)
      strut.position.set(x, 0.42, z)
      root.add(strut)
    }
  }
  const wheels: THREE.Mesh[] = []
  for (const x of [-1.2, 1.2]) for (const z of [-1.18, 1.18]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.28, 14), mat('#273746', 0.62))
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(x, 0.42, z)
    root.add(wheel)
    wheels.push(wheel)
  }
  const thrusters: THREE.Mesh[] = []
  const glow = new THREE.MeshStandardMaterial({ color: '#9eeff0', emissive: '#42c9e4', emissiveIntensity: 2.8, roughness: 0.2 })
  for (const x of [-0.7, 0.7]) {
    const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 8), glow)
    nozzle.rotation.x = Math.PI / 2
    nozzle.position.set(x, 0.74, 1.9)
    root.add(nozzle)
    thrusters.push(nozzle)
  }
  return { root, wheels, thrusters }
}

function makeSpaceship(): { root: THREE.Group; glow: THREE.Mesh } {
  const root = new THREE.Group()
  const hullMaterial = new THREE.MeshStandardMaterial({ color: '#536e9f', metalness: 0.78, roughness: 0.19 })
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), hullMaterial)
  hull.scale.set(3.15, 0.72, 4.45)
  hull.position.y = 1.10
  root.add(hull)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(4.85, 0.16, 5.95), new THREE.MeshStandardMaterial({ color: '#223b5c', metalness: 0.65, roughness: 0.26 }))
  floor.position.set(0, 0.36, -0.02)
  floor.castShadow = true
  floor.receiveShadow = true
  root.add(floor)
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), new THREE.MeshStandardMaterial({ color: '#8de9ed', emissive: '#2c7f9b', emissiveIntensity: 0.9, metalness: 0.58, roughness: 0.12, transparent: true, opacity: 0.62, depthWrite: false }))
  canopy.scale.set(2.72, 1.42, 3.42)
  canopy.position.set(0, 2.00, -0.20)
  root.add(canopy)
  const cockpitGlow = new THREE.MeshStandardMaterial({ color: '#b5fff5', emissive: '#45d9cf', emissiveIntensity: 2.5, roughness: 0.18, metalness: 0.3 })
  const console = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.42, 0.52), cockpitGlow)
  console.position.set(0, 1.05, -2.08)
  root.add(console)
  for (const side of [-1, 1]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.28, 1.36), new THREE.MeshStandardMaterial({ color: '#7c8dcc', metalness: 0.4, roughness: 0.28 }))
    seat.position.set(side * 0.72, 0.68, 0.02)
    root.add(seat)
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 2.85, 8), cockpitGlow)
    strut.position.set(side * 2.35, 2.0, -0.22)
    strut.rotation.z = side * 0.12
    root.add(strut)
  }
  const wingMat = mat('#d5a3e2', 0.2)
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.16, 3.55), wingMat)
    wing.rotation.z = side * -0.12
    wing.position.set(side * 3.25, 0.93, 0.36)
    root.add(wing)
  }
  const engineGlowMaterial = new THREE.MeshStandardMaterial({ color: '#b7ffff', emissive: '#48dfea', emissiveIntensity: 3.4, transparent: true, opacity: 0.82 })
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.70, 2.7, 14), hullMaterial)
    pod.rotation.x = Math.PI / 2
    pod.position.set(side * 1.72, 0.94, 3.25)
    root.add(pod)
  }
  const glow = new THREE.Mesh(new THREE.ConeGeometry(0.70, 2.35, 12), engineGlowMaterial)
  glow.rotation.x = -Math.PI / 2
  glow.position.set(0, 0.92, 4.68)
  root.add(glow)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.02, 0.075, 10, 64), new THREE.MeshStandardMaterial({ color: '#8af7ef', emissive: '#35c5cd', emissiveIntensity: 2.2, metalness: 0.4 }))
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0.34
  root.add(ring)
  return { root, glow }
}

function makeAirTrafficCraft(scale = 1): THREE.Group {
  const craft = new THREE.Group()
  craft.scale.setScalar(scale)
  const hull = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 10),
    new THREE.MeshStandardMaterial({ color: '#263d67', metalness: 0.82, roughness: 0.2, emissive: '#132d54', emissiveIntensity: 0.42 }),
  )
  hull.scale.set(1.65, 0.34, 3.35)
  craft.add(hull)
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 10),
    new THREE.MeshStandardMaterial({ color: '#8ee9ee', emissive: '#2b9cac', emissiveIntensity: 1.5, metalness: 0.45, roughness: 0.12, transparent: true, opacity: 0.78 }),
  )
  canopy.scale.set(0.84, 0.42, 1.38)
  canopy.position.set(0, 0.37, -0.42)
  craft.add(canopy)
  const trim = new THREE.MeshStandardMaterial({ color: '#b6fff2', emissive: '#42d6cf', emissiveIntensity: 2.8, metalness: 0.28, roughness: 0.2 })
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 2.2), trim)
    fin.position.set(side * 1.25, 0.02, 0.35)
    fin.rotation.z = side * -0.12
    craft.add(fin)
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 1.0, 10), trim)
    pod.rotation.x = Math.PI / 2
    pod.position.set(side * 0.9, -0.18, 1.8)
    craft.add(pod)
  }
  const engine = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.0, 10), trim)
  engine.rotation.x = -Math.PI / 2
  engine.position.set(0, -0.06, 3.12)
  engine.userData.airTrafficEngine = true
  craft.add(engine)
  craft.traverse(node => { if (node instanceof THREE.Mesh) node.castShadow = false })
  return craft
}

function makePetModel(kind: PetKind): THREE.Group {
  const pet = new THREE.Group()
  const p = (color: THREE.Material, position: [number, number, number], scale: [number, number, number], radius = 1) => sphere(pet, radius, color, position, scale)
  const fur = mat(kind === '小猫' ? '#d9a16f' : '#d4b98e')
  const cream = mat('#f4e4c9')
  const dark = mat('#46534d')
  p(fur, [0, 0.36, 0], [0.78, 0.68, 1.12], 0.34)
  p(fur, [0, 0.68, 0.27], [0.83, 0.84, 0.78], 0.30)
  if (kind === '小猫') {
    for (const x of [-0.19, 0.19]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.28, 5), fur)
      ear.position.set(x, 0.97, 0.28)
      ear.rotation.z = x < 0 ? 0.16 : -0.16
      pet.add(ear)
      p(mat('#e99791'), [x, 0.95, 0.33], [0.46, 0.72, 0.32], 0.08)
    }
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.07, 6, 12, Math.PI * 1.5), fur)
    tail.position.set(0, 0.56, -0.32)
    tail.rotation.y = Math.PI / 2
    pet.add(tail)
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.025, 6, 18), mat('#d77d76'))
    collar.rotation.x = Math.PI / 2
    collar.position.set(0, 0.57, 0.24)
    pet.add(collar)
    p(mat('#f0c56d'), [0, 0.54, 0.44], [0.8, 0.9, 0.8], 0.045)
    for (const side of [-1, 1]) {
      for (const y of [0.60, 0.68]) {
        const whisker = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.08, y, 0.51),
          new THREE.Vector3(side * 0.30, y + (y - 0.64) * 0.32, 0.53),
          new THREE.Vector3(side * 0.42, y + (y - 0.64) * 0.45, 0.52),
        ])
        pet.add(new THREE.Mesh(new THREE.TubeGeometry(whisker, 8, 0.008, 4, false), cream))
      }
    }
  } else {
    for (const x of [-0.27, 0.27]) {
      const ear = p(fur, [x, 0.64, 0.12], [0.38, 0.72, 0.5], 0.20)
      ear.rotation.z = x < 0 ? 0.3 : -0.3
    }
    p(cream, [0, 0.57, 0.53], [0.74, 0.48, 0.48], 0.18)
    p(dark, [0, 0.56, 0.69], [0.75, 0.72, 0.55], 0.075)
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.025, 6, 18), mat('#78a9a0'))
    collar.rotation.x = Math.PI / 2
    collar.position.set(0, 0.57, 0.18)
    pet.add(collar)
    p(mat('#f0c56d'), [0, 0.53, 0.39], [0.8, 0.9, 0.8], 0.045)
    const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.48, -0.29), new THREE.Vector3(0, 0.82, -0.50), new THREE.Vector3(0, 0.98, -0.72),
    ]), 10, 0.065, 6, false), fur)
    pet.add(tail)
  }
  for (const x of [-0.12, 0.12]) {
    p(cream, [x, 0.72, 0.50], [0.7, 0.84, 0.42], 0.055)
    p(dark, [x, 0.72, 0.54], [0.65, 0.8, 0.46], 0.032)
  }
  p(mat('#a96861'), [0, 0.61, 0.56], [1, 0.72, 0.72], 0.045)
  for (const x of [-0.20, 0.20]) {
    for (const z of [-0.12, 0.16]) {
      const leg = capsule(pet, fur, [x, 0.14, z], 0.07, 0.16)
      leg.rotation.x = -0.05
      p(cream, [x, 0.055, z + 0.045], [0.9, 0.42, 0.72], 0.065)
    }
  }
  p(mat('#e6bc76'), [0, 0.42, 0.60], [0.72, 0.32, 0.22], 0.08)
  return pet
}

export class VillageWorld {
  readonly scene = new THREE.Scene()
  // The world is deliberately large enough for the ship to leave the
  // atmosphere. Keep the far plane beyond the deep-space star layer so the
  // view does not collapse into a foggy blue wall while climbing.
  readonly camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 1800)
  readonly player = new THREE.Group()
  readonly vehicle = new THREE.Group()
  private readonly vehicleRider = new THREE.Group()
  readonly pet = new THREE.Group()
  readonly pickups: Pickup[] = []
  readonly residents: Resident[] = []
  readonly cropGroup = new THREE.Group()
  private playerRig!: HumanoidRig
  private playerAvatarGltf: GLTF | null = null
  private readonly cropPlants: THREE.Group[] = []
  private readonly decorations = new THREE.Group()
  private readonly buildingModels = new Map<string, THREE.Group>()
  /** Blender-authored PBR assets are optional at runtime; fallbacks stay alive until replacement. */
  private readonly worldAssets = new WorldAssetRegistry()
  private readonly habitatFallbacks: THREE.Group[] = []
  private readonly treeFallbacks: THREE.Group[] = []
  private readonly floraFallbacks: THREE.Group[] = []
  private worldAssetLoadPromise: Promise<WorldAssetLoadResult> | null = null
  private readonly clouds: THREE.Group[] = []
  private readonly rivers: THREE.Mesh[] = []
  private readonly trees: THREE.Group[] = []
  private readonly windPlants: THREE.Group[] = []
  private readonly alienFlora: THREE.Group[] = []
  private readonly celestial = new THREE.Group()
  private readonly meteors: Array<{ object: THREE.Group; start: THREE.Vector3; end: THREE.Vector3; delay: number; duration: number }> = []
  private readonly worldTime = new WorldTimeController()
  private hemiLight!: THREE.HemisphereLight
  private sunLight!: THREE.DirectionalLight
  private moonLight!: THREE.DirectionalLight
  private daylightSkyOverlay: THREE.Mesh | null = null
  private starLayer: THREE.Points | null = null
  private deepStarLayer: THREE.Points | null = null
  private galaxyLayer: THREE.Points | null = null
  private sunVisual: THREE.Mesh | null = null
  private sunCorona: THREE.Mesh | null = null
  private moonVisual: THREE.Mesh | null = null
  private moonRingVisual: THREE.Mesh | null = null
  private readonly emissiveMaterials = new Map<THREE.MeshStandardMaterial, number>()
  private readonly airTraffic: AirTraffic[] = []
  private readonly buildPreview = new THREE.Group()
  private buildPreviewKind: BuildingKind | null = null
  private buildPreviewRing: THREE.Mesh | null = null
  private readonly bicycleWheels: THREE.Mesh[] = []
  private readonly vehicleWheels: THREE.Mesh[] = []
  private readonly roverThrusters: THREE.Mesh[] = []
  private activeVehicle: VehicleKind = 'bicycle'
  private readonly vehicleFleet = new Map<VehicleKind, VehicleInfo>()
  private spaceFlight = false
  private readonly spaceOrigin = new THREE.Vector3()
  private readonly spaceship = new THREE.Group()
  private spaceshipEngine: THREE.Mesh | null = null
  private elapsed = 0
  private currentRegion: RegionId = '暖湾海岛'
  readonly hiddenFinds: HiddenFind[] = []
  readonly birds: Bird[] = []
  readonly unknownCreatures: UnknownCreature[] = []
  private readonly regionDetails = new Map<RegionId, THREE.Group>()
  private readonly fishingSchool = new THREE.Group()
  private playerHome: THREE.Group | null = null
  private readonly playerHomeBaseScale = new THREE.Vector3(PLAYER_HOME_SCALE.x, PLAYER_HOME_SCALE.y, PLAYER_HOME_SCALE.z)
  private homeStyle: BuildingStyle = '海风奶油'
  private homeColors: HomeColors = { ...DEFAULT_HOME_COLORS }
  private homeLevel = 1
  private readonly homeExpansion = new THREE.Group()
  private interiorStyle: BuildingStyle = '海风奶油'
  private interiorColors: InteriorColors = { ...DEFAULT_INTERIOR_COLORS }
  private readonly interiorExpansion = new THREE.Group()
  private readonly questMarker = new THREE.Group()
  private questMarkerTarget = new THREE.Vector3()

  getNearestBird(position: THREE.Vector3, maxDistance = 3.2): Bird | null {
    let nearest: Bird | null = null
    let distance = maxDistance
    for (const bird of this.birds) {
      const next = position.distanceTo(bird.object.position)
      if (next < distance) { nearest = bird; distance = next }
    }
    return nearest
  }

  getNearestHiddenFind(position: THREE.Vector3, maxDistance = 3.2): HiddenFind | null {
    let nearest: HiddenFind | null = null
    let distance = maxDistance
    for (const find of this.hiddenFinds) {
      if (!find.object.visible) continue
      const next = position.distanceTo(find.object.position)
      if (next < distance) { nearest = find; distance = next }
    }
    return nearest
  }
  private readonly interior = new THREE.Group()
  private readonly interiorShell = new THREE.Group()
  private readonly interiorPrefabs = new THREE.Group()
  private readonly interiorDecorations = new THREE.Group()
  private readonly interiorShellAnchor = new THREE.Group()
  private authoredInteriorAsset: THREE.Group | null = null
  private interiorBaseFloor: THREE.Mesh | null = null
  private interiorBuilt = false
  private interiorView = false
  private homeExteriorVisibility = new Map<THREE.Object3D, boolean>()
  private homeExteriorMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
  private readonly underwaterOverlay = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({ color: '#2d8194', transparent: true, opacity: 0, depthTest: false, depthWrite: false }),
  )
  // Start aerial perspective beyond the playable village and fade it out
  // gradually. The previous 58/190 range made the whole island read as a
  // blue wall, especially with the daytime atmosphere dome enabled.
  private readonly groundFog = new THREE.Fog('#a9cbbd', 165, 760)
  private emissiveScanTimer = 0

  constructor() {
    this.scene.background = new THREE.Color('#acd9df')
    this.scene.fog = this.groundFog
    this.hemiLight = new THREE.HemisphereLight('#f7e8e1', '#789c82', 1.6)
    this.scene.add(this.hemiLight)
    this.sunLight = new THREE.DirectionalLight('#fff0d8', 1.9)
    this.sunLight.position.set(-18, 27, 12)
    this.sunLight.castShadow = true
    this.sunLight.shadow.mapSize.set(1536, 1536)
    this.sunLight.shadow.camera.left = -72
    this.sunLight.shadow.camera.right = 72
    this.sunLight.shadow.camera.top = 72
    this.sunLight.shadow.camera.bottom = -72
    this.scene.add(this.sunLight)
    this.moonLight = new THREE.DirectionalLight('#d5d0ff', 0.12)
    this.moonLight.position.set(18, 18, -30)
    this.moonLight.castShadow = false
    this.scene.add(this.moonLight)
    this.addCelestialSky()
    this.addAirTraffic()
    this.addIsland()
    this.addAlienLandmarks()
    this.addClouds()
    this.addPath()
    this.addRiverAndTerrainLayers()
    this.addHomes()
    this.addTreesAndFlowers()
    this.addAlienFlora()
    this.addPondAndDock()
    this.addFarm()
    this.addPickups()
    this.addHiddenFinds()
    this.addRegionDetails()
    this.addUnknownLife()
    this.addFishingSchool()
    this.addBirds()
    this.addActivityStations()
    this.addResidents()
    this.addPlayer(DEFAULT_APPEARANCE)
    this.addBicycle()
    this.addVehicleFleet()
    this.setPetKind('小猫')
    this.scene.add(this.pet)
    this.buildInterior()
    this.scene.add(this.buildPreview)
    this.buildQuestMarker()
    this.underwaterOverlay.renderOrder = 20
    this.underwaterOverlay.visible = false
    this.scene.add(this.underwaterOverlay)
    this.setRegion('暖湾海岛')
    this.indexEmissiveMaterials()
    this.applyWorldTime(this.worldTime.snapshot())
  }

  getRegionName(): RegionId { return this.currentRegion }

  /** Load optional authored assets after the first frame; procedural fallbacks remain visible on failure. */
  async loadWorldAssets(assets: Assets, onStatus?: (message: string) => void): Promise<WorldAssetLoadResult> {
    if (this.worldAssetLoadPromise) return this.worldAssetLoadPromise
    this.worldAssetLoadPromise = this.worldAssets.load(assets, onStatus).then(result => {
      this.replaceWorldAssetFallbacks()
      return result
    })
    return this.worldAssetLoadPromise
  }

  private replaceWorldAssetFallbacks(): void {
    const replace = (fallback: THREE.Group, key: 'habitat-pod' | 'alien-flora' | 'alien-tree' | 'alien-creature'): THREE.Group | null => {
      const authored = this.worldAssets.clone(key)
      if (!authored) return null
      authored.position.copy(fallback.position)
      authored.rotation.copy(fallback.rotation)
      this.worldAssets.fitToFallback(authored, fallback)
      if (key === 'alien-tree') {
        const low = new THREE.Group()
        low.name = 'AlienTree_LOD_Far'
        low.add(new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.1, 7), new THREE.MeshStandardMaterial({ color: '#39706c', roughness: 0.95 })))
        low.position.y = 1.05
        const lod = this.wrapAuthoredLod(authored, fallback, low, 28)
        fallback.parent?.add(lod)
        fallback.removeFromParent()
        return lod
      }
      if (key === 'alien-flora' || key === 'alien-creature') {
        const size = this.worldAssets.bounds(fallback).getSize(new THREE.Vector3())
        const low = new THREE.Group()
        const lowMaterial = new THREE.MeshStandardMaterial({ color: key === 'alien-flora' ? '#4e8f75' : '#55728d', roughness: 0.82 })
        const lowMesh = key === 'alien-flora'
          ? new THREE.ConeGeometry(0.42, 1.8, 7)
          : new THREE.SphereGeometry(0.55, 8, 5)
        const mesh = new THREE.Mesh(lowMesh, lowMaterial)
        mesh.position.y = key === 'alien-flora' ? 0.9 : 0.55
        low.add(mesh)
        low.scale.set(size.x / 0.84, size.y / (key === 'alien-flora' ? 1.8 : 1.1), size.z / 0.84)
        const lod = this.wrapAuthoredLod(authored, fallback, low, key === 'alien-flora' ? 22 : 32)
        fallback.parent?.add(lod)
        fallback.removeFromParent()
        return lod
      }
      authored.userData.worldAsset = key
      authored.userData.replacedFallback = fallback.userData.worldAssetFallback ?? key
      fallback.parent?.add(authored)
      fallback.removeFromParent()
      if (key === 'habitat-pod') {
        authored.getObjectByName('InteriorShell')?.traverse(node => { node.visible = false })
      }
      return authored
    }
    this.habitatFallbacks.forEach(fallback => {
      const authored = replace(fallback, 'habitat-pod')
      if (authored && fallback === this.playerHome) {
        this.playerHome = authored
        this.playerHomeBaseScale.copy(authored.scale).divideScalar(1 + (this.homeLevel - 1) * 0.12)
        applyHomePalette(authored, this.homeStyle)
        this.setHomeColors(this.homeColors)
        this.installAuthoredInterior()
      }
    })
    this.treeFallbacks.forEach((fallback, index) => {
      const authored = replace(fallback, 'alien-tree')
      if (authored) {
        this.trees[index] = authored
      }
    })
    this.floraFallbacks.forEach(fallback => {
      const authored = replace(fallback, 'alien-flora')
      if (!authored) return
      const current = this.alienFlora.indexOf(fallback)
      if (current >= 0) this.alienFlora[current] = authored
      const windIndex = this.windPlants.indexOf(fallback)
      if (windIndex >= 0) this.windPlants[windIndex] = authored
    })
    this.unknownCreatures.forEach(creature => {
      const authored = replace(creature.object, 'alien-creature')
      if (authored) creature.object = authored
    })
  }

  private wrapAuthoredLod(authored: THREE.Group, fallback: THREE.Group, low: THREE.Group, distance: number): THREE.Group {
    const holder = new THREE.Group()
    holder.name = `${authored.name}_LOD`
    holder.position.copy(fallback.position)
    holder.rotation.copy(fallback.rotation)
    const relativePosition = authored.position.clone().sub(fallback.position)
    authored.position.copy(relativePosition)
    authored.rotation.set(0, 0, 0)
    holder.add(createAssetLod([{ distance: 0, object: authored }, { distance, object: low }]))
    holder.userData.assetLod = true
    return holder
  }

  /** Current in-game local time and its derived lighting state. */
  getWorldTime(): WorldTimeSnapshot { return this.worldTime.snapshot() }

  /** Jump to a deterministic hour (useful for gameplay, QA and screenshots). */
  setWorldTime(hours: number): WorldTimeSnapshot {
    const snapshot = this.worldTime.setHours(hours)
    this.applyWorldTime(snapshot)
    return snapshot
  }

  /** Advance the clock by game-hours without waiting for the render loop. */
  advanceWorldTime(hours: number): WorldTimeSnapshot {
    const snapshot = this.worldTime.advance(hours)
    this.applyWorldTime(snapshot)
    return snapshot
  }

  /** Set game-hours per real second. Zero freezes the clock. */
  setWorldTimeScale(hoursPerSecond: number): WorldTimeSnapshot {
    const snapshot = this.worldTime.setTimeScale(hoursPerSecond)
    this.applyWorldTime(snapshot)
    return snapshot
  }

  setWorldTimePaused(paused: boolean): WorldTimeSnapshot {
    const snapshot = this.worldTime.setPaused(paused)
    this.applyWorldTime(snapshot)
    return snapshot
  }

  toggleWorldTimePaused(): WorldTimeSnapshot {
    const snapshot = this.worldTime.togglePaused()
    this.applyWorldTime(snapshot)
    return snapshot
  }

  getLoadedWorldAssetKeys(): string[] { return this.worldAssets.keys() }

  setHomeStyle(style: BuildingStyle): void {
    this.homeStyle = style
    if (this.playerHome) {
      applyHomePalette(this.playerHome, style)
      this.setHomeColors(this.homeColors)
    }
  }

  setHomeColors(colors: HomeColors): void {
    this.homeColors = { ...colors }
    if (!this.playerHome) return
    this.playerHome.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return
      const part = node.userData.homePart as string | undefined
      const color = part === 'wall' ? colors.wall : part === 'roof' ? colors.roof : part === 'trim' ? colors.trim : undefined
      if (!color) return
      const material = Array.isArray(node.material) ? node.material[0] : node.material
      if (material instanceof THREE.MeshStandardMaterial) material.color.set(color)
    })
  }

  setInteriorStyle(style: BuildingStyle): void {
    this.interiorStyle = style
    const palette: Record<BuildingStyle, { wall: string; wood: string; floor: string }> = {
      海风奶油: { wall: '#78b9ad', wood: '#496e78', floor: '#3d667b' },
      花园薄荷: { wall: '#8fd0b0', wood: '#356c69', floor: '#315d6f' },
      暮光珊瑚: { wall: '#cf8ec1', wood: '#5b477e', floor: '#493e70' },
    }
    const colors = palette[style]
    this.interior.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return
      const part = node.userData.interiorPart as string | undefined
      const color = part === 'wall' ? colors.wall : part === 'wood' ? colors.wood : part === 'floor' ? colors.floor : undefined
      if (!color) return
      const material = Array.isArray(node.material) ? node.material[0] : node.material
      if (material instanceof THREE.MeshStandardMaterial) material.color.set(color)
    })
  }

  setInteriorColors(colors: InteriorColors): void {
    this.interiorColors = { ...colors }
    const apply = (node: THREE.Object3D): void => {
      if (!(node instanceof THREE.Mesh)) return
      const part = node.userData.interiorPart as string | undefined
      const color = part === 'wall' ? colors.wall : part === 'floor' ? colors.floor : part === 'wood' ? colors.trim : undefined
      if (!color) return
      const material = Array.isArray(node.material) ? node.material[0] : node.material
      if (material instanceof THREE.MeshStandardMaterial) material.color.set(color)
    }
    this.interior.traverse(apply)
    this.interiorDecorations.traverse(apply)
  }

  setInteriorLayoutAuthored(active: boolean): void {
    const authored = this.authoredInteriorAsset !== null
    this.interiorShell.visible = !active && !authored
    this.interiorPrefabs.visible = !active && !authored
    if (this.interiorBaseFloor) this.interiorBaseFloor.visible = !active && !authored
  }

  setHomeLevel(level: number): void {
    this.homeLevel = Math.max(1, Math.min(3, Math.floor(level)))
    if (this.playerHome) {
      const levelScale = 1 + (this.homeLevel - 1) * 0.12
      this.playerHome.scale.copy(this.playerHomeBaseScale).multiplyScalar(levelScale)
      applyHomePalette(this.playerHome, this.homeStyle)
    }
    this.homeExpansion.clear()
    if (this.homeLevel >= 2) {
      box(this.homeExpansion, [1.7, 1.85, 2.5], clay.wall, [-2.25, 1.0, 0.05])
      box(this.homeExpansion, [1.85, 0.22, 2.65], clay.roof, [-2.25, 2.02, 0.05])
      box(this.homeExpansion, [0.68, 0.95, 0.12], clay.window, [-2.25, 1.14, 1.31])
    }
    if (this.homeLevel >= 3) {
      const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), new THREE.MeshStandardMaterial({ color: '#f1d487', emissive: '#a87845', emissiveIntensity: 0.6 }))
      beacon.position.set(0, 5.55, 0)
      this.homeExpansion.add(beacon)
    }
    this.homeExpansion.position.set(LOCATIONS.home.x, 0, LOCATIONS.home.z)
    if (!this.homeExpansion.parent) this.scene.add(this.homeExpansion)
    this.interiorExpansion.clear()
    if (this.homeLevel >= 2) {
      const divider = box(this.interiorExpansion, [0.12, 2.7, 3.7], clay.wall, [-0.55, 1.48, -0.15])
      divider.userData.interiorPart = 'wall'
      box(this.interiorExpansion, [1.45, 0.14, 0.18], clay.wood, [-0.55, 2.8, -0.15]).userData.interiorPart = 'wood'
    }
    if (this.homeLevel >= 3) {
      box(this.interiorExpansion, [3.2, 0.12, 2.15], clay.wood, [1.65, 2.55, -0.85]).userData.interiorPart = 'wood'
      box(this.interiorExpansion, [3.2, 0.72, 0.10], clay.cream, [1.65, 2.92, 0.25]).userData.interiorPart = 'wood'
    }
    this.setInteriorStyle(this.interiorStyle)
  }

  setRegion(region: RegionId): THREE.Vector3 {
    this.currentRegion = region
    for (const [id, group] of this.regionDetails) group.visible = id === region || id === '暖湾海岛'
    const spawn = region === '暖湾海岛' ? LOCATIONS.start : region === '星砂海滩' ? new THREE.Vector3(17, 0, -4) : region === '萤光林地' ? new THREE.Vector3(-18, 0, -8) : region === '云端观景台' ? LOCATIONS.lookout : region === '星门荒原' ? new THREE.Vector3(34, 0, -18) : new THREE.Vector3(-34, 0, -22)
    this.player.position.copy(spawn)
    return spawn.clone()
  }

  private addHiddenFinds(): void {
    const spots = [
      { x: -18.5, z: -8.5, item: '荧光菌' as const, tint: '#91e6c2' },
      { x: 20.2, z: -11.5, item: '星砂' as const, tint: '#b9a6ee' },
    ]
    for (const [index, spot] of spots.entries()) {
      const group = new THREE.Group()
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.19, 1), new THREE.MeshStandardMaterial({ color: spot.tint, emissive: spot.tint, emissiveIntensity: 0.65, roughness: 0.35 }))
      orb.position.y = 0.35
      group.add(orb)
      group.position.set(spot.x, 0, spot.z)
      group.visible = false
      this.scene.add(group)
      this.hiddenFinds.push({ id: `find-${spot.item}`, position: group.position.clone(), object: group, item: spot.item })
      void index
    }
  }

  private addRegionDetails(): void {
    const beach = new THREE.Group()
    beach.name = 'StarSandBeach'
    for (let i = 0; i < 10; i += 1) {
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.22 + (i % 3) * 0.08), new THREE.MeshStandardMaterial({ color: i % 2 ? '#e8c9f5' : '#f8d88a', emissive: i % 2 ? '#7b5c9e' : '#a67a2a', emissiveIntensity: 0.3, roughness: 0.55 }))
      crystal.position.set(13 + (i % 5) * 1.5, 0.3, -10 + Math.floor(i / 5) * 1.6)
      crystal.rotation.set(0.2, i * 0.7, 0.1)
      crystal.castShadow = true
      beach.add(crystal)
    }
    this.scene.add(beach)
    this.regionDetails.set('星砂海滩', beach)

    const forest = new THREE.Group()
    forest.name = 'GlowForest'
    for (let i = 0; i < 12; i += 1) {
      const mushroom = new THREE.Group()
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.10, 0.42, 7), mat('#d9c2aa'))
      stem.position.y = 0.22
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 6), new THREE.MeshStandardMaterial({ color: i % 2 ? '#9ce3c8' : '#d7a9ef', emissive: i % 2 ? '#2a806c' : '#6b3a88', emissiveIntensity: 0.55, roughness: 0.62 }))
      cap.scale.y = 0.48
      cap.position.y = 0.48
      mushroom.add(stem, cap)
      mushroom.position.set(-22 + (i % 6) * 1.55, 0, -12 + Math.floor(i / 6) * 2.1)
      forest.add(mushroom)
    }
    this.scene.add(forest)
    this.regionDetails.set('萤光林地', forest)

    const lookout = new THREE.Group()
    lookout.name = 'CloudLookout'
    for (let i = 0; i < 5; i += 1) {
      const cloud = new THREE.Mesh(new THREE.SphereGeometry(1.4 + i * 0.2, 16, 10), new THREE.MeshStandardMaterial({ color: '#f3d8ee', roughness: 0.95, transparent: true, opacity: 0.86 }))
      cloud.scale.set(1.7, 0.38, 0.9)
      cloud.position.set(-4 + i * 2.1, 0.3 + (i % 2) * 0.25, -19 - (i % 2) * 0.8)
      lookout.add(cloud)
    }
    const rail = box(lookout, [8, 0.12, 0.12], clay.cream, [0, 1.1, -19])
    rail.castShadow = true
    this.scene.add(lookout)
    this.regionDetails.set('云端观景台', lookout)

    const wasteland = new THREE.Group()
    wasteland.name = 'StarGateWasteland'
    const gateMaterial = new THREE.MeshStandardMaterial({ color: '#8366b2', emissive: '#4b2c80', emissiveIntensity: 0.65, roughness: 0.45 })
    const gate = new THREE.Group()
    gate.position.set(34, 0, -18)
    for (const x of [-2.1, 2.1]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 5.4, 8), gateMaterial)
      pillar.position.set(x, 2.7, 0)
      gate.add(pillar)
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.26, 12, 36), gateMaterial)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 3.1
    gate.add(ring)
    wasteland.add(gate)
    for (let i = 0; i < 18; i += 1) {
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.25 + (i % 3) * 0.12), new THREE.MeshStandardMaterial({ color: i % 2 ? '#c795ed' : '#77d8d0', emissive: i % 2 ? '#7448a0' : '#2b8b86', emissiveIntensity: 0.5 }))
      crystal.position.set(27 + (i % 6) * 2.7, 0.35, -27 + Math.floor(i / 6) * 3)
      wasteland.add(crystal)
    }
    this.scene.add(wasteland)
    this.regionDetails.set('星门荒原', wasteland)

    const ringlands = new THREE.Group()
    ringlands.name = 'FloatingRinglands'
    for (let i = 0; i < 9; i += 1) {
      const island = new THREE.Group()
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6 + (i % 3) * 0.35), mat(i % 2 ? '#8d78a8' : '#9fb47e'))
      rock.scale.y = 0.42
      island.add(rock)
      const plant = new THREE.Mesh(new THREE.SphereGeometry(0.48, 12, 8), new THREE.MeshStandardMaterial({ color: '#9de3c6', emissive: '#2d8b6c', emissiveIntensity: 0.7 }))
      plant.scale.set(0.7, 1.8, 0.7)
      plant.position.y = 1.25
      island.add(plant)
      island.position.set(-45 + (i % 3) * 8, 3.8 + (i % 2) * 2.5, -28 + Math.floor(i / 3) * 8)
      ringlands.add(island)
    }
    this.scene.add(ringlands)
    this.regionDetails.set('浮岛环带', ringlands)
  }

  private addFishingSchool(): void {
    const fishMaterial = new THREE.MeshStandardMaterial({ color: '#9ed7e4', emissive: '#3b7d91', emissiveIntensity: 0.25, roughness: 0.55 })
    for (let i = 0; i < 6; i += 1) {
      const fish = new THREE.Group()
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 7), fishMaterial)
      body.scale.set(1.5, 0.58, 0.7)
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.28, 4), fishMaterial)
      tail.rotation.z = Math.PI / 2
      tail.position.x = -0.27
      fish.add(body, tail)
      fish.position.set(8.5 + (i % 3) * 0.85, 0.42 + (i % 2) * 0.08, -5.4 + Math.floor(i / 3) * 0.72)
      this.fishingSchool.add(fish)
    }
    this.scene.add(this.fishingSchool)
  }

  private addBirds(): void {
    const birds: Array<{ id: string; species: BirdSpecies; x: number; z: number; color: string }> = [
      { id: 'bird-blue', species: '蓝羽海燕', x: 18, z: -8, color: '#71b9dc' },
      { id: 'bird-moon', species: '月光鹭', x: -16, z: -10, color: '#d9e4ef' },
      { id: 'bird-rainbow', species: '彩虹蜂鸟', x: 2, z: -17, color: '#e9a5c7' },
    ]
    for (const entry of birds) {
      const bird = new THREE.Group()
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 7), mat(entry.color))
      body.scale.set(1.25, 0.82, 0.72)
      const wingL = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat('#f5e7c8'))
      wingL.scale.set(0.35, 0.18, 0.85)
      wingL.position.set(-0.14, 0.04, 0.08)
      const wingR = wingL.clone()
      wingR.position.x = 0.14
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.18, 5), mat('#e6b861'))
      beak.rotation.z = -Math.PI / 2
      beak.position.x = 0.25
      bird.add(body, wingL, wingR, beak)
      bird.position.set(entry.x, 1.5, entry.z)
      sceneAddShadow(bird)
      this.scene.add(bird)
      this.birds.push({ id: entry.id, species: entry.species, position: new THREE.Vector3(entry.x, 1.5, entry.z), object: bird })
    }
  }

  private addUnknownLife(): void {
    const frontierLife = new THREE.Group()
    frontierLife.name = 'UnknownLifeFrontier'
    const ringLife = new THREE.Group()
    ringLife.name = 'UnknownLifeRing'
    const homeLife = new THREE.Group()
    homeLife.name = 'UnknownLifeHome'
    const entries: Array<{ x: number; z: number; color: string; scale: number; name: UnknownCreatureSpecies; shape: 'runner' | 'winged' | 'crawler' | 'float' }> = [
      { x: 31, z: -21, color: '#e1a5ff', scale: 1.1, name: '雾尾兽', shape: 'runner' },
      { x: 39, z: -13, color: '#82e4d8', scale: 0.8, name: '星脉鹿', shape: 'runner' },
      { x: -33, z: -26, color: '#f0d78b', scale: 0.9, name: '浮光翼兽', shape: 'winged' },
      { x: -15, z: 17, color: '#9ce5e9', scale: 0.56, name: '星环蜉蝣', shape: 'float' },
      { x: 18, z: 22, color: '#f2a889', scale: 0.72, name: '晶壳螯兽', shape: 'crawler' },
      { x: -5, z: -30, color: '#95d6a0', scale: 1.35, name: '潮汐巨鹿', shape: 'runner' },
    ]
    for (const entry of entries) {
      const creature = new THREE.Group()
      const glow = new THREE.MeshStandardMaterial({ color: entry.color, emissive: entry.color, emissiveIntensity: 0.24, roughness: 0.38 })
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.46 * entry.scale, 14, 10), glow)
      body.scale.set(1.5, 0.82, 0.82)
      body.position.y = 0.85
      creature.add(body)
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.34 * entry.scale, 12, 9), glow)
      head.position.set(0.48 * entry.scale, 1.02, 0.08)
      creature.add(head)
      const eyeMaterial = new THREE.MeshStandardMaterial({ color: '#f5fff2', emissive: '#b5ffdc', emissiveIntensity: 1.2, roughness: 0.18 })
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075 * entry.scale, 8, 6), eyeMaterial)
        eye.position.set(0.68 * entry.scale, 1.12 * entry.scale, side * 0.17 * entry.scale)
        eye.scale.z = 0.58
        creature.add(eye)
      }
      const crest = new THREE.Mesh(new THREE.TorusGeometry(0.28 * entry.scale, 0.035 * entry.scale, 6, 16), eyeMaterial)
      crest.rotation.x = Math.PI / 2
      crest.position.set(0.02, 1.48 * entry.scale, 0)
      creature.add(crest)
      if (entry.shape === 'crawler') {
        for (const side of [-1, 1]) for (const z of [-0.26, 0.08, 0.4]) {
          const claw = new THREE.Mesh(new THREE.ConeGeometry(0.12 * entry.scale, 0.42 * entry.scale, 6), glow)
          claw.position.set(side * 0.42 * entry.scale, 0.46, z * entry.scale)
          claw.rotation.z = side * 0.78
          creature.add(claw)
        }
        for (const side of [-1, 1]) {
          const pincer = new THREE.Mesh(new THREE.TorusGeometry(0.16 * entry.scale, 0.055 * entry.scale, 6, 12, Math.PI), glow)
          pincer.position.set(side * 0.66 * entry.scale, 0.75, 0.38)
          pincer.rotation.z = side * 0.42
          creature.add(pincer)
        }
      } else if (entry.shape === 'winged') {
        for (const side of [-1, 1]) {
          const wing = new THREE.Mesh(new THREE.SphereGeometry(0.55 * entry.scale, 12, 8), glow)
          wing.scale.set(0.15, 0.82, 1.45)
          wing.position.set(side * 0.72 * entry.scale, 1.16, -0.1)
          wing.rotation.z = side * -0.42
          creature.add(wing)
        }
      } else if (entry.shape === 'float') {
        for (let side = -1; side <= 1; side += 2) {
          const feeler = new THREE.Mesh(new THREE.TorusGeometry(0.34 * entry.scale, 0.035 * entry.scale, 6, 14, Math.PI), glow)
          feeler.position.set(side * 0.28, 1.38, 0)
          feeler.rotation.z = side * -0.48
          creature.add(feeler)
        }
      } else {
        for (const side of [-1, 1]) {
          for (const z of [-0.26, 0.2]) {
            const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07 * entry.scale, 0.42 * entry.scale, 4, 8), glow)
            leg.position.set(side * 0.25 * entry.scale, 0.42, z * entry.scale)
            leg.userData.limbPhase = (side + 1) * 0.9 + z * 2.1
            creature.add(leg)
          }
        }
        for (const side of [-1, 1]) {
          const fin = new THREE.Mesh(new THREE.CapsuleGeometry(0.04 * entry.scale, 0.38 * entry.scale, 4, 8), eyeMaterial)
          fin.position.set(-0.14 * entry.scale, 1.14 * entry.scale, side * 0.42 * entry.scale)
          fin.rotation.x = side * 0.28
          creature.add(fin)
        }
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12 * entry.scale, 0.75 * entry.scale, 6), glow)
        horn.position.set(0.54 * entry.scale, 1.55 * entry.scale, 0.12)
        horn.rotation.z = -0.28
        creature.add(horn)
      }
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.58 * entry.scale, 0.025, 6, 18), glow)
      halo.rotation.x = Math.PI / 2
      halo.position.y = 1.55
      creature.add(halo)
      creature.position.set(entry.x, 0, entry.z)
      creature.userData.worldAssetFallback = 'alien-creature'
      creature.userData.sourceScale = entry.scale
      creature.userData.species = entry.name
      sceneAddShadow(creature)
      const habitat = entry.x < -20 ? ringLife : entry.x > 25 || entry.z < -20 ? frontierLife : homeLife
      habitat.add(creature)
      this.unknownCreatures.push({
        id: `creature-${entry.name}`,
        species: entry.name,
        position: creature.position.clone(),
        object: creature,
        anchor: creature.position.clone(),
        patrolRadius: 0.8 + (entry.scale * 0.8),
        patrolSpeed: 0.16 + (entry.scale * 0.08),
        phase: this.unknownCreatures.length * 1.7,
      })
    }
    this.scene.add(homeLife)
    const frontier = this.regionDetails.get('星门荒原')
    if (frontier) frontier.add(frontierLife)
    else {
      this.scene.add(frontierLife)
      this.regionDetails.set('星门荒原', frontierLife)
    }
    const ringlands = this.regionDetails.get('浮岛环带')
    if (ringlands) ringlands.add(ringLife)
    else this.scene.add(ringLife)
  }

  getNearestCreature(position: THREE.Vector3, maxDistance = 3.6): UnknownCreature | null {
    let nearest: UnknownCreature | null = null
    let distance = maxDistance
    for (const creature of this.unknownCreatures) {
      if (!creature.object.visible) continue
      const next = position.distanceTo(creature.object.position)
      if (next < distance) { nearest = creature; distance = next }
    }
    return nearest
  }

  setQuestMarker(quest: QuestId | null): void {
    if (!quest) { this.questMarker.visible = false; this.questMarkerTarget.set(0, 0, 0); return }
    const resident = quest === 'trading' ? this.residents.find(entry => entry.role === 'merchant') : quest === 'neighbors' ? this.residents.find(entry => entry.role === 'neighbor') : null
    const bird = quest === 'birdwatching' ? this.birds[0] : null
    const creature = quest === 'xenobiology' ? this.unknownCreatures.find(entry => entry.object.visible) : null
    const target = quest === 'shells' ? new THREE.Vector3(17, 0, -1) : quest === 'fishing' ? LOCATIONS.pond : quest === 'harvest' ? LOCATIONS.farm : quest === 'building' ? LOCATIONS.homeDoor : quest === 'cooking' ? LOCATIONS.kitchen : quest === 'exploration' ? LOCATIONS.lookout : resident?.position ?? bird?.object.position ?? creature?.object.position ?? LOCATIONS.plaza
    this.questMarkerTarget.copy(target)
    this.questMarker.position.set(target.x, 0, target.z)
    this.questMarker.visible = !this.interiorView
  }

  getQuestMarkerDistance(position: THREE.Vector3): number | null {
    return this.questMarker.visible ? position.distanceTo(this.questMarkerTarget) : null
  }

  private buildQuestMarker(): void {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.055, 8, 24), new THREE.MeshStandardMaterial({ color: '#f2c66d', emissive: '#b77e2c', emissiveIntensity: 0.55, transparent: true, opacity: 0.9 }))
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.18
    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 1), new THREE.MeshStandardMaterial({ color: '#fff0ae', emissive: '#e4ac4c', emissiveIntensity: 0.75 }))
    beacon.position.y = 1.35
    this.questMarker.add(ring, beacon)
    this.questMarker.name = 'tracked-quest-marker'
    this.questMarker.visible = false
    this.scene.add(this.questMarker)
  }

  private addActivityStations(): void {
    const kitchen = new THREE.Group()
    box(kitchen, [1.5, 0.75, 0.65], clay.wood, [0, 0.5, 0])
    box(kitchen, [1.3, 0.10, 0.56], clay.cream, [0, 0.94, 0])
    sphere(kitchen, 0.14, mat('#f2c875'), [-0.38, 1.08, 0], [1, 0.45, 1])
    sphere(kitchen, 0.14, mat('#e89e9f'), [0.38, 1.08, 0], [1, 0.45, 1])
    kitchen.position.copy(LOCATIONS.kitchen)
    this.scene.add(kitchen)
    const wardrobe = new THREE.Group()
    box(wardrobe, [1.25, 1.6, 0.48], mat('#b7d8cc'), [0, 0.9, 0])
    box(wardrobe, [0.95, 0.10, 0.08], clay.cream, [0, 1.45, 0.27])
    wardrobe.position.copy(LOCATIONS.wardrobe)
    this.scene.add(wardrobe)
  }

  getWaterState(position: THREE.Vector3): WaterState {
    const distance = Math.hypot(position.x, position.z)
    if (distance > 49.5) return 'deep'
    if (distance > 44.5) return 'shallow'
    return 'dry'
  }

  setUnderwater(active: boolean): void {
    this.underwaterOverlay.visible = active
    const material = this.underwaterOverlay.material as THREE.MeshBasicMaterial
    material.opacity = active ? 0.22 : 0
  }

  enterInterior(): void {
    this.interiorView = true
    this.setHomeCutaway(true)
    if (this.interior.parent) return
    this.scene.add(this.interior)
  }

  private setHomeCutaway(active: boolean): void {
    if (!this.playerHome) return
    if (!active) {
      for (const [node, visible] of this.homeExteriorVisibility) node.visible = visible
      this.homeExteriorVisibility.clear()
      for (const [mesh, material] of this.homeExteriorMaterials) mesh.material = material
      this.homeExteriorMaterials.clear()
      this.homeExpansion.visible = true
      return
    }
    this.homeExteriorVisibility.clear()
    this.playerHome.traverse(node => {
      this.homeExteriorVisibility.set(node, node.visible)
      const part = node.userData.homePart as string | undefined
      // Keep the lower shell, door, windows and trim as a spatial reference;
      // fade the shell instead of removing the home's exterior silhouette.
      if (node instanceof THREE.Mesh && (part === 'wall' || part === 'roof')) {
        this.homeExteriorMaterials.set(node, node.material)
        const ghost = (material: THREE.Material): THREE.Material => {
          const copy = material.clone()
          copy.transparent = true
          copy.opacity = part === 'roof' ? 0.12 : 0.18
          copy.depthWrite = false
          return copy
        }
        node.material = Array.isArray(node.material) ? node.material.map(ghost) : ghost(node.material)
      }
    })
    this.homeExpansion.visible = false
    const cutaway = this.playerHome.getObjectByName('CameraCutaway')
    if (cutaway) cutaway.visible = true
  }

  private buildInterior(): void {
    if (this.interiorBuilt) return
    this.interiorBuilt = true
    this.interior.add(this.interiorExpansion)
    this.interior.add(this.interiorShell, this.interiorPrefabs)
    this.interiorShellAnchor.name = 'InteriorShell'
    this.interiorShellAnchor.position.copy(HABITAT_DOOR_LOCAL)
    this.interior.add(this.interiorShellAnchor)
    // Match the exterior habitat pod: a 10.8 x 8.2 metre interior with room
    // for the avatar to circulate around furniture and editable partitions.
    const floor = box(this.interior, [INTERIOR_ROOM.width, 0.18, INTERIOR_ROOM.depth], clay.wood, [0, 0.12, INTERIOR_ROOM.centerZ]); floor.userData.interiorPart = 'floor'
    this.interiorBaseFloor = floor
    floor.receiveShadow = true
    // A real ceiling closes the enlarged room so indoor editing no longer
    // exposes the outdoor sky when the camera is aimed across the floor plan.
    box(this.interior, [INTERIOR_ROOM.width, 0.18, INTERIOR_ROOM.depth], clay.wall, [0, 3.28, INTERIOR_ROOM.centerZ]).userData.interiorPart = 'wall'
    box(this.interiorShell, [INTERIOR_ROOM.width, 3.2, 0.18], clay.wall, [0, 1.7, -INTERIOR_ROOM.back]).userData.interiorPart = 'wall'
    box(this.interiorShell, [0.18, 3.2, INTERIOR_ROOM.depth], clay.wall, [-INTERIOR_ROOM.halfWidth, 1.7, INTERIOR_ROOM.centerZ]).userData.interiorPart = 'wall'
    box(this.interiorShell, [0.18, 3.2, INTERIOR_ROOM.depth], clay.wall, [INTERIOR_ROOM.halfWidth, 1.7, INTERIOR_ROOM.centerZ]).userData.interiorPart = 'wall'
    // Leave a genuine doorway in the front wall and give it a visible frame,
    // threshold and open door leaf. The avatar enters this same room instance.
    box(this.interiorShell, [3.6, 3.2, 0.18], clay.wall, [-3.6, 1.7, INTERIOR_ROOM.front]).userData.interiorPart = 'wall'
    box(this.interiorShell, [3.6, 3.2, 0.18], clay.wall, [3.6, 1.7, INTERIOR_ROOM.front]).userData.interiorPart = 'wall'
    box(this.interiorShell, [3.6, 0.55, 0.18], clay.wall, [0, 3.02, INTERIOR_ROOM.front]).userData.interiorPart = 'wall'
    box(this.interiorShell, [0.13, 2.55, 0.14], clay.cream, [-1.72, 1.38, INTERIOR_ROOM.front - 0.08])
    box(this.interiorShell, [0.13, 2.55, 0.14], clay.cream, [1.72, 1.38, INTERIOR_ROOM.front - 0.08])
    box(this.interiorShell, [3.7, 0.14, 0.40], clay.wood, [0, 0.12, INTERIOR_ROOM.front + 0.05])
    const openDoor = new THREE.Group()
    openDoor.name = 'Door_Airlock'
    openDoor.position.set(-1.62, 0.2, INTERIOR_ROOM.front - 0.12)
    openDoor.rotation.y = -0.58
    box(openDoor, [0.98, 1.95, 0.10], clay.wood, [0.49, 0.98, 0])
    sphere(openDoor, 0.055, clay.cream, [0.86, 0.98, 0.08])
    this.interiorShell.add(openDoor)
    box(this.interiorPrefabs, [2.35, 0.035, 1.7], mat('#cf9b83'), [-1.75, 0.23, -0.15])
    // Bed, bedside chest, kitchen counter and reading table are separate
    // furniture modules; player-placed furniture lives beside these modules.
    box(this.interiorPrefabs, [1.65, 0.35, 2.05], clay.wood, [-2.55, 0.43, -1.45])
    box(this.interiorPrefabs, [1.52, 0.22, 1.72], mat('#d9b7a8'), [-2.55, 0.70, -1.34])
    box(this.interiorPrefabs, [0.76, 0.18, 0.60], clay.cream, [-2.55, 0.86, -1.95])
    box(this.interiorPrefabs, [0.72, 0.74, 0.62], clay.wood, [-1.0, 0.52, -2.15])
    box(this.interiorPrefabs, [1.85, 0.72, 0.72], clay.wood, [2.05, 0.52, -1.95])
    box(this.interiorPrefabs, [1.92, 0.11, 0.78], clay.cream, [2.05, 0.94, -1.95])
    for (const x of [1.55, 2.2, 2.55]) {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.27, 8), mat('#d69679'))
      jar.position.set(x, 1.13, -1.95)
      this.interiorPrefabs.add(jar)
    }
    box(this.interiorPrefabs, [0.08, 0.08, 0.70], clay.wood, [1.95, 0.46, -0.35])
    box(this.interiorPrefabs, [0.08, 0.08, 0.70], clay.wood, [2.35, 0.46, -0.35])
    box(this.interiorPrefabs, [2.2, 1.15, 0.08], clay.window, [0, 1.82, -INTERIOR_ROOM.back])
    box(this.interiorPrefabs, [0.10, 1.24, 0.08], clay.cream, [0, 1.82, -INTERIOR_ROOM.back + 0.06])
    box(this.interiorPrefabs, [2.32, 0.10, 0.10], clay.cream, [0, 1.82, -INTERIOR_ROOM.back + 0.06])
    this.interior.position.copy(HOME_INTERIOR_ORIGIN)
    this.interior.add(this.interiorDecorations)
    // A room viewed from the doorway needs its own fill light. The outdoor
    // sun is above the ceiling and leaves the ceiling-facing surfaces muddy,
    // which makes the furniture plan hard to read during construction.
    const ceilingLight = new THREE.PointLight('#fff0cf', 4.2, 18, 2)
    ceilingLight.position.set(0, 2.72, 0.35)
    ceilingLight.castShadow = false
    this.interior.add(ceilingLight)
    const backLight = new THREE.PointLight('#d8f1e9', 1.8, 12, 2)
    backLight.position.set(0, 2.15, -2.1)
    backLight.castShadow = false
    this.interior.add(backLight)
  }

  private installAuthoredInterior(): void {
    if (this.authoredInteriorAsset || !this.worldAssets.has('habitat-pod')) return
    const asset = this.worldAssets.clone('habitat-pod')
    const interior = asset?.getObjectByName('InteriorShell')
    if (!asset || !interior) return
    asset.name = 'HabitatPod_InteriorInstance'
    asset.scale.set(2.37, 1.10, 2.31)
    asset.traverse(node => {
      const inside = node === interior || interior.getObjectById(node.id) !== undefined || /FurnitureAnchor_/.test(node.name)
      if (node !== asset) node.visible = inside
    })
    this.authoredInteriorAsset = asset
    this.interior.add(asset)
    this.interiorShell.visible = false
    this.interiorPrefabs.visible = false
    if (this.interiorBaseFloor) this.interiorBaseFloor.visible = false
  }

  leaveInterior(): void {
    this.interiorView = false
    this.setHomeCutaway(false)
    this.interior.removeFromParent()
  }

  private addIsland(): void {
    const terrainCanvas = document.createElement('canvas')
    terrainCanvas.width = 256
    terrainCanvas.height = 256
    const terrainContext = terrainCanvas.getContext('2d')!
    const terrainGradient = terrainContext.createLinearGradient(0, 0, 256, 256)
    terrainGradient.addColorStop(0, '#344f55')
    terrainGradient.addColorStop(0.45, '#547d70')
    terrainGradient.addColorStop(1, '#8b7065')
    terrainContext.fillStyle = terrainGradient
    terrainContext.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 1500; i += 1) {
      terrainContext.fillStyle = i % 3 === 0 ? 'rgba(29,128,101,.16)' : 'rgba(255,244,184,.15)'
      terrainContext.fillRect((i * 73) % 256, (i * 47) % 256, 1 + (i % 4), 1 + (i % 3))
    }
    const terrainTexture = new THREE.CanvasTexture(terrainCanvas)
    terrainTexture.colorSpace = THREE.SRGBColorSpace
    terrainTexture.wrapS = THREE.RepeatWrapping
    terrainTexture.wrapT = THREE.RepeatWrapping
    terrainTexture.repeat.set(18, 18)
    terrainTexture.anisotropy = 8
    const oceanMaterial = new THREE.MeshPhysicalMaterial({ color: '#1e5867', roughness: 0.22, metalness: 0.05, transmission: 0.15, clearcoat: 0.62, clearcoatRoughness: 0.18 })
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(240, 240, 32, 32), oceanMaterial)
    ocean.rotation.x = -Math.PI / 2
    ocean.position.y = -0.94
    ocean.receiveShadow = true
    this.scene.add(ocean)
    const islandSide = new THREE.Mesh(new THREE.CylinderGeometry(62.3, 58.5, 1.25, 128, 8), new THREE.MeshStandardMaterial({ color: '#3e465b', roughness: 0.96 }))
    islandSide.position.y = -0.43
    islandSide.receiveShadow = true
    this.scene.add(islandSide)
    const beach = new THREE.Mesh(new THREE.CircleGeometry(62, 128), new THREE.MeshStandardMaterial({ color: '#7d7569', roughness: 0.9, map: terrainTexture }))
    beach.rotation.x = -Math.PI / 2
    beach.position.y = 0.2
    beach.receiveShadow = true
    this.scene.add(beach)
    const meadow = new THREE.Mesh(createRollingTerrainGeometry(54.5, 96), new THREE.MeshStandardMaterial({ color: '#557f73', vertexColors: true, roughness: 0.96, metalness: 0.02 }))
    meadow.name = 'Rolling_Meadow_Terrain'
    meadow.position.y = 0.225
    meadow.receiveShadow = true
    this.scene.add(meadow)
    const ridgeMaterial = new THREE.MeshStandardMaterial({ color: '#46556a', roughness: 0.98, metalness: 0.01 })
    for (let i = 0; i < 7; i += 1) {
      const angle = i / 7 * Math.PI * 2 + 0.18
      const ridge = new THREE.Mesh(new THREE.ConeGeometry(5.2 + (i % 3) * 0.8, 9.5 + (i % 4) * 1.4, 18, 8), ridgeMaterial)
      const distance = 55 + (i % 3) * 4.5
      ridge.position.set(Math.cos(angle) * distance, 3.2 + (i % 2) * 0.35, Math.sin(angle) * distance)
      ridge.scale.z = 0.8 + (i % 2) * 0.12
      ridge.rotation.y = -angle + Math.PI * 0.5
      ridge.castShadow = true
      ridge.receiveShadow = true
      this.scene.add(ridge)
    }
    for (let i = 0; i < 18; i += 1) {
      const a = i / 18 * Math.PI * 2
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1 + (i % 3) * 0.25, 1), i % 2 ? clay.sand : mat('#806e79', 0.96))
      rock.position.set(Math.cos(a) * 61.2, -0.1, Math.sin(a) * 61.2)
      rock.scale.y = 0.68
      rock.rotation.set(0.2, a, 0.12)
      rock.castShadow = true
      this.scene.add(rock)
    }
  }

  private addClouds(): void {
    for (let i = 0; i < 7; i += 1) {
      const cloud = new THREE.Group()
      const cloudTop = new THREE.MeshStandardMaterial({ color: '#c5d4d2', roughness: 0.98, transparent: true, opacity: 0.46 })
      const cloudShade = new THREE.MeshStandardMaterial({ color: i % 2 ? '#928ba8' : '#8194a8', roughness: 1, transparent: true, opacity: 0.34 })
      for (let j = 0; j < 6; j += 1) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), j % 3 === 0 ? cloudShade : cloudTop)
        puff.scale.set(1.25 + (j % 2) * 0.28, 0.52 + (j % 3) * 0.08, 0.74 + (j % 2) * 0.14)
        puff.position.set(j * 1.05 - 2.55, (j % 2) * 0.25 + (j === 2 ? 0.3 : 0), (j % 3 - 1) * 0.24)
        cloud.add(puff)
      }
      cloud.position.set(-32 + i * 11, 19 + (i % 3) * 2.3, -25 - (i % 2) * 30)
      this.scene.add(cloud)
      this.clouds.push(cloud)
    }
  }

  private addCelestialSky(): void {
    const textureCanvas = document.createElement('canvas')
    textureCanvas.width = 1536
    textureCanvas.height = 768
    const context = textureCanvas.getContext('2d')!
    const skyGradient = context.createLinearGradient(0, 0, 0, textureCanvas.height)
    // Keep the upper sky genuinely black-blue so the star field reads as
    // depth, while the lower horizon retains only a restrained atmospheric
    // rim instead of a painted purple dome.
    skyGradient.addColorStop(0, '#03051a')
    skyGradient.addColorStop(0.30, '#080f2c')
    skyGradient.addColorStop(0.66, '#172352')
    skyGradient.addColorStop(1, '#353a6b')
    context.fillStyle = skyGradient
    context.fillRect(0, 0, textureCanvas.width, textureCanvas.height)
    for (const nebula of [
      { x: 310, y: 255, radius: 320, color: '114, 132, 236' },
      { x: 830, y: 190, radius: 300, color: '224, 137, 194' },
      { x: 1260, y: 300, radius: 350, color: '90, 205, 193' },
      { x: 680, y: 470, radius: 260, color: '239, 151, 170' },
    ]) {
      const glow = context.createRadialGradient(nebula.x, nebula.y, 4, nebula.x, nebula.y, nebula.radius)
      glow.addColorStop(0, `rgba(${nebula.color},0.20)`)
      glow.addColorStop(1, `rgba(${nebula.color},0)`)
      context.fillStyle = glow
      context.fillRect(nebula.x - nebula.radius, nebula.y - nebula.radius, nebula.radius * 2, nebula.radius * 2)
    }
    const skyTexture = new THREE.CanvasTexture(textureCanvas)
    skyTexture.colorSpace = THREE.SRGBColorSpace
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(245, 48, 28),
      new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide, fog: false }),
    )
    sky.name = 'deep-space-sky'
    sky.renderOrder = -20
    this.celestial.add(sky)

    // During the day a translucent atmospheric dome tints the otherwise deep
    // space texture. It is kept separate from the stars so the day/night
    // controller can fade it smoothly without rebuilding the canvas texture.
    const daylightSky = new THREE.Mesh(
      new THREE.SphereGeometry(242, 48, 28),
      // This sphere colors only the background. Disabling depth testing made
      // it render over foreground geometry, washing the entire island in fog.
      new THREE.MeshBasicMaterial({ color: '#4b9cba', transparent: true, opacity: 0, side: THREE.BackSide, depthTest: true, depthWrite: false, fog: false }),
    )
    daylightSky.name = 'daylight-atmosphere-dome'
    daylightSky.renderOrder = -10
    this.daylightSkyOverlay = daylightSky
    this.celestial.add(daylightSky)

    let seed = 28009
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    const starGeometry = new THREE.BufferGeometry()
    const starPositions: number[] = []
    const starColors: number[] = []
    const palette = ['#d9e7ff', '#ffe6c7', '#e9d8ff', '#b8f3e1', '#f6b9d7']
    for (let i = 0; i < 4200; i += 1) {
      // Keep the near layer visible from the ground camera, not only during
      // a steep upward flight.
      const y = 8 + random() * 132
      const angle = random() * Math.PI * 2
      const radius = 78 + random() * 148
      starPositions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
      const color = new THREE.Color(palette[Math.floor(random() * palette.length)])
      starColors.push(color.r, color.g, color.b)
    }
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3))
    starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3))
    const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ size: 1.08, vertexColors: true, sizeAttenuation: false, transparent: true, opacity: 0.78, depthTest: false, depthWrite: false, fog: false }))
    stars.name = 'alien-starry-sky'
    this.starLayer = stars
    this.celestial.add(stars)

    // A second, much farther layer keeps parallax and scale readable when the
    // player flies above the island. The first layer is intentionally bright
    // for the ground view; this one is sparse and small so the sky still has
    // depth instead of looking like a flat texture.
    const deepStarGeometry = new THREE.BufferGeometry()
    const deepStarPositions: number[] = []
    const deepStarColors: number[] = []
    for (let i = 0; i < 1800; i += 1) {
      const direction = new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1).normalize()
      const radius = 420 + random() * 300
      deepStarPositions.push(direction.x * radius, direction.y * radius, direction.z * radius)
      const color = new THREE.Color(palette[Math.floor(random() * palette.length)])
      deepStarColors.push(color.r, color.g, color.b)
    }
    deepStarGeometry.setAttribute('position', new THREE.Float32BufferAttribute(deepStarPositions, 3))
    deepStarGeometry.setAttribute('color', new THREE.Float32BufferAttribute(deepStarColors, 3))
    const deepStars = new THREE.Points(deepStarGeometry, new THREE.PointsMaterial({ size: 0.58, vertexColors: true, sizeAttenuation: false, transparent: true, opacity: 0.72, depthTest: false, depthWrite: false, fog: false }))
    deepStars.name = 'deep-space-starfield'
    this.deepStarLayer = deepStars
    this.celestial.add(deepStars)

    // A thin, tilted galaxy band adds depth to the sky instead of a flat
    // decorative backdrop. The far layer uses smaller points so it reads as
    // distance when the camera pitches upward during flight.
    const galaxyGeometry = new THREE.BufferGeometry()
    const galaxyPositions: number[] = []
    const galaxyColors: number[] = []
    for (let i = 0; i < 4200; i += 1) {
      const angle = random() * Math.PI * 2
      const radius = 82 + random() * 148
      const spread = (random() - 0.5) * 15 * (1 - Math.min(1, (radius - 82) / 148))
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const y = 72 + spread + Math.sin(angle * 2.2) * 4
      galaxyPositions.push(x, y, z)
      const color = new THREE.Color(random() > 0.72 ? '#f8d9b1' : random() > 0.5 ? '#b4d7ff' : '#cabdf4')
      galaxyColors.push(color.r, color.g, color.b)
    }
    galaxyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(galaxyPositions, 3))
    galaxyGeometry.setAttribute('color', new THREE.Float32BufferAttribute(galaxyColors, 3))
    const galaxy = new THREE.Points(galaxyGeometry, new THREE.PointsMaterial({ size: 0.62, vertexColors: true, transparent: true, opacity: 0.56, depthTest: false, depthWrite: false, fog: false }))
    galaxy.name = 'milky-way-band'
    galaxy.rotation.z = -0.22
    this.galaxyLayer = galaxy
    this.celestial.add(galaxy)

    const planet = new THREE.Group()
    const planetMat = new THREE.MeshBasicMaterial({ color: '#bc83e8', fog: false })
    const planetMesh = new THREE.Mesh(new THREE.SphereGeometry(13, 36, 24), planetMat)
    planetMesh.position.set(34, 53, -92)
    planet.add(planetMesh)
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(13.7, 36, 22), new THREE.MeshBasicMaterial({ color: '#54d6ee', transparent: true, opacity: 0.30, side: THREE.BackSide, depthTest: false, fog: false }))
    atmosphere.position.copy(planetMesh.position)
    planet.add(atmosphere)
    this.celestial.add(planet)

    const moon = new THREE.Mesh(new THREE.SphereGeometry(5.2, 28, 20), new THREE.MeshBasicMaterial({ color: '#d2bfff', fog: false }))
    moon.position.set(-34, 29, -72)
    this.moonVisual = moon
    this.celestial.add(moon)
    const moonRing = new THREE.Mesh(new THREE.TorusGeometry(7.2, 0.18, 10, 64), new THREE.MeshBasicMaterial({ color: '#8ed8de', transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthTest: false, fog: false }))
    moonRing.rotation.x = 0.46
    moonRing.rotation.z = 0.22
    moonRing.position.copy(moon.position)
    this.moonRingVisual = moonRing
    this.celestial.add(moonRing)

    const sunGlow = new THREE.Mesh(new THREE.SphereGeometry(12, 24, 16), new THREE.MeshBasicMaterial({ color: '#ffd184', fog: false }))
    sunGlow.position.set(-115, 82, -130)
    this.sunVisual = sunGlow
    this.celestial.add(sunGlow)
    const corona = new THREE.Mesh(new THREE.SphereGeometry(16, 24, 16), new THREE.MeshBasicMaterial({ color: '#ffb45f', transparent: true, opacity: 0.16, side: THREE.BackSide, fog: false }))
    corona.position.copy(sunGlow.position)
    this.sunCorona = corona
    this.celestial.add(corona)

    for (let i = 0; i < 3; i += 1) {
      const meteor = new THREE.Group()
      const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.22, 6.8, 7, 1, true), new THREE.MeshBasicMaterial({ color: i === 1 ? '#91eee4' : '#d2c1ff', transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false, fog: false }))
      trail.rotation.z = Math.PI / 2
      trail.position.x = -2.8
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff6d5', fog: false }))
      meteor.add(trail, head)
      meteor.visible = false
      this.celestial.add(meteor)
      this.meteors.push({
        object: meteor,
        start: new THREE.Vector3(-98 + i * 26, 72 + i * 9, -122),
        end: new THREE.Vector3(28 + i * 22, 19 + i * 7, -122),
        delay: 5 + i * 8,
        duration: 2.6,
      })
    }
    this.scene.add(this.celestial)
  }

  /** Keep a base intensity for every emissive PBR material in the world. */
  private indexEmissiveMaterials(): void {
    this.scene.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return
      const materials = Array.isArray(node.material) ? node.material : [node.material]
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue
        if (material.emissiveIntensity <= 0 && material.emissive.getHex() === 0) continue
        if (!this.emissiveMaterials.has(material)) this.emissiveMaterials.set(material, material.emissiveIntensity)
      }
    })
  }

  /** Apply one derived time snapshot to the scene without creating objects. */
  private applyWorldTime(snapshot: WorldTimeSnapshot): void {
    const background = this.scene.background
    if (background instanceof THREE.Color) background.copy(snapshot.skyColor)
    this.groundFog.color.copy(snapshot.fogColor)
    this.hemiLight.color.copy(snapshot.hemiSkyColor)
    this.hemiLight.groundColor.copy(snapshot.hemiGroundColor)
    this.hemiLight.intensity = snapshot.hemiIntensity
    this.sunLight.color.copy(snapshot.sunColor)
    this.sunLight.intensity = snapshot.sunIntensity
    this.moonLight.color.copy(snapshot.moonColor)
    this.moonLight.intensity = snapshot.moonIntensity

    // The same solar arc drives the visible sun and the two directional lights.
    // A local -Z bias keeps the disc in front of the player from the default
    // camera orientation while still allowing the camera to look around it.
    const solarAngle = ((snapshot.hours - 6) / 12) * Math.PI
    const sunDirection = new THREE.Vector3(Math.cos(solarAngle), Math.sin(solarAngle), -0.72).normalize()
    const moonDirection = sunDirection.clone().multiplyScalar(-1)
    this.sunLight.position.copy(sunDirection).multiplyScalar(84)
    this.moonLight.position.copy(moonDirection).multiplyScalar(72)
    if (this.sunVisual) {
      this.sunVisual.position.copy(sunDirection).multiplyScalar(185)
      this.sunVisual.visible = snapshot.daylight > 0.008 || snapshot.twilight > 0.03
      const material = this.sunVisual.material
      if (material instanceof THREE.MeshBasicMaterial) material.color.copy(snapshot.sunColor)
    }
    if (this.sunCorona) {
      this.sunCorona.position.copy(sunDirection).multiplyScalar(185)
      this.sunCorona.visible = this.sunVisual?.visible ?? false
      const material = this.sunCorona.material
      if (material instanceof THREE.MeshBasicMaterial) {
        material.color.copy(snapshot.sunColor)
        material.opacity = 0.06 + snapshot.twilight * 0.26 + snapshot.daylight * 0.08
      }
    }
    if (this.moonVisual) {
      this.moonVisual.position.copy(moonDirection).multiplyScalar(172)
      this.moonVisual.visible = snapshot.night > 0.018
      const material = this.moonVisual.material
      if (material instanceof THREE.MeshBasicMaterial) material.color.copy(snapshot.moonColor)
    }
    if (this.moonRingVisual) {
      this.moonRingVisual.position.copy(moonDirection).multiplyScalar(172)
      this.moonRingVisual.visible = snapshot.night > 0.018
    }
    if (this.daylightSkyOverlay) {
      const material = this.daylightSkyOverlay.material
      if (material instanceof THREE.MeshBasicMaterial) {
        material.color.copy(snapshot.skyColor)
        // This is a subtle atmospheric tint over the deep-space dome. Keep it
        // low enough that daylight does not become a solid cyan screen.
        material.opacity = Math.min(0.16, snapshot.daylight * 0.14 + snapshot.twilight * 0.04)
      }
    }
    // Cloud puffs are an atmospheric accent, not a permanent white veil.
    // Tint and fade them with the same time snapshot so the night keeps its
    // indigo/mint palette and the stars remain visible through the horizon.
    cloudColorTemp.copy(cloudNightColor).lerp(cloudDayColor, snapshot.daylight)
    cloudColorTemp.lerp(cloudTwilightColor, snapshot.twilight * 0.48)
    const cloudOpacity = 0.22 + snapshot.daylight * 0.55 + snapshot.twilight * 0.12
    for (const cloud of this.clouds) {
      cloud.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return
        const materials = Array.isArray(node.material) ? node.material : [node.material]
        for (const material of materials) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue
          material.color.copy(cloudColorTemp)
          material.opacity = cloudOpacity
        }
      })
    }
    if (this.starLayer) {
      const material = this.starLayer.material
      if (material instanceof THREE.PointsMaterial) material.opacity = 0.78 * snapshot.starVisibility
    }
    if (this.deepStarLayer) {
      const material = this.deepStarLayer.material
      if (material instanceof THREE.PointsMaterial) material.opacity = 0.72 * snapshot.starVisibility
    }
    if (this.galaxyLayer) {
      const material = this.galaxyLayer.material
      if (material instanceof THREE.PointsMaterial) material.opacity = 0.56 * snapshot.galaxyVisibility
    }

    // Windows, crystals, flora, traffic trims and GLB PBR accents all respond
    // to the same night multiplier. Newly loaded GLBs are indexed periodically
    // by update(), so asynchronous avatar/asset loads join the cycle too.
    for (const [material, baseIntensity] of this.emissiveMaterials) {
      if (this.spaceshipEngine?.material === material) continue
      // Blender-authored assets can carry emission values in the 10-16 range.
      // Apply the time controller's restrained multiplier and a scene-wide
      // ceiling so a few bio-lights cannot clip the entire frame at night.
      material.emissiveIntensity = Math.min(baseIntensity * snapshot.emissiveMultiplier, 1.22)
    }
  }

  /** Civilian and survey traffic keeps the upper atmosphere from reading as
   * an empty sky. Each craft follows a broad, offset ellipse with a small
   * altitude wave, so their scale and motion remain readable from the ground
   * as well as from the player's ship. */
  private addAirTraffic(): void {
    const routes = [
      { x: -8, z: -10, radius: 33, speed: 0.08, phase: 0.2, altitude: 25, scale: 1.18 },
      { x: 14, z: 7, radius: 27, speed: -0.105, phase: 2.3, altitude: 34, scale: 0.86 },
      { x: -25, z: 14, radius: 42, speed: 0.052, phase: 4.2, altitude: 46, scale: 0.66 },
      { x: 28, z: -25, radius: 52, speed: -0.036, phase: 1.7, altitude: 58, scale: 0.48 },
      { x: 4, z: 22, radius: 21, speed: 0.14, phase: 5.1, altitude: 29, scale: 0.72 },
    ]
    for (const route of routes) {
      const craft = makeAirTrafficCraft(route.scale)
      craft.name = 'atmospheric-traffic-craft'
      craft.position.set(route.x + Math.cos(route.phase) * route.radius, route.altitude, route.z + Math.sin(route.phase) * route.radius * 0.62)
      this.scene.add(craft)
      this.airTraffic.push({
        object: craft,
        anchor: new THREE.Vector3(route.x, 0, route.z),
        radius: route.radius,
        speed: route.speed,
        phase: route.phase,
        altitude: route.altitude,
      })
    }
  }

  /** Large-scale silhouettes make the first playable view read as an alien
   * world immediately: a ring ruin, floating shards and bioluminescent flora.
   * They are lightweight meshes so the scene remains responsive on integrated
   * GPUs while giving the map a much larger horizon.
   */
  private addAlienLandmarks(): void {
    const landmark = new THREE.Group()
    const ringMaterial = new THREE.MeshStandardMaterial({ color: '#7fd7d0', emissive: '#2b8d9c', emissiveIntensity: 1.5, roughness: 0.32, metalness: 0.15 })
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7.6, 0.32, 14, 72), ringMaterial)
    ring.rotation.x = Math.PI / 2
    ring.position.set(0, 7.1, -25)
    landmark.add(ring)
    for (const x of [-7.6, 7.6]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.8, 7.2, 8), ringMaterial)
      pillar.position.set(x, 3.55, -25)
      pillar.rotation.z = x < 0 ? -0.08 : 0.08
      landmark.add(pillar)
    }
    const shardMaterial = new THREE.MeshStandardMaterial({ color: '#9a78da', emissive: '#6a39b2', emissiveIntensity: 1.1, roughness: 0.3 })
    for (let i = 0; i < 12; i += 1) {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.7 + (i % 3) * 0.25, 1), shardMaterial)
      const angle = i / 12 * Math.PI * 2
      shard.position.set(Math.cos(angle) * (14 + i % 2 * 2), 2.6 + (i % 4) * 0.72, -24 + Math.sin(angle) * 6)
      shard.rotation.set(i * 0.2, i * 0.45, i * 0.12)
      landmark.add(shard)
    }
    for (let i = 0; i < 24; i += 1) {
      const plant = new THREE.Group()
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.08, 1.0 + (i % 3) * 0.25, 6), new THREE.MeshStandardMaterial({ color: '#55b997', emissive: '#236c67', emissiveIntensity: 0.65 }))
      stem.position.y = 0.55
      plant.add(stem)
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16 + (i % 2) * 0.05, 10, 8), new THREE.MeshStandardMaterial({ color: i % 2 ? '#ef9be4' : '#9be8d0', emissive: i % 2 ? '#c145af' : '#2f9b86', emissiveIntensity: 1.2, roughness: 0.25 }))
      bulb.position.y = 1.15 + (i % 3) * 0.15
      plant.add(bulb)
      const angle = i / 24 * Math.PI * 2
      plant.position.set(Math.cos(angle) * (20 + (i % 4)), 0.22, Math.sin(angle) * (18 + (i % 5)) - 4)
      landmark.add(plant)
    }
    this.scene.add(landmark)
  }

  private addPath(): void {
    const points = [
      new THREE.Vector3(-2, 0.38, 10), new THREE.Vector3(-3, 0.38, 7), new THREE.Vector3(-4, 0.38, 4),
      new THREE.Vector3(-1.8, 0.38, 1.5), new THREE.Vector3(0, 0.38, -1), new THREE.Vector3(4, 0.38, -2),
      new THREE.Vector3(7, 0.38, -4), new THREE.Vector3(11, 0.38, -6),
    ]
    points.forEach(point => { point.y = getRollingTerrainHeight(point.x, point.z) + 0.18 })
    const curve = new THREE.CatmullRomCurve3(points)
    // Keep the road flat and walkable. A round TubeGeometry reads as a giant
    // pipe or culvert when the camera looks along it.
    const samples = curve.getPoints(90)
    const width = 0.78
    const vertices: number[] = []
    const indices: number[] = []
    for (let i = 0; i < samples.length; i += 1) {
      const current = samples[i]
      const previous = samples[Math.max(0, i - 1)]
      const next = samples[Math.min(samples.length - 1, i + 1)]
      const tangent = next.clone().sub(previous).setY(0).normalize()
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(width)
      const roadY = getRollingTerrainHeight(current.x, current.z) + 0.18
      vertices.push(current.x + normal.x, roadY, current.z + normal.z, current.x - normal.x, roadY, current.z - normal.z)
      if (i < samples.length - 1) {
        const a = i * 2
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }
    const roadGeometry = new THREE.BufferGeometry()
    roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    roadGeometry.setIndex(indices)
    roadGeometry.computeVertexNormals()
    const path = new THREE.Mesh(roadGeometry, mat('#f4bd8d', 0.78))
    path.name = 'macaron-road-surface'
    path.receiveShadow = true
    this.scene.add(path)
    for (const side of [-1, 1]) {
      const edgePoints = samples.map((current, index) => {
        const previous = samples[Math.max(0, index - 1)]
        const next = samples[Math.min(samples.length - 1, index + 1)]
        const tangent = next.clone().sub(previous).setY(0).normalize()
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x)
        return new THREE.Vector3(current.x + normal.x * width * side, getRollingTerrainHeight(current.x, current.z) + 0.21, current.z + normal.z * width * side)
      })
      const edgeCurve = new THREE.CatmullRomCurve3(edgePoints)
      const edge = new THREE.Mesh(new THREE.TubeGeometry(edgeCurve, 90, 0.035, 6, false), mat('#ffdf9b', 0.72))
      edge.name = side < 0 ? 'road-grass-edge-left' : 'road-grass-edge-right'
      this.scene.add(edge)
    }
    const steppingStones = [
      [-5, 0.31, 6], [-4.5, 0.31, 3.4], [-1.5, 0.31, 1], [1.2, 0.31, -1.5], [4.8, 0.31, -2.5], [8.4, 0.31, -4.8],
    ] as const
    for (const [x, y, z] of steppingStones) {
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.08, 7), mat('#efe0c5'))
      stone.position.set(x, y + 0.18, z)
      stone.receiveShadow = true
      this.scene.add(stone)
    }
  }

  /** Layered terrain readability: a flowing river, shaped banks, grass clusters and distant mountains. */
  private addRiverAndTerrainLayers(): void {
    const riverCurve = new THREE.CatmullRomCurve3(RIVER_ROUTE.map(([x, z]) => new THREE.Vector3(x, getRollingTerrainHeight(x, z) + 0.19, z)))
    const samples = riverCurve.getPoints(100)
    const width = 1.15
    const vertices: number[] = []
    const indices: number[] = []
    for (let i = 0; i < samples.length; i += 1) {
      const current = samples[i]
      const previous = samples[Math.max(0, i - 1)]
      const next = samples[Math.min(samples.length - 1, i + 1)]
      const tangent = next.clone().sub(previous).setY(0).normalize()
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x)
      const widthAtPoint = width * (0.82 + (i % 7) * 0.035)
      vertices.push(current.x + normal.x * widthAtPoint, current.y, current.z + normal.z * widthAtPoint)
      vertices.push(current.x - normal.x * widthAtPoint, current.y + 0.008, current.z - normal.z * widthAtPoint)
      if (i < samples.length - 1) {
        const index = i * 2
        indices.push(index, index + 1, index + 2, index + 1, index + 3, index + 2)
      }
    }
    const riverGeometry = new THREE.BufferGeometry()
    riverGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    riverGeometry.setIndex(indices)
    riverGeometry.computeVertexNormals()
    const riverMaterial = new THREE.MeshPhysicalMaterial({ color: '#277d86', roughness: 0.2, metalness: 0.04, transmission: 0.26, clearcoat: 0.68, clearcoatRoughness: 0.16, transparent: true, opacity: 0.84 })
    const river = new THREE.Mesh(riverGeometry, riverMaterial)
    river.name = 'LuminousRiver_MainChannel'
    river.receiveShadow = true
    river.userData.flowSpeed = 0.7
    this.scene.add(river)
    this.rivers.push(river)

    const bankMaterial = new THREE.MeshStandardMaterial({ color: '#755f68', roughness: 0.94 })
    const riverSamples = riverCurve.getPoints(100)
    for (const side of [-1, 1]) {
      const bankPoints = riverSamples.map((current, index) => {
        const previous = riverSamples[Math.max(0, index - 1)]
        const next = riverSamples[Math.min(riverSamples.length - 1, index + 1)]
        const tangent = next.clone().sub(previous).setY(0).normalize()
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x)
        const x = current.x + normal.x * 1.15 * side
        const z = current.z + normal.z * 1.15 * side
        return new THREE.Vector3(x, getRollingTerrainHeight(x, z) + 0.025, z)
      })
      const bankCurve = new THREE.CatmullRomCurve3(bankPoints)
      const bank = new THREE.Mesh(new THREE.TubeGeometry(bankCurve, 100, 0.14, 7, false), bankMaterial)
      bank.name = side < 0 ? 'RiverBank_Left' : 'RiverBank_Right'
      bank.castShadow = true
      bank.receiveShadow = true
      this.scene.add(bank)
    }
    for (let i = 0; i < 14; i += 1) {
      const t = (i + 0.4) / 14
      const point = riverCurve.getPointAt(t)
      const ripple = new THREE.Mesh(new THREE.TorusGeometry(0.22 + (i % 3) * 0.07, 0.018, 5, 18), new THREE.MeshBasicMaterial({ color: '#d8ffff', transparent: true, opacity: 0.48 }))
      ripple.rotation.x = Math.PI / 2
      ripple.position.copy(point).setY(point.y + 0.035)
      ripple.scale.x = 1.8
      ripple.userData.flowPhase = i * 0.43
      this.scene.add(ripple)
      this.rivers.push(ripple)
    }

    const grassBlade = new THREE.ConeGeometry(0.055, 0.42, 4)
    const grassMaterial = new THREE.MeshStandardMaterial({ color: '#60957e', roughness: 0.92 })
    const grass = new THREE.InstancedMesh(grassBlade, grassMaterial, 110)
    const transform = new THREE.Object3D()
    for (let i = 0; i < 110; i += 1) {
      const angle = i * 2.399
      const radius = 7 + (i % 9) * 2.3
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius - 2
      transform.position.set(x, getRollingTerrainHeight(x, z) + 0.2, z)
      transform.rotation.set(0, angle, (i % 2 ? 1 : -1) * 0.14)
      transform.scale.setScalar(0.7 + (i % 4) * 0.16)
      transform.updateMatrix()
      grass.setMatrixAt(i, transform.matrix)
    }
    grass.instanceMatrix.needsUpdate = true
    grass.name = 'Instanced_Meadow_Grass'
    grass.castShadow = true
    this.scene.add(grass)

    for (let i = 0; i < 9; i += 1) {
      const mountain = new THREE.Group()
      const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshStandardMaterial({ color: i % 2 ? '#9b82d2' : '#739bd0', roughness: 0.84, flatShading: true }))
      body.position.y = 5.1
      body.scale.set(5.8 + (i % 3) * 1.2, 6.8 + (i % 4) * 1.2, 3.8 + (i % 3) * 0.8)
      body.rotation.set(0.08 * (i % 2), i * 0.7, 0.04 * (i % 3))
      mountain.add(body)
      const shoulder = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: i % 2 ? '#b99be0' : '#8bb4dc', roughness: 0.88, flatShading: true }))
      shoulder.position.set((i % 2 ? -1 : 1) * 3.2, 2.8, 0.3)
      shoulder.scale.set(3.1, 3.5, 2.4)
      shoulder.rotation.y = i * 0.42
      mountain.add(shoulder)
      const snow = new THREE.Mesh(new THREE.ConeGeometry(1.25 + (i % 2) * 0.55, 2.2, 8), new THREE.MeshStandardMaterial({ color: '#ffe3ed', roughness: 0.7, flatShading: true }))
      snow.position.y = 10.6 + (i % 3) * 0.7
      snow.scale.z = 0.7
      mountain.add(snow)
      mountain.position.set(-54 + i * 13.2, -0.1 + (i % 2) * 0.4, -45 - (i % 3) * 7)
      mountain.name = `PastelMountain_${i + 1}`
      this.scene.add(mountain)
    }
  }

  private addHomes(): void {
    this.playerHome = addHouse(this.scene, LOCATIONS.home.x, LOCATIONS.home.z, 1, clay.wall, clay.roof, HOME_ROTATION)
    this.habitatFallbacks.push(this.playerHome)
    this.playerHome.scale.set(PLAYER_HOME_SCALE.x, PLAYER_HOME_SCALE.y, PLAYER_HOME_SCALE.z)
    applyHomePalette(this.playerHome, this.homeStyle)
    // Keep the opening view anchored on one authored habitat; duplicate pods made the plaza read as a toy showroom.
    this.habitatFallbacks.push(addHouse(this.scene, -13, -5, 0.78, mat('#316c72'), mat('#236078'), 0.42))
    // A front step and an open flower-box make the player's home read as a lived-in place.
    const porch = new THREE.Group()
    porch.position.copy(LOCATIONS.homeDoor)
    porch.rotation.y = HOME_ROTATION
    box(porch, [3.4, 0.18, 1.05], clay.wood, [0, 0.38, 0.48])
    box(porch, [2.5, 0.26, 0.70], mat('#c27c60'), [0, 0.55, 1.02])
    this.scene.add(porch)
    for (let i = 0; i < 4; i += 1) {
      const flowerPos = new THREE.Vector3(-1.3 + i * 0.44, 0, -0.45).applyAxisAngle(new THREE.Vector3(0, 1, 0), HOME_ROTATION).add(LOCATIONS.homeDoor)
      addFlower(this.scene, flowerPos.x, flowerPos.z, i % 2 ? mat('#f1c86e') : clay.flower)
    }
    this.scene.add(this.decorations)
  }

  private addTreesAndFlowers(): void {
    const trees: [number, number, number][] = [
      [-19, 5, 1.25], [-16, 12, 0.86], [-12, -15, 1.12], [-5, -19, 0.94],
      [6, -19, 1.08], [15, -14, 0.92], [20, -3, 1.18], [19, 10, 0.86],
      [12, 18, 1.04], [1, 19, 0.82], [-10, 16, 1.14], [-21, -8, 0.90],
    ]
    trees.forEach(([x, z, s]) => {
      const tree = addTree(this.scene, x, z, s)
      this.trees.push(tree)
      this.treeFallbacks.push(tree)
    })
    const patches: [number, number, string][] = [
      [-11, 2, '#e9a2a6'], [-10, 3, '#f2ce74'], [-12, 0, '#b49bc9'], [2, 8, '#f2ce74'],
      [4, 8, '#e9a2a6'], [7, 0, '#b49bc9'], [-10, -8, '#f1c86e'], [14, 9, '#e9a2a6'],
      [14, -12, '#f2ce74'], [-1, -11, '#e9a2a6'],
    ]
    patches.forEach(([x, z, c]) => addFlower(this.scene, x, z, mat(c)))
  }

  private addAlienFlora(): void {
    const colors = ['#78e4ce', '#dd9df0', '#f1c775', '#83c8f0']
    for (let i = 0; i < 8; i += 1) {
      const plant = new THREE.Group()
      const side = i % 2 === 0 ? -1 : 1
      const row = Math.floor(i / 2)
      const x = side * (14.5 + (row % 2) * 3.1)
      const z = -2 - row * 8.5
      const height = 2.1 + (i % 4) * 0.40
      const stemMaterial = new THREE.MeshStandardMaterial({ color: '#345e5d', emissive: '#123638', emissiveIntensity: 0.08, roughness: 0.76 })
      const bloomMaterial = new THREE.MeshStandardMaterial({ color: colors[i % colors.length], emissive: colors[i % colors.length], emissiveIntensity: 0.06, roughness: 0.68 })
      const stemCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.12, 0),
        new THREE.Vector3(side * 0.18, height * 0.42, 0),
        new THREE.Vector3(-side * 0.08, height * 0.78, 0.05),
        new THREE.Vector3(0, height, 0),
      ])
      const stem = new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 12, 0.065 + (i % 3) * 0.012, 6, false), stemMaterial)
      plant.add(stem)
      for (let petal = 0; petal < 5; petal += 1) {
        const angle = petal / 5 * Math.PI * 2 + i * 0.22
        const blade = new THREE.Mesh(new THREE.SphereGeometry(0.48 + (i % 3) * 0.08, 18, 12), bloomMaterial)
        blade.scale.set(1.12, 0.17, 0.38)
        blade.position.set(Math.cos(angle) * 0.48, height + Math.sin(angle) * 0.12, Math.sin(angle) * 0.48)
        blade.rotation.y = -angle
        blade.rotation.z = Math.sin(angle) * 0.16
        plant.add(blade)
      }
      const seedPod = new THREE.Mesh(new THREE.SphereGeometry(0.19, 18, 12), bloomMaterial)
      seedPod.position.y = height + 0.04
      plant.add(seedPod)
            plant.position.set(x, 0.24, z)
      plant.userData.worldAssetFallback = 'alien-flora'
      sceneAddShadow(plant)
      this.scene.add(plant)
      this.alienFlora.push(plant)
      this.floraFallbacks.push(plant)
      this.windPlants.push(plant)
    }
    for (let i = 0; i < 20; i += 1) {
      const mote = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13 + (i % 3) * 0.035, 1), new THREE.MeshStandardMaterial({ color: i % 2 ? '#b585c4' : '#74b9ad', emissive: i % 2 ? '#754d89' : '#286f69', emissiveIntensity: 0.18, roughness: 0.48 }))
      const angle = i * 2.4
      mote.position.set(Math.cos(angle) * (23 + i % 4 * 1.8), 1.7 + i % 5 * 0.34, Math.sin(angle) * (19 + i % 4 * 1.6) - 10)
      mote.userData.baseY = mote.position.y
      this.scene.add(mote)
      this.alienFlora.push(mote as unknown as THREE.Group)
    }
  }

  private addPondAndDock(): void {
    const pond = new THREE.Mesh(new THREE.CircleGeometry(5.1, 48), mat('#76c0c2', 0.44))
    pond.rotation.x = -Math.PI / 2
    pond.position.set(10, 0.255, -5)
    this.scene.add(pond)
    const edge = new THREE.Mesh(new THREE.TorusGeometry(5.1, 0.19, 7, 48), mat('#e7d2a5'))
    edge.rotation.x = Math.PI / 2
    edge.position.set(10, 0.28, -5)
    this.scene.add(edge)
    for (let i = 0; i < 5; i += 1) {
      const plank = box(this.scene, [3.1, 0.2, 0.52], clay.wood, [10.1, 0.62, -1.2 + i * 0.52])
      plank.rotation.y = -0.09
    }
    for (const x of [8.7, 11.5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.2, 7), clay.bark)
      post.position.set(x, 0.25, -0.1)
      post.castShadow = true
      this.scene.add(post)
    }
    // Floating lily pads and quiet rings give the pond a little life.
    for (const [x, z] of [[8.1, -6.7], [11.5, -7.2], [12.3, -3.5]] as const) {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.58, 9), clay.leaf)
      pad.rotation.x = -Math.PI / 2
      pad.position.set(x, 0.32, z)
      this.scene.add(pad)
      sphere(this.scene, 0.12, clay.flower, [x + 0.12, 0.38, z], [1, 0.55, 1])
    }
  }

  private addFarm(): void {
    const farm = this.cropGroup
    farm.position.set(LOCATIONS.farm.x, 0, LOCATIONS.farm.z)
    this.scene.add(farm)
    box(farm, [4.2, 0.23, 3.2], clay.soil, [0, 0.31, 0])
    for (let i = 0; i < 4; i += 1) {
      const row = box(farm, [3.8, 0.06, 0.08], mat('#bf9871'), [0, 0.45, -1.13 + i * 0.75])
      row.castShadow = false
    }
    for (let i = 0; i < 4; i += 1) {
      const patch = new THREE.Group()
      patch.position.set(-1.28 + i * 0.85, 0.47, 0.1)
      const leaves = mat('#6c9c68')
      for (let j = 0; j < 3; j += 1) {
        const sprout = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.58, 5), leaves)
        sprout.position.set((j - 1) * 0.18, 0.28, (j % 2) * 0.12)
        sprout.scale.x = 0.66
        sprout.visible = false
        sprout.castShadow = true
        patch.add(sprout)
      }
      sphere(patch, 0.22, mat('#e9a16d'), [0, 0.13, 0], [0.72, 0.56, 0.7]).visible = false
      farm.add(patch)
      this.cropPlants.push(patch)
    }
    box(this.scene, [0.15, 1.2, 0.15], clay.wood, [-5.1, 0.72, 3.3])
    const sign = box(this.scene, [1.8, 0.78, 0.14], clay.peach, [-5.1, 1.12, 3.3])
    sign.rotation.y = -0.25
  }

  private addPickups(): void {
    const pickups = [
      makePickup('shell-1', '贝壳', 17, 1), makePickup('shell-2', '贝壳', 19, -1), makePickup('shell-3', '贝壳', 16, -5),
      makePickup('berry-1', '蓝莓', 5, 4), makePickup('berry-2', '蓝莓', -12, -1), makePickup('herb-1', '香草', -17, -6),
      makePickup('flower-1', '野花', -11, 3), makePickup('flower-2', '野花', 3, 10), makePickup('flower-3', '野花', 13, 9),
      makePickup('wood-1', '木材', -14, 5), makePickup('wood-2', '木材', 6, 9), makePickup('stone-1', '石料', -15, -6), makePickup('stone-2', '石料', 14, 2),
    ]
    for (const pickup of pickups) {
      pickup.object.position.y = 0.31
      this.scene.add(pickup.object)
      this.pickups.push(pickup)
    }
  }

  private addResidents(): void {
    this.residents.push(addResident(this.scene, 'ahe', '阿禾', '帮我找回海滩边的三枚贝壳吧。', 0, -1, 'quest', { ...DEFAULT_APPEARANCE, outfit: '杏色开衫', hairStyle: '齐耳', hairColor: '亚麻金' }))
    this.residents.push(addResident(this.scene, 'xiaoman', '小满', '我在照看小镇的花园，今天的空气真好。', -7, -7, 'neighbor', { ...DEFAULT_APPEARANCE, outfit: '园艺围裙', hairStyle: '低马尾', hairColor: '茶黑' }))
    this.residents.push(addResident(this.scene, 'haishu', '海叔', '池塘水面很平静，正适合抛竿。', 7.1, -1.8, 'fisher', { ...DEFAULT_APPEARANCE, outfit: '海湾条纹衫', bottom: '长裤', hairStyle: '短卷', hairColor: '茶黑', skinTone: '浅麦' }))
    this.residents.push(addResident(this.scene, 'merchant', '阿葵', '欢迎来海湾小集，木料、鱼饵和宠物零食都备好了。', 4, -2.6, 'merchant', { ...DEFAULT_APPEARANCE, outfit: '园艺围裙', hairStyle: '蓬松卷', hairColor: '海松绿' }))
    this.residents.push(addResident(this.scene, 'mayor', '周镇长', '镇上的每一盏灯，都是大家一起点亮的。', -3.5, -3.2, 'mayor', { ...DEFAULT_APPEARANCE, accessory: '圆框眼镜', outfit: '新中式青衫', bottom: '长裤', hairStyle: '短卷', hairColor: '栗棕' }))
    this.residents.push(addResident(this.scene, 'scientist', '林博士', '我正在记录荧光植物的昼夜变化。', -14, -8, 'scientist', { ...DEFAULT_APPEARANCE, outfit: '海盐针织', bottom: '长裤', hairStyle: '低马尾', hairColor: '茶黑' }))
    this.residents.push(addResident(this.scene, 'doctor', '苏医生', '夜间活动记得带上保暖披肩。', -2, 5.5, 'doctor', { ...DEFAULT_APPEARANCE, outfit: '海盐针织', bottom: '长裤', hairStyle: '侧分波波', hairColor: '栗棕' }))
    this.residents.push(addResident(this.scene, 'musician', '茉莉', '晚些时候我会在广场弹一支新曲子。', 9, 5, 'musician', { ...DEFAULT_APPEARANCE, outfit: '杏色开衫', bottom: '绣纹长裙', hairStyle: '空气感中长', hairColor: '亚麻金' }))
    this.residents.push(addResident(this.scene, 'chef', '阿洛', '今天的菜单有香草烤鱼和莓果派。', -5.5, -4.5, 'chef', { ...DEFAULT_APPEARANCE, outfit: '海湾条纹衫', bottom: '长裤', hairStyle: '短卷', hairColor: '茶黑', skinTone: '浅麦' }))
    this.residents.push(addResident(this.scene, 'child', '芽芽', '我在找会发光的小花！', 2.5, 4.6, 'child', { ...DEFAULT_APPEARANCE, outfit: '杏色开衫', bottom: '灯笼短裤', hairStyle: '低双马尾', hairColor: '栗棕', accessory: '海星发夹' }))
    this.residents.push(addResident(this.scene, 'native', '阿澜', '荧光河谷的水母会跟着潮汐改变颜色。', -18, -13, 'native', { ...DEFAULT_APPEARANCE, skinTone: '浅麦', outfit: '薄荷外套', bottom: '长裤', hairStyle: '侧分长发', hairColor: '海松绿' }))
  }

  private addPlayer(appearance: AvatarAppearance): void {
    this.playerRig = createHumanoid(appearance)
    this.player.add(this.playerRig.root)
    this.player.position.copy(LOCATIONS.start)
    this.scene.add(this.player)
  }

  setPlayerAppearance(appearance: AvatarAppearance): void {
    const mounted = !this.player.visible
    this.removePlayerRig()
    this.playerRig = this.playerAvatarGltf ? createBlenderHumanoid(this.playerAvatarGltf, appearance) : createHumanoid(appearance)
    this.playerRig.root.position.set(0, 0, 0)
    this.playerRig.root.rotation.set(0, 0, 0)
    ;(mounted ? this.vehicleRider : this.player).add(this.playerRig.root)
  }

  getPlayerAppearanceRoot(): THREE.Object3D {
    return this.playerRig.root
  }

  async loadPlayerAvatar(assets: Assets, url: string, appearance: AvatarAppearance = DEFAULT_APPEARANCE): Promise<void> {
    const loaded = await assets.gltf(url)
    const gltf = loaded.scene ? loaded : { ...loaded, scene: loaded.scenes?.[0] }
    if (!gltf.scene) throw new Error(`avatar GLB has no scene: ${url}`)
    const probe = new THREE.Box3()
    let meshCount = 0
    let weightedMeshCount = 0
    gltf.scene.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return
      meshCount += 1
      const weighted = node instanceof THREE.SkinnedMesh || Boolean(node.geometry.getAttribute('skinIndex') && node.geometry.getAttribute('skinWeight'))
      if (weighted) {
        weightedMeshCount += 1
        probe.expandByObject(node)
      }
    })
    const sourceHeight = probe.max.y - probe.min.y
    if (!Number.isFinite(sourceHeight) || sourceHeight < 0.5 || sourceHeight > 10) throw new Error(`invalid avatar height: ${sourceHeight}`)
    if (meshCount < 8 || weightedMeshCount < 8) throw new Error(`invalid avatar skinning: ${weightedMeshCount}/${meshCount} weighted meshes`)
    this.playerAvatarGltf = gltf
    const mounted = !this.player.visible
    this.removePlayerRig()
    this.playerRig = createBlenderHumanoid(gltf, appearance)
    this.playerRig.root.rotation.y = mounted ? 0 : 0
    ;(mounted ? this.vehicleRider : this.player).add(this.playerRig.root)
  }

  async loadResidentAvatars(assets: Assets, url = 'assets/characters/player.glb'): Promise<void> {
    const loaded = this.playerAvatarGltf ?? await assets.gltf(url)
    const gltf = loaded.scene ? loaded : { ...loaded, scene: loaded.scenes?.[0] }
    if (!gltf.scene) throw new Error(`resident avatar GLB has no scene: ${url}`)
    for (const resident of this.residents) {
      resident.rig.root.removeFromParent()
      resident.rig = createBlenderHumanoid(gltf, resident.appearance)
      resident.object.add(resident.rig.root)
    }
  }

  private removePlayerRig(): void {
    const previous = this.playerRig.root
    previous.removeFromParent()
  }

  private addBicycle(): void {
    const bike = makeBicycle()
    this.vehicle.add(bike.root)
    this.vehicleRider.position.set(0, 0.18, 0.10)
    this.vehicleRider.visible = false
    this.vehicle.add(this.vehicleRider)
    this.vehicle.position.copy(VEHICLE_PARKING.bicycle)
    this.bicycleWheels.push(...bike.wheels)
    this.scene.add(this.vehicle)
    this.vehicleFleet.set('bicycle', { kind: 'bicycle', name: '小镇自行车', object: this.vehicle })
  }

  private addVehicleFleet(): void {
    const car = makeFutureCar()
    const carObject = new THREE.Group()
    carObject.add(car.root)
    carObject.position.copy(VEHICLE_PARKING.car)
    carObject.rotation.y = Math.PI
    this.scene.add(carObject)
    this.vehicleFleet.set('car', { kind: 'car', name: '星港悬浮车', object: carObject })
    this.vehicleWheels.push(...car.wheels)

    const rover = makeRover()
    const roverObject = new THREE.Group()
    roverObject.add(rover.root)
    roverObject.position.copy(VEHICLE_PARKING.rover)
    roverObject.rotation.y = -0.32
    this.scene.add(roverObject)
    this.vehicleFleet.set('rover', { kind: 'rover', name: '太空探险车', object: roverObject })
    this.vehicleWheels.push(...rover.wheels)
    this.roverThrusters.push(...rover.thrusters)

    const ship = makeSpaceship()
    this.spaceship.add(ship.root)
    // Give the cockpit enough volume for the authored avatar and make the
    // parked craft read as a vehicle rather than a small prop on the beach.
    this.spaceship.scale.setScalar(1.24)
    this.spaceship.position.copy(VEHICLE_PARKING.ship).setY(1.15)
    this.spaceship.rotation.y = Math.PI
    this.spaceshipEngine = ship.glow
    this.addVehicleParkingPad(VEHICLE_PARKING.ship, 'ship')
    this.scene.add(this.spaceship)
    this.vehicleFleet.set('ship', { kind: 'ship', name: '星穹飞船', object: this.spaceship })
  }

  /** Mark the landing zone as a deliberate piece of the world so large
   * vehicles do not visually merge into the road, plants, or shoreline. */
  private addVehicleParkingPad(position: THREE.Vector3, kind: VehicleKind): void {
    const radius = kind === 'ship' ? 6.7 : 3.2
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 0.08, 48),
      new THREE.MeshStandardMaterial({ color: '#1b3652', metalness: 0.72, roughness: 0.32, emissive: '#173d5b', emissiveIntensity: 0.45 }),
    )
    pad.position.copy(position).setY(0.26)
    pad.receiveShadow = true
    pad.name = `${kind}-parking-pad`
    this.scene.add(pad)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.86, 0.075, 8, 48),
      new THREE.MeshStandardMaterial({ color: '#8af7ef', emissive: '#35c5cd', emissiveIntensity: 2.1, metalness: 0.45, roughness: 0.22 }),
    )
    ring.rotation.x = Math.PI / 2
    ring.position.copy(position).setY(0.34)
    ring.name = `${kind}-parking-ring`
    this.scene.add(ring)
  }

  getNearestVehicle(position: THREE.Vector3, maxDistance = 4.2): VehicleInfo | null {
    let nearest: VehicleInfo | null = null
    let distance = maxDistance
    for (const vehicle of this.vehicleFleet.values()) {
      const next = position.distanceTo(vehicle.object.position)
      if (next < distance) { nearest = vehicle; distance = next }
    }
    return nearest
  }

  /** Return a ground-level point beside the active vehicle that is clear of
   * the home shell and the other parked vehicles. */
  private findVehicleExitPoint(origin: THREE.Vector3, yaw: number): THREE.Vector3 {
    const clearance = this.activeVehicle === 'ship' ? 6.4 : this.activeVehicle === 'rover' ? 5.2 : 4.6
    const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
    const candidates = [
      origin.clone().addScaledVector(side, clearance), origin.clone().addScaledVector(side, -clearance),
      origin.clone().addScaledVector(forward, clearance), origin.clone().addScaledVector(forward, -clearance),
    ]
    for (const candidate of candidates) {
      const homeDistance = Math.hypot(candidate.x - LOCATIONS.home.x, candidate.z - LOCATIONS.home.z)
      const vehicleClear = [...this.vehicleFleet.values()].every(vehicle => vehicle.object === this.vehicleFleet.get(this.activeVehicle)?.object || candidate.distanceTo(vehicle.object.position) > Math.max(3.5, clearance * 0.72))
      if (Math.hypot(candidate.x, candidate.z) < 48 && homeDistance > 7.1 && vehicleClear) {
        candidate.y = 0
        return candidate
      }
    }
    return origin.clone().addScaledVector(side, clearance).setY(0)
  }

  get activeVehicleName(): string { return this.vehicleFleet.get(this.activeVehicle)?.name ?? '载具' }
  get activeVehicleSpeed(): number {
    return this.activeVehicle === 'ship' ? 16 : this.activeVehicle === 'car' ? 12 : this.activeVehicle === 'rover' ? 9 : 7.8
  }
  get isSpaceFlight(): boolean { return this.spaceFlight }

  updateMountedVehicle(position: THREE.Vector3, yaw: number): void {
    if (!this.vehicleRider.visible) return
    const active = this.vehicleFleet.get(this.activeVehicle)?.object ?? this.vehicle
    active.position.copy(position)
    active.rotation.y = yaw
    if (this.spaceFlight) active.rotation.x = Math.sin(this.elapsed * 0.7) * 0.018
  }

  setVehicleMounted(mounted: boolean, position = this.player.position, yaw = this.player.rotation.y, kind: VehicleKind = this.activeVehicle): void {
    if (!mounted) {
      const previousKind = this.activeVehicle
      const active = this.vehicleFleet.get(previousKind)?.object ?? this.vehicle
      this.vehicleRider.visible = false
      if (this.playerRig.root.parent === this.vehicleRider) {
        this.vehicleRider.remove(this.playerRig.root)
        this.player.add(this.playerRig.root)
        this.playerRig.root.position.set(0, 0, 0)
        this.playerRig.root.rotation.set(0, 0, 0)
      }
      this.vehicleRider.removeFromParent()
      this.vehicleRider.position.set(0, 0.18, 0.10)
      this.player.visible = true
      // Leave the bicycle beside the path instead of under the avatar after
      // dismounting; otherwise its frame reads like a board attached to the
      // character and the interaction prompt keeps stealing focus.
      active.visible = true
      const origin = this.activeVehicle === 'ship' ? this.spaceOrigin.clone().setY(0) : position.clone().setY(0)
      const exit = this.findVehicleExitPoint(origin, yaw)
      const parked = origin.clone()
      this.player.position.copy(exit)
      active.position.copy(parked)
      active.rotation.y = yaw
      if (this.activeVehicle === 'ship') {
        this.spaceFlight = false
        this.scene.fog = this.groundFog
        this.player.position.x = this.spaceOrigin.x
        this.player.position.z = this.spaceOrigin.z
        this.player.position.y = 0
        const shipExit = this.findVehicleExitPoint(this.spaceOrigin, yaw)
        this.player.position.copy(shipExit)
        active.position.copy(this.spaceOrigin).setY(0)
        active.rotation.x = 0
      }
      return
    }
    this.activeVehicle = kind
    const active = this.vehicleFleet.get(kind)?.object ?? this.vehicle
    this.vehicleRider.removeFromParent()
    active.add(this.vehicleRider)
    this.vehicleRider.position.set(kind === 'ship' ? 0 : 0, kind === 'ship' ? 0.46 : kind === 'rover' ? 0.48 : kind === 'car' ? 0.34 : 0.18, kind === 'ship' ? -0.18 : 0.10)
    active.position.copy(position)
    active.rotation.y = yaw
    if (kind === 'ship') {
      this.spaceFlight = true
      this.spaceOrigin.copy(position)
      this.scene.fog = null
      this.player.position.y = 42
      active.position.y = 42
      // Seat the avatar below the canopy rim. This prevents the head from
      // clipping through the transparent shell while retaining a visible
      // rider silhouette through the cockpit glass.
      this.vehicleRider.position.y = 0.25
    }
    if (this.playerRig.root.parent !== this.vehicleRider) {
      this.player.remove(this.playerRig.root)
      this.vehicleRider.add(this.playerRig.root)
      this.playerRig.root.position.set(0, 0, 0)
      this.playerRig.root.rotation.set(0, 0, 0)
    }
    this.vehicleRider.visible = true
    this.player.visible = false
    active.visible = true
  }

  setPetKind(kind: PetKind): void {
    this.pet.clear()
    const model = makePetModel(kind)
    this.pet.add(model)
    if (!this.pet.parent) this.scene.add(this.pet)
  }

  addBuilding(building: PlacedBuilding): void {
    this.removeBuilding(building.id)
    const model = buildModel(building.kind, false, building.style)
    const elevation = building.kind === '室内地板' ? 0.03 : 0.25
    if (building.zone === 'interior') {
      model.position.set(building.x - HOME_INTERIOR_ORIGIN.x, elevation, building.z - HOME_INTERIOR_ORIGIN.z)
      this.interiorDecorations.add(model)
    } else {
      model.position.set(building.x, elevation, building.z)
      this.decorations.add(model)
    }
    model.rotation.y = building.rotation
    model.scale.setScalar(building.scale)
    if (building.zone === 'interior') {
      model.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return
        node.userData.interiorPart = building.kind === '室内地板' ? 'floor' : building.kind === '室内墙体' || building.kind === '室内门' ? 'wall' : 'wood'
      })
      this.setInteriorColors(this.interiorColors)
    }
    model.name = `building:${building.id}`
    this.buildingModels.set(building.id, model)
  }

  updateBuilding(building: PlacedBuilding): void {
    this.addBuilding(building)
  }

  removeBuilding(id: string): void {
    const model = this.buildingModels.get(id)
    if (!model) return
    model.removeFromParent()
    model.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return
      node.geometry.dispose()
      const materials = Array.isArray(node.material) ? node.material : [node.material]
      materials.forEach(material => material.dispose())
    })
    this.buildingModels.delete(id)
  }

  setBuildPreview(kind: BuildingKind, point: THREE.Vector3, valid: boolean, rotation = 0): void {
    if (this.buildPreviewKind !== kind) {
      this.buildPreview.clear()
      this.buildPreviewKind = kind
      this.buildPreviewRing = null
      this.buildPreview.add(buildModel(kind, true))
      const ringMaterial = mat(valid ? '#7eae8d' : '#d88477')
      const ringRadius = kind === '小屋' ? 2.25 : kind === '室内墙体' ? 1.85 : kind === '室内隔断' ? 1.15 : kind === '室内窗' ? 0.95 : kind === '室内地板' ? 0.88 : 0.72
      const ring = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, 0.035, 7, 24), ringMaterial)
      ring.rotation.x = Math.PI / 2
      ring.position.y = 0.28
      this.buildPreview.add(ring)
      this.buildPreviewRing = ring
    }
    if (this.buildPreviewRing) (this.buildPreviewRing.material as THREE.MeshStandardMaterial).color.set(valid ? '#7eae8d' : '#d88477')
    this.buildPreview.position.set(point.x, 0.26, point.z)
    this.buildPreview.rotation.y = rotation
    this.buildPreview.visible = true
  }

  hideBuildPreview(): void {
    this.buildPreview.visible = false
    this.buildPreviewKind = null
  }

  setCropStage(stage: CropStage, progress: number): void {
    for (let i = 0; i < this.cropPlants.length; i += 1) {
      const patch = this.cropPlants[i]
      const ready = stage === 'ready'
      const growing = stage === 'growing' && (i < Math.ceil(progress * 4))
      for (const child of patch.children) {
        if (child instanceof THREE.Mesh) child.visible = child.geometry instanceof THREE.SphereGeometry ? ready : growing || ready
      }
    }
  }

  addDecoration(index: number): void {
    const palette = [mat('#ef9b9f'), mat('#f1ce77'), mat('#9eb988'), mat('#a7c5c5')]
    const color = palette[index % palette.length]
    const spot = index % 5
    const x = -9.15 + (spot % 3) * 1.05
    const z = 8.65 + Math.floor(spot / 3) * 0.68
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.36, 8), mat('#cc8466'))
    pot.position.set(x, 0.57, z)
    pot.castShadow = true
    this.decorations.add(pot)
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), color)
    bloom.scale.set(1, 0.8, 1)
    bloom.position.set(x, 0.91, z)
    bloom.castShadow = true
    this.decorations.add(bloom)
    if (index === 0) {
      const lamp = new THREE.Group()
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 1.25, 6), clay.wood)
      stem.position.set(-5.15, 0.82, 8.8)
      lamp.add(stem)
      sphere(lamp, 0.28, mat('#f4dc9e'), [-5.15, 1.5, 8.8], [0.78, 1, 0.78])
      this.decorations.add(lamp)
    }
  }

  update(dt: number, yaw: number, moving = false, pitch = 0.08): void {
    this.elapsed += dt
    const timeSnapshot = this.worldTime.tick(dt)
    this.emissiveScanTimer += dt
    if (this.emissiveScanTimer >= 2) {
      this.emissiveScanTimer = 0
      this.indexEmissiveMaterials()
    }
    this.applyWorldTime(timeSnapshot)
    const desiredFov = this.interiorView ? 78 : this.spaceFlight ? 56 : 48
    if (Math.abs(this.camera.fov - desiredFov) > 0.1) {
      this.camera.fov = desiredFov
      this.camera.updateProjectionMatrix()
    }
    for (const [i, pickup] of this.pickups.entries()) {
      if (!pickup.active) continue
      pickup.object.position.y = 0.31 + Math.sin(this.elapsed * 2.4 + i) * 0.09
      pickup.object.rotation.y += dt * 0.35
    }
    this.clouds.forEach((cloud, i) => {
      cloud.position.x += dt * (0.18 + i * 0.01)
      if (cloud.position.x > 42) cloud.position.x = -42
    })
    this.rivers.forEach((river, i) => {
      if (!(river instanceof THREE.Mesh)) return
      if (typeof river.userData.flowSpeed === 'number') {
        river.position.x = Math.sin(this.elapsed * river.userData.flowSpeed * 0.45) * 0.035
      } else if (river.geometry instanceof THREE.TorusGeometry) {
        const phase = typeof river.userData.flowPhase === 'number' ? river.userData.flowPhase : i
        const rippleScale = 0.82 + Math.sin(this.elapsed * 1.8 + phase) * 0.18
        river.scale.set(1.8 * rippleScale, 1, rippleScale)
        if (river.material instanceof THREE.MeshBasicMaterial) {
          river.material.opacity = 0.28 + (Math.sin(this.elapsed * 2.2 + phase) + 1) * 0.12
        }
      }
    })
    this.trees.forEach((tree, i) => {
      const sway = Math.sin(this.elapsed * 0.8 + i * 1.37) * 0.025
      tree.rotation.z = sway
      tree.rotation.x = Math.cos(this.elapsed * 0.62 + i) * 0.018
    })
    this.windPlants.forEach((plant, i) => {
      plant.rotation.z = Math.sin(this.elapsed * 1.35 + i * 0.8) * 0.075
      plant.rotation.x = Math.cos(this.elapsed * 0.9 + i) * 0.04
    })
    this.airTraffic.forEach((traffic, i) => {
      const phase = this.elapsed * traffic.speed + traffic.phase
      const x = traffic.anchor.x + Math.cos(phase) * traffic.radius
      const z = traffic.anchor.z + Math.sin(phase) * traffic.radius * 0.62
      const y = traffic.altitude + Math.sin(this.elapsed * 0.42 + i * 1.8) * 1.8
      traffic.object.position.set(x, y, z)
      traffic.object.rotation.y = Math.atan2(Math.sin(phase), Math.cos(phase)) + Math.PI / 2
      traffic.object.rotation.z = Math.sin(this.elapsed * 0.75 + i) * 0.08
      traffic.object.rotation.x = Math.cos(this.elapsed * 0.56 + i) * 0.035
      traffic.object.traverse(node => {
        if (!(node instanceof THREE.Mesh) || !node.userData.airTrafficEngine) return
        node.scale.set(0.86 + Math.sin(this.elapsed * 8 + i) * 0.16, 0.86 + Math.sin(this.elapsed * 8 + i) * 0.16, 1.1 + Math.sin(this.elapsed * 8 + i) * 0.25)
      })
    })
    this.alienFlora.forEach((plant, i) => {
      plant.rotation.y += dt * (i % 2 ? 0.035 : -0.026)
      plant.position.y = (typeof plant.userData.baseY === 'number' ? plant.userData.baseY : 0.24) + Math.sin(this.elapsed * 1.1 + i) * 0.035
    })
    for (const meteor of this.meteors) {
      const cycle = meteor.duration + 13
      const t = (this.elapsed - meteor.delay) % cycle
      const active = t >= 0 && t < meteor.duration
      meteor.object.visible = active
      if (active) {
        const progress = t / meteor.duration
        meteor.object.position.lerpVectors(meteor.start, meteor.end, progress)
        meteor.object.rotation.z = -0.52
      }
    }
    this.celestial.position.copy(this.camera.position)
    this.celestial.rotation.y = Math.sin(this.elapsed * 0.008) * 0.012
    this.fishingSchool.children.forEach((fish, i) => {
      fish.position.x += Math.sin(this.elapsed * 0.9 + i) * dt * 0.16
      fish.position.y = 0.42 + Math.sin(this.elapsed * 2.1 + i) * 0.05
      fish.rotation.y = Math.sin(this.elapsed * 0.8 + i) * 0.25
    })
    this.unknownCreatures.forEach((creature, i) => {
      const patrol = this.elapsed * creature.patrolSpeed + creature.phase
      creature.object.position.x = creature.anchor.x + Math.sin(patrol) * creature.patrolRadius
      creature.object.position.z = creature.anchor.z + Math.cos(patrol * 0.83) * creature.patrolRadius * 0.7
      creature.object.position.y = Math.sin(this.elapsed * 1.4 + i) * 0.08
      creature.object.rotation.y = Math.atan2(Math.cos(patrol) * creature.patrolSpeed, Math.cos(patrol * 0.83) * creature.patrolSpeed * 0.7)
      creature.object.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return
        if (typeof node.userData.limbPhase === 'number') node.rotation.x = Math.sin(this.elapsed * 4.2 + node.userData.limbPhase) * 0.18
        if (node.geometry instanceof THREE.TorusGeometry && node !== creature.object.children.find(child => child instanceof THREE.Mesh && child.geometry instanceof THREE.TorusGeometry)) {
          node.rotation.y = Math.sin(this.elapsed * 2.1 + i) * 0.24
        }
      })
      const halo = creature.object.children.find(child => child instanceof THREE.Mesh && child.geometry instanceof THREE.TorusGeometry)
      if (halo instanceof THREE.Mesh) halo.rotation.z += dt * (0.6 + i * 0.1)
    })
    if (this.questMarker.visible) {
      this.questMarker.position.y = Math.sin(this.elapsed * 2.8) * 0.06
      const beacon = this.questMarker.children[1]
      beacon.rotation.y += dt * 1.8
    }
    this.birds.forEach((bird, i) => {
      bird.object.position.y = bird.position.y + Math.sin(this.elapsed * 2.2 + i) * 0.12
      bird.object.position.x = bird.position.x + Math.sin(this.elapsed * 0.35 + i) * 0.55
      bird.object.rotation.z = Math.sin(this.elapsed * 3.2 + i) * 0.08
    })
    // TownGame owns the resident route and their logical position. Keep the
    // render group aligned with that position here so an older local patrol
    // loop cannot pull NPCs away from their waypoints or make them appear to
    // walk in place while the logical position remains fixed.
    this.residents.forEach((resident, index) => {
      resident.object.position.copy(resident.position)
      resident.object.position.y = Math.abs(Math.sin(this.elapsed * 3.2 + index * 0.9)) * 0.012
      resident.rig.animate(this.elapsed + index * 0.14, true)
    })
    this.playerRig.animate(this.elapsed, moving && this.player.visible)
    if (!this.player.visible) {
      this.playerRig.leftArm.rotation.x = -0.48
      this.playerRig.rightArm.rotation.x = -0.48
      this.playerRig.leftLeg.rotation.x = -0.38
      this.playerRig.rightLeg.rotation.x = -0.38
    }
    if (moving && !this.player.visible) {
      for (const wheel of this.bicycleWheels) wheel.rotation.x += dt * 8
      for (const wheel of this.vehicleWheels) wheel.rotation.x += dt * 7
      this.roverThrusters.forEach((thruster, i) => { thruster.scale.z = 0.82 + Math.sin(this.elapsed * 9 + i) * 0.18 })
    }
    if (this.spaceshipEngine) {
      const pulse = 0.78 + Math.sin(this.elapsed * 8.5) * 0.16
      this.spaceshipEngine.scale.set(1, 1, pulse)
      const material = this.spaceshipEngine.material
      if (material instanceof THREE.MeshStandardMaterial) material.emissiveIntensity = 2.8 + pulse * 1.4
    }
    // Keep the companion one step to the player's right and slightly behind;
    // putting it directly behind the avatar hid the cat/dog from the camera.
    const behind = new THREE.Vector3(-Math.sin(this.player.rotation.y), 0, -Math.cos(this.player.rotation.y)).multiplyScalar(0.52)
    const side = new THREE.Vector3(Math.cos(this.player.rotation.y), 0, -Math.sin(this.player.rotation.y)).multiplyScalar(0.86)
    const petTarget = this.player.position.clone().add(behind).add(side)
    this.pet.position.lerp(petTarget, Math.min(1, dt * 2.8))
    this.pet.position.y = Math.abs(Math.sin(this.elapsed * 4.5)) * 0.035
    const petDirection = petTarget.clone().sub(this.pet.position)
    if (petDirection.lengthSq() > 0.025) this.pet.rotation.y = Math.atan2(petDirection.x, petDirection.z)
    const target = this.player.position
    for (const find of this.hiddenFinds) {
      if (target.distanceTo(find.position) < 5) find.object.visible = true
      find.object.rotation.y += dt * 0.6
      find.object.position.y = Math.sin(this.elapsed * 2.4) * 0.08
    }
    const cameraDistance = this.spaceFlight ? 24 : this.interiorView ? 6.2 : 13.2
    const offset = this.spaceFlight
      ? new THREE.Vector3(
          Math.sin(yaw) * cameraDistance,
          9 + Math.sin(pitch) * 7,
          Math.cos(yaw) * cameraDistance,
        )
      : this.interiorView
      ? new THREE.Vector3(Math.sin(yaw) * 4.6, 3.35, Math.cos(yaw) * 4.6)
        : new THREE.Vector3(Math.sin(yaw) * 9.25, 5.35, Math.cos(yaw) * 10.25)
    const desired = target.clone().add(offset)
    this.camera.position.lerp(desired, Math.min(1, dt * 4.5))
    const lookTarget = this.spaceFlight
      ? target.clone().add(new THREE.Vector3(
          -Math.sin(yaw) * 4.8,
          1.7 + Math.sin(pitch) * 13,
          -Math.cos(yaw) * 4.8,
        ))
      : this.interiorView
      ? target.clone().add(new THREE.Vector3(0, 1.05 + Math.tan(pitch) * cameraDistance, -1.35))
      : target.clone().add(new THREE.Vector3(0, 1.15 + Math.tan(pitch) * cameraDistance, 0))
    this.camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z)
    this.underwaterOverlay.position.copy(this.camera.position)
    this.underwaterOverlay.quaternion.copy(this.camera.quaternion)
    this.underwaterOverlay.scale.set(2.2, 2.2, 1)
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }
}
