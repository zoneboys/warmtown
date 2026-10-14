import {
  APPEARANCE_OPTIONS,
  BUILDING_COSTS,
  DEFAULT_APPEARANCE,
  FRIEND_PROFILES,
  HOME_UPGRADE_COSTS,
  ITEM_IDS,
  ITEM_META,
  QUESTS,
  RECIPES,
  REGIONS,
  SHOP_BUY_PRICES,
  type AvatarAppearance,
  type BirdSpecies,
  type BuildingKind,
  type BuildingStyle,
  type FriendId,
  type InteriorColors,
  type HomeColors,
  type ItemId,
  type QuestId,
  type RecipeId,
  type RegionId,
  type TownState,
  type UnknownCreatureSpecies,
} from '../game/town-model'
import type { TownPanel } from '../game/town-game'

export type TownUIHooks = {
  start(): void
  interact(): void
  pause(): void
  menuOpen(open: boolean): void
  setVirtualMove(x: number, y: number): void
  customize(changes: Partial<AvatarAppearance>): void
  buy(item: ItemId, amount: number): void
  sell(item: ItemId, amount: number): void
  claimQuest(id: QuestId): void
  beginBuild(kind: BuildingKind): void
  beginMoveBuilding(id: string): void
  claimBuildKit(): void
  removeBuilding(id: string): void
  rotateBuilding(id: string): void
  modifyBuilding(id: string): void
  resizeBuilding(id: string, scale: number): void
  modifyInteriorColors(colors: Partial<InteriorColors>): void
  modifyHomeColors(colors: Partial<HomeColors>): void
  modifyHomeStyle(style: BuildingStyle): void
  modifyInteriorStyle(style: BuildingStyle): void
  cancelBuild(): void
  confirmBuild(): void
  rotateBuild(): void
  toggleVehicle(): void
  openFloorplan(popup?: boolean): void
  petInteract(): void
  feedPet(): void
  renamePet(name: string): void
  changePet(kind: TownState['pet']['kind']): void
  changeRegion(region: RegionId): void
  cook(recipe: RecipeId): void
  editInterior(): void
  leaveInterior(): void
  isInterior?(): boolean
  trackQuest(id: QuestId): void
  befriend(id: FriendId): void
  giftFriend(id: FriendId, item: ItemId): void
  upgradeHome(): void
  loadAvatar?(): void
}

const panelTitles: Record<TownPanel, string> = {
  inventory: '随身背包', character: '我的衣橱', shop: '海湾小集', build: '家园建造', quests: '今日小目标', pet: '伙伴小屋', explore: '探索手册', friends: '好友手册',
}

const appearanceGroups: Array<{ title: string; fields: Array<{ key: Exclude<keyof AvatarAppearance, 'morphs'>; label: string }> }> = [
  { title: '脸部', fields: [
    { key: 'faceShape', label: '脸型' }, { key: 'eyeStyle', label: '眼睛' }, { key: 'browStyle', label: '眉毛' },
    { key: 'noseStyle', label: '鼻子' }, { key: 'mouthStyle', label: '嘴巴' },
  ] },
  { title: '头发与肤色', fields: [
    { key: 'hairStyle', label: '发型' }, { key: 'hairColor', label: '发色' }, { key: 'skinTone', label: '肤色' },
  ] },
  { title: '日常穿搭与配饰', fields: [
    { key: 'outfit', label: '上衣' }, { key: 'bottom', label: '下装' }, { key: 'accessory', label: '配饰' },
  ] },
]

const previewHairClass: Record<AvatarAppearance['hairStyle'], string> = {
  '空气感中长': 'hair-airy-long', '侧分波波': 'hair-side-bob', '软糯短发': 'hair-soft-short', '低双马尾': 'hair-low-twin-ponies',
  '齐肩层次': 'hair-layered', '侧分长发': 'hair-side-part', '软刘海': 'hair-soft-bangs',
  '双丸子': 'hair-buns', '短卷': 'hair-short', '齐耳': 'hair-ear-length', '低马尾': 'hair-pony', '蓬松卷': 'hair-curly',
}
const previewEyeClass: Record<AvatarAppearance['eyeStyle'], string> = {
  '杏仁眼': 'eye-almond', '圆眼': 'eye-round', '弯眼': 'eye-smile', '星光眼': 'eye-star',
}

export class TownUI {
  private state: TownState | null = null
  private activePanel: TownPanel | null = null
  private toastTimer = 0
  private readonly toastElement: HTMLElement
  private readonly panelScreen: HTMLElement
  private readonly panelContent: HTMLElement
  private readonly welcome: HTMLElement
  private readonly shell: HTMLElement
  private readonly floorplanScreen: HTMLElement
  private readonly floorplanFrame: HTMLIFrameElement
  private readonly floorplanError: HTMLElement
  private liveControlInput = false

  constructor(private readonly root: HTMLElement, private readonly hooks: TownUIHooks) {
    root.innerHTML = `
      <div class="game-shell">
        <header class="topbar" aria-label="小镇状态">
      <a class="brand" href="${import.meta.env.BASE_URL}website/" aria-label="暖湾小镇官网"><span class="brand-mark">⌁</span><span>暖湾小镇</span><small>慢慢生活，刚刚好</small></a>
          <div class="weather-pill"><span class="sun-dot"></span><span>初夏 · 微风</span><i>☼</i></div>
          <div class="top-actions"><span class="save-state"><i></i>进度保存在本机</span><button class="icon-button" data-action="pause" aria-label="暂停游戏" title="暂停（Esc）">Ⅱ</button></div>
        </header>

        <button class="map-toggle" data-action="map" aria-label="打开地图">⌖ 地图</button>
        <aside class="map-card panel hidden" id="map-card" aria-label="暖湾地图">
          <div class="panel-kicker"><span class="kicker-dot gold"></span>暖湾探索地图</div>
          <div class="map-illustration"><span class="map-island"></span><i class="map-marker map-home">⌂</i><i class="map-marker map-pond">♧</i><i class="map-marker map-plaza">✦</i><i class="map-marker map-npc npc-a">●</i><i class="map-marker map-npc npc-f">●</i><i class="map-marker map-npc npc-m">●</i><i class="map-marker map-player" id="map-player">●</i><span class="map-label label-home">家园</span><span class="map-label label-pond">池塘</span><span class="map-label label-plaza">广场</span><span class="map-label label-npc-a">阿禾</span><span class="map-label label-npc-f">海叔</span></div>
          <div class="region-list">${REGIONS.map(region => `<button class="region-chip" data-action="region" data-region="${region.id}">${region.id}<small>${region.description}</small></button>`).join('')}</div>
          <p class="map-help">金色标记是任务地点，蓝色标记是你的当前位置。切换区域后会保留探索记录。</p>
        </aside>
        <aside class="quest-card panel" aria-label="任务进度">
          <div class="panel-kicker"><span class="kicker-dot"></span>今日小目标</div>
          <div id="quest-summary-list" class="quest-summary-list"></div>
          <button class="text-button" data-panel="quests">打开任务本领取奖励 →</button>
        </aside>

        <div class="orientation-hint" role="status" aria-live="polite">
          <span class="orientation-icon" aria-hidden="true">↔</span>
          <span>横屏体验更舒服</span>
        </div>

        <aside class="inventory-card panel" aria-label="背包与贝币">
          <div class="inventory-heading"><div class="panel-kicker"><span class="kicker-dot gold"></span>随身背包</div><button class="tiny-button" data-panel="inventory">打开背包</button></div>
          <div class="coin-line"><span class="coin-icon">✦</span><strong id="coin-count">16</strong><span>贝币</span><span class="inventory-divider"></span><span class="seed-icon">♧</span><strong id="seed-count">3</strong><span>种子</span></div>
          <div id="quick-inventory" class="inventory-grid"></div>
        </aside>

        <div class="location-label" id="location-label"><span class="location-pin">⌖</span><span>暖湾海岛</span></div>
        <div class="interaction-hint" id="interaction-hint"><span class="keycap">E</span><span id="prompt-copy">沿着小路散步，认识邻居，看看海边有什么新发现。</span></div>
        <div class="build-toolbar" id="build-toolbar" aria-label="建造操作" hidden>
          <span class="build-toolbar-title"><i>⌁</i><b id="build-toolbar-mode">建造预览</b><small id="build-toolbar-copy">点击地面放置</small></span>
          <button class="mini-action" data-action="confirm-build">放置</button>
          <button class="mini-action light" data-action="rotate-build">↻ 旋转</button>
          <button class="mini-action light" data-action="cancel-build">× 取消</button>
        </div>
        <div class="toast" id="toast" role="status" aria-live="polite"></div>

        <nav class="action-bar" aria-label="生活菜单">
          <button data-panel="inventory"><span>▦</span>背包 <kbd>I</kbd></button>
          <button data-panel="character"><span>✿</span>衣橱 <kbd>C</kbd></button>
          <button data-panel="quests"><span>☷</span>任务 <kbd>J</kbd></button>
          <button data-panel="shop"><span>⌂</span>小集 <kbd>T</kbd></button>
          <button data-panel="build"><span>⌁</span>建造 <kbd>B</kbd></button>
          <button data-panel="pet"><span>♡</span>伙伴 <kbd>O</kbd></button>
          <button data-panel="friends"><span>◎</span>好友 <kbd>F</kbd></button>
          <button data-panel="explore"><span>✧</span>探索 <kbd>L</kbd></button>
          <button data-action="vehicle"><span>↗</span>载具 <kbd>V</kbd></button>
        </nav>

        <div class="mobile-pad" aria-label="触屏移动控制">
          <div class="touch-stick town-stick"><i></i></div>
        </div>
        <div class="mobile-actions" aria-label="触屏操作">
          <button class="mobile-jump" data-touch="jump" aria-label="跳跃">跳跃</button>
          <button class="mobile-interact" data-touch="interact" aria-label="互动">互动</button>
        </div>
        <div class="mobile-look-hint" aria-hidden="true">拖动右侧转动视角</div>

        <section class="welcome-screen" id="welcome-screen" aria-label="欢迎来到暖湾小镇">
          <div class="welcome-scrim"></div>
          <div class="welcome-content">
            <div class="welcome-eyebrow"><span>✦</span> 一座慢下来的海岛 <span>✦</span></div>
            <h1>暖湾小镇</h1>
            <p class="welcome-lead">海风吹过的时候，日子就慢了一点。</p>
            <p class="welcome-copy">捏出喜欢的笑脸，穿上今天的衣服，<br>带上小伙伴去赶集、钓鱼、布置家门口。</p>
            <div class="welcome-buttons"><button class="start-button" data-action="start"><span>开始漫游</span><b>→</b></button><button class="wardrobe-button" data-panel="character">先看看我的样子</button></div>
            <div class="welcome-controls"><span>移动 <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>跳跃 <kbd>Space</kbd></span><span>互动 <kbd>E</kbd></span><span>载具 <kbd>V</kbd></span><span>视角 拖动鼠标（上下可仰望星空）</span></div>
            <small class="welcome-note">单人生活模拟 · 进度保存在当前设备 · 真实多人联动尚未上线</small>
          </div>
        </section>

        <section class="modal-screen hidden" id="panel-screen" aria-label="小镇菜单">
          <div class="modal-card panel" role="dialog" aria-modal="true" aria-labelledby="panel-title">
            <header class="modal-header"><div><p class="panel-kicker">暖湾日常手册</p><h2 id="panel-title">随身背包</h2></div><button class="close-button" data-action="close-panel" aria-label="关闭面板">×</button></header>
            <div class="modal-content" id="panel-content"></div>
            <footer class="modal-footer"><span>慢慢来，不必一次做完所有事。</span><kbd>Esc</kbd></footer>
          </div>
        </section>

        <section class="floorplan-screen hidden" id="floorplan-screen" aria-label="室内户型建造">
          <div class="floorplan-window panel" role="dialog" aria-modal="true" aria-labelledby="floorplan-title">
            <header class="floorplan-header"><div><p class="panel-kicker"><span class="kicker-dot gold"></span>游戏内建造工作区</p><h2 id="floorplan-title">户型与室内装修</h2><small>拖拽墙体、门窗和家具，应用后立即同步到当前家园</small></div><div class="floorplan-actions"><button class="mini-action light" data-action="floorplan-popup">新窗口打开</button><button class="close-button" data-action="close-floorplan" aria-label="关闭户型设计器">×</button></div></header>
            <div class="floorplan-body"><iframe id="floorplan-frame" title="户型与室内装修设计器" loading="eager" src="about:blank"></iframe><div class="floorplan-error hidden" id="floorplan-error" role="alert"><strong>户型设计器没有加载</strong><p>请确认游戏服务仍在运行，然后重新加载设计器。</p><button class="mini-action" data-action="floorplan-retry">重新加载</button></div></div>
          </div>
        </section>

        <section class="pause-screen hidden" id="pause-screen" aria-label="游戏暂停">
          <div class="pause-card panel"><span class="pause-leaf">☘</span><h2>歇一会儿</h2><p>海风不会催你，慢慢来就好。</p><button class="start-button small" data-action="resume"><span>继续漫游</span><b>→</b></button><small>按 Esc 也可以继续</small></div>
        </section>
      </div>`
    this.toastElement = root.querySelector<HTMLElement>('#toast')!
    this.panelScreen = root.querySelector<HTMLElement>('#panel-screen')!
    this.panelContent = root.querySelector<HTMLElement>('#panel-content')!
    this.welcome = root.querySelector<HTMLElement>('#welcome-screen')!
    this.shell = root.querySelector<HTMLElement>('.game-shell')!
    this.floorplanScreen = root.querySelector<HTMLElement>('#floorplan-screen')!
    this.floorplanFrame = root.querySelector<HTMLIFrameElement>('#floorplan-frame')!
    this.floorplanError = root.querySelector<HTMLElement>('#floorplan-error')!
    this.floorplanFrame.addEventListener('load', () => this.onFloorplanFrameLoad())
    this.floorplanFrame.addEventListener('error', () => this.showFloorplanError())
    window.addEventListener('warmtown-floorplan-applied', event => {
      const count = (event as CustomEvent<{ count?: number }>).detail?.count ?? 0
      this.closeFloorplan(true)
      this.toast(`户型已应用，建造清单已刷新（${count} 个室内实体）。`)
    })
    this.bindEvents()
  }

  setState(state: TownState): void {
    this.state = state
    this.renderHud()
    if (this.activePanel && !this.liveControlInput) this.renderPanel()
  }

  openPanel(panel: TownPanel): void {
    this.activePanel = panel
    this.panelScreen.classList.remove('hidden')
    this.root.querySelector<HTMLElement>('#panel-title')!.textContent = panelTitles[panel]
    this.renderPanel()
    this.hooks.menuOpen(true)
  }

  closePanel(): void {
    if (!this.activePanel) return
    this.activePanel = null
    this.panelScreen.classList.add('hidden')
    this.hooks.menuOpen(false)
  }

  openFloorplan(): void {
    if (this.activePanel) this.closePanel()
    this.floorplanScreen.classList.remove('hidden')
    if (this.floorplanFrame.src === 'about:blank' || !this.floorplanFrame.src.includes('/floorplan-3d/')) {
      this.floorplanError.classList.add('hidden')
      this.floorplanFrame.src = new URL('./floorplan-3d/index.html?from=warmtown&embedded=1', document.baseURI).toString()
    }
    this.hooks.menuOpen(true)
  }

  private onFloorplanFrameLoad(): void {
    this.floorplanFrame.title = '户型与室内装修设计器，已加载'
    try {
      const ready = Boolean(this.floorplanFrame.contentDocument?.querySelector('#plan'))
      if (ready) this.floorplanError.classList.add('hidden')
      else this.showFloorplanError()
    } catch {
      this.showFloorplanError()
    }
  }

  private showFloorplanError(): void {
    this.floorplanError.classList.remove('hidden')
  }

  private retryFloorplan(): void {
    this.floorplanError.classList.add('hidden')
    const url = new URL('./floorplan-3d/index.html?from=warmtown&embedded=1', document.baseURI)
    url.searchParams.set('retry', String(Date.now()))
    this.floorplanFrame.src = url.toString()
  }

  closeFloorplan(returnToBuild = false): void {
    this.floorplanScreen.classList.add('hidden')
    this.hooks.menuOpen(false)
    if (returnToBuild) this.openPanel('build')
  }

  startGame(): void {
    if (this.activePanel) this.closePanel()
    this.hooks.start()
    this.shell.classList.add('is-playing')
    this.welcome.classList.add('hidden')
    this.root.querySelector<HTMLElement>('#interaction-hint')?.classList.add('active')
  }

  updateStatus(prompt: string, target: string, paused: boolean, mapPoint?: { x: number; z: number }, worldTime?: { hours: number; phase: string; daylight: number }): void {
    const promptCopy = this.root.querySelector<HTMLElement>('#prompt-copy')!
    promptCopy.textContent = prompt
    const keycap = this.root.querySelector<HTMLElement>('#interaction-hint .keycap')
    const isVehiclePrompt = /驾驶|飞船|漫游|下车|返回地面|飞行/.test(prompt)
    if (keycap) {
      keycap.textContent = isVehiclePrompt ? 'V' : 'E'
      keycap.setAttribute('aria-label', isVehiclePrompt ? '按 V 下车或切换载具' : '按 E 互动')
    }
    this.root.querySelector<HTMLElement>('.mobile-jump')?.classList.toggle('hidden', isVehiclePrompt)
    const label = this.root.querySelector<HTMLElement>('#location-label')!
    label.innerHTML = `<span class="location-pin">⌖</span><span>${target ? escapeHtml(target) : '暖湾海岛'}</span>`
    if (worldTime) {
      const hour = Math.floor(worldTime.hours)
      const minute = Math.floor((worldTime.hours - hour) * 60)
      const timeLabel = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
      const weather = this.root.querySelector<HTMLElement>('.weather-pill')
      if (weather) weather.innerHTML = `<span class="sun-dot"></span><span>${timeLabel} · ${worldTime.phase === 'night' ? '星夜' : worldTime.phase === 'dawn' ? '黎明' : worldTime.phase === 'dusk' ? '暮光' : '白昼'}</span><i>${worldTime.daylight > 0.35 ? '☼' : '☾'}</i>`
    }
    this.root.querySelector<HTMLElement>('#pause-screen')?.classList.toggle('hidden', !paused || Boolean(this.activePanel))
    this.root.querySelector<HTMLElement>('[data-action="pause"]')?.classList.toggle('is-active', paused)
    const toolbar = this.root.querySelector<HTMLElement>('#build-toolbar')
    const isBuildPreview = prompt.includes('建造预览') || prompt.includes('移动家具预览')
    if (toolbar) {
      toolbar.hidden = !isBuildPreview
      toolbar.classList.toggle('is-interior', prompt.includes('室内'))
      const mode = this.root.querySelector<HTMLElement>('#build-toolbar-mode')
      const copy = this.root.querySelector<HTMLElement>('#build-toolbar-copy')
      if (mode) mode.textContent = prompt.includes('移动家具') ? '移动家具' : prompt.includes('室内') ? '室内建造' : '院落建造'
      if (copy) copy.textContent = prompt.includes('移动家具') ? '点击地面确认位置' : '点击地面放置 · R 旋转'
    }
    if (mapPoint) {
      const marker = this.root.querySelector<HTMLElement>('#map-player')
      if (marker) {
        const left = Math.max(5, Math.min(95, ((mapPoint.x + 64) / 128) * 100))
        const top = Math.max(5, Math.min(95, ((mapPoint.z + 64) / 128) * 100))
        marker.style.left = `${left}%`
        marker.style.top = `${top}%`
      }
    }
  }

  toast(message: string): void {
    this.toastElement.textContent = message
    this.toastElement.classList.add('visible')
    window.clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => this.toastElement.classList.remove('visible'), 3200)
  }

  private renderHud(): void {
    if (!this.state) return
    const state = this.state
    this.root.querySelectorAll<HTMLElement>('[data-action="region"]').forEach(button => button.classList.toggle('active', button.dataset.region === state.exploration.region))
    this.root.querySelector<HTMLElement>('#coin-count')!.textContent = String(state.coins)
    this.root.querySelector<HTMLElement>('#seed-count')!.textContent = String(state.seeds)
    const quickItems: ItemId[] = ['贝壳', '蓝莓', '小鱼', '胡萝卜', '木材', '鱼饵']
    this.root.querySelector<HTMLElement>('#quick-inventory')!.innerHTML = quickItems.map(item => `
      <div class="inventory-item"><span class="item-emoji">${ITEM_META[item].emoji}</span><span>${item}</span><b>${state.inventory[item]}</b></div>`).join('')
    const active = QUESTS.filter(quest => !state.claimedQuests.includes(quest.id)).sort((a, b) => Number(b.id === state.trackedQuest) - Number(a.id === state.trackedQuest)).slice(0, 2)
    this.root.querySelector<HTMLElement>('#quest-summary-list')!.innerHTML = active.map(quest => {
      const count = state.questProgress[quest.id]
      const step = quest.steps[Math.min(count, quest.steps.length - 1)]
      return `<div class="quest-mini"><div class="quest-title">${escapeHtml(quest.title)}</div><div class="quest-copy">${escapeHtml(step)} · ${escapeHtml(quest.guide)}</div><div class="quest-progress"><span class="progress-track"><i style="width:${Math.round(count / quest.goal * 100)}%"></i></span><b>${count}/${quest.goal}</b></div></div>`
    }).join('') || '<div class="quest-copy">今天的心愿都完成啦，去海边散散步吧。</div>'
  }

  private renderPanel(): void {
    if (!this.state || !this.activePanel) return
    const state = this.state
    const content = this.panelContent
    if (this.activePanel === 'inventory') content.innerHTML = this.renderInventory(state)
    else if (this.activePanel === 'character') content.innerHTML = this.renderCharacter(state)
    else if (this.activePanel === 'shop') content.innerHTML = this.renderShop(state)
    else if (this.activePanel === 'build') content.innerHTML = this.renderBuild(state)
    else if (this.activePanel === 'quests') content.innerHTML = this.renderQuests(state)
    else if (this.activePanel === 'explore') content.innerHTML = this.renderExplore(state)
    else if (this.activePanel === 'friends') content.innerHTML = this.renderFriends(state)
    else content.innerHTML = this.renderPet(state)
    this.bindPanelEvents()
  }

  private renderInventory(state: TownState): string {
    return `<div class="wallet-strip"><span>✦ <b>${state.coins}</b> 贝币</span><span>♧ <b>${state.seeds}</b> 包种子</span><span>背包物品 <b>${ITEM_IDS.reduce((sum, item) => sum + state.inventory[item], 0)}</b> 件</span></div>
      <p class="panel-intro">捡到的材料、鱼获和宠物零食都会收在这里。鱼饵在池塘边会自动用掉。</p>
      <div class="bag-grid">${ITEM_IDS.map(item => `<article class="bag-item"><span class="bag-emoji">${ITEM_META[item].emoji}</span><div><strong>${item}</strong><small>${ITEM_META[item].group}${ITEM_META[item].sellPrice === null ? ' · 暂不出售' : ` · 摊位收购 ${ITEM_META[item].sellPrice} 贝币`}</small></div><b>×${state.inventory[item]}</b>${item === '宠物零食' ? '<button class="mini-action" data-action="pet-feed">喂伙伴</button>' : ''}</article>`).join('')}</div>`
  }

  private renderCharacter(state: TownState): string {
    const hairClass = previewHairClass[state.appearance.hairStyle]
    const eyeClass = previewEyeClass[state.appearance.eyeStyle]
    const outfitColor = state.appearance.outfit === '海盐针织' ? '#b7c6dd' : state.appearance.outfit === '薄荷外套' ? '#a8d1c5' : state.appearance.outfit === '杏色开衫' ? '#e7a487' : '#84c5b8'
    const morphLabels: Array<[keyof AvatarAppearance['morphs'], string, number, number, number]> = [
      ['height', '身高', 0.82, 1.18, 0.01], ['build', '体型', 0.78, 1.28, 0.01], ['head', '头部比例', 0.86, 1.16, 0.01],
      ['shoulder', '肩宽', 0.8, 1.22, 0.01], ['legs', '腿长', 0.82, 1.18, 0.01],
    ]
    return `<div class="character-preview"><div class="character-preview-orbit"><span class="preview-spark spark-a">✦</span><span class="preview-spark spark-b">✿</span><div class="preview-avatar face-${state.appearance.faceShape} ${hairClass} ${eyeClass}" style="--preview-skin:${state.appearance.skinTone === '奶油' ? '#f1d2ae' : state.appearance.skinTone === '浅麦' ? '#c98f6d' : '#f0bd9d'};--preview-hair:${state.appearance.hairColor === '茶黑' ? '#3f3d3b' : state.appearance.hairColor === '亚麻金' ? '#c99c55' : state.appearance.hairColor === '海松绿' ? '#507c70' : '#684a3c'};--preview-outfit:${outfitColor}"><span class="preview-body"></span><i class="preview-eye eye-left"></i><i class="preview-eye eye-right"></i><b class="preview-mouth"></b></div></div><div class="character-preview-copy"><strong>我的暖湾居民</strong><p>选择脸型、眉眼、发型和穿搭，游戏中的人物会立即更新并保存。</p><button class="mini-action" data-action="close-panel">回到游戏查看</button></div></div>
      <div class="character-intro"><div class="avatar-stamp">✿</div><div><strong>做一个有自己样子的暖湾居民</strong><p>内置角色是当前可验收版本，外观修改会立刻显示并保存。</p><button class="mini-action light" data-action="modern-default">使用现代默认形象</button><button class="mini-action light" data-action="load-avatar">加载 Blender 角色预览</button></div></div>
      <section class="option-group morph-group"><h3>实时体型塑形</h3><div class="morph-grid">${morphLabels.map(([key, label, min, max, step]) => `<label class="range-field"><span>${label}<output data-morph-output="${key}">${state.appearance.morphs[key].toFixed(2)}</output></span><input type="range" min="${min}" max="${max}" step="${step}" value="${state.appearance.morphs[key]}" data-morph="${key}" /></label>`).join('')}</div></section>
      ${appearanceGroups.map(group => `<section class="option-group"><h3>${group.title}</h3><div class="option-grid">${group.fields.map(field => {
        const options = APPEARANCE_OPTIONS[field.key] as readonly string[]
        const selected = state.appearance[field.key]
        return `<label class="select-field"><span>${field.label}</span><select data-appearance="${field.key}">${options.map(option => `<option value="${escapeHtml(option)}"${selected === option ? ' selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select></label>`
      }).join('')}</div></section>`).join('')}`
  }

  private renderShop(state: TownState): string {
    const buys = (Object.entries(SHOP_BUY_PRICES) as [ItemId, number][]).map(([item, price]) => `<article class="trade-row"><span class="trade-icon">${ITEM_META[item].emoji}</span><div class="trade-copy"><strong>${item}</strong><small>${item === '鱼饵' ? '钓鱼时需要，每次抛竿消耗 1 个' : item === '宠物零食' ? '喂给小伙伴，亲密度增加' : '家园建造常用材料'}</small></div><b class="trade-price">${price} 贝币</b><button class="mini-action" data-action="buy" data-item="${item}"${state.coins < price ? ' disabled' : ''}>买 1</button></article>`).join('')
    const sellable = ITEM_IDS.filter(item => ITEM_META[item].sellPrice !== null && state.inventory[item] > 0)
    const sells = sellable.length ? sellable.map(item => `<article class="trade-row"><span class="trade-icon">${ITEM_META[item].emoji}</span><div class="trade-copy"><strong>${item} <small>×${state.inventory[item]}</small></strong><small>摊位收购价 ${ITEM_META[item].sellPrice} 贝币 / 件</small></div><b class="trade-price">+${ITEM_META[item].sellPrice} 贝币</b><button class="mini-action light" data-action="sell" data-item="${item}">卖 1</button></article>`).join('') : '<p class="empty-note">背包里还没有可以卖出的采集物或鱼获。</p>'
    return `<div class="wallet-strip"><span>当前零钱 <b>✦ ${state.coins} 贝币</b></span><span>摊主 阿葵</span></div><p class="panel-intro">用采集与垂钓换来的收获，换成建造材料、鱼饵和宠物零食。每笔买卖都会记入市集小目标。</p><section class="trade-section"><h3>摊位货架</h3>${buys}</section><section class="trade-section"><h3>把收获卖给阿葵</h3>${sells}</section>`
  }

  private renderExplore(state: TownState): string {
    const recipes = RECIPES.map(recipe => {
      const ingredients = Object.entries(recipe.ingredients).map(([item, amount]) => `${item} ×${amount}`).join('、')
      const ready = Object.entries(recipe.ingredients).every(([item, amount]) => state.inventory[item as ItemId] >= (amount ?? 0))
      return `<article class="recipe-card"><span class="recipe-icon">${ITEM_META[recipe.output].emoji}</span><div><strong>${recipe.id}</strong><small>${ingredients}</small><p>${recipe.description}</p></div><button class="mini-action" data-action="cook" data-recipe="${recipe.id}"${ready ? '' : ' disabled'}>制作</button></article>`
    }).join('')
    const birds = ['蓝羽海燕', '月光鹭', '彩虹蜂鸟'].map(species => { const seen = state.exploration.birdSightings.includes(species as BirdSpecies); return `<span class="discovery-chip${seen ? ' found' : ''}">${seen ? '✓' : '○'} ${species}</span>` }).join('')
    const creatures = ['雾尾兽', '星脉鹿', '浮光翼兽', '星环蜉蝣', '晶壳螯兽', '潮汐巨鹿'].map(species => { const seen = state.exploration.creatureSightings.includes(species as UnknownCreatureSpecies); return `<span class="discovery-chip creature-chip${seen ? ' found' : ''}">${seen ? '✦' : '○'} ${species}</span>` }).join('')
    return `<div class="explore-summary"><strong>${state.exploration.region}</strong><p>已发现 ${state.exploration.discoveredRegions.length} / ${REGIONS.length} 个区域 · 隐藏材料 ${state.exploration.hiddenFinds.length} 件</p></div><section class="trade-section"><h3>观鸟手册</h3><div class="discovery-list">${birds}</div></section><section class="trade-section"><h3>未知生命档案</h3><p class="panel-intro">靠近发光生物按 E，记录样本后获得星砂。</p><div class="discovery-list">${creatures}</div></section><section class="trade-section"><h3>烹饪台食谱</h3><div class="recipe-list">${recipes}</div></section>`
  }

  private renderBuild(state: TownState): string {
    const interior = this.hooks.isInterior?.() ?? false
    const iconFor = (kind: BuildingKind): string => kind === '花盆' ? '🪴' : kind === '长椅' ? '🪑' : kind === '路灯' ? '🏮' : kind === '木栅栏' ? '🪵' : kind === '邮箱' ? '📮' : kind === '小屋' ? '🏠' : kind === '厨房' ? '🍳' : kind === '床铺' ? '🛏️' : kind === '室内墙体' ? '🧱' : kind === '室内隔断' ? '🪟' : kind === '室内地板' ? '▦' : kind === '室内窗' ? '🪟' : kind === '室内门' ? '🚪' : kind === '室内衣柜' ? '🗄️' : kind === '室内沙发' ? '🛋️' : kind === '室内桌子' ? '🪑' : kind === '室内椅子' ? '🪑' : '💡'
    const renderItem = ([kind, cost]: [BuildingKind, typeof BUILDING_COSTS[BuildingKind]]): string => {
      const materials = Object.entries(cost.materials).map(([item, amount]) => `${item} ×${amount}`).join('、')
      const zoneAllowed = interior ? kind !== '小屋' : !kind.startsWith('室内')
      const ready = zoneAllowed && state.coins >= cost.coins && Object.entries(cost.materials).every(([item, amount]) => state.inventory[item as ItemId] >= (amount ?? 0))
      const interiorOnly = kind.startsWith('室内')
      return `<article class="build-card"><span class="build-icon">${iconFor(kind)}</span><div><strong>${kind}</strong><small>${interiorOnly ? '室内结构' : '院落 / 室内家具'} · ${cost.coins} 贝币${materials ? ` · ${materials}` : ''}</small></div><button class="mini-action" data-action="begin-build" data-kind="${kind}"${ready ? '' : ' disabled'}>放置</button></article>`
    }
    const allItems = Object.entries(BUILDING_COSTS) as [BuildingKind, typeof BUILDING_COSTS[BuildingKind]][]
    const items = allItems.filter(([kind]) => !kind.startsWith('室内')).map(renderItem).join('')
    const interiorItems = allItems.filter(([kind]) => kind.startsWith('室内')).map(renderItem).join('')
    const placed = state.buildings.length
      ? `<section class="trade-section build-edit-section"><h3>已放置 · 点击编辑</h3>${state.buildings.map(building => `<article class="build-card placed-build"><span class="build-icon">${building.kind === '小屋' ? '🏠' : building.kind === '厨房' ? '🍳' : building.kind === '床铺' ? '🛏️' : '✦'}</span><div><strong>${building.kind}</strong><small>${building.zone === 'interior' ? '屋内' : '院落'} · ${building.style} · ${(building.rotation * 180 / Math.PI).toFixed(0)}° · ${(building.scale * 100).toFixed(0)}%</small>${building.zone === 'interior' ? `<label class="range-field compact"><span>尺寸 <output data-building-output="${building.id}">${building.scale.toFixed(2)}</output></span><input type="range" min="0.65" max="1.8" step="0.05" value="${building.scale}" data-building-scale="${building.id}" /></label>` : ''}</div><button class="mini-action light" data-action="move-building" data-building="${building.id}" title="移动">移动</button><button class="mini-action light" data-action="rotate-building" data-building="${building.id}" title="旋转">↻</button><button class="mini-action light" data-action="modify-building" data-building="${building.id}">改造</button><button class="mini-action light" data-action="remove-building" data-building="${building.id}">收起</button></article>`).join('')}</section>`
      : '<p class="empty-note">还没有放置建筑。先领取建材包，或去海边和小集收集材料。</p>'
    const kit = !state.buildKitClaimed && state.buildings.length === 0
      ? `<section class="build-kit"><div><strong>新手建材包</strong><small>木材 ×12 · 石料 ×6 · 贝币 +40，只能领取一次</small></div><button class="mini-action" data-action="claim-build-kit">领取</button></section>`
      : ''
    const styles: BuildingStyle[] = ['海风奶油', '花园薄荷', '暮光珊瑚']
    const styleNames: Record<BuildingStyle, string> = { 海风奶油: '月纱藻绿', 花园薄荷: '星云晶紫', 暮光珊瑚: '熔光珊瑚' }
    const homeStyles = `<section class="home-style-editor"><div><strong>有机舱体外观</strong><small>异星材质主题与外壳、穹顶、光带颜色都能单独调整。</small></div><div class="style-chips">${styles.map(style => `<button class="choice-chip${state.homeStyle === style ? ' selected' : ''}" data-action="home-style" data-style="${style}">${styleNames[style]}</button>`).join('')}</div><div class="color-grid"><label>外壳 <input type="color" value="${state.homeColors.wall}" data-home-color="wall" /></label><label>穹顶 <input type="color" value="${state.homeColors.roof}" data-home-color="roof" /></label><label>光带 <input type="color" value="${state.homeColors.trim}" data-home-color="trim" /></label></div></section><section class="home-style-editor interior-style-editor"><div><strong>室内材质</strong><small>为舱壁、地面和结构边框选色。</small></div><div class="style-chips">${styles.map(style => `<button class="choice-chip${state.interiorStyle === style ? ' selected' : ''}" data-action="interior-style" data-style="${style}">${styleNames[style]}</button>`).join('')}</div><div class="color-grid"><label>墙面 <input type="color" value="${state.interiorColors.wall}" data-interior-color="wall" /></label><label>地板 <input type="color" value="${state.interiorColors.floor}" data-interior-color="floor" /></label><label>边框 <input type="color" value="${state.interiorColors.trim}" data-interior-color="trim" /></label></div></section>`
    const upgrade = HOME_UPGRADE_COSTS[state.homeLevel - 1]
    const upgradeMaterials = upgrade ? Object.entries(upgrade.materials).map(([item, amount]) => `${item} ×${amount}`).join('、') : ''
    const canUpgrade = Boolean(upgrade && state.coins >= upgrade.coins && Object.entries(upgrade.materials).every(([item, amount]) => state.inventory[item as ItemId] >= (amount ?? 0)))
    const upgradeCard = upgrade
      ? `<section class="build-kit home-upgrade"><div><strong>家园等级 ${state.homeLevel} → ${state.homeLevel + 1}</strong><small>${upgrade.title} · ${upgrade.coins} 贝币${upgradeMaterials ? ` · ${upgradeMaterials}` : ''}</small></div><button class="mini-action" data-action="upgrade-home"${canUpgrade ? '' : ' disabled'}>扩建</button></section>`
      : `<section class="build-kit home-upgrade"><div><strong>家园已达到星港等级</strong><small>阁楼信标会在夜空中指引未知航线。</small></div></section>`
    const modeTitle = interior ? '室内编辑' : `家园建造模式 · ${state.homeLevel === 1 ? '院落' : state.homeLevel === 2 ? '观景房' : '星港阁楼'}`
    const modeCopy = interior
      ? '你正在屋内施工：墙体、隔断、地板和窗会按人物尺度吸附到室内网格。绿色预览才可放置，按 R 旋转，按 E 或下方按钮回到院落。'
      : '院落家具可以自由摆放；进入室内编辑后，可用墙体、隔断、地板和窗重新划分房间。绿色预览才可放置，按 R 旋转。'
    const modeAction = interior ? '<button class="mini-action" data-action="leave-interior">回到院落</button>' : '<button class="mini-action" data-action="edit-interior">进入室内编辑</button>'
    const interiorAction = interior ? '<span class="build-mode-chip active">当前：室内网格</span>' : '<span class="build-mode-chip">进入房屋后编辑室内</span>'
    return `<div class="build-note"><div class="build-note-heading"><strong>${modeTitle}</strong>${interiorAction}</div><p>${modeCopy}</p><div class="build-note-actions">${modeAction}${interior ? '<button class="mini-action light" data-action="close-panel">开始自由摆放</button>' : ''}<button class="mini-action light" data-action="floorplan" title="打开 2D / 3D 户型设计器">户型设计器</button></div></div>${homeStyles}${upgradeCard}${kit}<h3 class="build-section-title">院落家具与房屋</h3><div class="build-list">${items}</div><h3 class="build-section-title">室内结构件</h3><p class="panel-intro">室内墙体、隔断、窗用于重新划分房间；室内地板可重复铺满。选择“放置”后关闭面板，在地面点击确认。</p><div class="build-list">${interiorItems}</div>${placed}<div class="wallet-strip"><span>贝币 <b>${state.coins}</b></span><span>木材 <b>${state.inventory.木材}</b></span><span>石料 <b>${state.inventory.石料}</b></span></div>`
  }

  private renderQuests(state: TownState): string {
    return `<p class="panel-intro">完成进度后，点击右侧“领取”按钮，奖励会自动加入贝币、种子或背包。</p><div class="quest-list">${QUESTS.map(quest => {
      const count = state.questProgress[quest.id]
      const claimed = state.claimedQuests.includes(quest.id)
      const complete = count >= quest.goal
      const reward = [`${quest.rewardCoins} 贝币`, quest.rewardSeeds ? `${quest.rewardSeeds} 种子` : '', quest.rewardItem ? `${quest.rewardItem.item} ×${quest.rewardItem.amount}` : ''].filter(Boolean).join(' · ')
      const step = quest.steps[Math.min(count, quest.steps.length - 1)]
      return `<article class="quest-row${claimed ? ' is-claimed' : complete ? ' is-complete' : ''}${state.trackedQuest === quest.id ? ' is-tracked' : ''}"><div class="quest-row-top"><span class="quest-medal">${claimed ? '✓' : complete ? '✦' : '○'}</span><div class="quest-detail"><strong>${escapeHtml(quest.title)}</strong><p>${escapeHtml(step)}</p><small>${escapeHtml(quest.guide)}</small><div class="quest-progress"><span class="progress-track"><i style="width:${Math.round(count / quest.goal * 100)}%"></i></span><b>${count}/${quest.goal}</b></div><small>奖励：${escapeHtml(reward)}</small></div><div class="quest-actions"><button class="mini-action light" data-action="track-quest" data-quest="${quest.id}"${claimed ? ' disabled' : ''}>${state.trackedQuest === quest.id ? '已追踪' : '追踪'}</button><button class="mini-action${claimed ? ' light' : ''}" data-action="claim" data-quest="${quest.id}"${complete && !claimed ? '' : ' disabled'}>${claimed ? '已领取' : complete ? '领取' : '进行中'}</button></div></div></article>`
    }).join('')}</div>`
  }

  private renderFriends(state: TownState): string {
    const giftItem = ITEM_IDS.find(item => ITEM_META[item].sellPrice !== null && state.inventory[item] > 0)
    return `<p class="panel-intro">这里记录小镇居民的关系进度。对话、送礼会提高好感度；好友系统目前是本地单机关系网络，后续可以接入真实联机。</p><div class="friend-list">${FRIEND_PROFILES.map(friend => {
      const level = state.friends[friend.id]
      return `<article class="friend-card"><div class="friend-avatar">${friend.id === 'haishu' ? '🌊' : friend.id === 'merchant' ? '🛍️' : friend.id === 'xiaoman' ? '🌱' : '✦'}</div><div class="friend-copy"><strong>${friend.name} · ${friend.role}</strong><p>${friend.greeting}</p><div class="quest-progress"><span class="progress-track"><i style="width:${level}%"></i></span><b>${level}/100</b></div></div><div class="friend-actions"><button class="mini-action" data-action="befriend" data-friend="${friend.id}">聊天</button><button class="mini-action light" data-action="gift-friend" data-friend="${friend.id}" data-item="${giftItem ?? ''}"${giftItem ? '' : ' disabled'}>送礼</button></div></article>`
    }).join('')}</div>`
  }

  private renderPet(state: TownState): string {
    const petName = escapeHtml(state.pet.name)
    return `<div class="pet-card"><div class="pet-portrait">${state.pet.kind === '小猫' ? '🐈' : '🐕'}</div><div class="pet-copy"><p class="panel-kicker">与你同行的小伙伴</p><h3>${petName}</h3><p>亲密度 ${state.pet.bond} / 100</p><div class="progress-track"><i style="width:${state.pet.bond}%"></i></div></div></div>
      <div class="pet-choice"><span>伙伴</span><button class="choice-chip${state.pet.kind === '小猫' ? ' selected' : ''}" data-action="pet-kind" data-kind="小猫">🐈 小猫</button><button class="choice-chip${state.pet.kind === '小狗' ? ' selected' : ''}" data-action="pet-kind" data-kind="小狗">🐕 小狗</button></div>
      <form class="pet-name-form" id="pet-name-form"><label for="pet-name">给伙伴取个名字</label><input id="pet-name" name="pet-name" maxlength="16" value="${petName}" /><button class="mini-action" type="submit">保存名字</button></form>
      <div class="pet-actions"><button class="secondary-button" data-action="pet-interact">摸摸伙伴</button><button class="mini-action" data-action="pet-feed"${state.inventory.宠物零食 <= 0 ? ' disabled' : ''}>喂宠物零食 ×${state.inventory.宠物零食}</button></div>
      <p class="panel-intro">伙伴会在你身后跟随。互动或喂食能增加亲密度，宠物种类、名字和进度保存在本机。</p>`
  }

  private bindEvents(): void {
    this.root.addEventListener('click', event => {
      const element = (event.target as HTMLElement).closest<HTMLElement>('[data-action], [data-panel]')
      if (!element) return
      if (element.dataset.panel) {
        this.openPanel(element.dataset.panel as TownPanel)
        return
      }
      const action = element.dataset.action
      if (action === 'start') this.startGame()
      else if (action === 'map') this.root.querySelector<HTMLElement>('#map-card')?.classList.toggle('hidden')
      else if (action === 'region' && element.dataset.region) this.hooks.changeRegion(element.dataset.region as RegionId)
      else if (action === 'interact') this.hooks.interact()
      else if (action === 'pause') this.hooks.pause()
      else if (action === 'resume') this.hooks.pause()
      else if (action === 'close-panel') this.closePanel()
      else if (action === 'vehicle') this.hooks.toggleVehicle()
      else if (action === 'floorplan') { this.openFloorplan(); this.hooks.openFloorplan() }
      else if (action === 'floorplan-popup') this.hooks.openFloorplan(true)
      else if (action === 'floorplan-retry') this.retryFloorplan()
      else if (action === 'close-floorplan') this.closeFloorplan()
      else if (action === 'buy' && element.dataset.item) this.hooks.buy(element.dataset.item as ItemId, 1)
      else if (action === 'sell' && element.dataset.item) this.hooks.sell(element.dataset.item as ItemId, 1)
      else if (action === 'claim' && element.dataset.quest) this.hooks.claimQuest(element.dataset.quest as QuestId)
      else if (action === 'track-quest' && element.dataset.quest) this.hooks.trackQuest(element.dataset.quest as QuestId)
      else if (action === 'befriend' && element.dataset.friend) this.hooks.befriend(element.dataset.friend as FriendId)
      else if (action === 'gift-friend' && element.dataset.friend && element.dataset.item) this.hooks.giftFriend(element.dataset.friend as FriendId, element.dataset.item as ItemId)
      else if (action === 'upgrade-home') this.hooks.upgradeHome()
      else if (action === 'edit-interior') this.hooks.editInterior()
      else if (action === 'leave-interior') { this.hooks.leaveInterior(); this.closePanel() }
      else if (action === 'cook' && element.dataset.recipe) this.hooks.cook(element.dataset.recipe as RecipeId)
      else if (action === 'claim-build-kit') this.hooks.claimBuildKit()
      else if (action === 'rotate-building' && element.dataset.building) this.hooks.rotateBuilding(element.dataset.building)
      else if (action === 'move-building' && element.dataset.building) { this.hooks.beginMoveBuilding(element.dataset.building); this.closePanel() }
      else if (action === 'modify-building' && element.dataset.building) this.hooks.modifyBuilding(element.dataset.building)
      else if (action === 'home-style' && element.dataset.style) this.hooks.modifyHomeStyle(element.dataset.style as BuildingStyle)
      else if (action === 'interior-style' && element.dataset.style) this.hooks.modifyInteriorStyle(element.dataset.style as BuildingStyle)
      else if (action === 'remove-building' && element.dataset.building) this.hooks.removeBuilding(element.dataset.building)
      else if (action === 'begin-build' && element.dataset.kind) {
        this.hooks.beginBuild(element.dataset.kind as BuildingKind)
        this.closePanel()
      } else if (action === 'rotate-build') this.hooks.rotateBuild()
      else if (action === 'confirm-build') this.hooks.confirmBuild()
      else if (action === 'cancel-build') this.hooks.cancelBuild()
      else if (action === 'modern-default') {
        this.hooks.customize({ ...DEFAULT_APPEARANCE })
        this.renderPanel()
      } else if (action === 'load-avatar') this.hooks.loadAvatar?.()
      else if (action === 'pet-interact') this.hooks.petInteract()
      else if (action === 'pet-feed') this.hooks.feedPet()
      else if (action === 'pet-kind' && element.dataset.kind) this.hooks.changePet(element.dataset.kind as TownState['pet']['kind'])
    })
    this.root.addEventListener('change', event => {
      const select = (event.target as HTMLElement).closest<HTMLSelectElement>('[data-appearance]')
      if (select) {
        const key = select.dataset.appearance as Exclude<keyof AvatarAppearance, 'morphs'>
        this.hooks.customize({ [key]: select.value } as Partial<AvatarAppearance>)
        this.renderPanel()
        return
      }
      const color = (event.target as HTMLElement).closest<HTMLInputElement>('[data-interior-color]')
      if (color?.dataset.interiorColor) {
        this.hooks.modifyInteriorColors({ [color.dataset.interiorColor]: color.value } as Partial<InteriorColors>)
        return
      }
      const homeColor = (event.target as HTMLElement).closest<HTMLInputElement>('[data-home-color]')
      if (homeColor?.dataset.homeColor) {
        this.hooks.modifyHomeColors({ [homeColor.dataset.homeColor]: homeColor.value } as Partial<HomeColors>)
      }
    })
    this.root.addEventListener('input', event => {
      const morph = (event.target as HTMLElement).closest<HTMLInputElement>('[data-morph]')
      if (morph?.dataset.morph) {
        const key = morph.dataset.morph as keyof AvatarAppearance['morphs']
        const value = Number(morph.value)
        const output = this.root.querySelector<HTMLOutputElement>(`[data-morph-output="${key}"]`)
        if (output) output.value = value.toFixed(2)
        this.liveControlInput = true
        try { this.hooks.customize({ morphs: { ...this.state!.appearance.morphs, [key]: value } }) }
        finally { this.liveControlInput = false }
        return
      }
      const scale = (event.target as HTMLElement).closest<HTMLInputElement>('[data-building-scale]')
      if (scale?.dataset.buildingScale) {
        const value = Number(scale.value)
        const output = this.root.querySelector<HTMLOutputElement>(`[data-building-output="${scale.dataset.buildingScale}"]`)
        if (output) output.value = value.toFixed(2)
        this.liveControlInput = true
        try { this.hooks.resizeBuilding(scale.dataset.buildingScale, value) }
        finally { this.liveControlInput = false }
      }
    })
    this.root.addEventListener('submit', event => {
      const form = (event.target as HTMLElement).closest<HTMLFormElement>('#pet-name-form')
      if (!form) return
      event.preventDefault()
      const input = form.querySelector<HTMLInputElement>('#pet-name')
      if (input) this.hooks.renamePet(input.value)
    })
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-move]')) {
      const vectors: Record<string, [number, number]> = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] }
      const move = () => { const value = vectors[button.dataset.move ?? ''] ?? [0, 0]; this.hooks.setVirtualMove(...value) }
      button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture?.(event.pointerId); move() })
      button.addEventListener('pointerup', () => this.hooks.setVirtualMove(0, 0))
      button.addEventListener('pointercancel', () => this.hooks.setVirtualMove(0, 0))
      button.addEventListener('lostpointercapture', () => this.hooks.setVirtualMove(0, 0))
    }
    window.addEventListener('keydown', event => {
      const typing = (event.target as HTMLElement | null)?.matches?.('input, textarea, select')
      if (this.activePanel && event.code === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        this.closePanel()
        return
      }
      if (typing || !this.shell.classList.contains('is-playing')) return
      const shortcut: Record<string, TownPanel> = {
        KeyI: 'inventory', KeyC: 'character', KeyJ: 'quests', KeyT: 'shop', KeyB: 'build', KeyO: 'pet', KeyF: 'friends', KeyL: 'explore',
      }
      const panel = shortcut[event.code]
      if (panel) {
        event.preventDefault()
        this.openPanel(panel)
      }
    })
  }

  private bindPanelEvents(): void {
    // The root-level delegated handlers remain active when panel HTML is refreshed from state.
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}
