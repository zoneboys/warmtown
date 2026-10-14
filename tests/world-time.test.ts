import { describe, expect, it } from 'vitest'
import { WorldTimeController } from '../src/game/world-time'

describe('world time lighting palette', () => {
  it('keeps midnight indigo and readable under soft colored moonlight', () => {
    const night = new WorldTimeController(0).snapshot()

    expect(night.phase).toBe('night')
    expect(night.skyColor.getHexString()).toBe('10152f')
    expect(night.fogColor.getHexString()).toBe('343a62')
    expect(night.hemiIntensity).toBeGreaterThan(1)
    expect(night.moonIntensity).toBeGreaterThan(0.7)
    expect(night.emissiveMultiplier).toBeLessThan(0.9)
  })

  it('fades the night palette and stars toward daytime', () => {
    const controller = new WorldTimeController(0)
    const night = controller.snapshot()
    const day = controller.setHours(12)

    expect(day.phase).toBe('day')
    expect(day.starVisibility).toBeLessThan(night.starVisibility)
    expect(day.galaxyVisibility).toBeLessThan(night.galaxyVisibility)
    expect(day.sunIntensity).toBeGreaterThan(night.sunIntensity)
    expect(day.skyColor.getHexString()).not.toBe(night.skyColor.getHexString())
    expect(day.skyColor.getHexString()).toBe('8ee9ef')
    expect(day.fogColor.getHexString()).toBe('ade1c4')
  })
})
