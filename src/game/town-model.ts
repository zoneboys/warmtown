export type ItemId =
  | '贝壳' | '蓝莓' | '小鱼' | '银鳞鱼' | '星砂鱼' | '胡萝卜' | '野花'
  | '木材' | '石料' | '鱼饵' | '宠物零食' | '香草' | '星砂' | '荧光菌' | '羽毛'
  | '烤鱼' | '莓果派' | '香草茶'
export type CropStage = 'empty' | 'growing' | 'ready'
export type RegionId = '暖湾海岛' | '星砂海滩' | '萤光林地' | '云端观景台' | '星门荒原' | '浮岛环带'
export type BirdSpecies = '蓝羽海燕' | '月光鹭' | '彩虹蜂鸟'
export type UnknownCreatureSpecies = '雾尾兽' | '星脉鹿' | '浮光翼兽' | '星环蜉蝣' | '晶壳螯兽' | '潮汐巨鹿'
export type RecipeId = '烤鱼' | '莓果派' | '香草茶'
export type FaceShape = '圆润' | '椭圆' | '方圆'
export type EyeStyle = '杏仁眼' | '圆眼' | '弯眼' | '星光眼'
export type BrowStyle = '柔和' | '上扬' | '平直'
export type NoseStyle = '小巧' | '圆鼻' | '微翘'
export type MouthStyle = '微笑' | '樱桃嘴' | '惊喜'
export type HairStyle = '空气感中长' | '侧分波波' | '软糯短发' | '低双马尾' | '齐肩层次' | '侧分长发' | '软刘海' | '双丸子' | '短卷' | '齐耳' | '低马尾' | '蓬松卷'
export type HairColor = '栗棕' | '茶黑' | '亚麻金' | '海松绿'
export type SkinTone = '暖桃' | '奶油' | '浅麦'
export type Outfit = '海湾条纹衫' | '园艺围裙' | '杏色开衫' | '海盐针织' | '薄荷外套' | '新中式青衫'
export type BottomStyle = '灯笼短裤' | '长裤' | '百褶裙' | '宽腿长裤' | '绣纹长裙'
export type AccessoryStyle = '无' | '海星发夹' | '贝壳项链' | '圆框眼镜' | '玉兰发簪'
export type PetKind = '小猫' | '小狗'
export type AvatarMorphs = {
  height: number
  build: number
  head: number
  shoulder: number
  legs: number
}
export type BuildingKind = '花盆' | '长椅' | '路灯' | '木栅栏' | '邮箱' | '小屋' | '厨房' | '床铺'
  | '室内墙体' | '室内隔断' | '室内地板' | '室内窗' | '室内门' | '室内衣柜' | '室内沙发'
  | '室内桌子' | '室内椅子' | '室内灯'
export type BuildingStyle = '海风奶油' | '花园薄荷' | '暮光珊瑚'
export type QuestId = 'shells' | 'fishing' | 'harvest' | 'building' | 'trading' | 'neighbors' | 'exploration' | 'birdwatching' | 'cooking' | 'xenobiology'
export type Activity = 'fishing' | 'harvest' | 'building' | 'trading' | 'neighbors' | 'exploration' | 'birdwatching' | 'cooking' | 'xenobiology'
export type FriendId = 'ahe' | 'xiaoman' | 'haishu' | 'merchant'

export type AvatarAppearance = {
  faceShape: FaceShape
  eyeStyle: EyeStyle
  browStyle: BrowStyle
  noseStyle: NoseStyle
  mouthStyle: MouthStyle
  hairStyle: HairStyle
  hairColor: HairColor
  skinTone: SkinTone
  outfit: Outfit
  bottom: BottomStyle
  accessory: AccessoryStyle
  morphs: AvatarMorphs
}

export type InteriorColors = {
  wall: string
  floor: string
  trim: string
}

export type HomeColors = {
  wall: string
  roof: string
  trim: string
}

export type PlacedBuilding = {
  id: string
  kind: BuildingKind
  x: number
  z: number
  rotation: number
  style: BuildingStyle
  zone: 'yard' | 'interior'
  scale: number
  /** Optional source data from the floorplan editor. Kept for round-tripping. */
  floorplan?: {
    type: string
    name: string
    widthMm?: number
    depthMm?: number
    sourceId?: string
    color?: string
  }
}

/** Building pieces that can only be authored inside the player's home. */
export const INTERIOR_BUILDING_KINDS = [
  '室内墙体', '室内隔断', '室内地板', '室内窗', '室内门', '室内衣柜', '室内沙发', '室内桌子', '室内椅子', '室内灯',
] as const

export function isInteriorBuildingKind(kind: BuildingKind): boolean {
  return (INTERIOR_BUILDING_KINDS as readonly string[]).includes(kind)
}

export type PetState = {
  kind: PetKind
  name: string
  bond: number
}

export type ExplorationState = {
  region: RegionId
  discoveredRegions: RegionId[]
  hiddenFinds: string[]
  birdSightings: BirdSpecies[]
  creatureSightings: UnknownCreatureSpecies[]
  craftedRecipes: RecipeId[]
}

export type FriendState = Record<FriendId, number>

export type TownState = {
  inventory: Record<ItemId, number>
  coins: number
  seeds: number
  cropStage: CropStage
  cropSeconds: number
  /** Kept for compatibility with the original single shell errand. */
  shellQuestDone: boolean
  /** Number of flowers placed by the original prototype. */
  decorations: number
  appearance: AvatarAppearance
  homeStyle: BuildingStyle
  homeColors: HomeColors
  interiorStyle: BuildingStyle
  interiorColors: InteriorColors
  buildings: PlacedBuilding[]
  buildKitClaimed: boolean
  questProgress: Record<QuestId, number>
  claimedQuests: QuestId[]
  trackedQuest: QuestId | null
  friends: FriendState
  homeLevel: number
  pet: PetState
  exploration: ExplorationState
}

export const CROP_GROW_SECONDS = 16
export const DECORATION_COST = 5
export const ITEM_IDS: readonly ItemId[] = [
  '贝壳', '蓝莓', '小鱼', '银鳞鱼', '星砂鱼', '胡萝卜', '野花', '木材', '石料', '鱼饵', '宠物零食',
  '香草', '星砂', '荧光菌', '羽毛', '烤鱼', '莓果派', '香草茶',
]
export const ITEM_META: Record<ItemId, { emoji: string; group: '采集' | '作物' | '鱼获' | '材料' | '照料' | '烹饪' | '稀有'; sellPrice: number | null }> = {
  贝壳: { emoji: '🐚', group: '采集', sellPrice: 2 },
  蓝莓: { emoji: '🫐', group: '采集', sellPrice: 3 },
  小鱼: { emoji: '🐟', group: '鱼获', sellPrice: 4 },
  银鳞鱼: { emoji: '🐠', group: '鱼获', sellPrice: 7 },
  星砂鱼: { emoji: '🐡', group: '鱼获', sellPrice: 12 },
  胡萝卜: { emoji: '🥕', group: '作物', sellPrice: 4 },
  野花: { emoji: '🌼', group: '采集', sellPrice: 2 },
  木材: { emoji: '🪵', group: '材料', sellPrice: null },
  石料: { emoji: '🪨', group: '材料', sellPrice: null },
  鱼饵: { emoji: '🪱', group: '材料', sellPrice: null },
  宠物零食: { emoji: '🦴', group: '照料', sellPrice: null },
  香草: { emoji: '🌿', group: '材料', sellPrice: 2 },
  星砂: { emoji: '✦', group: '稀有', sellPrice: 12 },
  荧光菌: { emoji: '🍄', group: '稀有', sellPrice: 9 },
  羽毛: { emoji: '🪶', group: '稀有', sellPrice: 6 },
  烤鱼: { emoji: '🍢', group: '烹饪', sellPrice: 10 },
  莓果派: { emoji: '🥧', group: '烹饪', sellPrice: 12 },
  香草茶: { emoji: '🍵', group: '烹饪', sellPrice: 8 },
}

export const REGIONS: readonly { id: RegionId; description: string; spawn: { x: number; z: number } }[] = [
  { id: '暖湾海岛', description: '家园、广场和池塘都在这里。', spawn: { x: -1, z: 9 } },
  { id: '星砂海滩', description: '潮汐会带来贝壳、星砂和漂浮木材。', spawn: { x: 17, z: -4 } },
  { id: '萤光林地', description: '夜色里的荧光菌和鸟鸣藏在林间。', spawn: { x: -18, z: -8 } },
  { id: '云端观景台', description: '风会带来羽毛，也能看见整座海岛。', spawn: { x: 2, z: -18 } },
  { id: '星门荒原', description: '古老星门在荒原深处运转，未知生物会回应你的脚步。', spawn: { x: 34, z: -18 } },
  { id: '浮岛环带', description: '漂浮岛屿围绕暖湾旋转，藏着新植物、遗迹与远方航线。', spawn: { x: -34, z: -22 } },
]

export const RECIPES: readonly { id: RecipeId; ingredients: Partial<Record<ItemId, number>>; output: ItemId; description: string }[] = [
  { id: '烤鱼', ingredients: { 小鱼: 1, 香草: 1 }, output: '烤鱼', description: '池塘小鱼配上清香野草。' },
  { id: '莓果派', ingredients: { 蓝莓: 2, 胡萝卜: 1 }, output: '莓果派', description: '酸甜莓果和新鲜蔬菜做成的小点心。' },
  { id: '香草茶', ingredients: { 香草: 2, 荧光菌: 1 }, output: '香草茶', description: '带一点微光的森林热饮。' },
]

export const DEFAULT_APPEARANCE: AvatarAppearance = {
  faceShape: '椭圆', eyeStyle: '杏仁眼', browStyle: '柔和', noseStyle: '小巧', mouthStyle: '微笑',
  hairStyle: '侧分长发', hairColor: '茶黑', skinTone: '暖桃', outfit: '新中式青衫', bottom: '绣纹长裙', accessory: '玉兰发簪',
  morphs: { height: 1, build: 1, head: 1, shoulder: 1, legs: 1 },
}

export const DEFAULT_INTERIOR_COLORS: InteriorColors = { wall: '#d8f0ea', floor: '#6d91a2', trim: '#e5bf77' }
export const DEFAULT_HOME_COLORS: HomeColors = { wall: '#78b9ad', roof: '#7156a6', trim: '#e5bf77' }

export const APPEARANCE_OPTIONS = {
  faceShape: ['圆润', '椭圆', '方圆'] as const,
  eyeStyle: ['杏仁眼', '圆眼', '弯眼', '星光眼'] as const,
  browStyle: ['柔和', '上扬', '平直'] as const,
  noseStyle: ['小巧', '圆鼻', '微翘'] as const,
  mouthStyle: ['微笑', '樱桃嘴', '惊喜'] as const,
  hairStyle: ['空气感中长', '侧分波波', '软糯短发', '低双马尾', '齐肩层次', '侧分长发', '软刘海', '双丸子', '短卷', '齐耳', '低马尾', '蓬松卷'] as const,
  hairColor: ['栗棕', '茶黑', '亚麻金', '海松绿'] as const,
  skinTone: ['暖桃', '奶油', '浅麦'] as const,
  outfit: ['海湾条纹衫', '园艺围裙', '杏色开衫', '海盐针织', '薄荷外套', '新中式青衫'] as const,
  bottom: ['灯笼短裤', '长裤', '百褶裙', '宽腿长裤', '绣纹长裙'] as const,
  accessory: ['无', '海星发夹', '贝壳项链', '圆框眼镜', '玉兰发簪'] as const,
}

export const QUESTS: readonly {
  id: QuestId
  title: string
  description: string
  steps: readonly string[]
  guide: string
  goal: number
  rewardCoins: number
  rewardSeeds?: number
  rewardItem?: { item: ItemId; amount: number }
}[] = [
  { id: 'shells', title: '帮阿禾找贝壳', description: '沿着海边找到 3 枚贝壳，再回到阿禾身边。', steps: ['去海边', '捡起 3 枚贝壳', '回到阿禾身边'], guide: '先沿木栈道往海边走，看到贝壳时按 E。', goal: 3, rewardCoins: 12, rewardSeeds: 2 },
  { id: 'fishing', title: '和海叔学钓鱼', description: '去池塘边听海叔讲解，抛竿并钓到 1 条鱼。', steps: ['找到海叔', '在池塘边抛竿', '看到咬钩后按 E'], guide: '海叔在池塘旁边，靠近他会出现互动提示。', goal: 1, rewardCoins: 8, rewardItem: { item: '宠物零食', amount: 1 } },
  { id: 'harvest', title: '照顾第一块菜圃', description: '给菜圃种下一颗种子，等它长大后收获胡萝卜。', steps: ['走到小菜圃', '选择种子并按 E', '等作物成熟后再按 E'], guide: '小菜圃就在家门口，成熟时会变成橙色。', goal: 1, rewardCoins: 10, rewardSeeds: 1 },
  { id: 'building', title: '给家门口添一盏灯', description: '打开建造，选择一件家具，放在家门口。', steps: ['打开家园建造', '选择路灯或花盆', '把绿色预览放到院子里'], guide: '按 B 打开建造，绿色预览表示可以放置。', goal: 1, rewardCoins: 8, rewardItem: { item: '木材', amount: 1 } },
  { id: 'trading', title: '去小集换一件东西', description: '找到阿葵，用采集到的物品换一份鱼饵。', steps: ['找到阿葵', '打开海湾小集', '买一份鱼饵或卖出一件物品'], guide: '阿葵的摊位在广场边，按 E 可以打开小集。', goal: 1, rewardCoins: 6, rewardItem: { item: '鱼饵', amount: 1 } },
  { id: 'neighbors', title: '认识三位新朋友', description: '找到镇上的居民，和他们各聊一次天。', steps: ['和第一位居民聊天', '和第二位居民聊天', '和第三位居民聊天'], guide: '头顶有金色标记的居民都可以聊天。', goal: 3, rewardCoins: 10, rewardItem: { item: '宠物零食', amount: 1 } },
  { id: 'exploration', title: '沿着星光去远方', description: '切换到三个区域，并找到隐藏的稀有材料。', steps: ['打开地图切换区域', '发现第二个区域', '找到隐藏材料'], guide: '地图在左上角，靠近发光物后按 E。', goal: 3, rewardCoins: 14, rewardItem: { item: '星砂', amount: 1 } },
  { id: 'birdwatching', title: '听见三种鸟鸣', description: '在海滩、林地和观景台观察三种鸟。', steps: ['找到一只鸟', '靠近并按 E 观察', '集齐三种鸟鸣'], guide: '鸟会在不同区域轻轻飞动，看到翅膀就慢慢靠近。', goal: 3, rewardCoins: 12, rewardItem: { item: '羽毛', amount: 1 } },
  { id: 'cooking', title: '把收获做成晚餐', description: '在烹饪台用采集物做出一道料理。', steps: ['收集食材', '走到烹饪台', '选择一道食谱并制作'], guide: '烹饪台在广场北侧，按 E 打开探索与制作。', goal: 1, rewardCoins: 10, rewardItem: { item: '香草茶', amount: 1 } },
  { id: 'xenobiology', title: '记录未知生命', description: '在星门荒原和浮岛环带观察三种未知生物。', steps: ['找到一种未知生物', '靠近并观察', '完成三种生命记录'], guide: '切换到星门荒原或浮岛环带，靠近发光生物后按 E。', goal: 3, rewardCoins: 24, rewardItem: { item: '星砂', amount: 2 } },
]

export const SHOP_BUY_PRICES: Partial<Record<ItemId, number>> = {
  木材: 3, 石料: 4, 鱼饵: 2, 宠物零食: 5,
}

export const BUILDING_COSTS: Record<BuildingKind, { coins: number; materials: Partial<Record<ItemId, number>> }> = {
  花盆: { coins: 4, materials: { 木材: 1 } },
  长椅: { coins: 8, materials: { 木材: 3 } },
  路灯: { coins: 7, materials: { 木材: 1, 石料: 1 } },
  木栅栏: { coins: 3, materials: { 木材: 1 } },
  邮箱: { coins: 5, materials: { 木材: 2 } },
  小屋: { coins: 28, materials: { 木材: 8, 石料: 4 } },
  厨房: { coins: 18, materials: { 木材: 4, 石料: 2 } },
  床铺: { coins: 12, materials: { 木材: 3 } },
  '室内墙体': { coins: 6, materials: { 木材: 2, 石料: 1 } },
  '室内隔断': { coins: 5, materials: { 木材: 2 } },
  '室内地板': { coins: 3, materials: { 木材: 1 } },
  '室内窗': { coins: 5, materials: { 木材: 1, 石料: 1 } },
  '室内门': { coins: 8, materials: { 木材: 2, 石料: 1 } },
  '室内衣柜': { coins: 10, materials: { 木材: 4 } },
  '室内沙发': { coins: 12, materials: { 木材: 3 } },
  '室内桌子': { coins: 8, materials: { 木材: 3 } },
  '室内椅子': { coins: 4, materials: { 木材: 1 } },
  '室内灯': { coins: 6, materials: { 木材: 1, 星砂: 1 } },
}

// The interior build grid follows the habitable area inside the exterior pod.
export const HOME_BUILD_BOUNDS = { minX: -14.2, maxX: 0.2, minZ: 10.1, maxZ: 16.4 }
export const HOME_INTERIOR_BUILD_BOUNDS = { minX: -12.12, maxX: -1.88, minZ: 2.63, maxZ: 10.27 }
export const HOME_INTERIOR_WALK_BOUNDS = { minX: -12.3, maxX: -1.7, minZ: 2.2, maxZ: 10.45 }

export const BUILDING_STYLES: readonly BuildingStyle[] = ['海风奶油', '花园薄荷', '暮光珊瑚']

export const FRIEND_PROFILES: readonly { id: FriendId; name: string; role: string; greeting: string }[] = [
  { id: 'ahe', name: '阿禾', role: '海滩向导', greeting: '我把海风和贝壳都记在小本子里。' },
  { id: 'xiaoman', name: '小满', role: '园艺师', greeting: '想让植物长得更好，先学会观察它。' },
  { id: 'haishu', name: '海叔', role: '潮汐研究员', greeting: '每一条鱼都有自己的星光轨迹。' },
  { id: 'merchant', name: '阿葵', role: '商城店主', greeting: '把喜欢的东西带回家，生活就会发光。' },
]

export const HOME_UPGRADE_COSTS: readonly { coins: number; materials: Partial<Record<ItemId, number>>; title: string }[] = [
  { coins: 42, materials: { 木材: 8, 石料: 4 }, title: '扩建观景房' },
  { coins: 88, materials: { 木材: 14, 石料: 10, 星砂: 2 }, title: '解锁星港阁楼' },
]

const BUILDING_CLEARANCE: Record<BuildingKind, number> = {
  花盆: 0.72, 长椅: 0.95, 路灯: 0.65, 木栅栏: 0.95, 邮箱: 0.72, 小屋: 2.25, 厨房: 1.15, 床铺: 1.05,
  室内墙体: 0.22, 室内隔断: 0.22, 室内地板: 0, 室内窗: 0.22, 室内门: 0.28,
  室内衣柜: 0.95, 室内沙发: 1.2, 室内桌子: 0.85, 室内椅子: 0.48, 室内灯: 0.45,
}

const INTERIOR_RESERVED_ZONES = [
  { x: -9.55, z: 4.55, radius: 0.42 }, // bed
  { x: -8.0, z: 3.85, radius: 0.28 }, // bedside table
  { x: -5.0, z: 4.05, radius: 0.42 }, // kitchen counter
  { x: -5.0, z: 5.65, radius: 0.05 }, // dining table anchor
] as const

export function isBuildingPlacementValid(state: TownState, kind: BuildingKind, point: { x: number; z: number }, zone: PlacedBuilding['zone'] = 'yard', ignoreId?: string): boolean {
  const bounds = zone === 'interior' ? HOME_INTERIOR_BUILD_BOUNDS : HOME_BUILD_BOUNDS
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z) || point.x < bounds.minX || point.x > bounds.maxX || point.z < bounds.minZ || point.z > bounds.maxZ) return false
  if (isInteriorBuildingKind(kind) && zone !== 'interior') return false
  if (kind === '小屋' && zone === 'interior') return false
  // Floor tiles are intentionally paintable over each other and under
  // furniture. This lets the player lay a continuous floor with a grid of
  // small tiles instead of fighting the furniture clearance checks.
  if (kind === '室内地板') return zone === 'interior'
  const clearance = BUILDING_CLEARANCE[kind]
  if (zone === 'interior' && INTERIOR_RESERVED_ZONES.some(reserved => Math.hypot(reserved.x - point.x, reserved.z - point.z) < clearance + reserved.radius - 0.25)) return false
  return !state.buildings.some(building => building.id !== ignoreId && building.zone === zone
    && Math.hypot(building.x - point.x, building.z - point.z) < Math.max(0.85, clearance + BUILDING_CLEARANCE[building.kind] - 0.35))
}

export function freshTownState(): TownState {
  const inventory = Object.fromEntries(ITEM_IDS.map(item => [item, 0])) as Record<ItemId, number>
  inventory.鱼饵 = 3
  inventory.宠物零食 = 2
  return {
    inventory,
    coins: 16,
    seeds: 3,
    cropStage: 'empty',
    cropSeconds: 0,
    shellQuestDone: false,
    decorations: 0,
    appearance: { ...DEFAULT_APPEARANCE },
    homeStyle: '海风奶油',
    homeColors: { ...DEFAULT_HOME_COLORS },
    interiorStyle: '海风奶油',
    interiorColors: { ...DEFAULT_INTERIOR_COLORS },
    buildings: [],
    buildKitClaimed: false,
    questProgress: { shells: 0, fishing: 0, harvest: 0, building: 0, trading: 0, neighbors: 0, exploration: 0, birdwatching: 0, cooking: 0, xenobiology: 0 },
    claimedQuests: [],
    trackedQuest: 'shells',
    friends: { ahe: 0, xiaoman: 0, haishu: 0, merchant: 0 },
    homeLevel: 1,
    pet: { kind: '小猫', name: '团子', bond: 0 },
    exploration: { region: '暖湾海岛', discoveredRegions: ['暖湾海岛'], hiddenFinds: [], birdSightings: [], creatureSightings: [], craftedRecipes: [] },
  }
}

function safeCount(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(9999, Math.floor(value))) : fallback
}

function isOneOf<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? value as T : fallback
}

const LEGACY_DEFAULT_APPEARANCE = {
  faceShape: '圆润', eyeStyle: '圆眼', browStyle: '柔和', noseStyle: '小巧', mouthStyle: '微笑',
  hairStyle: '双丸子', hairColor: '栗棕', skinTone: '暖桃', outfit: '海湾条纹衫', bottom: '灯笼短裤', accessory: '无',
} as const

function normalizeAppearance(value: unknown): AvatarAppearance {
  const raw = value && typeof value === 'object' ? value as Partial<Record<keyof AvatarAppearance, unknown>> : {}
  // Saves made before the visual redesign contain the old prototype defaults.
  // Migrate that exact untouched set once so an existing browser session sees
  // the new authored character while preserving any deliberate customization.
  const isLegacyDefault = Object.entries(LEGACY_DEFAULT_APPEARANCE).every(([key, expected]) => raw[key as keyof AvatarAppearance] === expected)
  if (isLegacyDefault) return { ...DEFAULT_APPEARANCE }
  const morphRaw = raw.morphs && typeof raw.morphs === 'object' ? raw.morphs as Partial<Record<keyof AvatarMorphs, unknown>> : {}
  const morphs: AvatarMorphs = {
    height: Math.max(0.82, Math.min(1.18, Number(morphRaw.height) || DEFAULT_APPEARANCE.morphs.height)),
    build: Math.max(0.78, Math.min(1.28, Number(morphRaw.build) || DEFAULT_APPEARANCE.morphs.build)),
    head: Math.max(0.86, Math.min(1.16, Number(morphRaw.head) || DEFAULT_APPEARANCE.morphs.head)),
    shoulder: Math.max(0.8, Math.min(1.22, Number(morphRaw.shoulder) || DEFAULT_APPEARANCE.morphs.shoulder)),
    legs: Math.max(0.82, Math.min(1.18, Number(morphRaw.legs) || DEFAULT_APPEARANCE.morphs.legs)),
  }
  return {
    faceShape: isOneOf(raw.faceShape, APPEARANCE_OPTIONS.faceShape, DEFAULT_APPEARANCE.faceShape),
    eyeStyle: isOneOf(raw.eyeStyle, APPEARANCE_OPTIONS.eyeStyle, DEFAULT_APPEARANCE.eyeStyle),
    browStyle: isOneOf(raw.browStyle, APPEARANCE_OPTIONS.browStyle, DEFAULT_APPEARANCE.browStyle),
    noseStyle: isOneOf(raw.noseStyle, APPEARANCE_OPTIONS.noseStyle, DEFAULT_APPEARANCE.noseStyle),
    mouthStyle: isOneOf(raw.mouthStyle, APPEARANCE_OPTIONS.mouthStyle, DEFAULT_APPEARANCE.mouthStyle),
    hairStyle: isOneOf(raw.hairStyle, APPEARANCE_OPTIONS.hairStyle, DEFAULT_APPEARANCE.hairStyle),
    hairColor: isOneOf(raw.hairColor, APPEARANCE_OPTIONS.hairColor, DEFAULT_APPEARANCE.hairColor),
    skinTone: isOneOf(raw.skinTone, APPEARANCE_OPTIONS.skinTone, DEFAULT_APPEARANCE.skinTone),
    outfit: isOneOf(raw.outfit, APPEARANCE_OPTIONS.outfit, DEFAULT_APPEARANCE.outfit),
    bottom: isOneOf(raw.bottom, APPEARANCE_OPTIONS.bottom, DEFAULT_APPEARANCE.bottom),
    accessory: isOneOf(raw.accessory, APPEARANCE_OPTIONS.accessory, DEFAULT_APPEARANCE.accessory),
    morphs,
  }
}

function normalizeInteriorColors(value: unknown, fallback: InteriorColors): InteriorColors {
  const raw = value && typeof value === 'object' ? value as Partial<InteriorColors> : {}
  const hex = (candidate: unknown, defaultValue: string): string => typeof candidate === 'string' && /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : defaultValue
  return { wall: hex(raw.wall, fallback.wall), floor: hex(raw.floor, fallback.floor), trim: hex(raw.trim, fallback.trim) }
}

function normalizeHomeColors(value: unknown, fallback: HomeColors): HomeColors {
  const raw = value && typeof value === 'object' ? value as Partial<HomeColors> : {}
  const hex = (candidate: unknown, defaultValue: string): string => typeof candidate === 'string' && /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : defaultValue
  return { wall: hex(raw.wall, fallback.wall), roof: hex(raw.roof, fallback.roof), trim: hex(raw.trim, fallback.trim) }
}

function normalizeBuildings(value: unknown): PlacedBuilding[] {
  if (!Array.isArray(value)) return []
  const kinds: readonly BuildingKind[] = [
    '花盆', '长椅', '路灯', '木栅栏', '邮箱', '小屋', '厨房', '床铺', '室内墙体', '室内隔断', '室内地板', '室内窗',
    '室内门', '室内衣柜', '室内沙发', '室内桌子', '室内椅子', '室内灯',
  ]
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Partial<PlacedBuilding>
    const kind = isOneOf(item.kind, kinds, '花盆')
    if (!kinds.includes(item.kind as BuildingKind)) return []
    const x = Number(item.x)
    const z = Number(item.z)
    const rotation = Number(item.rotation)
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rotation)) return []
    const zone = item.zone === 'interior' ? 'interior' : 'yard'
    const bounds = zone === 'interior' ? HOME_INTERIOR_BUILD_BOUNDS : HOME_BUILD_BOUNDS
    if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return []
    const style = isOneOf(item.style, BUILDING_STYLES, BUILDING_STYLES[0])
    const scale = Number.isFinite(Number(item.scale)) ? Math.max(0.65, Math.min(1.8, Number(item.scale))) : 1
    const source = item.floorplan && typeof item.floorplan === 'object' ? item.floorplan as Record<string, unknown> : undefined
    const floorplan = source && typeof source.type === 'string' && typeof source.name === 'string'
      ? {
          type: source.type.slice(0, 64), name: source.name.slice(0, 120),
          widthMm: Number.isFinite(Number(source.widthMm)) ? Math.max(1, Math.min(30000, Number(source.widthMm))) : undefined,
          depthMm: Number.isFinite(Number(source.depthMm)) ? Math.max(1, Math.min(30000, Number(source.depthMm))) : undefined,
          sourceId: typeof source.sourceId === 'string' ? source.sourceId.slice(0, 80) : undefined,
          color: typeof source.color === 'string' && /^#[0-9a-f]{6}$/i.test(source.color) ? source.color : undefined,
        }
      : undefined
    return [{ id: typeof item.id === 'string' ? item.id.slice(0, 48) : `build-${index + 1}`, kind, x, z, rotation, style, zone, scale, ...(floorplan ? { floorplan } : {}) }]
  })
}

export function normalizeTownState(value: unknown): TownState {
  const base = freshTownState()
  if (!value || typeof value !== 'object') return base
  const raw = value as Partial<TownState> & Record<string, unknown>
  const inventoryRaw = raw.inventory && typeof raw.inventory === 'object' ? raw.inventory as Partial<Record<ItemId, unknown>> : {}
  const stage: CropStage = raw.cropStage === 'growing' || raw.cropStage === 'ready' ? raw.cropStage : 'empty'
  const inventory = Object.fromEntries(ITEM_IDS.map(item => [item, safeCount(inventoryRaw[item])])) as Record<ItemId, number>
  const claimed = Array.isArray(raw.claimedQuests)
    ? raw.claimedQuests.filter((id): id is QuestId => typeof id === 'string' && QUESTS.some(quest => quest.id === id))
    : []
  if (raw.shellQuestDone === true && !claimed.includes('shells')) claimed.push('shells')
  const progressRaw = raw.questProgress && typeof raw.questProgress === 'object' ? raw.questProgress as Partial<Record<QuestId, unknown>> : {}
  const questProgress = Object.fromEntries(QUESTS.map(quest => [quest.id, Math.min(quest.goal, safeCount(progressRaw[quest.id], quest.id === 'shells' ? inventory.贝壳 : 0))])) as Record<QuestId, number>
  const petRaw = raw.pet && typeof raw.pet === 'object' ? raw.pet as Partial<PetState> : {}
  const petName = typeof petRaw.name === 'string' && petRaw.name.trim() ? petRaw.name.trim().slice(0, 16) : base.pet.name
  const trackedQuest = typeof raw.trackedQuest === 'string' && QUESTS.some(quest => quest.id === raw.trackedQuest) ? raw.trackedQuest as QuestId : base.trackedQuest
  const friendsRaw = raw.friends && typeof raw.friends === 'object' ? raw.friends as Partial<Record<FriendId, unknown>> : {}
  const friends = Object.fromEntries(FRIEND_PROFILES.map(friend => [friend.id, Math.min(100, safeCount(friendsRaw[friend.id]))])) as FriendState
  const homeLevel = Math.max(1, Math.min(3, safeCount(raw.homeLevel, base.homeLevel)))
  return {
    inventory,
    coins: safeCount(raw.coins, base.coins),
    seeds: safeCount(raw.seeds, base.seeds),
    cropStage: stage,
    cropSeconds: stage === 'empty' ? 0 : Math.min(CROP_GROW_SECONDS, Math.max(0, Number(raw.cropSeconds) || 0)),
    shellQuestDone: raw.shellQuestDone === true || claimed.includes('shells'),
    decorations: safeCount(raw.decorations),
    appearance: normalizeAppearance(raw.appearance),
    homeStyle: isOneOf(raw.homeStyle, BUILDING_STYLES, base.homeStyle),
    homeColors: normalizeHomeColors(raw.homeColors, base.homeColors),
    interiorStyle: isOneOf(raw.interiorStyle, BUILDING_STYLES, base.interiorStyle),
    interiorColors: normalizeInteriorColors(raw.interiorColors, base.interiorColors),
    buildings: normalizeBuildings(raw.buildings),
    buildKitClaimed: raw.buildKitClaimed === true,
    questProgress,
    claimedQuests: [...new Set(claimed)],
    trackedQuest,
    friends,
    homeLevel,
    pet: {
      kind: isOneOf(petRaw.kind, ['小猫', '小狗'] as const, base.pet.kind),
      name: petName,
      bond: safeCount(petRaw.bond, 0),
    },
    exploration: normalizeExploration(raw.exploration, base.exploration),
  }
}

function normalizeExploration(value: unknown, fallback: ExplorationState): ExplorationState {
  const raw = value && typeof value === 'object' ? value as Partial<ExplorationState> : {}
  const regionIds = REGIONS.map(region => region.id)
  const region = isOneOf(raw.region, regionIds, fallback.region)
  const discoveredRegions = Array.isArray(raw.discoveredRegions)
    ? [...new Set(raw.discoveredRegions.filter((id): id is RegionId => regionIds.includes(id as RegionId)))]
    : [...fallback.discoveredRegions]
  if (!discoveredRegions.includes(region)) discoveredRegions.push(region)
  const birdIds: BirdSpecies[] = ['蓝羽海燕', '月光鹭', '彩虹蜂鸟']
  const creatureIds: UnknownCreatureSpecies[] = ['雾尾兽', '星脉鹿', '浮光翼兽', '星环蜉蝣', '晶壳螯兽', '潮汐巨鹿']
  const recipeIds: RecipeId[] = ['烤鱼', '莓果派', '香草茶']
  return {
    region,
    discoveredRegions,
    hiddenFinds: Array.isArray(raw.hiddenFinds) ? raw.hiddenFinds.filter(id => typeof id === 'string').slice(0, 100) : [],
    birdSightings: Array.isArray(raw.birdSightings) ? [...new Set(raw.birdSightings.filter((id): id is BirdSpecies => birdIds.includes(id as BirdSpecies)))] : [],
    creatureSightings: Array.isArray(raw.creatureSightings) ? [...new Set(raw.creatureSightings.filter((id): id is UnknownCreatureSpecies => creatureIds.includes(id as UnknownCreatureSpecies)))] : [],
    craftedRecipes: Array.isArray(raw.craftedRecipes) ? [...new Set(raw.craftedRecipes.filter((id): id is RecipeId => recipeIds.includes(id as RecipeId)))] : [],
  }
}

export function collectItem(state: TownState, item: ItemId, amount = 1): TownState {
  const count = Math.max(1, Math.min(99, Math.floor(amount)))
  const next = { ...state, inventory: { ...state.inventory, [item]: state.inventory[item] + count } }
  return item === '贝壳' ? progressQuest(next, 'shells', count) : next
}

export function plantSeed(state: TownState): TownState {
  if (state.cropStage !== 'empty' || state.seeds <= 0) return state
  return { ...state, seeds: state.seeds - 1, cropStage: 'growing', cropSeconds: 0 }
}

export function advanceCrop(state: TownState, seconds: number): TownState {
  if (state.cropStage !== 'growing' || seconds <= 0) return state
  const cropSeconds = Math.min(CROP_GROW_SECONDS, state.cropSeconds + seconds)
  return { ...state, cropSeconds, cropStage: cropSeconds >= CROP_GROW_SECONDS ? 'ready' : 'growing' }
}

export function progressQuest(state: TownState, id: QuestId, amount = 1): TownState {
  const quest = QUESTS.find(entry => entry.id === id)
  if (!quest || state.claimedQuests.includes(id)) return state
  const increment = Math.max(1, Math.floor(amount))
  return { ...state, questProgress: { ...state.questProgress, [id]: Math.min(quest.goal, state.questProgress[id] + increment) } }
}

export function recordActivity(state: TownState, activity: Activity, amount = 1): TownState {
  return progressQuest(state, activity, amount)
}

export function trackQuest(state: TownState, id: QuestId): TownState {
  if (!QUESTS.some(quest => quest.id === id) || state.claimedQuests.includes(id)) return state
  return { ...state, trackedQuest: state.trackedQuest === id ? null : id }
}

export function befriend(state: TownState, id: FriendId): TownState {
  const current = state.friends[id]
  const friends = { ...state.friends, [id]: Math.min(100, current + 8) }
  return recordActivity({ ...state, friends }, 'neighbors')
}

export function giftFriend(state: TownState, id: FriendId, item: ItemId): TownState | null {
  if (!FRIEND_PROFILES.some(friend => friend.id === id) || state.inventory[item] < 1 || ITEM_META[item].sellPrice === null) return null
  const friends = { ...state.friends, [id]: Math.min(100, state.friends[id] + 12) }
  const inventory = { ...state.inventory, [item]: state.inventory[item] - 1 }
  return recordActivity({ ...state, friends, inventory }, 'neighbors')
}

export function upgradeHome(state: TownState): TownState | null {
  const upgrade = HOME_UPGRADE_COSTS[state.homeLevel - 1]
  if (!upgrade) return null
  if (state.coins < upgrade.coins) return null
  for (const [item, amount] of Object.entries(upgrade.materials) as [ItemId, number][]) {
    if (state.inventory[item] < amount) return null
  }
  const inventory = { ...state.inventory }
  for (const [item, amount] of Object.entries(upgrade.materials) as [ItemId, number][]) inventory[item] -= amount
  return { ...state, homeLevel: state.homeLevel + 1, coins: state.coins - upgrade.coins, inventory }
}

export function harvestCrop(state: TownState): TownState {
  if (state.cropStage !== 'ready') return state
  const next: TownState = {
    ...state,
    inventory: { ...state.inventory, 胡萝卜: state.inventory.胡萝卜 + 1 },
    cropStage: 'empty',
    cropSeconds: 0,
    coins: state.coins + 2,
  }
  return progressQuest(next, 'harvest')
}

export function claimQuest(state: TownState, id: QuestId): TownState | null {
  const quest = QUESTS.find(entry => entry.id === id)
  if (!quest || state.claimedQuests.includes(id) || state.questProgress[id] < quest.goal) return null
  if (id === 'shells' && state.inventory.贝壳 < quest.goal) return null
  const inventory = { ...state.inventory }
  if (id === 'shells') inventory.贝壳 -= quest.goal
  if (quest.rewardItem) inventory[quest.rewardItem.item] += quest.rewardItem.amount
  const claimedQuests = [...state.claimedQuests, id]
  return {
    ...state,
    inventory,
    coins: state.coins + quest.rewardCoins,
    seeds: state.seeds + (quest.rewardSeeds ?? 0),
    shellQuestDone: state.shellQuestDone || id === 'shells',
    claimedQuests,
  }
}

export function completeShellQuest(state: TownState): TownState | null {
  return claimQuest(state, 'shells')
}

export function buyItem(state: TownState, item: ItemId, amount = 1): TownState | null {
  const unitPrice = SHOP_BUY_PRICES[item]
  const count = Math.max(1, Math.min(99, Math.floor(amount)))
  if (unitPrice === undefined || state.coins < unitPrice * count) return null
  const next: TownState = {
    ...state,
    coins: state.coins - unitPrice * count,
    inventory: { ...state.inventory, [item]: state.inventory[item] + count },
  }
  return recordActivity(next, 'trading')
}

export function sellItem(state: TownState, item: ItemId, amount = 1): TownState | null {
  const unitPrice = ITEM_META[item].sellPrice
  const count = Math.max(1, Math.min(99, Math.floor(amount)))
  if (unitPrice === null || state.inventory[item] < count) return null
  const next: TownState = {
    ...state,
    coins: state.coins + unitPrice * count,
    inventory: { ...state.inventory, [item]: state.inventory[item] - count },
  }
  return recordActivity(next, 'trading')
}

export function placeBuilding(state: TownState, kind: BuildingKind, point: { x: number; z: number }, rotation = 0, zone: PlacedBuilding['zone'] = 'yard'): TownState | null {
  const cost = BUILDING_COSTS[kind]
  if (!cost || !Number.isFinite(point.x) || !Number.isFinite(point.z) || !Number.isFinite(rotation)) return null
  if (!isBuildingPlacementValid(state, kind, point, zone)) return null
  if (state.coins < cost.coins) return null
  for (const [item, quantity] of Object.entries(cost.materials) as [ItemId, number][]) {
    if (state.inventory[item] < quantity) return null
  }
  const inventory = { ...state.inventory }
  for (const [item, quantity] of Object.entries(cost.materials) as [ItemId, number][]) inventory[item] -= quantity
  const building: PlacedBuilding = {
    id: `build-${state.buildings.length + 1}`,
    kind,
    x: Math.round(point.x * 2) / 2,
    z: Math.round(point.z * 2) / 2,
    rotation,
    style: BUILDING_STYLES[0],
    zone,
    scale: 1,
  }
  const next: TownState = {
    ...state,
    coins: state.coins - cost.coins,
    inventory,
    buildings: [...state.buildings, building],
  }
  return recordActivity(next, 'building')
}

export function moveBuilding(state: TownState, id: string, point: { x: number; z: number }): TownState | null {
  const building = state.buildings.find(entry => entry.id === id)
  if (!building || !isBuildingPlacementValid(state, building.kind, point, building.zone, id)) return null
  return {
    ...state,
    buildings: state.buildings.map(entry => entry.id === id
      ? { ...entry, x: Math.round(point.x * 2) / 2, z: Math.round(point.z * 2) / 2 }
      : entry),
  }
}

export function claimBuildKit(state: TownState): TownState | null {
  if (state.buildKitClaimed || state.buildings.length > 0) return null
  return {
    ...state,
    coins: state.coins + 40,
    inventory: { ...state.inventory, 木材: state.inventory.木材 + 12, 石料: state.inventory.石料 + 6 },
    buildKitClaimed: true,
  }
}

export function removeBuilding(state: TownState, id: string): TownState | null {
  const building = state.buildings.find(entry => entry.id === id)
  if (!building) return null
  const cost = BUILDING_COSTS[building.kind]
  const inventory = { ...state.inventory }
  for (const [item, quantity] of Object.entries(cost.materials) as [ItemId, number][]) inventory[item] += Math.max(1, Math.floor(quantity * 0.75))
  return {
    ...state,
    coins: state.coins + Math.max(1, Math.floor(cost.coins * 0.75)),
    inventory,
    buildings: state.buildings.filter(entry => entry.id !== id),
  }
}

export function rotateBuilding(state: TownState, id: string): TownState | null {
  if (!state.buildings.some(entry => entry.id === id)) return null
  return { ...state, buildings: state.buildings.map(entry => entry.id === id ? { ...entry, rotation: (entry.rotation + Math.PI / 4) % (Math.PI * 2) } : entry) }
}

export function modifyBuilding(state: TownState, id: string): TownState | null {
  if (!state.buildings.some(entry => entry.id === id)) return null
  return { ...state, buildings: state.buildings.map(entry => {
    if (entry.id !== id) return entry
    const index = BUILDING_STYLES.indexOf(entry.style)
    return { ...entry, style: BUILDING_STYLES[(index + 1) % BUILDING_STYLES.length] }
  }) }
}

/** Change the permanent home shell theme while keeping placed furniture intact. */
export function modifyHomeStyle(state: TownState, style: BuildingStyle): TownState {
  const nextStyle = BUILDING_STYLES.includes(style) ? style : state.homeStyle
  return { ...state, homeStyle: nextStyle }
}

export function modifyHomeColors(state: TownState, colors: Partial<HomeColors>): TownState {
  return { ...state, homeColors: normalizeHomeColors({ ...state.homeColors, ...colors }, state.homeColors) }
}

export function modifyInteriorStyle(state: TownState, style: BuildingStyle): TownState {
  const nextStyle = BUILDING_STYLES.includes(style) ? style : state.interiorStyle
  return { ...state, interiorStyle: nextStyle }
}

export function modifyInteriorColors(state: TownState, colors: Partial<InteriorColors>): TownState {
  const next = normalizeInteriorColors({ ...state.interiorColors, ...colors }, state.interiorColors)
  return { ...state, interiorColors: next }
}

export function resizeBuilding(state: TownState, id: string, scale: number): TownState | null {
  if (!state.buildings.some(entry => entry.id === id)) return null
  const nextScale = Math.max(0.65, Math.min(1.8, Number(scale) || 1))
  return { ...state, buildings: state.buildings.map(entry => entry.id === id ? { ...entry, scale: nextScale } : entry) }
}

export function decorateHome(state: TownState): TownState | null {
  if (state.coins < DECORATION_COST) return null
  const next = { ...state, coins: state.coins - DECORATION_COST, decorations: state.decorations + 1 }
  return recordActivity(next, 'building')
}

export function catchFish(state: TownState, fish: Extract<ItemId, '小鱼' | '银鳞鱼' | '星砂鱼'>): TownState {
  const next = { ...state, inventory: { ...state.inventory, [fish]: state.inventory[fish] + 1 } }
  return recordActivity(next, 'fishing')
}

export function switchRegion(state: TownState, region: RegionId): TownState {
  const discoveredRegions = state.exploration.discoveredRegions.includes(region)
    ? state.exploration.discoveredRegions
    : [...state.exploration.discoveredRegions, region]
  const next = { ...state, exploration: { ...state.exploration, region, discoveredRegions } }
  return discoveredRegions.length > state.exploration.discoveredRegions.length ? progressQuest(next, 'exploration') : next
}

export function discoverHiddenFind(state: TownState, id: string, item: Extract<ItemId, '星砂' | '荧光菌'>): TownState {
  if (state.exploration.hiddenFinds.includes(id)) return state
  const next = {
    ...state,
    inventory: { ...state.inventory, [item]: state.inventory[item] + 1 },
    exploration: { ...state.exploration, hiddenFinds: [...state.exploration.hiddenFinds, id] },
  }
  return progressQuest(next, 'exploration')
}

export function observeBird(state: TownState, species: BirdSpecies): TownState {
  if (state.exploration.birdSightings.includes(species)) return state
  const next = {
    ...state,
    inventory: { ...state.inventory, 羽毛: state.inventory.羽毛 + 1 },
    exploration: { ...state.exploration, birdSightings: [...state.exploration.birdSightings, species] },
  }
  return progressQuest(next, 'birdwatching')
}

export function observeCreature(state: TownState, species: UnknownCreatureSpecies): TownState {
  if (state.exploration.creatureSightings.includes(species)) return state
  const next = {
    ...state,
    inventory: { ...state.inventory, 星砂: state.inventory.星砂 + 1 },
    exploration: { ...state.exploration, creatureSightings: [...state.exploration.creatureSightings, species] },
  }
  return progressQuest(next, 'xenobiology')
}

export function cookRecipe(state: TownState, recipeId: RecipeId): TownState | null {
  const recipe = RECIPES.find(entry => entry.id === recipeId)
  if (!recipe) return null
  for (const [item, quantity] of Object.entries(recipe.ingredients) as [ItemId, number][]) {
    if (state.inventory[item] < quantity) return null
  }
  const inventory = { ...state.inventory }
  for (const [item, quantity] of Object.entries(recipe.ingredients) as [ItemId, number][]) inventory[item] -= quantity
  inventory[recipe.output] += 1
  const next = {
    ...state,
    inventory,
    exploration: { ...state.exploration, craftedRecipes: state.exploration.craftedRecipes.includes(recipeId) ? state.exploration.craftedRecipes : [...state.exploration.craftedRecipes, recipeId] },
  }
  return progressQuest(next, 'cooking')
}

export function interactWithPet(state: TownState): TownState {
  return { ...state, pet: { ...state.pet, bond: Math.min(100, state.pet.bond + 1) } }
}

export function feedPet(state: TownState): TownState | null {
  if (state.inventory.宠物零食 <= 0) return null
  return {
    ...state,
    inventory: { ...state.inventory, 宠物零食: state.inventory.宠物零食 - 1 },
    pet: { ...state.pet, bond: Math.min(100, state.pet.bond + 10) },
  }
}

export function renamePet(state: TownState, name: string): TownState | null {
  const trimmed = name.trim().slice(0, 16)
  if (!trimmed) return null
  return { ...state, pet: { ...state.pet, name: trimmed } }
}

export function changePet(state: TownState, kind: PetKind): TownState {
  return { ...state, pet: { ...state.pet, kind } }
}

export function customizeAvatar(state: TownState, changes: Partial<AvatarAppearance>): TownState {
  return { ...state, appearance: normalizeAppearance({ ...state.appearance, ...changes }) }
}
