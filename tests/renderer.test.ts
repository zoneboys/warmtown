import { describe, expect, it } from 'vitest'
import { QUALITY_PRESETS } from '../src/engine/renderer'

describe('renderer quality tiers', () => {
  it('keeps expensive image-space effects exclusive to high quality', () => {
    expect(QUALITY_PRESETS.low.ambientOcclusion).toBe(false)
    expect(QUALITY_PRESETS.medium.ambientOcclusion).toBe(false)
    expect(QUALITY_PRESETS.high.ambientOcclusion).toBe(true)
    expect(QUALITY_PRESETS.high.depthOfField).toBe(true)
  })

  it('uses soft shadows only where the shadow budget can support them', () => {
    expect(QUALITY_PRESETS.low.shadows).toBe(false)
    expect(QUALITY_PRESETS.medium.shadowMap).toBe(1024)
    expect(QUALITY_PRESETS.high.shadowMap).toBeGreaterThan(QUALITY_PRESETS.medium.shadowMap)
  })
})
