import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { HumanoidRig } from './character'
import type { AvatarAppearance } from './town-model'

const TARGET_HEIGHT = 2.35

function findNode(root: THREE.Object3D, names: RegExp): THREE.Object3D {
  let match: THREE.Object3D | undefined
  root.traverse(node => {
    if (!match && names.test(node.name)) match = node
  })
  return match ?? new THREE.Object3D()
}

function isWeightedMesh(node: THREE.Object3D): node is THREE.SkinnedMesh {
  return node instanceof THREE.SkinnedMesh || Boolean(
    node instanceof THREE.Mesh
      && node.geometry.getAttribute('skinIndex')
      && node.geometry.getAttribute('skinWeight'),
  )
}

function appearancePalette(appearance: AvatarAppearance): Record<string, string> {
  const accent = appearance.outfit === '新中式青衫' ? '#c66a58'
    : appearance.outfit === '园艺围裙' ? '#d7b377'
      : appearance.outfit === '海湾条纹衫' ? '#f4e4c9'
        : appearance.outfit === '海盐针织' ? '#8e8bb4'
          : '#d8b56a'
  return {
    skin: appearance.skinTone === '奶油' ? '#f1d2ae' : appearance.skinTone === '浅麦' ? '#c98f6d' : '#efb99b',
    hair: appearance.hairColor === '栗棕' ? '#684437' : appearance.hairColor === '亚麻金' ? '#c9975b' : appearance.hairColor === '海松绿' ? '#47776d' : '#34211d',
    top: appearance.outfit === '海湾条纹衫' ? '#84c5b8' : appearance.outfit === '园艺围裙' ? '#91ad7d' : appearance.outfit === '杏色开衫' ? '#e7a487' : appearance.outfit === '海盐针织' ? '#b7c6dd' : appearance.outfit === '薄荷外套' ? '#a8d1c5' : '#5c8f86',
    bottom: appearance.bottom === '灯笼短裤' ? '#e5a38c' : appearance.bottom === '百褶裙' ? '#dc8f91' : appearance.bottom === '宽腿长裤' ? '#7889a8' : appearance.bottom === '绣纹长裙' ? '#9b7480' : '#668985',
    accent,
  }
}

function applyAppearance(root: THREE.Object3D, appearance?: AvatarAppearance): void {
  if (!appearance) return
  const palette = appearancePalette(appearance)
  const morphs = appearance.morphs
  const head = findNode(root, /head|face|skull/i)
  if (head.parent) head.scale.multiplyScalar(morphs.head)
  for (const side of ['left', 'right']) {
    const shoulder = findNode(root, new RegExp(`${side}.*(shoulder|upperarm)|${side}.*arm`, 'i'))
    if (shoulder.parent) shoulder.scale.x *= morphs.shoulder
    const leg = findNode(root, new RegExp(`${side}.*(thigh|leg)|${side}.*upperleg`, 'i'))
    if (leg.parent) leg.scale.y *= morphs.legs
  }
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return
    const materials = Array.isArray(node.material) ? node.material : [node.material]
    const recolored = materials.map(material => {
      if (!(material instanceof THREE.MeshStandardMaterial)) return material
      const copy = material.clone()
      const tag = `${node.name} ${copy.name}`.toLowerCase()
      if (/hair|brow/.test(tag)) copy.color.set(palette.hair)
      else if (/head|jaw|ear|skin|forearm|hand|neck|nose|blush/.test(tag)) copy.color.set(palette.skin)
      else if (/collar|seam|waistband|clip/.test(tag)) copy.color.set(palette.accent)
      else if (/torso|sleeve|knit/.test(tag)) copy.color.set(palette.top)
      else if (/wideleg|sock/.test(tag)) copy.color.set(palette.bottom)
      return copy
    })
    // Keep a single material single.  Three.js treats a one-item material
    // array as grouped geometry; these authored meshes have no groups, so an
    // array would make them render nothing.
    node.material = Array.isArray(node.material) ? recolored : recolored[0]
  })
}

function prepareScene(root: THREE.Object3D, appearance?: AvatarAppearance): THREE.Group {
  const wrapper = new THREE.Group()
  // GLTF roots are cached. SkeletonUtils remaps every SkinnedMesh to the cloned
  // bones; Object3D.clone(true) leaves skin bindings pointed at the cached rig.
  const model = cloneSkeleton(root)
  let hasSkinnedMesh = false
  model.traverse(node => {
    if (isWeightedMesh(node)) hasSkinnedMesh = true
  })
  if (hasSkinnedMesh) {
    // Unweighted helpers have no reliable deformation space. The Hero export
    // binds all authored details; reject only stray helpers from other assets.
    const helpers: THREE.Mesh[] = []
    model.traverse(node => {
      if (node instanceof THREE.Mesh && !isWeightedMesh(node)) helpers.push(node)
    })
    for (const helper of helpers) helper.removeFromParent()
  }
  // The hero generator authors the character front toward +Y; the town
  // controller and camera convention face characters toward +Z.
  if (model.getObjectByName('PlayerHero_Armature')) model.rotation.y = Math.PI
  applyAppearance(model, appearance)
  // Blender's glTF exporter can leave the root bone with a -90deg X
  // conversion while the scene node itself remains unrotated. In Three.js
  // that makes a perfectly vertical Blender rig lie on the ground. Detect
  // the source bounds before scaling and correct only this known Z-up/Y-up
  // mismatch. The check is deliberately geometric so an authored tilt is not
  // hidden by a blanket rotation.
  const sourceBounds = new THREE.Box3().setFromObject(model)
  const sourceSize = sourceBounds.getSize(new THREE.Vector3())
  // This export is authored in Blender Z-up and arrives in Three.js with its
  // long axis on -Z.  Rotate only when the bounds prove that orientation;
  // authored upright assets pass through unchanged.
  if (sourceSize.z > sourceSize.y * 1.45 && sourceSize.z > sourceSize.x * 1.45) {
    model.rotation.x = Math.PI / 2
    model.updateMatrixWorld(true)
  }
  const bounds = new THREE.Box3().setFromObject(model)
  const height = Math.max(0.01, bounds.max.y - bounds.min.y)
  const scale = TARGET_HEIGHT / height
  model.scale.setScalar(scale)
  if (appearance) model.scale.multiply(new THREE.Vector3(appearance.morphs.build, appearance.morphs.height, appearance.morphs.build))
  const scaledBounds = new THREE.Box3().setFromObject(model)
  model.position.y -= scaledBounds.min.y
  model.traverse((node: THREE.Object3D) => {
    if (!(node instanceof THREE.Mesh)) return
    node.castShadow = true
    node.receiveShadow = true
    // The avatar is assembled from many rigidly weighted parts and then
    // normalized/rotated as one rig. Three.js' static skinned-mesh bounds can
    // otherwise cull the whole character after the Blender Z-up conversion.
    if (node instanceof THREE.SkinnedMesh) node.frustumCulled = false
    const materials = Array.isArray(node.material) ? node.material : [node.material]
    materials.forEach(material => {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.envMapIntensity = 0.35
        material.roughness = Math.max(material.roughness, 0.72)
        material.metalness = 0
        material.toneMapped = true
      }
    })
  })
  wrapper.add(model)
  return wrapper
}

function clipByName(clips: THREE.AnimationClip[], pattern: RegExp): THREE.AnimationClip | undefined {
  return clips.find(clip => pattern.test(clip.name))
}

function applyProceduralGait(root: THREE.Group, leftArm: THREE.Object3D, rightArm: THREE.Object3D, leftLeg: THREE.Object3D, rightLeg: THREE.Object3D, time: number, moving: boolean): void {
  // Some exported avatars contain only the rig. Keep those assets alive with
  // the same contralateral gait as the authored Blender Walk clip: left hand
  // travels with the right leg and vice versa. This also prevents a missing
  // clip from leaving a resident frozen in a default bind pose.
  const wave = moving ? Math.sin(time * 8.2) : Math.sin(time * 1.6)
  const phase = moving ? wave * 0.34 : wave * 0.025
  const armPhase = moving ? phase : phase * 0.55
  leftArm.rotation.x = armPhase
  rightArm.rotation.x = -armPhase
  leftArm.rotation.z = moving ? -wave * 0.022 : 0
  rightArm.rotation.z = moving ? -wave * 0.022 : 0
  leftLeg.rotation.x = -phase * 0.82
  rightLeg.rotation.x = phase * 0.82
  // A small alternating lift sells forward travel even when the source GLB
  // contains no locomotion clip. Keep it local to the leg roots so the feet
  // do not stretch or detach from the authored shoes.
  const leftBaseY = typeof leftLeg.userData.baseY === 'number' ? leftLeg.userData.baseY : (leftLeg.userData.baseY = leftLeg.position.y)
  const rightBaseY = typeof rightLeg.userData.baseY === 'number' ? rightLeg.userData.baseY : (rightLeg.userData.baseY = rightLeg.position.y)
  const leftLift = moving ? Math.max(0, Math.sin(time * 8.2 + Math.PI * 0.5)) * 0.045 : 0
  const rightLift = moving ? Math.max(0, Math.sin(time * 8.2 + Math.PI * 1.5)) * 0.045 : 0
  leftLeg.position.y = leftBaseY + leftLift
  rightLeg.position.y = rightBaseY + rightLift
  root.rotation.z = moving ? wave * 0.008 : 0
  root.position.y = moving ? Math.abs(Math.sin(time * 8.2)) * 0.022 : Math.sin(time * 1.6) * 0.006
}

/** Converts a Blender-exported glTF scene into the rig contract used by VillageWorld. */
export function createBlenderHumanoid(gltf: GLTF, appearance?: AvatarAppearance): HumanoidRig {
  const root = prepareScene(gltf.scene, appearance)
  const mixer = new THREE.AnimationMixer(root)
  const idle = clipByName(gltf.animations, /idle|stand|待机/i)
  const walk = clipByName(gltf.animations, /walk|run|locomotion|走/i)
  const idleAction = idle ? mixer.clipAction(idle) : undefined
  const walkAction = walk ? mixer.clipAction(walk) : undefined
  let active: THREE.AnimationAction | undefined
  let activeName = 'Idle'
  let lastTime = 0
  const switchAction = (next: THREE.AnimationAction | undefined): void => {
    if (next === active) return
    active?.fadeOut(0.16)
    next?.reset().fadeIn(0.16).play()
    active = next
    activeName = next === walkAction ? 'Walk' : 'Idle'
  }
  const leftArm = findNode(root, /left.*(arm|upperarm)|upperarm.*left|左.*臂/i)
  const rightArm = findNode(root, /right.*(arm|upperarm)|upperarm.*right|右.*臂/i)
  const leftLeg = findNode(root, /left.*(leg|thigh)|thigh.*left|左.*腿/i)
  const rightLeg = findNode(root, /right.*(leg|thigh)|thigh.*right|右.*腿/i)

  const rig = {
    root,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    animate(time: number, moving: boolean) {
      switchAction(moving ? walkAction : idleAction)
      const delta = Math.min(0.08, Math.max(0, time - lastTime))
      mixer.update(delta)
      lastTime = time
      // Use authored clips when available. If an export omitted either Idle
      // or Walk, the procedural fallback keeps the same visual language and
      // retains a natural opposite-side arm/leg rhythm.
      if (!active) applyProceduralGait(root, leftArm, rightArm, leftLeg, rightLeg, time, moving)
    },
    getAnimationName() { return activeName },
  }
  return rig
}
