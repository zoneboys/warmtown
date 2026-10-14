import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Assets } from '../src/engine/assets'
import { createAssetLod, HABITAT_ANCHORS, WorldAssetRegistry, WORLD_ASSET_PATHS, type WorldAssetKey } from '../src/game/world-assets'

async function loadGlb(path: string) {
  const localPath = path.replace(/^staging\/assets\//, 'staging/assets/')
  const buffer = await readFile(new URL(`../${localPath.startsWith('staging/') ? localPath : `public/${localPath}`}`, import.meta.url))
  const data = Uint8Array.from(buffer).buffer
  return new Promise<Awaited<ReturnType<GLTFLoader['parseAsync']>>>((resolve, reject) => {
    new GLTFLoader().parse(data, '', resolve, reject)
  })
}

describe('authored world assets', () => {
  it('builds deterministic distance levels and exposes the habitat contract', () => {
    const near = new THREE.Group()
    const far = new THREE.Group()
    const lod = createAssetLod([{ distance: 28, object: far }, { distance: 0, object: near }])
    expect(lod.levels.map(level => level.distance)).toEqual([0, 28])
    expect(lod.userData.assetLod).toBe(true)
    expect(HABITAT_ANCHORS).toContain('ExteriorShell')
    expect(HABITAT_ANCHORS).toContain('Door_Airlock')
  })

  it('restores Blender Y-up orientation and fits each asset onto its fallback', async () => {
    const registry = new WorldAssetRegistry()
    const parsed = new Map<string, Awaited<ReturnType<typeof loadGlb>>>()
    for (const path of Object.values(WORLD_ASSET_PATHS)) parsed.set(path, await loadGlb(path))
    const assets = { gltf: async (path: string) => parsed.get(path)! } as unknown as Assets

    const result = await registry.load(assets)
    expect(result.failed).toEqual([])

    const minimumHeight: Record<WorldAssetKey, number> = {
      'habitat-pod': 5.5,
      'alien-flora': 2.8,
      'alien-creature': 2.3,
      'alien-tree': 6,
    }
    for (const key of Object.keys(WORLD_ASSET_PATHS) as WorldAssetKey[]) {
      const authored = registry.clone(key)!
      const sourceBounds = registry.bounds(authored)
      expect(sourceBounds.max.y - sourceBounds.min.y).toBeGreaterThan(minimumHeight[key])

      const fallback = new THREE.Group()
      const base = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2))
      base.position.y = 1.5
      fallback.add(base)
      fallback.position.set(7, 4, -3)
      authored.position.copy(fallback.position)
      authored.rotation.copy(fallback.rotation)
      registry.fitToFallback(authored, fallback)

      const fitted = registry.bounds(authored)
      expect(fitted.max.y - fitted.min.y).toBeCloseTo(3, 4)
      expect(fitted.min.y).toBeCloseTo(4, 4)
      expect(fitted.max.x - fitted.min.x).toBeCloseTo(2, 4)
      expect(fitted.max.z - fitted.min.z).toBeCloseTo(2, 4)
    }

    const creature = registry.clone('alien-creature')!
    const habitat = registry.clone('habitat-pod')!
    const authoredPartPosition = (root: THREE.Object3D, name: string) => {
      const position = new THREE.Vector3()
      root.traverse(node => {
        if (node.name === name) node.getWorldPosition(position)
      })
      return position
    }
    expect(authoredPartPosition(creature, 'AlienCreature_Head').x).toBeGreaterThan(0.5)
    expect(authoredPartPosition(habitat, 'Door_Airlock')).not.toEqual(new THREE.Vector3())
    expect(habitat.getObjectByName('ExteriorShell')).toBeTruthy()
    expect(habitat.getObjectByName('InteriorShell')).toBeTruthy()
    expect(habitat.getObjectByName('FurnitureAnchor_LivingRoom')).toBeTruthy()
  })
})
