import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js'
import type { Quality } from './save'

export type RendererPreset = { pixelRatio: number; shadows: boolean; shadowMap: number; bloom: boolean; ambientOcclusion: boolean; depthOfField: boolean; antialias: boolean }
export const QUALITY_PRESETS: Record<Quality, RendererPreset> = {
  low: { pixelRatio: 1, shadows: false, shadowMap: 512, bloom: false, ambientOcclusion: false, depthOfField: false, antialias: false },
  medium: { pixelRatio: 1.5, shadows: true, shadowMap: 1024, bloom: false, ambientOcclusion: false, depthOfField: false, antialias: true },
  high: { pixelRatio: 1.75, shadows: true, shadowMap: 2048, bloom: true, ambientOcclusion: true, depthOfField: true, antialias: true },
}

/** Pick a starting quality from device hints; the player can override it in Settings. */
export function suggestQuality(): Quality {
  const coarse = matchMedia('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency ?? 4
  if (coarse || cores <= 4) return 'medium'
  return 'high'
}

/**
 * Owns the WebGL renderer, the optional post-processing chain and resize handling.
 * Scenes call `render(scene, camera)`; they never touch the composer directly.
 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer
  private composer?: EffectComposer
  private bloom?: UnrealBloomPass
  private preset: RendererPreset
  private scene?: THREE.Scene
  private camera?: THREE.PerspectiveCamera
  private gtao?: GTAOPass
  private bokeh?: BokehPass

  constructor(readonly canvas: HTMLCanvasElement, quality: Quality) {
    this.preset = QUALITY_PRESETS[quality]
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: this.preset.antialias, powerPreference: 'high-performance' })
    this.gl.outputColorSpace = THREE.SRGBColorSpace
    this.gl.toneMapping = THREE.ACESFilmicToneMapping
    this.gl.toneMappingExposure = 1
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap
    this.applyQuality(quality)
    window.addEventListener('resize', () => this.resize())
  }

  get shadowMapSize(): number {
    return this.preset.shadowMap
  }

  applyQuality(quality: Quality): void {
    this.preset = QUALITY_PRESETS[quality]
    this.gl.shadowMap.enabled = this.preset.shadows
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.preset.pixelRatio))
    this.bloom?.dispose()
    this.gtao?.dispose()
    this.bokeh?.dispose()
    this.composer?.dispose()
    this.composer = undefined
    this.bloom = undefined
    this.gtao = undefined
    this.bokeh = undefined
    this.resize()
  }

  private ensureComposer(scene: THREE.Scene, camera: THREE.PerspectiveCamera): EffectComposer | undefined {
    if (!this.preset.bloom) return undefined
    if (this.composer && this.scene === scene && this.camera === camera) return this.composer
    this.scene = scene
    this.camera = camera
    const size = this.gl.getSize(new THREE.Vector2())
    this.composer = new EffectComposer(this.gl)
    this.composer.addPass(new RenderPass(scene, camera))
    if (this.preset.ambientOcclusion) {
      this.gtao = new GTAOPass(scene, camera, size.x, size.y)
      this.gtao.updateGtaoMaterial({ radius: 0.42, distanceExponent: 2, thickness: 1.05, distanceFallOff: 1.25, scale: 1.15, samples: 12 })
      this.gtao.updatePdMaterial({ lumaPhi: 2, depthPhi: 1, normalPhi: 1, radius: 2, rings: 2, samples: 8 })
      this.composer.addPass(this.gtao)
    }
    // Keep bioluminescent accents readable without washing out the playable
    // scene. High-intensity PBR emission should bloom selectively, not turn
    // the entire night frame into a white veil.
    this.bloom = new UnrealBloomPass(size, 0.075, 0.16, 3.4)
    this.composer.addPass(this.bloom)
    if (this.preset.depthOfField) {
      this.bokeh = new BokehPass(scene, camera, { focus: 10, aperture: 0.00012, maxblur: 0.012 })
      this.composer.addPass(this.bokeh)
    }
    this.composer.addPass(new OutputPass())
    this.composer.setSize(size.x, size.y)
    return this.composer
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.gl.setSize(w, h, false)
    this.composer?.setSize(w, h)
    if (this.camera) {
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
    }
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    if (Math.abs(camera.aspect - w / h) > 1e-3) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const composer = this.ensureComposer(scene, camera)
    if (composer) composer.render()
    else this.gl.render(scene, camera)
  }
}
