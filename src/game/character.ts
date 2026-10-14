import * as THREE from 'three'
import type { AccessoryStyle, AvatarAppearance, BottomStyle, BrowStyle, EyeStyle, HairColor, HairStyle, MouthStyle, NoseStyle, Outfit, SkinTone } from './town-model'

export type HumanoidRig = {
  root: THREE.Group
  leftArm: THREE.Object3D
  rightArm: THREE.Object3D
  leftLeg: THREE.Object3D
  rightLeg: THREE.Object3D
  animate(time: number, moving: boolean): void
  getAnimationName?: () => string
}

const palette = {
  skin: { 暖桃: '#efc2a7', 奶油: '#f5d9bd', 浅麦: '#d7a27f' } satisfies Record<SkinTone, string>,
  // Contemporary tea-black and chestnut tones keep the hair soft in daylight;
  // pure black made the old cap silhouette read as a bald head from the back.
  hair: { 栗棕: '#684437', 茶黑: '#49332f', 亚麻金: '#c9975b', 海松绿: '#47776d' } satisfies Record<HairColor, string>,
  top: { 海湾条纹衫: '#84c5b8', 园艺围裙: '#91ad7d', 杏色开衫: '#e7a487', 海盐针织: '#b7c6dd', 薄荷外套: '#a8d1c5', 新中式青衫: '#5c8f86' } satisfies Record<Outfit, string>,
  bottom: { 灯笼短裤: '#e5a38c', 长裤: '#668985', 百褶裙: '#dc8f91', 宽腿长裤: '#7889a8', 绣纹长裙: '#9b7480' } satisfies Record<BottomStyle, string>,
}

function material(color: THREE.ColorRepresentation, roughness = 0.9): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness })
}

function addMesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material, position: [number, number, number], scale?: [number, number, number]): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, mat)
  mesh.position.set(...position)
  if (scale) mesh.scale.set(...scale)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function sphere(parent: THREE.Object3D, mat: THREE.Material, position: [number, number, number], scale: [number, number, number], radius = 1): THREE.Mesh {
  return addMesh(parent, new THREE.SphereGeometry(radius, 28, 20), mat, position, scale)
}

function capsule(parent: THREE.Object3D, mat: THREE.Material, position: [number, number, number], radius: number, length: number): THREE.Mesh {
  return addMesh(parent, new THREE.CapsuleGeometry(radius, length, 5, 12), mat, position)
}

function roundedFoot(parent: THREE.Object3D, mat: THREE.Material, position: [number, number, number], width: number, length: number, height: number, sole = false): THREE.Mesh {
  // A capsule rotated along the foot axis has a continuous silhouette from
  // ankle to toe. The previous box shoes made every resident read as a toy.
  const foot = addMesh(parent, new THREE.CapsuleGeometry(height * 0.5, length, 5, 14), mat, position)
  foot.rotation.x = Math.PI / 2
  foot.scale.x = width / height
  if (sole) foot.scale.y = 0.72
  return foot
}

function makeHair(head: THREE.Group, style: HairStyle, color: THREE.Material): void {
  const addBang = (points: readonly [number, number][], z = 0.365): void => {
    const shape = new THREE.Shape()
    shape.moveTo(points[0][0], points[0][1])
    for (const [x, y] of points.slice(1)) shape.lineTo(x, y)
    shape.closePath()
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: true, bevelSize: 0.010, bevelThickness: 0.008, bevelSegments: 2 })
    addMesh(head, geometry, color, [0, 0, z])
  }
  const addWisp = (points: readonly [number, number, number][], radius = 0.018): void => {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)))
    addMesh(head, new THREE.TubeGeometry(curve, 10, radius, 5, false), color, [0, 0, 0])
  }

  // A shallow scalp shell plus a rounded nape gives the hair volume from the
  // front, side, and rear. The old tall cap hid the parting and looked bald
  // whenever the camera moved behind the avatar.
  sphere(head, color, [0, 0.18, -0.04], [1.01, 0.44, 0.88], 0.39)
  const nape = capsule(head, color, [0, -0.08, -0.27], 0.19, 0.62)
  nape.scale.set(1.82, 1.0, 0.76)
  addWisp([[-0.15, 0.39, 0.39], [-0.04, 0.46, 0.41], [0.10, 0.38, 0.40]], 0.012)
  if (style === '空气感中长' || style === '齐肩层次') {
    sphere(head, color, [0, -0.04, -0.19], [0.96, 1.02, 0.56], 0.30)
    const curtain = capsule(head, color, [0, -0.20, -0.29], 0.22, 0.72)
    curtain.scale.set(1.85, 1.0, 0.72)
    for (const side of [-1, 1]) {
      const lock = capsule(head, color, [side * 0.32, -0.18, -0.035], 0.085, 0.50)
      lock.rotation.z = side * 0.10
    }
    addBang([[-0.34, 0.29], [-0.16, 0.34], [-0.05, 0.27], [-0.19, 0.08]])
    addBang([[-0.08, 0.34], [0.10, 0.32], [0.04, 0.12], [-0.02, 0.08]])
    addBang([[0.10, 0.32], [0.31, 0.27], [0.20, 0.10], [0.04, 0.12]])
    addWisp([[-0.25, 0.25, 0.38], [-0.34, -0.05, 0.37], [-0.30, -0.32, 0.25]], 0.014)
    addWisp([[0.20, 0.27, 0.38], [0.34, -0.03, 0.37], [0.30, -0.30, 0.25]], 0.014)
  } else if (style === '侧分波波' || style === '侧分长发') {
    sphere(head, color, [0.10, -0.03, -0.19], [0.98, 1.04, 0.58], 0.30)
    const curtain = capsule(head, color, [0.05, -0.18, -0.29], 0.22, 0.70)
    curtain.scale.set(1.86, 1.0, 0.70)
    sphere(head, color, [-0.35, -0.18, -0.03], [0.30, 0.96, 0.46], 0.22)
    const sideLock = capsule(head, color, [0.37, -0.26, -0.04], 0.09, 0.62)
    sideLock.rotation.z = -0.12
    addBang([[-0.34, 0.30], [-0.09, 0.34], [0.03, 0.21], [-0.15, 0.08]])
    addBang([[-0.06, 0.34], [0.18, 0.28], [0.07, 0.09], [-0.03, 0.13]])
    addWisp([[0.23, 0.23, 0.38], [0.39, -0.10, 0.37], [0.33, -0.42, 0.24]], 0.016)
  } else if (style === '软糯短发') {
    sphere(head, color, [0, -0.02, -0.18], [0.98, 0.82, 0.56], 0.30)
    const curtain = capsule(head, color, [0, -0.14, -0.27], 0.20, 0.58)
    curtain.scale.set(1.8, 1.0, 0.68)
    for (const side of [-1, 1]) {
      const lock = capsule(head, color, [side * 0.34, -0.15, -0.01], 0.075, 0.30)
      lock.rotation.z = side * 0.12
    }
    addBang([[-0.30, 0.30], [-0.12, 0.34], [-0.02, 0.14], [-0.18, 0.08]])
    addBang([[-0.10, 0.34], [0.12, 0.34], [0.06, 0.14], [-0.01, 0.11]])
    addBang([[0.10, 0.33], [0.29, 0.28], [0.18, 0.10], [0.04, 0.13]])
  } else if (style === '低双马尾') {
    sphere(head, color, [0, -0.02, -0.19], [0.99, 0.92, 0.58], 0.30)
    const curtain = capsule(head, color, [0, -0.17, -0.29], 0.22, 0.66)
    curtain.scale.set(1.84, 1.0, 0.70)
    for (const side of [-1, 1]) {
      const pony = capsule(head, color, [side * 0.37, -0.28, -0.25], 0.09, 0.55)
      pony.rotation.z = side * 0.18
    }
    addBang([[-0.31, 0.29], [-0.12, 0.34], [-0.02, 0.12], [-0.18, 0.08]])
    addBang([[-0.08, 0.34], [0.13, 0.33], [0.05, 0.12], [-0.02, 0.10]])
    addBang([[0.11, 0.33], [0.30, 0.28], [0.18, 0.10], [0.03, 0.12]])
  } else if (style === '软刘海') {
    sphere(head, color, [0, -0.02, -0.20], [0.98, 1.02, 0.58], 0.30)
    addBang([[-0.34, 0.30], [-0.19, 0.34], [-0.12, 0.10], [-0.26, 0.08]])
    addBang([[-0.18, 0.34], [0.02, 0.35], [0.01, 0.10], [-0.10, 0.08]])
    addBang([[0.02, 0.35], [0.21, 0.31], [0.12, 0.09], [0.01, 0.10]])
    addBang([[0.20, 0.31], [0.34, 0.26], [0.22, 0.08], [0.11, 0.09]])
  } else if (style === '双丸子') {
    sphere(head, color, [-0.34, 0.38, -0.04], [0.62, 0.68, 0.68], 0.21)
    sphere(head, color, [0.34, 0.38, -0.04], [0.62, 0.68, 0.68], 0.21)
    for (const side of [-1, 1]) {
      sphere(head, material('#c76a62'), [side * 0.34, 0.48, 0.19], [0.52, 0.15, 0.28], 0.07)
      sphere(head, material('#f1c36f'), [side * 0.34, 0.46, 0.25], [0.28, 0.12, 0.16], 0.035)
    }
  } else if (style === '齐耳') {
    sphere(head, color, [-0.35, -0.12, -0.02], [0.47, 0.77, 0.86], 0.25)
    sphere(head, color, [0.35, -0.12, -0.02], [0.47, 0.77, 0.86], 0.25)
    sphere(head, color, [0, -0.22, -0.18], [0.83, 0.35, 0.55], 0.26)
  } else if (style === '低马尾') {
    sphere(head, color, [0, -0.03, -0.20], [0.99, 1.10, 0.68], 0.31)
    const pony = capsule(head, color, [0.05, -0.43, -0.33], 0.11, 0.54)
    pony.rotation.x = -0.52
  } else if (style === '蓬松卷') {
    for (let i = 0; i < 9; i += 1) {
      const angle = (i / 9) * Math.PI * 2
      sphere(head, color, [Math.cos(angle) * 0.28, 0.12 + (i % 2) * 0.04, Math.sin(angle) * 0.26 - 0.06], [1, 0.92, 1], 0.16)
    }
    sphere(head, color, [0, -0.20, -0.10], [0.90, 0.42, 0.65], 0.25)
  } else {
    sphere(head, color, [0, -0.02, -0.18], [0.98, 0.90, 0.68], 0.31)
  }
}

function addBrows(head: THREE.Group, style: BrowStyle, color: THREE.Material): void {
  const tilt = style === '上扬' ? 0.22 : style === '平直' ? 0 : 0.10
  for (const side of [-1, 1]) {
    const brow = capsule(head, color, [side * 0.16, 0.145, 0.394], 0.014, 0.095)
    brow.rotation.z = -side * tilt
  }
}

/** Small, readable facial planes keep the stylised avatar expressive at the
 * game's third-person distance. They are deliberately subtle so the face
 * reads as a person rather than a collection of oversized toy parts. */
function addFaceDetails(head: THREE.Group, skin: THREE.Material): void {
  const ear = material('#e8ad9f')
  const blush = material('#d8847d', 1)
  for (const side of [-1, 1]) {
    sphere(head, skin, [side * 0.365, 0.005, 0.015], [0.22, 0.34, 0.18], 0.12)
    sphere(head, ear, [side * 0.374, 0.006, 0.105], [0.46, 0.56, 0.20], 0.055)
    sphere(head, blush, [side * 0.235, -0.105, 0.386], [0.82, 0.46, 0.20], 0.038)
  }
  // A narrow chin plane and a soft philtrum add depth without changing the
  // selected face-shape morph.
  sphere(head, skin, [0, -0.255, 0.16], [0.56, 0.33, 0.35], 0.085)
  sphere(head, material('#d89b8c'), [0, -0.165, 0.405], [0.46, 0.45, 0.22], 0.018)
}

function addMandarinCollar(root: THREE.Group, shirt: THREE.Material, accent: THREE.Material): void {
  // The collar is a small visual anchor for the default 新中式青衫 outfit and
  // also gives every procedural character a clear neckline from behind.
  addMesh(root, new THREE.BoxGeometry(0.25, 0.08, 0.045), accent, [0, 1.93, 0.285])
  addMesh(root, new THREE.BoxGeometry(0.045, 0.22, 0.035), accent, [0, 1.78, 0.305])
  addMesh(root, new THREE.BoxGeometry(0.44, 0.035, 0.028), shirt, [0, 1.24, 0.285])
}

function addEyes(head: THREE.Group, style: EyeStyle): void {
  const white = material('#fff8ee')
  const iris = material('#3c302c')
  const glint = material('#ffffff', 0.25)
  for (const side of [-1, 1]) {
    const x = side * 0.16
    if (style === '弯眼') {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x - 0.06, 0.01, 0.397),
        new THREE.Vector3(x, 0.038, 0.414),
        new THREE.Vector3(x + 0.06, 0.01, 0.397),
      ])
      addMesh(head, new THREE.TubeGeometry(curve, 8, 0.014, 5, false), iris, [0, 0, 0])
    } else {
      const almond = style === '杏仁眼'
      sphere(head, white, [x, 0.012, 0.386], almond ? [0.80, 0.52, 0.34] : [0.86, 0.70, 0.42], almond ? 0.068 : 0.071)
      sphere(head, iris, [x + side * 0.004, 0.006, 0.420], almond ? [0.58, 0.70, 0.40] : [0.68, 0.76, 0.48], almond ? 0.039 : 0.043)
      sphere(head, glint, [x - 0.010, 0.025, 0.442], [1, 1, 0.8], almond ? 0.010 : 0.014)
      if (style === '星光眼') {
        sphere(head, glint, [x + side * 0.02, -0.012, 0.444], [0.55, 0.55, 0.55], 0.009)
      }
      if (almond) {
        const lid = new THREE.CatmullRomCurve3([
          new THREE.Vector3(x - 0.065, 0.030, 0.435),
          new THREE.Vector3(x, 0.056, 0.445),
          new THREE.Vector3(x + 0.065, 0.030, 0.435),
        ])
        addMesh(head, new THREE.TubeGeometry(lid, 8, 0.010, 5, false), iris, [0, 0, 0])
      }
    }
  }
}

function addNose(head: THREE.Group, style: NoseStyle, skin: THREE.Material): void {
  const scale: [number, number, number] = style === '圆鼻' ? [0.085, 0.08, 0.075] : style === '微翘' ? [0.055, 0.052, 0.068] : [0.050, 0.058, 0.060]
  sphere(head, skin, [0, -0.085, 0.405], scale, 0.5)
  sphere(head, material('#c88878', 1), [0.035, -0.112, 0.408], [0.62, 0.34, 0.34], 0.020)
}

function addMouth(head: THREE.Group, style: MouthStyle): void {
  if (style === '惊喜') {
    sphere(head, material('#865348'), [0, -0.215, 0.398], [0.72, 1.05, 0.58], 0.040)
    sphere(head, material('#e78d83'), [0, -0.235, 0.430], [0.62, 0.40, 0.42], 0.018)
    return
  }
  if (style === '樱桃嘴') {
    sphere(head, material('#a55f5e'), [0, -0.215, 0.405], [0.90, 0.58, 0.55], 0.032)
    return
  }
  const smile = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.075, -0.205, 0.398),
    new THREE.Vector3(0, -0.238, 0.420),
    new THREE.Vector3(0.075, -0.205, 0.398),
  ])
  addMesh(head, new THREE.TubeGeometry(smile, 10, 0.011, 5, false), material('#985d55'), [0, 0, 0])
}

function addAccessory(root: THREE.Group, head: THREE.Group, style: AccessoryStyle): void {
  if (style === '海星发夹') {
    const shape = new THREE.Shape()
    for (let i = 0; i < 10; i += 1) {
      const angle = Math.PI / 2 + i * Math.PI / 5
      const radius = i % 2 === 0 ? 0.13 : 0.058
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      if (i === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }
    shape.closePath()
    const star = new THREE.Mesh(new THREE.ShapeGeometry(shape), material('#e8bd61'))
    star.position.set(-0.27, 0.17, 0.405)
    star.rotation.z = 0.14
    head.add(star)
    sphere(head, material('#e28b83'), [-0.27, 0.17, 0.414], [0.9, 0.9, 0.55], 0.035)
  } else if (style === '贝壳项链') {
    const gold = material('#d7b66f')
    const chain = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.23, 1.98, 0.22), new THREE.Vector3(-0.17, 1.88, 0.30),
      new THREE.Vector3(0, 1.84, 0.34), new THREE.Vector3(0.17, 1.88, 0.30),
      new THREE.Vector3(0.23, 1.98, 0.22),
    ])
    addMesh(root, new THREE.TubeGeometry(chain, 18, 0.014, 5, false), gold, [0, 0, 0])
    sphere(root, material('#f4dfb4'), [0, 1.83, 0.355], [0.95, 0.75, 0.45], 0.075)
    sphere(root, material('#d99080'), [0, 1.845, 0.382], [0.9, 0.82, 0.35], 0.032)
  } else if (style === '圆框眼镜') {
    const frame = material('#9b7755')
    for (const side of [-1, 1]) {
      const lens = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 6, 18), frame)
      lens.position.set(side * 0.16, 0.012, 0.445)
      head.add(lens)
    }
    addMesh(head, new THREE.BoxGeometry(0.10, 0.016, 0.016), frame, [0, 0.012, 0.445])
  } else if (style === '玉兰发簪') {
    const stem = addMesh(head, new THREE.CylinderGeometry(0.018, 0.018, 0.36, 8), material('#9b7049'), [0.30, 0.30, -0.05])
    stem.rotation.z = -0.32
    sphere(head, material('#f1d6c5'), [0.16, 0.42, -0.08], [0.62, 0.36, 0.78], 0.09)
    sphere(head, material('#e9b7aa'), [0.16, 0.42, -0.01], [0.42, 0.26, 0.52], 0.045)
  }
}

function addOutfitDetails(root: THREE.Group, appearance: AvatarAppearance, shirt: THREE.Material, accent: THREE.Material): void {
  if (appearance.outfit === '园艺围裙') {
    addMesh(root, new THREE.BoxGeometry(0.38, 0.47, 0.045), material('#d9ae78'), [0, 1.29, 0.30])
    addMesh(root, new THREE.BoxGeometry(0.055, 0.28, 0.045), material('#e9cb99'), [-0.14, 1.70, 0.28])
    addMesh(root, new THREE.BoxGeometry(0.055, 0.28, 0.045), material('#e9cb99'), [0.14, 1.70, 0.28])
    addMesh(root, new THREE.BoxGeometry(0.12, 0.08, 0.025), material('#f2d99f'), [0, 1.31, 0.33])
  } else if (appearance.outfit === '海湾条纹衫') {
    for (const y of [1.15, 1.40, 1.65]) {
      addMesh(root, new THREE.BoxGeometry(0.44, 0.035, 0.035), material('#f4e4c9'), [0, y, 0.29])
    }
    addMesh(root, new THREE.BoxGeometry(0.15, 0.10, 0.035), accent, [0, 1.83, 0.26])
  } else if (appearance.outfit === '海盐针织') {
    addMesh(root, new THREE.BoxGeometry(0.30, 0.07, 0.035), material('#f4eef2'), [0, 1.92, 0.29])
    for (const y of [1.36, 1.52, 1.68]) {
      addMesh(root, new THREE.BoxGeometry(0.46, 0.018, 0.024), material('#dfe5f0'), [0, y, 0.30])
    }
    addMesh(root, new THREE.BoxGeometry(0.06, 0.24, 0.03), accent, [0, 1.52, 0.32])
  } else if (appearance.outfit === '薄荷外套') {
    addMesh(root, new THREE.BoxGeometry(0.14, 0.28, 0.035), material('#e5f2e7'), [-0.10, 1.63, 0.30])
    addMesh(root, new THREE.BoxGeometry(0.14, 0.28, 0.035), material('#e5f2e7'), [0.10, 1.63, 0.30])
    addMesh(root, new THREE.BoxGeometry(0.04, 0.32, 0.03), accent, [0, 1.53, 0.33])
  } else if (appearance.outfit === '新中式青衫') {
    addMesh(root, new THREE.BoxGeometry(0.06, 0.42, 0.04), accent, [0, 1.50, 0.32])
    addMesh(root, new THREE.BoxGeometry(0.27, 0.06, 0.04), material('#e5cf9b'), [0, 1.82, 0.31])
    addMesh(root, new THREE.BoxGeometry(0.055, 0.23, 0.035), material('#e5cf9b'), [-0.15, 1.60, 0.31])
    addMesh(root, new THREE.BoxGeometry(0.055, 0.23, 0.035), material('#e5cf9b'), [0.15, 1.60, 0.31])
  } else {
    addMesh(root, new THREE.BoxGeometry(0.18, 0.11, 0.04), material('#fff0d4'), [0, 1.83, 0.27])
    addMesh(root, new THREE.BoxGeometry(0.050, 0.42, 0.035), accent, [0, 1.43, 0.29])
  }
  void shirt
}

export function createHumanoid(appearance: AvatarAppearance): HumanoidRig {
  const root = new THREE.Group()
  const skin = material(palette.skin[appearance.skinTone])
  const hair = material(palette.hair[appearance.hairColor])
  const shirt = material(palette.top[appearance.outfit])
  const bottom = material(palette.bottom[appearance.bottom])
  const accent = material(appearance.outfit === '园艺围裙' ? '#d7b377' : appearance.outfit === '杏色开衫' ? '#ba655e' : appearance.outfit === '海盐针织' ? '#8e8bb4' : appearance.outfit === '薄荷外套' ? '#6da695' : '#b84d52')
  const shoes = material('#f0dfd0')
  const shoeSole = material('#aa8e88')

  // A longer, lighter silhouette keeps the avatar cute without the toddler
  // proportions of the old prototype: longer legs, a narrower waist and a
  // head that is roughly one quarter of the total height.
  capsule(root, bottom, [0, 0.93, -0.015], 0.24, 0.22)
  const torso = addMesh(root, new THREE.CapsuleGeometry(0.285, 0.60, 8, 18), shirt, [0, 1.43, 0])
  torso.scale.set(1.08, 1, 0.84)
  addMesh(root, new THREE.CylinderGeometry(0.095, 0.11, 0.15, 14), skin, [0, 1.93, 0])

  const head = new THREE.Group()
  head.position.set(0, 2.22, 0)
  const headScale: [number, number, number] = appearance.faceShape === '椭圆' ? [0.95, 1.08, 0.94]
    : appearance.faceShape === '方圆' ? [1.05, 0.98, 0.98]
      : [1, 1, 0.97]
  sphere(head, skin, [0, 0, 0], headScale, 0.375)
  // One subtle lower-face volume gives a soft jawline while avoiding the
  // oversized cheek spheres that made the previous face look like a toy.
  sphere(head, skin, [0, -0.16, 0.005], [0.82, 0.56, 0.82], 0.19)
  makeHair(head, appearance.hairStyle, hair)
  addEyes(head, appearance.eyeStyle)
  addBrows(head, appearance.browStyle, hair)
  addNose(head, appearance.noseStyle, skin)
  addMouth(head, appearance.mouthStyle)
  addFaceDetails(head, skin)
  addAccessory(root, head, appearance.accessory)
  root.add(head)

  addOutfitDetails(root, appearance, shirt, accent)
  if (appearance.outfit === '新中式青衫') addMandarinCollar(root, shirt, accent)
  if (appearance.bottom === '百褶裙' || appearance.bottom === '绣纹长裙') {
    const skirt = addMesh(root, new THREE.CylinderGeometry(0.24, 0.34, 0.36, 16), bottom, [0, 0.74, 0])
    skirt.rotation.y = 0.12
    if (appearance.bottom === '绣纹长裙') {
      for (const x of [-0.15, 0, 0.15]) addMesh(root, new THREE.BoxGeometry(0.035, 0.22, 0.03), material('#e5cf9b'), [x, 0.74, 0.30])
    }
  }

  const leftArm = new THREE.Group()
  leftArm.position.set(-0.35, 1.73, 0)
  sphere(leftArm, shirt, [0, -0.11, 0], [1.08, 1.26, 1.02], 0.13)
  capsule(leftArm, skin, [0, -0.36, 0.015], 0.082, 0.30)
  sphere(leftArm, skin, [0, -0.57, 0.015], [0.72, 0.78, 0.72], 0.072)
  root.add(leftArm)
  const rightArm = new THREE.Group()
  rightArm.position.set(0.35, 1.73, 0)
  sphere(rightArm, shirt, [0, -0.11, 0], [1.08, 1.26, 1.02], 0.13)
  capsule(rightArm, skin, [0, -0.36, 0.015], 0.082, 0.30)
  sphere(rightArm, skin, [0, -0.57, 0.015], [0.72, 0.78, 0.72], 0.072)
  root.add(rightArm)

  const leftLeg = new THREE.Group()
  leftLeg.position.set(-0.15, 0.94, 0)
  capsule(leftLeg, appearance.bottom === '长裤' || appearance.bottom === '宽腿长裤' ? bottom : skin, [0, -0.25, 0], appearance.bottom === '宽腿长裤' ? 0.14 : 0.11, 0.48)
  roundedFoot(leftLeg, shoeSole, [-0.015, -0.68, 0.10], 0.25, 0.30, 0.10, true)
  roundedFoot(leftLeg, shoes, [-0.015, -0.61, 0.10], 0.23, 0.25, 0.15)
  root.add(leftLeg)
  const rightLeg = new THREE.Group()
  rightLeg.position.set(0.15, 0.94, 0)
  capsule(rightLeg, appearance.bottom === '长裤' || appearance.bottom === '宽腿长裤' ? bottom : skin, [0, -0.25, 0], appearance.bottom === '宽腿长裤' ? 0.14 : 0.11, 0.48)
  roundedFoot(rightLeg, shoeSole, [0.015, -0.68, 0.10], 0.25, 0.30, 0.10, true)
  roundedFoot(rightLeg, shoes, [0.015, -0.61, 0.10], 0.23, 0.25, 0.15)
  root.add(rightLeg)

  // The wardrobe sliders drive the same authored parts immediately. Keeping
  // the controls as local transforms avoids rebuilding individual meshes on
  // every pointer movement and preserves the walking rig references.
  const morphs = appearance.morphs
  root.scale.set(morphs.build, morphs.height, morphs.build)
  torso.scale.x = 0.96 + (morphs.build - 1) * 0.55
  torso.scale.z = 0.96 + (morphs.build - 1) * 0.55
  head.scale.set(morphs.head, morphs.head, morphs.head)
  leftArm.position.x = -0.35 * morphs.shoulder
  rightArm.position.x = 0.35 * morphs.shoulder
  leftArm.scale.x = morphs.shoulder
  rightArm.scale.x = morphs.shoulder
  leftLeg.scale.y = morphs.legs
  rightLeg.scale.y = morphs.legs
  leftLeg.position.y = 0.94 + (morphs.legs - 1) * 0.10
  rightLeg.position.y = 0.94 + (morphs.legs - 1) * 0.10

  return {
    root,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    animate(time, moving) {
      const gait = moving ? Math.sin(time * 8.4) : Math.sin(time * 1.7)
      const swing = moving ? gait * 0.36 : gait * 0.025
      const lift = moving ? Math.max(0, Math.sin(time * 8.4 + Math.PI * 0.5)) * 0.07 : 0
      leftArm.rotation.x = swing
      rightArm.rotation.x = -swing
      leftArm.rotation.z = moving ? -gait * 0.025 : 0
      rightArm.rotation.z = moving ? -gait * 0.025 : 0
      leftLeg.rotation.x = -swing * 0.88
      rightLeg.rotation.x = swing * 0.88
      leftLeg.position.y = 0.94 + (moving ? lift : 0) + (morphs.legs - 1) * 0.10
      rightLeg.position.y = 0.94 + (moving ? Math.max(0, Math.sin(time * 8.4 + Math.PI * 1.5)) * 0.07 : 0) + (morphs.legs - 1) * 0.10
      root.position.y = moving ? Math.abs(Math.sin(time * 8.4)) * 0.022 : Math.sin(time * 1.7) * 0.006
    },
  }
}
