import './styles/main.css'
import { Input } from './engine/input'
import { Renderer, suggestQuality } from './engine/renderer'
import { TownGame } from './game/town-game'
import type { TownState } from './game/town-model'
import { TownUI } from './ui/town-ui'
import { TouchControls } from './ui/touch'

document.documentElement.lang = 'zh-CN'
const canvas = document.querySelector<HTMLCanvasElement>('#game')!
const root = document.querySelector<HTMLElement>('#ui')!
let game!: TownGame

// Register the UI's Escape handler before the generic input listener so a menu closes
// without also toggling the world pause state in the same key press.
const ui = new TownUI(root, {
  start: () => game.start(),
  interact: () => game.interact(),
  pause: () => game.togglePause(),
  menuOpen: open => game.setMenuOpen(open),
  setVirtualMove: (x, y) => game.setVirtualMove(x, y),
  customize: changes => game.customize(changes),
  buy: (item, amount) => game.buy(item, amount),
  sell: (item, amount) => game.sell(item, amount),
  claimQuest: id => game.claimQuest(id),
  trackQuest: id => game.trackQuest(id),
  befriend: id => game.befriend(id),
  giftFriend: (id, item) => { game.giftFriend(id, item) },
  upgradeHome: () => { game.upgradeHome() },
  beginBuild: kind => game.beginBuild(kind),
  beginMoveBuilding: id => game.beginMoveBuilding(id),
  claimBuildKit: () => game.claimBuildKit(),
  removeBuilding: id => game.removeBuilding(id),
  rotateBuilding: id => game.rotateBuilding(id),
  modifyBuilding: id => game.modifyBuilding(id),
  resizeBuilding: (id, scale) => game.resizeBuilding(id, scale),
  modifyInteriorColors: colors => game.modifyInteriorColors(colors),
  modifyHomeColors: colors => game.modifyHomeColors(colors),
  modifyHomeStyle: style => game.modifyHomeStyle(style),
  modifyInteriorStyle: style => game.modifyInteriorStyle(style),
  cancelBuild: () => game.cancelBuild(),
  confirmBuild: () => game.confirmBuild(),
  rotateBuild: () => game.rotateBuild(),
  toggleVehicle: () => game.toggleVehicle(),
  openFloorplan: popup => game.openFloorplan(popup),
  petInteract: () => game.interactWithCompanion(),
  feedPet: () => game.feedCompanion(),
  renamePet: name => game.setPetName(name),
  changePet: kind => game.setPetKind(kind),
  changeRegion: region => game.changeRegion(region),
  cook: recipe => game.cook(recipe),
  editInterior: () => game.editInterior(),
  leaveInterior: () => game.leaveInteriorFromMenu(),
  isInterior: () => game.isInterior,
  loadAvatar: () => { void game.loadBlenderAvatar() },
})

const input = new Input(canvas)
const renderer = new Renderer(canvas, suggestQuality())
game = new TownGame(renderer, input, {
  toast: message => ui.toast(message),
  changed: (state: TownState) => ui.setState(state),
  openPanel: panel => ui.openPanel(panel),
})

// TownUI exposes the same data-touch actions as the arcade HUD. Mounting the
// shared controller here keeps the mobile jump button on the unified Input
// path instead of creating a second gameplay shortcut.
new TouchControls(root, input, () => game.started && !game.paused)

let lastTime = performance.now()
let hudTime = 0
function frame(now: number): void {
  const dt = Math.min(0.05, (now - lastTime) / 1000)
  lastTime = now
  game.step(dt)
  game.render()
  if (now - hudTime > 120) {
    hudTime = now
    ui.updateStatus(game.getPrompt(), game.getTargetName(), game.paused, { x: game.world.player.position.x, z: game.world.player.position.z }, game.world.getWorldTime())
  }
  requestAnimationFrame(frame)
}

window.addEventListener('resize', () => game.world.setAspect(window.innerWidth / window.innerHeight))
;(window as unknown as { __game?: unknown }).__game = {
  game,
  ui,
  loadBlenderAvatar: (url?: string) => game.loadBlenderAvatar(url),
  setWorldTime: (hours: number) => game.world.setWorldTime(hours),
  getWorldTime: () => game.world.getWorldTime(),
  getLoadedWorldAssetKeys: () => game.world.getLoadedWorldAssetKeys(),
  get state() { return game.state },
}
requestAnimationFrame(frame)
