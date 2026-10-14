import * as THREE from 'three'
import { Assets } from '../engine/assets'
import type { Input } from '../engine/input'
import type { Renderer } from '../engine/renderer'
import {
  advanceCrop,
  befriend,
  BUILDING_COSTS,
  buyItem,
  catchFish,
  claimBuildKit,
  cookRecipe,
  changePet,
  claimQuest as claimQuestModel,
  collectItem,
  customizeAvatar,
  discoverHiddenFind,
  feedPet,
  freshTownState,
  giftFriend,
  harvestCrop,
  HOME_INTERIOR_BUILD_BOUNDS,
  HOME_INTERIOR_WALK_BOUNDS,
  HOME_BUILD_BOUNDS,
  interactWithPet,
  isInteriorBuildingKind,
  modifyBuilding,
  modifyInteriorColors,
  modifyHomeColors,
  modifyInteriorStyle,
  modifyHomeStyle,
  moveBuilding,
  normalizeTownState,
  QUESTS,
  placeBuilding,
  isBuildingPlacementValid,
  plantSeed,
  recordActivity,
  observeBird,
  observeCreature,
  removeBuilding,
  resizeBuilding,
  renamePet,
  rotateBuilding,
  sellItem,
  switchRegion,
  trackQuest,
  upgradeHome,
  type AvatarAppearance,
  type BuildingKind,
  type BuildingStyle,
  type InteriorColors,
  type HomeColors,
  type FriendId,
  type ItemId,
  type QuestId,
  type RecipeId,
  type RegionId,
  type TownState,
} from './town-model'
import { HOME_ENTRY_RADIUS, HOME_INTERIOR_EXIT, HOME_INTERIOR_ORIGIN, HOME_ROTATION, LOCATIONS, VillageWorld, type Bird, type HiddenFind, type Pickup, type Resident, type UnknownCreature, type VehicleKind, type WaterState } from './village-world'
import {
  FLOORPLAN_MESSAGE_SOURCE,
  FLOORPLAN_PROTOCOL_VERSION,
  buildingsToFloorplanDesign,
  floorplanDesignToBuildings,
  loadStoredFloorplanDesign,
  readFloorplanDesign,
  storeFloorplanDesign,
  type FloorplanDesign,
} from './floorplan-adapter'

const SAVE_KEY = 'warm-town-save-v2'
const LEGACY_SAVE_KEY = 'warm-town-save-v1'
const INTERACT_DISTANCE = 3.2
// A five-unit apex lets a full-sized avatar reach the pod roof and tree
// terraces while the longer airtime still reads as alien low gravity.
const ALIEN_GRAVITY = 10.4
const ALIEN_JUMP_SPEED = 10.4
const MAX_PLATFORM_HEIGHT = 5.2
const MAX_STEP_HEIGHT = 0.72
const POND_WATER_CENTER = new THREE.Vector3(10, 0, -5)
const POND_WATER_RADIUS = 5.3

type ResidentRoute = {
  waypoints: THREE.Vector3[]
  targetIndex: number
  wait: number
}

export type TownPanel = 'inventory' | 'character' | 'shop' | 'build' | 'quests' | 'pet' | 'explore' | 'friends'
type Target = { kind: 'pickup'; pickup: Pickup; distance: number }
  | { kind: 'resident'; resident: Resident; distance: number }
  | { kind: 'farm' | 'pond' | 'home' | 'home-door'; distance: number }
  | { kind: 'vehicle'; vehicleKind: VehicleKind; vehicleName: string; distance: number }
  | { kind: 'interior-exit'; distance: number }
  | { kind: 'hidden-find'; find: HiddenFind; distance: number }
  | { kind: 'bird'; bird: Bird; distance: number }
  | { kind: 'creature'; creature: UnknownCreature; distance: number }
  | { kind: 'kitchen' | 'wardrobe' | 'lookout'; distance: number }
type FishingPhase = 'idle' | 'waiting' | 'bite'

export type TownGameHooks = {
  toast(message: string): void
  changed(state: TownState): void
  openPanel(panel: TownPanel): void
}

export class TownGame {
  readonly world: VillageWorld
  private readonly assets = new Assets()
  state: TownState
  started = false
  paused = false
  private yaw = 0
  private pitch = 0.08
  private elapsed = 0
  private nextSaveAt = 5
  private fishingPhase: FishingPhase = 'idle'
  private fishingTimer = 0
  private biteAfter = 0
  private buildKind: BuildingKind | null = null
  private movingBuildingId: string | null = null
  private buildRotation = 0
  private mounted = false
  private lastTarget = ''
  private pointerDrag = false
  private lastPointerX = 0
  private lastPointerY = 0
  private lastBuildPoint: THREE.Vector3 | null = null
  private readonly canvas: HTMLCanvasElement
  private readonly raycaster = new THREE.Raycaster()
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.26)
  private interior = false
  private waterState: WaterState = 'dry'
  private avatarLoadStarted = false
  // Pandora-like gravity: enough lift to feel alien, while still landing in a
  // predictable time window for a third-person game.
  private verticalVelocity = 0
  private grounded = true
  private readonly residentRoutes = new Map<string, ResidentRoute>()
  private floorplanWindow: Window | null = null

  constructor(private readonly renderer: Renderer, private readonly input: Input, private readonly hooks: TownGameHooks) {
    this.world = new VillageWorld()
    this.canvas = renderer.canvas
    this.state = this.load()
    this.world.player.position.copy(LOCATIONS.start)
    this.world.setPlayerAppearance(this.state.appearance)
    this.world.setHomeStyle(this.state.homeStyle)
    this.world.setHomeColors(this.state.homeColors)
    this.world.setInteriorStyle(this.state.interiorStyle)
    this.world.setInteriorColors(this.state.interiorColors)
    this.world.setHomeLevel(this.state.homeLevel)
    this.world.setHomeColors(this.state.homeColors)
    this.world.setPetKind(this.state.pet.kind)
    this.world.setCropStage(this.state.cropStage, this.cropProgress())
    for (let i = 0; i < this.state.decorations; i += 1) this.world.addDecoration(i)
    for (const building of this.state.buildings) this.world.addBuilding(building)
    this.world.setInteriorLayoutAuthored(this.state.buildings.some(building => building.zone === 'interior' && building.floorplan?.sourceId?.startsWith('w')))
    this.initializeResidentRoutes()
    this.world.setQuestMarker(this.state.trackedQuest)
    this.bindPointer()
    this.bindFloorplanMessages()
    this.hooks.changed(this.state)
  }

  start(): void {
    this.started = true
    this.paused = false
    this.input.endFrame()
    this.hooks.toast('海风正好，去小镇里走走吧。靠近居民、摊位或池塘，按 E 互动。')
    void this.loadBlenderAvatar()
    void this.world.loadWorldAssets(this.assets, message => {
      // Keep the boot interaction responsive while optional world GLBs stream
      // in; the world remains playable on the procedural fallbacks.
      if (message.includes('habitat-pod')) this.hooks.toast('正在加载 Blender 5.2 外星栖居舱资产…')
    }).then(result => {
      const loaded = result.loaded.length
      const failed = result.failed.length
      if (loaded > 0) this.hooks.toast(`已替换 ${loaded} 个 Blender 5.2 PBR 世界资产${failed ? `，${failed} 个使用程序化后备` : ''}。`)
    })
  }

  togglePause(): void {
    if (!this.started) return
    this.paused = !this.paused
    this.pointerDrag = false
    if (this.paused) this.cancelBuild()
  }

  setMenuOpen(open: boolean): void {
    if (this.started) this.paused = open
    this.pointerDrag = false
    this.input.endFrame()
  }

  interact(): void {
    if (!this.started || this.paused) return
    if (this.fishingPhase !== 'idle') {
      this.reelFishing()
      return
    }
    const target = this.nearestTarget()
    // The enlarged porch is intentionally forgiving: once the home prompt is
    // visible, pressing E should enter without pixel-hunting the doorway.
    const interactionDistance = target?.kind === 'home-door' ? HOME_ENTRY_RADIUS : target?.kind === 'home' ? 5.5 : INTERACT_DISTANCE
    if (!target || target.distance > interactionDistance) {
      this.hooks.toast('附近没有需要互动的东西。沿着小路再往前看看吧。')
      return
    }
    if (target.kind === 'pickup') {
      const { pickup } = target
      this.state = collectItem(this.state, pickup.item)
      pickup.active = false
      pickup.object.visible = false
      const names: Record<Pickup['item'], string> = { 贝壳: '一枚贝壳', 蓝莓: '一把蓝莓', 野花: '一朵野花', 木材: '一段木料', 石料: '一块石料', 香草: '一束香草' }
      this.hooks.toast(`拾到了${names[pickup.item]}，已经放进背包。`)
      this.saveAndNotify()
      return
    }
    if (target.kind === 'interior-exit') {
      this.leaveInterior()
      return
    }
    if (target.kind === 'hidden-find') {
      this.state = discoverHiddenFind(this.state, target.find.id, target.find.item)
      target.find.object.visible = false
      this.hooks.toast(`发现了${target.find.item}！已经放进背包。`)
      this.saveAndNotify()
      return
    }
    if (target.kind === 'bird') {
      this.state = observeBird(this.state, target.bird.species)
      this.hooks.toast(`观察到了${target.bird.species}，记录已加入观鸟手册。`)
      this.saveAndNotify()
      return
    }
    if (target.kind === 'creature') {
      this.state = observeCreature(this.state, target.creature.species)
      target.creature.object.visible = false
      this.world.setQuestMarker(this.state.trackedQuest)
      this.hooks.toast(`记录了${target.creature.species}的星脉样本，获得 1 份星砂。`)
      this.saveAndNotify()
      return
    }
    if (target.kind === 'kitchen') {
      this.hooks.openPanel('explore')
      this.hooks.toast('烹饪台：选择一份食谱，把今天的收获做成晚餐。')
      return
    }
    if (target.kind === 'wardrobe') {
      this.hooks.openPanel('character')
      return
    }
    if (target.kind === 'lookout') {
      this.hooks.toast(`登上了云端观景台。当前区域：${this.world.getRegionName()}。`)
      return
    }
    if (target.kind === 'resident') {
      this.talk(target.resident)
      return
    }
    if (target.kind === 'farm') {
      this.interactFarm()
      return
    }
    if (target.kind === 'pond') {
      this.startFishing()
      return
    }
    if (target.kind === 'home-door') {
      this.enterInterior()
      return
    }
    if (target.kind === 'home') {
      this.hooks.openPanel('build')
      this.hooks.toast('挑一件喜欢的院落物件，再在家门前点一下放置。')
      return
    }
    if (target.kind === 'vehicle') this.toggleVehicle(target.vehicleKind)
  }

  getPrompt(): string {
    if (!this.started) return '先整理好自己的样子，再开始一段慢悠悠的海湾散步。'
    if (this.paused) return '旅途暂歇中，关闭面板或按 Esc 继续漫游。'
    if (this.mounted && this.world.isSpaceFlight) return '星穹飞船 · 低重力飞行 · WASD移动 · 鼠标上下俯仰 · V返回地面'
    if (this.mounted) return `驾驶${this.world.activeVehicleName}漫游 · 按 V 下车`
    if (this.movingBuildingId) return '移动家具预览 · 绿色可放置 · 点击确认 · Esc 取消'
    if (this.buildKind) return `建造预览已就绪 · 在${this.interior ? '室内' : '院落'}点击放置 · 按 Esc 取消`
    if (this.waterState === 'deep') return '深水区 · 正在游泳 · 方向键移动 · 按 E 离开水面'
    if (this.waterState === 'shallow') return '浅水区 · 轻轻涉水 · 靠近海岸可以上岸'
    if (this.fishingPhase === 'waiting') return '浮漂静静地等着 · 听见提示后按 E 收竿'
    if (this.fishingPhase === 'bite') return '咬钩了！现在按 E 收竿'
    const target = this.nearestTarget()
    const targetRange = target?.kind === 'home-door' ? HOME_ENTRY_RADIUS : 5.5
    if (!target || target.distance > targetRange) {
      const tracked = this.state.trackedQuest ? QUESTS.find(quest => quest.id === this.state.trackedQuest) : null
      const markerDistance = this.world.getQuestMarkerDistance(this.world.player.position)
      if (tracked && markerDistance !== null) return `追踪：${tracked.title} · 目标约 ${Math.round(markerDistance)} 米`
      return this.mounted ? `驾驶${this.world.activeVehicleName}漫游 · 按 V 下车` : '异星陆地探索 · 低重力 · Space 跳跃 · E 互动'
    }
    if (target.kind === 'pickup') return `靠近了：${target.pickup.item} · 按 E 拾取`
    if (target.kind === 'resident') {
      if (target.resident.role === 'merchant') return `遇见摊主${target.resident.name} · 按 E 打开小集`
      return `遇见了${target.resident.name} · 按 E 交谈`
    }
    if (target.kind === 'farm') return this.state.cropStage === 'ready' ? '作物成熟了 · 按 E 收获' : this.state.cropStage === 'growing' ? '小苗正在生长 · 按 E 查看' : '暖湾小菜圃 · 按 E 播种'
    if (target.kind === 'pond') return '海风池塘 · 按 E 抛竿或收竿'
    if (target.kind === 'vehicle') return `${target.vehicleName} · 按 E 驾驶`
    if (target.kind === 'hidden-find') return `发现发光的${target.find.item} · 按 E 收集`
    if (target.kind === 'bird') return `${target.bird.species}在附近 · 按 E 观察`
    if (target.kind === 'creature') return `${target.creature.species}正在观察你 · 按 E 记录`
    if (target.kind === 'kitchen') return '烹饪台 · 按 E 查看食谱'
    if (target.kind === 'wardrobe') return '换装衣柜 · 按 E 打开衣橱'
    if (target.kind === 'lookout') return '云端观景台 · 按 E 眺望远方'
    if (target.kind === 'interior-exit') return '靠近门口按 E 出门 · 按 B 打开室内建造'
    if (target.kind === 'home-door') return '家门入口 · 按 E 进入室内'
    return '回到家门口 · 按 E 打开建造菜单'
  }

  getTargetName(): string {
    const target = this.nearestTarget()
    const targetRange = target?.kind === 'home-door' ? HOME_ENTRY_RADIUS : 5.5
    if (!target || target.distance > targetRange) return ''
    if (target.kind === 'pickup') return target.pickup.item
    if (target.kind === 'resident') return target.resident.name
    if (target.kind === 'farm') return '小菜圃'
    if (target.kind === 'pond') return '海风池塘'
    if (target.kind === 'vehicle') return target.vehicleName
    if (target.kind === 'hidden-find') return target.find.item
    if (target.kind === 'bird') return target.bird.species
    if (target.kind === 'creature') return target.creature.species
    if (target.kind === 'kitchen') return '烹饪台'
    if (target.kind === 'wardrobe') return '换装衣柜'
    if (target.kind === 'lookout') return '云端观景台'
    if (target.kind === 'interior-exit') return '小屋门口'
    if (target.kind === 'home-door') return '家门入口'
    return '你的家'
  }

  get isInterior(): boolean { return this.interior }

  get isBuilding(): boolean { return this.buildKind !== null }

  editInterior(): void {
    if (!this.started) return
    this.enterInterior()
  }

  leaveInteriorFromMenu(): void {
    if (!this.started || !this.interior) return
    this.leaveInterior()
  }

  step(dt: number): void {
    if (!this.started || this.paused) {
      this.world.update(dt, this.yaw, false, this.pitch)
      return
    }
    const delta = Math.min(0.05, Math.max(0, dt))
    this.elapsed += delta
    this.input.update()
    const look = this.input.takeLook()
    this.yaw -= look.x
    this.pitch = Math.max(-0.72, Math.min(0.82, this.pitch - look.y))
    if (this.input.consume('pause')) this.togglePause()
    if (this.paused) {
      this.input.endFrame()
      return
    }
    if (this.input.consume('vehicle')) this.toggleVehicle()
    if (this.input.consume('interact')) this.interact()
    if (
      this.input.consume('jump') &&
      !this.mounted &&
      !this.interior &&
      this.waterState === 'dry' &&
      this.grounded
    ) {
      this.verticalVelocity = ALIEN_JUMP_SPEED
      this.grounded = false
    }
    const move = this.input.move
    const intentLength = Math.hypot(move.x, move.y)
    let movedThisFrame = false
    if (intentLength > 0.02) {
      const forward = this.world.isSpaceFlight
        ? new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch))
        : new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
      const direction = right.multiplyScalar(move.x).add(forward.multiplyScalar(move.y)).normalize()
      const speed = this.mounted ? this.world.activeVehicleSpeed : this.waterState === 'deep' ? 3.0 : this.waterState === 'shallow' ? 2.2 : 4.15
      const next = this.world.player.position.clone().addScaledVector(direction, speed * delta)
      // Keep the playable island generous. The old 76-unit gate made the
      // outer alien biomes feel like an invisible wall even though the world
      // and camera were authored for a much larger horizon.
      const distance = Math.hypot(next.x, next.z)
      const beforeMove = this.world.player.position.clone()
      if (this.world.isSpaceFlight) {
        // Flying follows the camera pitch, so holding W while looking up can
        // carry the ship from the atmosphere into the star field.
        next.y = THREE.MathUtils.clamp(next.y, 18, 220)
        this.world.player.position.copy(next)
      } else if (this.interior) {
        next.x = Math.max(HOME_INTERIOR_WALK_BOUNDS.minX, Math.min(HOME_INTERIOR_WALK_BOUNDS.maxX, next.x))
        next.z = Math.max(HOME_INTERIOR_WALK_BOUNDS.minZ, Math.min(HOME_INTERIOR_WALK_BOUNDS.maxZ, next.z))
        if (!this.isBlockedByInteriorStructure(next)) this.world.player.position.copy(next)
      } else if (distance < 176 && (!this.isBlockedByHome(next) || (!this.grounded && (next.y > 1.8 || this.getSupportHeight(next) > this.world.player.position.y + 0.2)))) {
        const support = this.getSupportHeight(next)
        // Short steps and roots can be walked onto. Larger ledges still need
        // a jump, while a jump can pass the wall volume above head height.
        if (this.grounded && support > this.world.player.position.y + 0.05) {
          if (support - this.world.player.position.y <= MAX_STEP_HEIGHT) next.y = support
        }
        // A high canopy or roof detected above the path is not a wall. Keep
        // horizontal travel responsive and let the jump/landing solver decide
        // whether the surface can actually be reached.
        this.world.player.position.copy(next)
        if (this.waterState === 'deep') this.world.player.position.y = 0.05
      }
      movedThisFrame = this.world.player.position.distanceToSquared(beforeMove) > 0.000001
      this.world.player.rotation.y = Math.atan2(direction.x, direction.z)
    }
    if (!this.mounted && !this.interior && this.waterState === 'dry') {
      const previousY = this.world.player.position.y
      this.verticalVelocity -= ALIEN_GRAVITY * delta
      const proposedY = previousY + this.verticalVelocity * delta
      const support = this.getSupportHeight(this.world.player.position)
      // A ledge above the current feet is not a floor until the avatar has
      // jumped onto it. Otherwise walking into a building side would make
      // the player fall forever while the ray still sees its roof.
      const landingY = support > 0 && previousY >= support - 0.2 ? support : 0
      if (this.verticalVelocity <= 0 && proposedY <= landingY && previousY >= landingY - 0.08) {
        this.world.player.position.y = landingY
        this.verticalVelocity = 0
        this.grounded = true
      } else {
        this.world.player.position.y = proposedY
      }
    } else if (!this.world.isSpaceFlight) {
      this.world.player.position.y = 0
      this.verticalVelocity = 0
      this.grounded = true
    }
    this.waterState = this.interior || this.mounted ? 'dry' : this.world.getWaterState(this.world.player.position)
    this.world.setUnderwater(!this.mounted && this.waterState === 'deep')
    if (this.mounted) this.world.updateMountedVehicle(this.world.player.position, this.world.player.rotation.y)
    this.state = advanceCrop(this.state, delta)
    this.world.setCropStage(this.state.cropStage, this.cropProgress())
    if (this.elapsed >= this.nextSaveAt) {
      this.nextSaveAt = this.elapsed + 5
      this.saveAndNotify()
    }
    this.updateFishing(delta)
    if (this.fishingPhase !== 'idle' && this.world.player.position.distanceTo(LOCATIONS.pond) > 6) {
      this.fishingPhase = 'idle'
      this.hooks.toast('你离开了池塘，先把鱼竿收好吧。')
    }
    this.world.update(delta, this.yaw, movedThisFrame, this.pitch)
    this.updateResidentWander(delta)
    const targetName = this.getTargetName()
    if (targetName !== this.lastTarget) {
      this.lastTarget = targetName
      this.hooks.changed(this.state)
    }
    this.input.endFrame()
  }

  render(): void {
    this.renderer.render(this.world.scene, this.world.camera)
  }

  setVirtualMove(x: number, y: number): void {
    this.input.setTouchMove(x, y)
  }

  clearVirtualMove(): void {
    this.input.setTouchMove(0, 0)
  }

  customize(changes: Partial<AvatarAppearance>): void {
    this.state = customizeAvatar(this.state, changes)
    this.world.setPlayerAppearance(this.state.appearance)
    this.saveAndNotify()
  }

  async loadBlenderAvatar(url = (import.meta.env.DEV ? 'staging/assets/characters/player-hero.glb' : 'assets/characters/player.glb')): Promise<boolean> {
    const defaultUrl = import.meta.env.DEV ? 'staging/assets/characters/player-hero.glb' : 'assets/characters/player.glb'
    if (this.avatarLoadStarted && url === defaultUrl) return true
    if (url === defaultUrl) this.avatarLoadStarted = true
    try {
      await this.world.loadPlayerAvatar(this.assets, url, this.state.appearance)
      await this.world.loadResidentAvatars(this.assets, url)
      this.hooks.toast('Blender 5.2 原创中国当代卡通角色已加载：玩家与居民统一使用完整发型、面部和服装资产。')
      return true
    } catch (error) {
      console.warn(`[warmtown] avatar asset rejected: ${url}`, error)
      const reason = error instanceof Error ? error.message : String(error)
      this.hooks.toast(`Blender 角色加载失败：${reason.slice(0, 96)}`)
      if (url === defaultUrl) this.avatarLoadStarted = false
      this.world.setPlayerAppearance(this.state.appearance)
      return false
    }
  }

  buy(item: ItemId, amount = 1): boolean {
    const next = buyItem(this.state, item, amount)
    if (!next) {
      this.hooks.toast('贝币不够，或这件商品暂时没有上架。')
      return false
    }
    this.state = next
    this.hooks.toast(`买下了${amount > 1 ? ` ${amount} 件` : '一份'}${item}。`)
    this.saveAndNotify()
    return true
  }

  sell(item: ItemId, amount = 1): boolean {
    const next = sellItem(this.state, item, amount)
    if (!next) {
      this.hooks.toast(`背包里没有足够的${item}，或摊位不收这类物品。`)
      return false
    }
    this.state = next
    this.hooks.toast(`卖出了${amount > 1 ? ` ${amount} 件` : '一份'}${item}，贝币已到账。`)
    this.saveAndNotify()
    return true
  }

  claimQuest(id: QuestId): boolean {
    const next = claimQuestModel(this.state, id)
    if (!next) {
      this.hooks.toast('这个目标还没有完成，或者奖励已经领取过了。')
      return false
    }
    const title = id === 'shells' ? '海风里的小心愿' : id === 'fishing' ? '池塘来信' : id === 'harvest' ? '花园新鲜事' : id === 'building' ? '把家门口布置好' : id === 'trading' ? '市集初相识' : '熟悉的邻里'
    this.state = next
    this.hooks.toast(`完成「${title}」！奖励已经放进背包。`)
    this.saveAndNotify()
    return true
  }

  beginBuild(kind: BuildingKind): void {
    if (isInteriorBuildingKind(kind) && !this.interior) {
      this.hooks.toast('室内墙体、隔断、地板和窗只能在室内编辑，请先进入房屋。')
      return
    }
    if (!isInteriorBuildingKind(kind) && this.interior && kind === '小屋') {
      this.hooks.toast('小屋外壳需要在院落中放置。室内可以继续搭墙和布置家具。')
      return
    }
    this.buildKind = kind
    this.movingBuildingId = null
    this.buildRotation = 0
    this.pointerDrag = false
    this.lastBuildPoint = this.interior
      ? new THREE.Vector3(-6.5, 0.26, 7.5)
      : new THREE.Vector3(-7, 0.26, 12.5)
    this.hooks.toast(`选择了${kind}。移动鼠标查看${this.interior ? '室内' : '院落'}预览，点击地面放置；Esc 可取消。`)
    this.refreshBuildPreview(this.lastBuildPoint)
  }

  beginMoveBuilding(id: string): void {
    const building = this.state.buildings.find(entry => entry.id === id)
    if (!building) return
    if ((building.zone === 'interior') !== this.interior) {
      this.hooks.toast(building.zone === 'interior' ? '先进入室内，再移动这件家具。' : '先回到院落，再移动这件建筑。')
      return
    }
    this.buildKind = building.kind
    this.movingBuildingId = id
    this.buildRotation = building.rotation
    this.pointerDrag = false
    this.lastBuildPoint = new THREE.Vector3(building.x, 0.26, building.z)
    this.hooks.toast(`正在移动${building.kind}。绿色预览可放置，按 R 调整角度，Esc 取消。`)
    this.refreshBuildPreview(this.lastBuildPoint)
  }

  trackQuest(id: QuestId): void {
    this.state = trackQuest(this.state, id)
    this.world.setQuestMarker(this.state.trackedQuest)
    this.saveAndNotify()
  }

  befriend(id: FriendId): void {
    this.state = befriend(this.state, id)
    this.hooks.toast('关系更近了一点。打开好友手册可以查看居民故事。')
    this.saveAndNotify()
  }

  giftFriend(id: FriendId, item: ItemId): boolean {
    const next = giftFriend(this.state, id, item)
    if (!next) {
      this.hooks.toast('需要一件可以赠送的背包物品。')
      return false
    }
    this.state = next
    this.hooks.toast('礼物送出去了，对方的好感度提升了。')
    this.saveAndNotify()
    return true
  }

  upgradeHome(): boolean {
    const next = upgradeHome(this.state)
    if (!next) {
      this.hooks.toast('扩建需要更多贝币、木材、石料或星砂。')
      return false
    }
    this.state = next
    this.world.setHomeLevel(this.state.homeLevel)
    this.world.setHomeColors(this.state.homeColors)
    this.hooks.toast(`家园扩建完成：${this.state.homeLevel === 2 ? '观景房' : '星港阁楼'}已解锁。`)
    this.saveAndNotify()
    return true
  }

  claimBuildKit(): void {
    const next = claimBuildKit(this.state)
    if (!next) {
      this.hooks.toast('基础建材包已经领取过，或院落里已有建筑。')
      return
    }
    this.state = next
    this.hooks.toast('领取了新手建材包：木材、石料和贝币已经到账，可以先搭一间小屋。')
    this.saveAndNotify()
  }

  removeBuilding(id: string): void {
    const building = this.state.buildings.find(entry => entry.id === id)
    const next = removeBuilding(this.state, id)
    if (!next || !building) {
      this.hooks.toast('没有找到这件院落建筑。')
      return
    }
    this.state = next
    this.world.removeBuilding(id)
    this.hooks.toast(`收起了${building.kind}，返还的材料和贝币已放回背包。`)
    this.saveAndNotify()
  }

  rotateBuilding(id: string): void {
    const next = rotateBuilding(this.state, id)
    if (!next) return
    this.state = next
    const building = next.buildings.find(entry => entry.id === id)
    if (building) this.world.updateBuilding(building)
    this.hooks.toast('建筑已旋转 45°。')
    this.saveAndNotify()
  }

  modifyBuilding(id: string): void {
    const next = modifyBuilding(this.state, id)
    if (!next) return
    this.state = next
    const building = next.buildings.find(entry => entry.id === id)
    if (building) this.world.updateBuilding(building)
    this.hooks.toast(`已切换${building?.kind ?? '建筑'}的外观主题。`)
    this.saveAndNotify()
  }

  resizeBuilding(id: string, scale: number): void {
    const next = resizeBuilding(this.state, id, scale)
    if (!next) return
    this.state = next
    const building = next.buildings.find(entry => entry.id === id)
    if (building) this.world.updateBuilding(building)
    this.saveAndNotify()
  }

  modifyInteriorColors(colors: Partial<InteriorColors>): void {
    this.state = modifyInteriorColors(this.state, colors)
    this.world.setInteriorColors(this.state.interiorColors)
    this.saveAndNotify()
  }

  modifyHomeColors(colors: Partial<HomeColors>): void {
    this.state = modifyHomeColors(this.state, colors)
    this.world.setHomeColors(this.state.homeColors)
    this.saveAndNotify()
  }

  modifyHomeStyle(style: BuildingStyle): void {
    // Style buttons live inside the paused build panel, so the paused state is
    // expected here. Only reject calls made before the player enters the game.
    if (!this.started) return
    this.state = modifyHomeStyle(this.state, style)
    this.world.setHomeStyle(this.state.homeStyle)
    this.world.setHomeColors(this.state.homeColors)
    this.hooks.toast(`小屋外观已切换为「${this.state.homeStyle}」，室内家具和存档保持不变。`)
    this.saveAndNotify()
  }

  modifyInteriorStyle(style: BuildingStyle): void {
    if (!this.started) return
    this.state = modifyInteriorStyle(this.state, style)
    this.world.setInteriorStyle(this.state.interiorStyle)
    this.world.setInteriorColors(this.state.interiorColors)
    this.hooks.toast(`室内墙面与地板已切换为「${this.state.interiorStyle}」。`)
    this.saveAndNotify()
  }

  cancelBuild(): void {
    if (!this.buildKind && !this.movingBuildingId) return
    this.buildKind = null
    this.movingBuildingId = null
    this.lastBuildPoint = null
    this.world.hideBuildPreview()
  }

  confirmBuild(): void {
    if (!this.buildKind || this.paused) return
    const point = this.lastBuildPoint?.clone()
    if (!point) {
      this.hooks.toast('预览位置还没有准备好，请移动鼠标或触碰场地。')
      return
    }
    this.placeBuildAtPoint(point)
  }

  rotateBuild(): void {
    if (!this.buildKind) return
    this.buildRotation = (this.buildRotation + Math.PI / 4) % (Math.PI * 2)
    if (this.lastBuildPoint) this.refreshBuildPreview(this.lastBuildPoint)
  }

  toggleVehicle(requestedKind?: VehicleKind): void {
    if (!this.started || this.paused) return
    if (this.mounted) {
      this.mounted = false
      this.world.setVehicleMounted(false)
      this.hooks.toast('载具已停靠，继续探索未知区域吧。')
      return
    }
    const nearby = this.world.getNearestVehicle(this.world.player.position, INTERACT_DISTANCE)
    const kind = requestedKind ?? nearby?.kind
    if (!kind || !nearby) {
      this.hooks.toast('走到载具旁边再按 V，或靠近载具按 E。')
      return
    }
    this.mounted = true
    this.verticalVelocity = 0
    this.grounded = false
    this.world.setVehicleMounted(true, this.world.player.position, this.world.player.rotation.y, kind)
    this.hooks.toast(kind === 'ship' ? '星穹飞船启动，正在升入轨道。按 V 返回地面。' : `已驾驶${nearby.name}。按 V 下车。`)
  }

  openFloorplan(popup = false): void {
    if (!this.started) return
    // Prefer the same-origin in-game workspace when TownUI has opened it.
    // The popup remains the fallback for browsers that block iframe storage or
    // when this method is called outside the build panel.
    const embedded = document.querySelector<HTMLIFrameElement>('#floorplan-frame')
    const embeddedScreen = document.querySelector<HTMLElement>('#floorplan-screen')
    const embeddedReady = Boolean(embedded?.contentDocument?.querySelector('#plan'))
    if (!popup && embedded?.contentWindow && embeddedScreen && !embeddedScreen.classList.contains('hidden')) {
      this.floorplanWindow = embedded.contentWindow
      if (embeddedReady) {
        const stored = loadStoredFloorplanDesign() ?? buildingsToFloorplanDesign(this.state.buildings)
        this.postFloorplanMessage('floorplan-import', stored)
        this.hooks.toast('已在游戏内打开户型设计器，应用方案后会立即更新家园。')
      } else {
        this.hooks.toast('户型设计器正在加载，加载完成后即可编辑。')
      }
      return
    }
    // Keep an opener reference so the standalone editor can send its JSON
    // back to this game. `noopener` would deliberately sever that channel.
    const url = new URL('./floorplan-3d/index.html?from=warmtown', document.baseURI).toString()
    const opened = window.open(url, 'warmtown-floorplan', 'popup=yes,width=1440,height=920')
    if (!opened) {
      this.hooks.toast('户型设计器被浏览器拦截，请允许新窗口后再试。')
      return
    }
    this.floorplanWindow = opened
    const stored = loadStoredFloorplanDesign() ?? buildingsToFloorplanDesign(this.state.buildings)
    this.postFloorplanMessage('floorplan-import', stored)
    this.hooks.toast('已打开 2D / 3D 户型设计器，可在新窗口拖拽墙体和家具。')
  }

  /** Apply a validated floorplan design without charging game materials. */
  applyFloorplanDesign(design: FloorplanDesign): boolean {
    const imported = floorplanDesignToBuildings(design, this.state.interiorStyle)
    if (!imported.length) {
      this.hooks.toast('户型方案没有可导入的墙体、房间或家具。')
      return false
    }
    for (const building of this.state.buildings) {
      if (building.zone === 'interior') this.world.removeBuilding(building.id)
    }
    const yard = this.state.buildings.filter(building => building.zone !== 'interior')
    this.state = { ...this.state, buildings: [...yard, ...imported] }
    for (const building of imported) this.world.addBuilding(building)
    this.world.setInteriorLayoutAuthored(imported.some(building => building.floorplan?.sourceId?.startsWith('w')))
    this.hooks.toast(`户型已同步：${imported.length} 个墙体、地板和家具实体。`)
    this.saveAndNotify()
    window.dispatchEvent(new CustomEvent('warmtown-floorplan-applied', { detail: { count: imported.length } }))
    return true
  }

  private postFloorplanMessage(type: 'floorplan-import' | 'floorplan-ack', design?: FloorplanDesign): void {
    if (!this.floorplanWindow || this.floorplanWindow.closed) return
    this.floorplanWindow.postMessage({ source: FLOORPLAN_MESSAGE_SOURCE, version: FLOORPLAN_PROTOCOL_VERSION, type, design }, window.location.origin)
  }

  private bindFloorplanMessages(): void {
    window.addEventListener('message', event => {
      const data = event.data as { source?: unknown; type?: unknown; design?: unknown; payload?: unknown } | null
      if (!data || data.source !== FLOORPLAN_MESSAGE_SOURCE) return
      if (event.source && this.floorplanWindow && event.source !== this.floorplanWindow) return
      if (event.origin && event.origin !== window.location.origin) return
      if (event.source && !this.floorplanWindow) this.floorplanWindow = event.source as Window
      if (data.type === 'floorplan-ready') {
        const stored = loadStoredFloorplanDesign() ?? buildingsToFloorplanDesign(this.state.buildings)
        this.postFloorplanMessage('floorplan-import', stored)
        return
      }
      if (data.type !== 'floorplan-export' && data.type !== 'floorplan-apply') return
      const design = readFloorplanDesign(data.design ?? data.payload)
      if (!design) {
        this.hooks.toast('户型数据格式无效，未同步到游戏。')
        return
      }
      storeFloorplanDesign(design)
      if (this.applyFloorplanDesign(design)) this.postFloorplanMessage('floorplan-ack', design)
    })
  }

  interactWithCompanion(): void {
    this.state = interactWithPet(this.state)
    this.hooks.toast(`${this.state.pet.name}蹭了蹭你的手，亲密度提升了。`)
    this.saveAndNotify()
  }

  feedCompanion(): boolean {
    const next = feedPet(this.state)
    if (!next) {
      this.hooks.toast('背包里没有宠物零食，可以去阿葵的小集看看。')
      return false
    }
    this.state = next
    this.hooks.toast(`${this.state.pet.name}开心地吃下零食，亲密度提升了。`)
    this.saveAndNotify()
    return true
  }

  setPetName(name: string): boolean {
    const next = renamePet(this.state, name)
    if (!next) {
      this.hooks.toast('给伙伴取一个不超过 16 个字的名字吧。')
      return false
    }
    this.state = next
    this.saveAndNotify()
    return true
  }

  setPetKind(kind: TownState['pet']['kind']): void {
    this.state = changePet(this.state, kind)
    this.world.setPetKind(kind)
    this.saveAndNotify()
  }

  setVirtualLook(dx: number, dy = 0): void {
    this.yaw -= dx * 0.006
    this.pitch = Math.max(-0.72, Math.min(0.82, this.pitch - dy * 0.005))
  }

  private interactFarm(): void {
    if (this.state.cropStage === 'empty') {
      const planted = plantSeed(this.state)
      if (planted === this.state) this.hooks.toast('种子用完了。完成花园目标就能领取新的种子奖励。')
      else {
        this.state = planted
        this.world.setCropStage(this.state.cropStage, 0.05)
        this.hooks.toast('种下了一颗种子。慢慢逛一会儿，小苗会自己长大。')
        this.saveAndNotify()
      }
    } else if (this.state.cropStage === 'ready') {
      this.state = harvestCrop(this.state)
      this.world.setCropStage(this.state.cropStage, 0)
      this.hooks.toast('收获了一根胡萝卜，还得到 2 枚贝币。')
      this.saveAndNotify()
    } else {
      this.hooks.toast(`小苗正在长大，还需要约 ${Math.ceil(Math.max(0, 16 - this.state.cropSeconds))} 秒。`)
    }
  }

  private startFishing(): void {
    if (this.state.inventory.鱼饵 <= 0) {
      this.hooks.toast('鱼饵用完啦。去阿葵的小集买一些，再回来试试。')
      return
    }
    this.state = { ...this.state, inventory: { ...this.state.inventory, 鱼饵: this.state.inventory.鱼饵 - 1 } }
    this.fishingPhase = 'waiting'
    this.fishingTimer = 0
    this.biteAfter = 2.7 + Math.random() * 2.4
    this.hooks.toast('鱼线落进水面。留意浮漂，轻轻动起来时按 E 收竿。')
    this.saveAndNotify()
  }

  private reelFishing(): void {
    if (this.fishingPhase === 'waiting') {
      this.hooks.toast('浮漂还没动，再等一小会儿。')
      return
    }
    if (this.fishingPhase !== 'bite') return
    const caught: Extract<ItemId, '小鱼' | '银鳞鱼' | '星砂鱼'> = Math.random() < 0.66 ? '小鱼' : Math.random() < 0.82 ? '银鳞鱼' : '星砂鱼'
    this.state = catchFish(this.state, caught)
    this.fishingPhase = 'idle'
    this.fishingTimer = 0
    this.hooks.toast(`收竿啦！钓到${caught}，已经放进背包。`)
    this.saveAndNotify()
  }

  private updateFishing(dt: number): void {
    if (this.fishingPhase === 'idle') return
    this.fishingTimer += dt
    if (this.fishingPhase === 'waiting' && this.fishingTimer >= this.biteAfter) {
      this.fishingPhase = 'bite'
      this.fishingTimer = 0
      this.hooks.toast('浮漂轻轻沉了一下！现在按 E 收竿。')
    } else if (this.fishingPhase === 'bite' && this.fishingTimer >= 2.2) {
      this.fishingPhase = 'idle'
      this.fishingTimer = 0
      this.hooks.toast('鱼游开了，没关系，再试一次就好。')
    }
  }

  private talk(resident: Resident): void {
    if (resident.role === 'merchant') {
      this.hooks.openPanel('shop')
      this.hooks.toast(`${resident.name}：欢迎来海湾小集！`)
      return
    }
    if (resident.role === 'neighbor') {
      this.state = recordActivity(this.state, 'neighbors')
      this.saveAndNotify()
    }
    if (resident.id === 'ahe') {
      const progress = this.state.questProgress.shells
      this.hooks.toast(progress >= 3
        ? '阿禾：贝壳都找齐啦！打开任务本领取我的小谢礼吧。'
        : `阿禾：海滩边散落着三枚贝壳，可以帮我找找吗？（${progress}/3）`)
    } else if (resident.role === 'fisher') {
      const progress = this.state.questProgress.fishing
      this.hooks.toast(progress >= 1 ? `${resident.name}：好收获！打开任务本看看池塘来信。` : `${resident.name}：池塘水面很平静，抛竿时记得留意浮漂。`)
    } else {
      const roleLines: Partial<Record<Resident['role'], string>> = {
        mayor: '镇长：小镇的公告板上有新的社区委托，欢迎来看看。',
        scientist: '林博士：带来荧光菌或星砂样本，我可以帮你记录它们的变化。',
        doctor: '苏医生：探索回来若觉得疲惫，就到诊所歇一会儿。',
        musician: '茉莉：夜市开灯后，来听我弹一首河谷的歌吧。',
        chef: '阿洛：收集香草和鱼获，就能做出今天的招牌晚餐。',
        child: '芽芽：你也看到那些会发光的小花了吗？',
        native: '阿澜：水母会随着潮汐变色，夜里沿河岸就能观察到。',
      }
      this.hooks.toast(roleLines[resident.role] ?? `${resident.name}：${resident.greeting}`)
    }
  }

  private nearestTarget(): Target | null {
    const pos = this.world.player.position
    const candidates: Target[] = []
    if (this.interior) {
      candidates.push({ kind: 'interior-exit', distance: pos.distanceTo(HOME_INTERIOR_EXIT) })
      return candidates[0]
    }
    // The front door is an intentional interaction zone. Give it priority
    // over the nearby farm or bicycle so a child can walk to the porch and
    // press E without hunting for a narrow target radius.
    const homeDistance = pos.distanceTo(LOCATIONS.homeDoor)
    if (homeDistance < HOME_ENTRY_RADIUS) return { kind: 'home-door', distance: homeDistance }
    for (const pickup of this.world.pickups) {
      if (pickup.active) candidates.push({ kind: 'pickup', pickup, distance: pos.distanceTo(pickup.position) })
    }
    for (const resident of this.world.residents) candidates.push({ kind: 'resident', resident, distance: pos.distanceTo(resident.position) })
    const hiddenFind = this.world.getNearestHiddenFind(pos)
    if (hiddenFind) candidates.push({ kind: 'hidden-find', find: hiddenFind, distance: pos.distanceTo(hiddenFind.object.position) })
    const bird = this.world.getNearestBird(pos)
    if (bird) candidates.push({ kind: 'bird', bird, distance: pos.distanceTo(bird.object.position) })
    const creature = this.world.getNearestCreature(pos)
    if (creature) candidates.push({ kind: 'creature', creature, distance: pos.distanceTo(creature.object.position) })
    candidates.push({ kind: 'farm', distance: pos.distanceTo(LOCATIONS.farm) })
    candidates.push({ kind: 'pond', distance: pos.distanceTo(LOCATIONS.pond) })
    candidates.push({ kind: 'home', distance: pos.distanceTo(LOCATIONS.home) })
    candidates.push({ kind: 'kitchen', distance: pos.distanceTo(LOCATIONS.kitchen) })
    candidates.push({ kind: 'wardrobe', distance: pos.distanceTo(LOCATIONS.wardrobe) })
    candidates.push({ kind: 'lookout', distance: pos.distanceTo(LOCATIONS.lookout) })
    if (!this.mounted) {
      const vehicle = this.world.getNearestVehicle(pos, 8)
      if (vehicle) candidates.push({ kind: 'vehicle', vehicleKind: vehicle.kind, vehicleName: vehicle.name, distance: pos.distanceTo(vehicle.object.position) })
    }
    return candidates.sort((a, b) => a.distance - b.distance)[0] ?? null
  }

  changeRegion(region: RegionId): void {
    if (!this.started || this.paused) return
    this.state = switchRegion(this.state, region)
    this.world.setRegion(region)
    this.world.setQuestMarker(this.state.trackedQuest)
    this.world.setUnderwater(false)
    this.waterState = 'dry'
    this.hooks.toast(`来到了${region}。${region === '暖湾海岛' ? '家园和池塘就在前方。' : '慢慢探索，看看有什么新发现。'}`)
    this.saveAndNotify()
  }

  cook(recipe: RecipeId): boolean {
    const next = cookRecipe(this.state, recipe)
    if (!next) { this.hooks.toast('食材还不够，先去海边、林地和菜圃收集吧。'); return false }
    this.state = next
    this.hooks.toast(`做好了${recipe}，香味飘出来啦！`)
    this.saveAndNotify()
    return true
  }

  private enterInterior(): void {
    this.interior = true
    this.waterState = 'dry'
    // Spawn just inside the doorway so the enlarged room, furniture and
    // player-built structure all fit into the first interior camera frame.
    this.world.player.position.copy(HOME_INTERIOR_ORIGIN).add(new THREE.Vector3(0, 0, 0.4))
    this.world.player.rotation.y = Math.PI
    this.world.player.visible = true
    this.world.setInteriorLayoutAuthored(this.state.buildings.some(building => building.zone === 'interior' && building.floorplan?.sourceId?.startsWith('w')))
    this.world.enterInterior()
    this.world.setQuestMarker(null)
    this.world.setUnderwater(false)
    this.hooks.toast('欢迎回家！这里是你的小屋，厨房和床铺都可以继续布置。靠近门口按 E 出门。')
    // Entering the home always opens the editor so the room has an obvious
    // construction mode instead of looking like a decorative-only interior.
    this.hooks.openPanel('build')
  }

  private leaveInterior(): void {
    this.interior = false
    this.world.leaveInterior()
    this.world.setQuestMarker(this.state.trackedQuest)
    this.world.player.position.copy(HOME_INTERIOR_EXIT).add(new THREE.Vector3(0, 0, 1.25))
    this.world.player.position.y = 0
    this.hooks.toast('回到院子啦。可以继续装饰，也可以去海边游泳。')
  }

  private updateBuildPreviewAt(clientX: number, clientY: number): THREE.Vector3 | null {
    if (!this.buildKind) return null
    const rect = this.canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.world.camera)
    const point = new THREE.Vector3()
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, point)) {
      // A modal panel can leave the cursor outside the canvas. Keep the editor
      // alive by projecting a stable center point instead of silently losing
      // the preview and making the next click look broken.
      point.copy(this.world.player.position)
      point.y = 0.26
    }
    point.x = Math.round(point.x * 2) / 2
    point.z = Math.round(point.z * 2) / 2
    if (this.interior) {
      // Keep the editor usable even when the camera ray hits the ceiling or
      // an interior wall. The cursor is clamped to the nearest room grid cell
      // instead of producing an apparently dead preview.
      point.x = Math.max(HOME_INTERIOR_BUILD_BOUNDS.minX + 0.35, Math.min(HOME_INTERIOR_BUILD_BOUNDS.maxX - 0.35, point.x))
      point.z = Math.max(HOME_INTERIOR_BUILD_BOUNDS.minZ + 0.35, Math.min(HOME_INTERIOR_BUILD_BOUNDS.maxZ - 0.35, point.z))
    } else {
      point.x = Math.max(HOME_BUILD_BOUNDS.minX + 0.35, Math.min(HOME_BUILD_BOUNDS.maxX - 0.35, point.x))
      point.z = Math.max(HOME_BUILD_BOUNDS.minZ + 0.35, Math.min(HOME_BUILD_BOUNDS.maxZ - 0.35, point.z))
    }
    this.refreshBuildPreview(point)
    this.lastBuildPoint = point.clone()
    return point
  }

  private refreshBuildPreview(point: THREE.Vector3): void {
    if (!this.buildKind) return
    const zone = this.interior ? 'interior' : 'yard'
    const cost = BUILDING_COSTS[this.buildKind]
    const clear = isBuildingPlacementValid(this.state, this.buildKind, point, zone, this.movingBuildingId ?? undefined)
    const affordable = Boolean(this.movingBuildingId) || (this.state.coins >= cost.coins && Object.entries(cost.materials).every(([item, amount]) => this.state.inventory[item as ItemId] >= (amount ?? 0)))
    this.world.setBuildPreview(this.buildKind, point, clear && affordable, this.buildRotation)
  }

  private placeBuildAt(clientX: number, clientY: number): void {
    if (!this.buildKind) return
    const point = this.updateBuildPreviewAt(clientX, clientY) ?? this.lastBuildPoint?.clone()
    if (!point) return
    this.placeBuildAtPoint(point)
  }

  private placeBuildAtPoint(point: THREE.Vector3): void {
    if (!this.buildKind) return
    if (this.movingBuildingId) {
      const id = this.movingBuildingId
      const next = moveBuilding(this.state, id, point)
      if (!next) { this.hooks.toast('这里空间不足，请将预览放在空地上。'); return }
      this.state = next
      const building = this.state.buildings.find(entry => entry.id === id)
      if (building) this.world.updateBuilding(building)
      this.buildKind = null
      this.movingBuildingId = null
      this.lastBuildPoint = null
      this.world.hideBuildPreview()
      this.hooks.toast('家具位置已调整。')
      this.saveAndNotify()
      return
    }
    const kind = this.buildKind
    const next = placeBuilding(this.state, kind, point, this.buildRotation, this.interior ? 'interior' : 'yard')
    if (!next) {
      const cost = BUILDING_COSTS[kind]
      const affordable = this.state.coins >= cost.coins && Object.entries(cost.materials).every(([item, amount]) => this.state.inventory[item as ItemId] >= (amount ?? 0))
      this.hooks.toast(affordable
        ? (this.interior ? '请把物件放在室内空地，墙体和隔断可以旋转后拼接。' : '请把家具放在空着的院落位置，靠近家门前的草地即可。')
        : `材料或贝币不够：${kind} 需要 ${cost.coins} 枚贝币和对应材料。`)
      return
    }
    this.state = next
    this.world.addBuilding(this.state.buildings[this.state.buildings.length - 1])
    this.hooks.toast(this.interior
      ? `放好了${kind}，屋内的空间又多了一点自己的样子。`
      : `放好了${kind}，家门口又多了一点自己的样子。`)
    this.buildKind = null
    this.movingBuildingId = null
    this.lastBuildPoint = null
    this.world.hideBuildPreview()
    this.saveAndNotify()
  }

  private cropProgress(): number {
    return Math.min(1, this.state.cropSeconds / 16)
  }

  private isBlockedByHome(position: THREE.Vector3): boolean {
    // Keep the house shell solid so the avatar cannot walk through a wall.
    // The front porch remains the only opening and is handled by the home
    // interaction target above.
    const offset = new THREE.Vector3(position.x - LOCATIONS.home.x, 0, position.z - LOCATIONS.home.z)
    const localX = offset.x * Math.cos(HOME_ROTATION) - offset.z * Math.sin(HOME_ROTATION)
    const localZ = offset.x * Math.sin(HOME_ROTATION) + offset.z * Math.cos(HOME_ROTATION)
    const insideShell = Math.abs(localX) < 5.15 && localZ > -4.35 && localZ < 4.38
    const atDoor = Math.abs(localX) < 2.25 && localZ > 3.65 && localZ < 6.25
    return insideShell && !atDoor
  }

  private isBlockedByInteriorStructure(position: THREE.Vector3): boolean {
    const local = new THREE.Vector3(position.x - HOME_INTERIOR_ORIGIN.x, 0, position.z - HOME_INTERIOR_ORIGIN.z)
    for (const building of this.state.buildings) {
      // Doors remain passable in the first editor bridge. The floorplan
      // carries their geometry for rendering, while the game has no door
      // open/close state yet; treating them as colliders would trap the player.
      if (building.zone !== 'interior' || !['室内墙体', '室内隔断', '室内窗'].includes(building.kind)) continue
      const dx = building.x - HOME_INTERIOR_ORIGIN.x
      const dz = building.z - HOME_INTERIOR_ORIGIN.z
      const cos = Math.cos(-building.rotation)
      const sin = Math.sin(-building.rotation)
      const x = (local.x - dx) * cos - (local.z - dz) * sin
      const z = (local.x - dx) * sin + (local.z - dz) * cos
      const halfWidth = building.kind === '室内墙体' ? 1.72 : building.kind === '室内隔断' ? 1.02 : 0.84
      const halfDepth = 0.16
      if (Math.abs(x) < halfWidth && Math.abs(z) < halfDepth) return true
    }
    return false
  }

  /**
   * Find a raised, upward-facing surface underneath the avatar. The world is
   * authored from meshes rather than a navmesh, so a short raycast keeps
   * steps, roots, low roofs and the alien lookout platforms usable without
   * making walls or foliage into invisible collision volumes.
   */
  private getSupportHeight(position: THREE.Vector3): number {
    if (this.interior || this.world.isSpaceFlight) return 0
    const origin = new THREE.Vector3(position.x, Math.max(6.5, position.y + 3.5), position.z)
    const ray = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, MAX_PLATFORM_HEIGHT + 3)
    const hits = ray.intersectObjects(this.world.scene.children, true)
    const normalMatrix = new THREE.Matrix3()
    for (const hit of hits) {
      if (!hit.object.visible || !hit.face || this.isDynamicSupportObject(hit.object)) continue
      const normal = hit.face.normal.clone()
      normalMatrix.getNormalMatrix(hit.object.matrixWorld)
      normal.applyNormalMatrix(normalMatrix)
      if (normal.y < 0.58) continue
      // The meadow mesh is intentionally below the avatar origin. Ignore it
      // so ordinary walking remains at y=0, while steps begin at ~0.35.
      if (hit.point.y < 0.31 || hit.point.y > MAX_PLATFORM_HEIGHT) continue
      return hit.point.y
    }
    return 0
  }

  private initializeResidentRoutes(): void {
    const routes: Record<string, Array<[number, number]>> = {
      ahe: [[0, -1], [9, -8], [15, 4], [5, 16], [-12, 12], [-18, 2], [-10, -10]],
      xiaoman: [[-7, -7], [-18, -16], [-31, -8], [-26, 10], [-14, 19], [-4, 10]],
      haishu: [[7.1, -1.8], [18, 3], [28, 12], [24, 28], [10, 31], [2, 18]],
      merchant: [[4, -2.6], [13, -0.2], [22, -7], [31, -2], [28, 10], [17, 14], [8, 7]],
      mayor: [[-3.5, -3.2], [0, -6], [6, -7], [4, -2]],
      scientist: [[-14, -8], [-21, -12], [-26, -4], [-17, 3]],
      doctor: [[-2, 5.5], [-8, 9], [-13, 7], [-8, 2]],
      musician: [[9, 5], [12, 1], [4, 2], [0, 4]],
      chef: [[-5.5, -4.5], [-9, -6], [-7, -2]],
      child: [[2.5, 4.6], [5, 7], [1, 9], [-2, 6]],
      native: [[-18, -13], [-24, -17], [-30, -12], [-22, -7]],
    }
    for (const resident of this.world.residents) {
      const points = (routes[resident.id] ?? [[resident.position.x, resident.position.z]])
        .map(([x, z]) => new THREE.Vector3(x, 0, z))
        .filter(point => this.isSafeResidentPoint(point))
      this.residentRoutes.set(resident.id, { waypoints: points.length > 1 ? points : [resident.position.clone()], targetIndex: 0, wait: 1.5 })
    }
  }

  private isSafeResidentPoint(point: THREE.Vector3): boolean {
    if (Math.hypot(point.x, point.z) > 58) return false
    if (this.world.getWaterState(point) !== 'dry') return false
    if (point.distanceTo(POND_WATER_CENTER) < POND_WATER_RADIUS) return false
    return !this.isBlockedByHome(point)
  }

  private isDynamicSupportObject(object: THREE.Object3D): boolean {
    let node: THREE.Object3D | null = object
    while (node) {
      if (node === this.world.player || node === this.world.pet) return true
      if (this.world.residents.some(resident => resident.object === node)) return true
      node = node.parent
    }
    return false
  }

  private updateResidentWander(dt: number): void {
    for (const [index, resident] of this.world.residents.entries()) {
      const route = this.residentRoutes.get(resident.id)
      if (!route || route.waypoints.length < 2) continue
      const target = route.waypoints[route.targetIndex]
      // VillageWorld still has a legacy idle sway. Restore the route position
      // after its update so that sway cannot overwrite path progress.
      resident.object.position.copy(resident.position)
      // The model group receives a tiny visual bob in VillageWorld.update;
      // route movement must use the stable gameplay position instead.
      const current = resident.position
      const toTarget = new THREE.Vector3(target.x - current.x, 0, target.z - current.z)
      const distance = toTarget.length()
      if (distance < 0.24) {
        route.wait -= dt
        if (route.wait <= 0) {
          route.targetIndex = (route.targetIndex + 1) % route.waypoints.length
          route.wait = 1.1 + ((index * 0.37) % 1.4)
        }
        resident.rig.animate(this.elapsed + index * 0.17, false)
        continue
      }
      const direction = toTarget.normalize()
      // Keep residents visibly mobile without matching the player's sprint:
      // roughly one sixth of a player stride per frame at 60 fps.
      const step = Math.min(distance, dt * (0.72 + (index % 2) * 0.10))
      const next = current.clone().addScaledVector(direction, step)
      const currentPondDistance = current.distanceTo(POND_WATER_CENTER)
      const nextPondDistance = next.distanceTo(POND_WATER_CENTER)
      const exitingPond = currentPondDistance < POND_WATER_RADIUS && nextPondDistance > currentPondDistance
      if (!this.isSafeResidentPoint(next) && !exitingPond) {
        route.targetIndex = (route.targetIndex + 1) % route.waypoints.length
        route.wait = 0.4
        continue
      }
      current.copy(next)
      resident.object.position.copy(next)
      resident.object.position.y = 0
      resident.object.rotation.y = Math.atan2(direction.x, direction.z)
      resident.rig.animate(this.elapsed + index * 0.17, true)
    }
  }

  private saveAndNotify(): void {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.state)) } catch { /* private browsing can disable saves */ }
    this.hooks.changed(this.state)
  }

  /** Used by the wardrobe to apply a visible change immediately. */
  refreshAppearance(): void {
    this.world.setPlayerAppearance(this.state.appearance)
    this.saveAndNotify()
  }

  private load(): TownState {
    try {
      const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(LEGACY_SAVE_KEY)
      return raw ? normalizeTownState(JSON.parse(raw)) : freshTownState()
    } catch {
      return freshTownState()
    }
  }

  private bindPointer(): void {
    this.canvas.addEventListener('contextmenu', event => event.preventDefault())
    this.canvas.addEventListener('pointerdown', event => {
      if (!this.started || this.paused) return
      if (event.pointerType === 'touch' && !this.buildKind) return
      if (this.buildKind) {
        if (event.button === 0) {
          event.preventDefault()
          this.placeBuildAt(event.clientX, event.clientY)
        }
        return
      }
      if (event.button !== 0) return
      this.pointerDrag = true
      this.lastPointerX = event.clientX
      this.lastPointerY = event.clientY
      this.canvas.setPointerCapture?.(event.pointerId)
    })
    this.canvas.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch' && !this.buildKind) return
      if (this.buildKind) {
        this.updateBuildPreviewAt(event.clientX, event.clientY)
        return
      }
      if (!this.pointerDrag) return
      this.yaw -= (event.clientX - this.lastPointerX) * 0.006
      this.pitch = Math.max(-0.72, Math.min(0.82, this.pitch - (event.clientY - this.lastPointerY) * 0.005))
      this.lastPointerX = event.clientX
      this.lastPointerY = event.clientY
    })
    const stop = () => { this.pointerDrag = false }
    this.canvas.addEventListener('pointerup', stop)
    this.canvas.addEventListener('pointercancel', stop)
    window.addEventListener('blur', stop)
    window.addEventListener('keydown', event => {
      if ((event.code === 'KeyR' || event.code === 'Enter' || event.code === 'NumpadEnter') && this.buildKind) {
        if (event.code === 'KeyR') this.rotateBuild()
        else this.confirmBuild()
      }
      if (event.code === 'Escape' && this.buildKind) this.cancelBuild()
    })
  }
}
