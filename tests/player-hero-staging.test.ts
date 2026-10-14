import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createBlenderHumanoid } from '../src/game/blender-avatar'

const path = new URL('../staging/assets/characters/player-hero.glb', import.meta.url)

describe('player hero staging GLB', () => {
  it('loads a skinned hero scene and its required animation clips through the runtime adapter', async () => {
    const bytes = await readFile(path)
    const data = Uint8Array.from(bytes).buffer
    const gltf = await new GLTFLoader().parseAsync(data, '')
    expect(gltf.scene).toBeTruthy()
    expect(typeof gltf.scene.clone).toBe('function')
    const sourceMeshes: THREE.Mesh[] = []
    gltf.scene.traverse(node => { if (node instanceof THREE.Mesh) sourceMeshes.push(node) })
    expect(sourceMeshes.length).toBeGreaterThan(40)
    expect(sourceMeshes.some(mesh => mesh.name === 'Cube')).toBe(false)
    expect(sourceMeshes.every(mesh => mesh.geometry.getAttribute('skinIndex') && mesh.geometry.getAttribute('skinWeight'))).toBe(true)
    expect(gltf.animations.map(clip => clip.name)).toEqual(expect.arrayContaining(['Idle', 'Walk', 'Run', 'Interact']))
    const rig = createBlenderHumanoid(gltf)
    expect(rig.root.children.length).toBeGreaterThan(0)
    const sourceSkins: THREE.SkinnedMesh[] = []
    const clonedSkins: THREE.SkinnedMesh[] = []
    gltf.scene.traverse(node => { if (node instanceof THREE.SkinnedMesh) sourceSkins.push(node) })
    rig.root.traverse(node => { if (node instanceof THREE.SkinnedMesh) clonedSkins.push(node) })
    expect(clonedSkins).toHaveLength(sourceSkins.length)
    expect(clonedSkins.every((mesh, index) => mesh.skeleton !== sourceSkins[index].skeleton)).toBe(true)
    rig.root.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(rig.root)
    expect(bounds.getSize(new THREE.Vector3()).y).toBeCloseTo(2.35, 1)
    expect(() => rig.animate(0, false)).not.toThrow()
    expect(() => rig.animate(0.3, true)).not.toThrow()
  })
})
