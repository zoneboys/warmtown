import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Assets } from '../engine/assets'

/** Optional Blender-authored PBR assets. Gameplay keeps procedural fallbacks. */
export type WorldAssetKey = 'habitat-pod' | 'alien-flora' | 'alien-creature' | 'alien-tree'

// Staging assets are Vite-dev previews only. Production keeps using the approved public assets
// until the vertical slice passes visual and mobile QA and a deliberate promotion is requested.
const assetFolder = import.meta.env.DEV ? 'staging/assets/world' : 'assets/world'
export const WORLD_ASSET_PATHS: Record<WorldAssetKey, string> = {
  'habitat-pod': `${assetFolder}/habitat-pod.glb`,
  'alien-flora': `${assetFolder}/alien-flora.glb`,
  'alien-creature': `${assetFolder}/alien-creature.glb`,
  'alien-tree': `${assetFolder}/alien-tree.glb`,
}

export type WorldAssetLoadResult = {
  loaded: WorldAssetKey[]
  failed: Array<{ key: WorldAssetKey; error: string }>
}

export type AssetLod = { distance: number; object: THREE.Object3D }

/** Build a camera-driven LOD while preserving an authored asset's root contract. */
export function createAssetLod(levels: AssetLod[]): THREE.LOD {
  const lod = new THREE.LOD()
  for (const level of [...levels].sort((a, b) => a.distance - b.distance)) lod.addLevel(level.object, level.distance)
  lod.userData.assetLod = true
  return lod
}

export const HABITAT_ANCHORS = ['ExteriorShell', 'InteriorShell', 'Door_Airlock', 'CameraCutaway', 'FurnitureAnchor_LivingRoom', 'FurnitureAnchor_Entry'] as const

type LoadedAsset = { source: THREE.Object3D; gltf: GLTF }

function configurePbr(root: THREE.Object3D, key: WorldAssetKey): void {
  root.userData.worldAsset = key
  let appendageIndex = 0
  root.traverse(node => {
    node.userData.worldAsset = key
    if (!(node instanceof THREE.Mesh)) return
    node.castShadow = true
    node.receiveShadow = true
    if (key === 'alien-creature' && /leg|tail|fin|wing/i.test(node.name)) {
      node.userData.limbPhase = appendageIndex * 1.17
      appendageIndex += 1
    }
    if (key === 'habitat-pod') {
      const name = node.name.toLowerCase()
      node.userData.homePart = /window|porthole|glass/.test(name) ? 'window'
        : /door|airlock/.test(name) ? 'door'
          : /seam|ring|trim|beacon|strut|fin|antenna/.test(name) ? 'trim'
            : /roof|dome|upper/.test(name) ? 'roof' : 'wall'
    }
    const materials = Array.isArray(node.material) ? node.material : [node.material]
    materials.forEach(material => {
      if (!(material instanceof THREE.MeshStandardMaterial)) return
      material.envMapIntensity = Math.max(material.envMapIntensity || 0, 0.28)
      material.roughness = Math.min(1, Math.max(0.18, material.roughness))
      material.metalness = Math.min(1, Math.max(0, material.metalness))
      // Keep imported bio-lights inside the game's HDR budget. The source
      // assets remain authored with strong emission, but values such as 10-16
      // overwhelm the small game's exposure and turn the night scene white.
      material.emissiveIntensity = Math.min(material.emissiveIntensity, 0.72)
      material.toneMapped = true
    })
  })
}

/** Caches authored GLB scenes and clones independent shadow-ready instances. */
export class WorldAssetRegistry {
  private readonly loaded = new Map<WorldAssetKey, LoadedAsset>()
  private pending: Promise<WorldAssetLoadResult> | null = null

  has(key: WorldAssetKey): boolean { return this.loaded.has(key) }
  keys(): WorldAssetKey[] { return [...this.loaded.keys()] }

  async load(assets: Assets, onStatus?: (message: string) => void): Promise<WorldAssetLoadResult> {
    if (this.pending) return this.pending
    this.pending = (async () => {
      const loaded: WorldAssetKey[] = []
      const failed: Array<{ key: WorldAssetKey; error: string }> = []
      const entries = Object.entries(WORLD_ASSET_PATHS) as Array<[WorldAssetKey, string]>
      for (const [key, path] of entries) {
        if (this.loaded.has(key)) { loaded.push(key); continue }
        onStatus?.(`加载 Blender 资产：${key}`)
        try {
          const gltf = await assets.gltf(path)
          configurePbr(gltf.scene, key)
          this.loaded.set(key, { gltf, source: gltf.scene })
          loaded.push(key)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          failed.push({ key, error: message })
          console.warn(`[warmtown] optional world asset unavailable: ${path}`, error)
        }
      }
      this.pending = null
      return { loaded, failed }
    })()
    return this.pending
  }

  clone(key: WorldAssetKey): THREE.Group | null {
    const entry = this.loaded.get(key)
    if (!entry) return null
    const cloned = cloneSkeleton(entry.source)
    const root = new THREE.Group()
    root.name = `${entry.source.name || 'WorldAsset'}_Instance`
    // The Blender sources are authored Y-up, while the glTF exporter converts
    // from Blender's native Z-up frame. Restore the authored frame in Three.js.
    cloned.rotation.x = Math.PI / 2
    root.add(cloned)
    configurePbr(root, key)
    if (key === 'habitat-pod') this.ensureHabitatContract(root)
    return root
  }

  private ensureHabitatContract(root: THREE.Group): void {
    const find = (pattern: RegExp): THREE.Object3D | undefined => {
      let result: THREE.Object3D | undefined
      root.traverse(node => { if (!result && pattern.test(node.name)) result = node })
      return result
    }
    const exterior = root.getObjectByName('ExteriorShell') ?? find(/MainPressureShell|LowerShell/i)
    const interior = root.getObjectByName('InteriorShell') ?? find(/TransparentDome/i)
    const door = root.getObjectByName('Door_Airlock') ?? find(/AirlockDoor/i)
    const cutaway = root.getObjectByName('CameraCutaway') ?? find(/RoofEnergyRing|QuantumAntenna/i)
    if (exterior && exterior.name !== 'ExteriorShell') exterior.name = 'ExteriorShell'
    if (interior && interior.name !== 'InteriorShell') interior.name = 'InteriorShell'
    if (door && door.name !== 'Door_Airlock') door.name = 'Door_Airlock'
    if (cutaway && cutaway.name !== 'CameraCutaway') cutaway.name = 'CameraCutaway'
    root.userData.anchorNames = HABITAT_ANCHORS.filter(name => root.getObjectByName(name)).slice()
  }

  bounds(root: THREE.Object3D): THREE.Box3 {
    root.updateMatrixWorld(true)
    return new THREE.Box3().setFromObject(root)
  }

  private localBounds(root: THREE.Object3D): THREE.Box3 {
    root.updateMatrixWorld(true)
    const inverseRoot = root.matrixWorld.clone().invert()
    const bounds = new THREE.Box3().makeEmpty()
    root.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return
      const geometry = node.geometry
      if (!geometry.boundingBox) geometry.computeBoundingBox()
      if (!geometry.boundingBox) return
      const nodeToRoot = inverseRoot.clone().multiply(node.matrixWorld)
      bounds.union(geometry.boundingBox.clone().applyMatrix4(nodeToRoot))
    })
    return bounds
  }

  fitToFallback(root: THREE.Object3D, fallback: THREE.Object3D): THREE.Group {
    const target = this.localBounds(fallback)
    const source = this.localBounds(root)
    const targetMinY = this.bounds(fallback).min.y
    const targetSize = target.getSize(new THREE.Vector3()).multiply(fallback.scale)
    const sourceSize = source.getSize(new THREE.Vector3())
    root.scale.set(
      targetSize.x / Math.max(0.001, sourceSize.x),
      targetSize.y / Math.max(0.001, sourceSize.y),
      targetSize.z / Math.max(0.001, sourceSize.z),
    )

    // Match the authored and fallback centers in the house's rotated local frame.
    const targetCenter = target.getCenter(new THREE.Vector3()).multiply(fallback.scale)
    const sourceCenter = source.getCenter(new THREE.Vector3()).multiply(root.scale)
    const centerOffset = targetCenter.sub(sourceCenter).applyQuaternion(fallback.quaternion)
    root.position.add(centerOffset)
    root.updateMatrixWorld(true)
    const fitted = this.bounds(root)
    root.position.y += targetMinY - fitted.min.y
    return root as THREE.Group
  }
}
