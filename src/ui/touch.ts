import type { Input } from '../engine/input'

/**
 * On-screen touch controls: a floating stick on the left half, drag-to-look on the right half,
 * and JUMP / DASH buttons. Enabled automatically on the first touch.
 */
export class TouchControls {
  private stickId: number | null = null
  private lookId: number | null = null
  private origin = { x: 0, y: 0 }
  private last = { x: 0, y: 0 }
  private readonly stick: HTMLElement | null
  private readonly knob: HTMLElement | null

  constructor(root: HTMLElement, private readonly input: Input, private readonly active: () => boolean) {
    // The arcade HUD uses `.touch`, while the town HUD keeps the same input
    // actions in its own mobile controls. Support both layouts so jump stays
    // on the unified Input path when TownUI is mounted.
    const layer = root.querySelector<HTMLElement>('.touch') ?? root
    this.stick = layer.querySelector<HTMLElement>('.touch-stick')
    this.knob = this.stick?.querySelector<HTMLElement>('i') ?? null
    const radius = 56

    const enable = () => document.body.classList.add('has-touch')
    if (matchMedia('(pointer: coarse)').matches) enable()
    window.addEventListener('touchstart', enable, { once: true, passive: true })
    // Any touch switches hints/prompts to touch, even taps on menu buttons.
    window.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') this.input.method = 'touch'
    }, { capture: true })

    window.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch' || !this.active()) return
      const target = e.target as HTMLElement | null
      if (target?.closest('[data-touch], [data-action], [data-panel], a, select, input, textarea')) return
      if (this.stick && this.knob && e.clientX < window.innerWidth * 0.48 && this.stickId === null) {
        this.stickId = e.pointerId
        const rect = this.stick.parentElement?.getBoundingClientRect()
        const localX = e.clientX - (rect?.left ?? 0)
        const localY = e.clientY - (rect?.top ?? 0)
        this.origin = { x: localX, y: localY }
        this.stick.style.left = `${Math.max(58, Math.min((rect?.width ?? 240) - 58, localX))}px`
        this.stick.style.top = `${Math.max(58, Math.min((rect?.height ?? 190) - 58, localY))}px`
        this.stick.classList.add('is-active')
      } else if (this.lookId === null && e.clientX >= window.innerWidth * 0.48) {
        this.lookId = e.pointerId
        this.last = { x: e.clientX, y: e.clientY }
      }
    }, { capture: true, passive: false })
    window.addEventListener('pointermove', e => {
      if (e.pointerId === this.stickId) {
        const rect = this.stick?.parentElement?.getBoundingClientRect()
        const localX = e.clientX - (rect?.left ?? 0)
        const localY = e.clientY - (rect?.top ?? 0)
        let dx = localX - this.origin.x
        let dy = localY - this.origin.y
        const len = Math.hypot(dx, dy)
        if (len > radius) {
          dx = (dx / len) * radius
          dy = (dy / len) * radius
        }
        if (this.knob) this.knob.style.transform = `translate(${dx}px, ${dy}px)`
        this.input.setTouchMove(dx / radius, -dy / radius)
      } else if (e.pointerId === this.lookId) {
        this.input.addTouchLook(e.clientX - this.last.x, e.clientY - this.last.y)
        this.last = { x: e.clientX, y: e.clientY }
      }
    })
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.stickId) {
        this.stickId = null
        this.knob?.style.removeProperty('transform')
        this.stick?.classList.remove('is-active')
        this.input.setTouchMove(0, 0)
      }
      if (e.pointerId === this.lookId) this.lookId = null
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)

    for (const btn of root.querySelectorAll<HTMLElement>('[data-touch]')) {
      const action = btn.dataset.touch as 'jump' | 'dash' | 'interact'
      btn.addEventListener('pointerdown', e => {
        e.preventDefault()
        btn.setPointerCapture(e.pointerId)
        btn.classList.add('is-down')
        this.input.setTouchButton(action, true)
      })
      const up = () => {
        btn.classList.remove('is-down')
        this.input.setTouchButton(action, false)
      }
      btn.addEventListener('pointerup', up)
      btn.addEventListener('pointercancel', up)
    }
  }
}
