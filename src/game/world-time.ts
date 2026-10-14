import * as THREE from 'three'

/**
 * A small, deterministic day/night clock for the town world.
 *
 * The clock intentionally has no DOM or renderer dependencies.  VillageWorld
 * owns the visual targets (lights, sky and emissive materials) and consumes
 * this snapshot, which also makes the clock easy to drive from a debug panel
 * or a save file later.
 */
export type WorldTimePhase = 'night' | 'dawn' | 'day' | 'dusk'

export type WorldTimeSnapshot = {
  /** Current local time in the range [0, 24). */
  hours: number
  /** Solar altitude, where -1 is midnight and 1 is high noon. */
  solarAltitude: number
  /** 0..1 daylight amount used for the scene lighting. */
  daylight: number
  /** 0..1 night amount used for stars, moonlight and emissive accents. */
  night: number
  /** 0..1 twilight amount around sunrise and sunset. */
  twilight: number
  /** A human-readable phase for HUD/debug consumers. */
  phase: WorldTimePhase
  /** Whether the clock is currently stopped. */
  paused: boolean
  /** Game-hours advanced per real second. */
  timeScale: number
  /** Target colors for atmosphere and fog. */
  skyColor: THREE.Color
  fogColor: THREE.Color
  /** Light colors and intensities for the current solar state. */
  sunColor: THREE.Color
  sunIntensity: number
  hemiSkyColor: THREE.Color
  hemiGroundColor: THREE.Color
  hemiIntensity: number
  moonColor: THREE.Color
  moonIntensity: number
  /** Visibility multipliers for astronomical points and the galaxy band. */
  starVisibility: number
  galaxyVisibility: number
  /** Multiplier for windows, flora and other emissive accents. */
  emissiveMultiplier: number
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))
const mixColorTemp = new THREE.Color()

// Smoothstep without allocating intermediate objects on every frame.
const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

const mixColor = (target: THREE.Color, a: THREE.ColorRepresentation, b: THREE.ColorRepresentation, amount: number): THREE.Color => {
  mixColorTemp.set(b)
  target.set(a).lerp(mixColorTemp, clamp01(amount))
  return target
}

/**
 * Simulation clock used by the town's lighting system.
 *
 * A default scale of 0.04 means a complete 24-hour cycle takes ten minutes.
 * Call setTimeScale(0) to freeze it or setWorldTime() to jump to a QA state.
 */
export class WorldTimeController {
  private hoursValue: number
  private timeScaleValue: number
  private pausedValue = false
  private readonly skyColorValue = new THREE.Color()
  private readonly fogColorValue = new THREE.Color()
  private readonly sunColorValue = new THREE.Color()
  private readonly hemiSkyColorValue = new THREE.Color()
  private readonly hemiGroundColorValue = new THREE.Color()
  private readonly moonColorValue = new THREE.Color()

  constructor(initialHours = 11.5, timeScale = 0.04) {
    this.hoursValue = WorldTimeController.normalizeHours(initialHours)
    this.timeScaleValue = Math.max(0, timeScale)
  }

  static normalizeHours(hours: number): number {
    if (!Number.isFinite(hours)) return 0
    const normalized = hours % 24
    return normalized < 0 ? normalized + 24 : normalized
  }

  get hours(): number { return this.hoursValue }
  get timeScale(): number { return this.timeScaleValue }
  get paused(): boolean { return this.pausedValue }

  setHours(hours: number): WorldTimeSnapshot {
    this.hoursValue = WorldTimeController.normalizeHours(hours)
    return this.snapshot()
  }

  advance(hours: number): WorldTimeSnapshot {
    if (Number.isFinite(hours)) this.hoursValue = WorldTimeController.normalizeHours(this.hoursValue + hours)
    return this.snapshot()
  }

  setTimeScale(hoursPerSecond: number): WorldTimeSnapshot {
    this.timeScaleValue = Number.isFinite(hoursPerSecond) ? Math.max(0, hoursPerSecond) : this.timeScaleValue
    return this.snapshot()
  }

  setPaused(paused: boolean): WorldTimeSnapshot {
    this.pausedValue = paused
    return this.snapshot()
  }

  togglePaused(): WorldTimeSnapshot {
    this.pausedValue = !this.pausedValue
    return this.snapshot()
  }

  tick(seconds: number): WorldTimeSnapshot {
    if (!this.pausedValue && Number.isFinite(seconds) && seconds > 0 && this.timeScaleValue > 0) {
      this.hoursValue = WorldTimeController.normalizeHours(this.hoursValue + seconds * this.timeScaleValue)
    }
    return this.snapshot()
  }

  snapshot(): WorldTimeSnapshot {
    // Sunrise is 06:00 and sunset is 18:00. The sine makes noon +1 and
    // midnight -1, which is convenient for moving the visual sun/moon arcs.
    const solarAltitude = Math.sin(((this.hoursValue - 6) / 12) * Math.PI)
    const daylight = smoothstep(-0.08, 0.22, solarAltitude)
    const night = 1 - smoothstep(-0.18, 0.12, solarAltitude)
    const twilight = clamp01(1 - Math.abs(solarAltitude) / 0.30) * (1 - Math.abs(daylight - 0.5) * 1.2)

    // Keep phase labels stable around the horizon.  The solar curve controls
    // actual illumination, while these civil-time windows make 18:30 read as
    // dusk even when the sun has already dipped below the horizon numerically.
    let phase: WorldTimePhase
    if (this.hoursValue >= 5 && this.hoursValue < 8) phase = 'dawn'
    else if (this.hoursValue >= 8 && this.hoursValue < 17) phase = 'day'
    else if (this.hoursValue >= 17 && this.hoursValue < 20) phase = 'dusk'
    else phase = 'night'

    // The night palette is intentionally saturated rather than grey. A deep
    // indigo base, lavender moon fill and small macaron accents keep the
    // terrain readable while still feeling like an alien evening.
    const nightSky = new THREE.Color('#10152f')
    // Keep the day atmosphere readable without washing the terrain in cyan.
    // The deep-space dome still carries the alien palette at the horizon.
    const daySky = new THREE.Color('#8ee9ef')
    const twilightSky = new THREE.Color('#eaaec7')
    const nightFog = new THREE.Color('#343a62')
    // Keep the horizon colorful, but much lighter than the night sky so fog
    // softens distant forms without tinting the playable ground grey-blue.
    const dayFog = new THREE.Color('#ade1c4')
    const twilightFog = new THREE.Color('#c99db7')
    const dayBlend = daylight
    const twilightBlend = smoothstep(0, 1, twilight)
    mixColor(this.skyColorValue, nightSky, daySky, dayBlend)
    this.skyColorValue.lerp(twilightSky, twilightBlend * 0.32)
    mixColor(this.fogColorValue, nightFog, dayFog, dayBlend)
    this.fogColorValue.lerp(twilightFog, twilightBlend * 0.22)

    mixColor(this.sunColorValue, '#aeb8f3', '#fff1bc', daylight)
    mixColor(this.hemiSkyColorValue, '#a8c9ff', '#fff0df', daylight)
    mixColor(this.hemiGroundColorValue, '#6a74a2', '#74c98f', daylight)
    mixColor(this.moonColorValue, '#b6b4ff', '#d6c8ff', night)

    return {
      hours: this.hoursValue,
      solarAltitude,
      daylight,
      night,
      twilight: twilightBlend,
      phase,
      paused: this.pausedValue,
      timeScale: this.timeScaleValue,
      skyColor: this.skyColorValue.clone(),
      fogColor: this.fogColorValue.clone(),
      sunColor: this.sunColorValue.clone(),
      sunIntensity: 0.08 + daylight * 1.82,
      hemiSkyColor: this.hemiSkyColorValue.clone(),
      hemiGroundColor: this.hemiGroundColorValue.clone(),
      // Keep a readable moonlit fill on the ground after sunset.
      hemiIntensity: 1.02 + daylight * 0.58,
      moonColor: this.moonColorValue.clone(),
      moonIntensity: 0.16 + night * 0.62,
      starVisibility: 0.06 + night * 0.94,
      galaxyVisibility: 0.10 + night * 0.90,
      // Keep PBR emissive accents below the bloom threshold by default, then
      // bring them up gradually as the sun goes down. VillageWorld applies a
      // hard ceiling for assets authored with unusually high emission values.
      emissiveMultiplier: 0.16 + night * 0.34 + twilightBlend * 0.05,
    }
  }
}

