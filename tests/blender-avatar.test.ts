import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createBlenderHumanoid } from '../src/game/blender-avatar'

describe('Blender avatar adapter', () => {
  it('normalizes model height, shadows, and named animation clips', () => {
    const scene = new THREE.Group()
    scene.name = 'Armature'
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 1), new THREE.MeshStandardMaterial({ color: '#c98f6d' }))
    body.name = 'Body'
    scene.add(body)
    const gltf = {
      scene,
      animations: [
        new THREE.AnimationClip('Idle', -1, []),
        new THREE.AnimationClip('Walk', -1, []),
      ],
    } as never

    const rig = createBlenderHumanoid(gltf)
    const bounds = new THREE.Box3().setFromObject(rig.root)
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(2.35, 2)
    expect(body.castShadow).toBe(false)
    const clonedBody = rig.root.getObjectByName('Body') as THREE.Mesh
    expect(clonedBody.castShadow).toBe(true)
    expect(clonedBody.receiveShadow).toBe(true)
    expect(() => rig.animate(0, false)).not.toThrow()
    expect(rig.getAnimationName?.()).toBe('Idle')
    expect(() => rig.animate(0.2, true)).not.toThrow()
    expect(rig.getAnimationName?.()).toBe('Walk')
    rig.animate(0.4, false)
    expect(rig.getAnimationName?.()).toBe('Idle')
  })

  it('removes an unweighted helper mesh when a skinned asset is present', () => {
    const scene = new THREE.Group()
    const bodyGeometry = new THREE.BoxGeometry(1, 2, 1)
    const vertexCount = bodyGeometry.getAttribute('position').count
    bodyGeometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(vertexCount * 4).fill(0), 4))
    bodyGeometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(vertexCount * 4).fill(0).map((_, index) => index % 4 === 0 ? 1 : 0), 4))
    const body = new THREE.Mesh(bodyGeometry, new THREE.MeshStandardMaterial({ color: '#d89172' }))
    body.name = 'Body'
    const helper = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshStandardMaterial({ color: '#ffffff' }))
    helper.name = 'UnweightedHelper'
    scene.add(body, helper)

    const rig = createBlenderHumanoid({ scene, animations: [] } as never)
    expect(rig.root.getObjectByName('Body')).toBeTruthy()
    expect(rig.root.getObjectByName('UnweightedHelper')).toBeUndefined()
  })

  it('corrects the Blender Z-up armature conversion when the source lies on Z', () => {
    const scene = new THREE.Group()
    const horizontal = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 4), new THREE.MeshStandardMaterial({ color: '#d89172' }))
    horizontal.name = 'Body'
    scene.add(horizontal)

    const rig = createBlenderHumanoid({ scene, animations: [] } as never)
    const bounds = new THREE.Box3().setFromObject(rig.root)
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(2.35, 2)
    expect(bounds.max.z - bounds.min.z).toBeLessThan(0.7)
    expect(bounds.min.y).toBeGreaterThanOrEqual(-0.001)
  })
})
