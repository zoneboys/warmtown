import { describe, expect, it } from 'vitest'
import {
  advanceCrop,
  befriend,
  buyItem,
  catchFish,
  claimBuildKit,
  cookRecipe,
  changePet,
  claimQuest,
  collectItem,
  completeShellQuest,
  customizeAvatar,
  discoverHiddenFind,
  feedPet,
  freshTownState,
  giftFriend,
  harvestCrop,
  interactWithPet,
  normalizeTownState,
  modifyBuilding,
  modifyInteriorStyle,
  modifyHomeStyle,
  moveBuilding,
  observeBird,
  observeCreature,
  placeBuilding,
  plantSeed,
  recordActivity,
  removeBuilding,
  renamePet,
  sellItem,
  switchRegion,
  trackQuest,
  rotateBuilding,
  upgradeHome,
} from '../src/game/town-model'

describe('cozy-town progression', () => {
  it('collects items and advances the matching quest without mutating the previous save', () => {
    const before = freshTownState()
    const after = collectItem(before, '蓝莓', 2)
    const shells = collectItem(after, '贝壳', 2)
    expect(after.inventory.蓝莓).toBe(2)
    expect(before.inventory.蓝莓).toBe(0)
    expect(shells.questProgress.shells).toBe(2)
  })

  it('plants a seed, grows over time, harvests produce and advances its quest', () => {
    const planted = plantSeed(freshTownState())
    expect(planted.seeds).toBe(2)
    expect(harvestCrop(planted)).toBe(planted)
    const ready = advanceCrop(planted, 16)
    expect(ready.cropStage).toBe('ready')
    const harvested = harvestCrop(ready)
    expect(harvested.inventory.胡萝卜).toBe(1)
    expect(harvested.cropStage).toBe('empty')
    expect(harvested.coins).toBe(18)
    expect(harvested.questProgress.harvest).toBe(1)
  })

  it('awards the shell errand once and only after collecting three shells', () => {
    const two = collectItem(collectItem(freshTownState(), '贝壳'), '贝壳')
    expect(completeShellQuest(two)).toBeNull()
    const three = collectItem(two, '贝壳')
    const done = completeShellQuest(three)!
    expect(done.inventory.贝壳).toBe(0)
    expect(done.coins).toBe(28)
    expect(done.seeds).toBe(5)
    expect(done.shellQuestDone).toBe(true)
    expect(completeShellQuest(done)).toBeNull()
  })

  it('buys and sells only valid quantities and records a trading objective', () => {
    const bought = buyItem(freshTownState(), '木材', 2)!
    expect(bought.inventory.木材).toBe(2)
    expect(bought.coins).toBe(10)
    expect(bought.questProgress.trading).toBe(1)
    expect(buyItem({ ...bought, coins: 1 }, '石料')).toBeNull()
    expect(sellItem(bought, '木材')).toBeNull()
    const stocked = collectItem(bought, '蓝莓', 2)
    const sold = sellItem(stocked, '蓝莓', 2)!
    expect(sold.inventory.蓝莓).toBe(0)
    expect(sold.coins).toBe(16)
  })

  it('places a buildable item only within the home yard and when its costs are met', () => {
    const wood = collectItem(freshTownState(), '木材', 2)
    const built = placeBuilding(wood, '花盆', { x: -8.5, z: 10.5 })!
    expect(built.buildings).toHaveLength(1)
    expect(built.buildings[0].zone).toBe('yard')
    expect(built.inventory.木材).toBe(1)
    expect(built.coins).toBe(12)
    expect(built.questProgress.building).toBe(1)
    expect(placeBuilding(built, '花盆', { x: -8.4, z: 10.5 })).toBeNull()
    expect(placeBuilding(built, '长椅', { x: 0, z: 0 })).toBeNull()
  })


  it('opens the starter build kit and edits a placed house without losing the save', () => {
    const kit = claimBuildKit(freshTownState())!
    expect(kit.coins).toBe(56)
    expect(kit.inventory.木材).toBe(12)
    expect(kit.inventory.石料).toBe(6)
    expect(claimBuildKit(kit)).toBeNull()
    const placed = placeBuilding(kit, '小屋', { x: -7, z: 11 })!
    const rotated = rotateBuilding(placed, placed.buildings[0].id)!
    expect(rotated.buildings[0].rotation).toBeCloseTo(Math.PI / 4)
    const styled = modifyBuilding(rotated, placed.buildings[0].id)!
    expect(styled.buildings[0].style).toBe('花园薄荷')
    const removed = removeBuilding(styled, placed.buildings[0].id)!
    expect(removed.buildings).toHaveLength(0)
    expect(removed.inventory.木材).toBeGreaterThan(4)
    expect(removed.coins).toBeGreaterThan(28)
  })

  it('persists a readable exterior home style independently from furniture', () => {
    const styled = modifyHomeStyle(freshTownState(), '花园薄荷')
    expect(styled.homeStyle).toBe('花园薄荷')
    const restored = normalizeTownState(styled)
    expect(restored.homeStyle).toBe('花园薄荷')
    expect(restored.buildings).toHaveLength(0)
  })

  it('keeps the interior palette and unknown-life archive in the same save', () => {
    const styled = modifyInteriorStyle(freshTownState(), '暮光珊瑚')
    expect(styled.interiorStyle).toBe('暮光珊瑚')
    const observed = observeCreature(styled, '雾尾兽')
    expect(observed.exploration.creatureSightings).toContain('雾尾兽')
    expect(observed.inventory.星砂).toBe(1)
    expect(observed.questProgress.xenobiology).toBe(1)
    expect(normalizeTownState(observed).interiorStyle).toBe('暮光珊瑚')
  })

  it('keeps indoor furniture in a separate editable home zone', () => {
    const kit = claimBuildKit(freshTownState())!
    const placed = placeBuilding(kit, '床铺', { x: -8.5, z: 5.5 }, 0, 'interior')!
    expect(placed.buildings[0].zone).toBe('interior')
    expect(placeBuilding(placed, '厨房', { x: -5.5, z: 6.5 }, 0, 'interior')).not.toBeNull()
    expect(placeBuilding(placed, '床铺', { x: 5, z: 0 }, 0, 'interior')).toBeNull()
    const restored = normalizeTownState(placed)
    expect(restored.buildings[0].zone).toBe('interior')
  })

  it('supports human-scale indoor construction pieces and keeps them out of the yard', () => {
    const stocked = claimBuildKit(freshTownState())!
    const wall = placeBuilding(stocked, '室内墙体', { x: -7, z: 5.8 }, 0, 'interior')!
    expect(wall.buildings[0].kind).toBe('室内墙体')
    expect(placeBuilding(stocked, '室内墙体', { x: -7, z: 11 }, 0, 'yard')).toBeNull()
    const floor = placeBuilding(wall, '室内地板', { x: -8.5, z: 6.8 }, 0, 'interior')
    expect(floor).not.toBeNull()
    expect(placeBuilding(wall, '室内隔断', { x: 5, z: 0 }, 0, 'interior')).toBeNull()
  })

  it('moves an existing building only inside its current zone', () => {
    const kit = claimBuildKit(freshTownState())!
    const placed = placeBuilding(kit, '花盆', { x: -8.5, z: 10.5 })!
    const moved = moveBuilding(placed, placed.buildings[0].id, { x: -6.5, z: 12.5 })!
    expect(moved.buildings[0].x).toBe(-6.5)
    expect(moveBuilding(moved, moved.buildings[0].id, { x: 0, z: 0 })).toBeNull()
  })

  it('adds caught fish to the backpack and advances the fishing objective', () => {
    const caught = catchFish(freshTownState(), '银鳞鱼')
    expect(caught.inventory.银鳞鱼).toBe(1)
    expect(caught.questProgress.fishing).toBe(1)
  })

  it('claims a completed quest once and applies its reward', () => {
    const ready = recordActivity(freshTownState(), 'fishing')
    const rewarded = claimQuest(ready, 'fishing')!
    expect(rewarded.coins).toBe(24)
    expect(rewarded.inventory.宠物零食).toBe(3)
    expect(rewarded.claimedQuests).toContain('fishing')
    expect(claimQuest(rewarded, 'fishing')).toBeNull()
  })

  it('customizes face and outfit using safe appearance choices', () => {
    const styled = customizeAvatar(freshTownState(), { faceShape: '椭圆', eyeStyle: '星光眼', outfit: '园艺围裙', accessory: '圆框眼镜' })
    expect(styled.appearance.faceShape).toBe('椭圆')
    expect(styled.appearance.eyeStyle).toBe('星光眼')
    expect(styled.appearance.outfit).toBe('园艺围裙')
    expect(styled.appearance.accessory).toBe('圆框眼镜')
    const safe = normalizeTownState({ appearance: { faceShape: 'not-an-option', hairStyle: '低马尾' } })
    expect(safe.appearance.faceShape).toBe('椭圆')
    expect(safe.appearance.hairStyle).toBe('低马尾')
    expect(safe.appearance.accessory).toBe('玉兰发簪')
    const migrated = normalizeTownState({ appearance: {
      faceShape: '圆润', eyeStyle: '圆眼', browStyle: '柔和', noseStyle: '小巧', mouthStyle: '微笑',
      hairStyle: '双丸子', hairColor: '栗棕', skinTone: '暖桃', outfit: '海湾条纹衫', bottom: '灯笼短裤', accessory: '无',
    } })
    expect(migrated.appearance.hairStyle).toBe('侧分长发')
    expect(migrated.appearance.eyeStyle).toBe('杏仁眼')
  })

  it('uses the contemporary Chinese-inspired default appearance and accepts modern hair options', () => {
    const fresh = freshTownState()
    expect(fresh.appearance.faceShape).toBe('椭圆')
    expect(fresh.appearance.eyeStyle).toBe('杏仁眼')
    expect(fresh.appearance.hairStyle).toBe('侧分长发')
    expect(fresh.appearance.outfit).toBe('新中式青衫')
    const styled = customizeAvatar(fresh, { hairStyle: '侧分长发', bottom: '宽腿长裤' })
    expect(styled.appearance.hairStyle).toBe('侧分长发')
    expect(styled.appearance.bottom).toBe('宽腿长裤')
  })

  it('lets the pet bond grow, changes the companion and validates its name', () => {
    const bonded = interactWithPet(freshTownState())
    expect(bonded.pet.bond).toBe(1)
    const fed = feedPet(bonded)!
    expect(fed.inventory.宠物零食).toBe(1)
    expect(fed.pet.bond).toBe(11)
    expect(feedPet({ ...fed, inventory: { ...fed.inventory, 宠物零食: 0 } })).toBeNull()
    expect(renamePet(fed, '  小团子  ')?.pet.name).toBe('小团子')
    expect(renamePet(fed, '  ')).toBeNull()
    expect(changePet(fed, '小狗').pet.kind).toBe('小狗')
  })

  it('keeps exploration, discoveries, bird sightings and cooking in one save state', () => {
    const explored = switchRegion(freshTownState(), '萤光林地')
    expect(explored.exploration.region).toBe('萤光林地')
    expect(explored.exploration.discoveredRegions).toContain('萤光林地')
    const found = discoverHiddenFind(explored, 'find-荧光菌', '荧光菌')
    expect(found.inventory.荧光菌).toBe(1)
    const bird = observeBird(found, '月光鹭')
    expect(bird.inventory.羽毛).toBe(1)
    const ingredients = { ...bird, inventory: { ...bird.inventory, 香草: 1, 小鱼: 1 } }
    const cooked = cookRecipe(ingredients, '烤鱼')!
    expect(cooked.inventory.烤鱼).toBe(1)
    expect(cooked.exploration.craftedRecipes).toContain('烤鱼')
    const restored = normalizeTownState(cooked)
    expect(restored.exploration.region).toBe('萤光林地')
    expect(restored.exploration.birdSightings).toContain('月光鹭')
  })

  it('normalizes malformed and legacy v1 local-save values safely', () => {
    const normalized = normalizeTownState({ coins: -5, seeds: 'many', cropStage: 'unknown', inventory: { 贝壳: 3.9 }, shellQuestDone: true })
    expect(normalized.coins).toBe(0)
    expect(normalized.seeds).toBe(3)
    expect(normalized.cropStage).toBe('empty')
    expect(normalized.inventory.贝壳).toBe(3)
    expect(normalized.questProgress.shells).toBe(3)
    expect(normalized.claimedQuests).toContain('shells')
    expect(normalized.pet.name).toBe('团子')
  })

  it('tracks quests, grows local friendships and upgrades the home shell', () => {
    const tracked = trackQuest(freshTownState(), 'fishing')
    expect(tracked.trackedQuest).toBe('fishing')
    const talked = befriend(tracked, 'ahe')
    expect(talked.friends.ahe).toBe(8)
    const gifted = giftFriend(collectItem(talked, '蓝莓'), 'ahe', '蓝莓')!
    expect(gifted.friends.ahe).toBe(20)
    const upgraded = upgradeHome({ ...gifted, ...claimBuildKit(gifted)! })
    expect(upgraded?.homeLevel).toBe(2)
  })
})
