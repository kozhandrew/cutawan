import { describe, expect, it } from 'vitest'
import {
  captionPopScale,
  hookEntrance,
  overlayFrameCount,
  overlayFrameTime
} from '@shared/overlayTiming'

describe('deterministic overlay timing', () => {
  it('derives caption pop scale only from media time', () => {
    expect(captionPopScale(2, 2)).toBeCloseTo(0.94)
    expect(captionPopScale(2.045, 2)).toBeGreaterThan(0.94)
    expect(captionPopScale(2.045, 2)).toBeCloseTo(0.98108, 4)
    expect(captionPopScale(2.09, 2)).toBe(1)
    expect(captionPopScale(20, 2)).toBe(1)
  })

  it('derives hook opacity and offset only from clip-relative media time', () => {
    expect(hookEntrance(10, 10)).toEqual({ opacity: 0, translateCqh: 0.8 })
    expect(hookEntrance(10.22, 10)).toEqual({ opacity: 1, translateCqh: 0 })
  })

  it('uses exact frame timestamps without a realtime clock', () => {
    expect(overlayFrameCount(1, 30)).toBe(30)
    expect(overlayFrameCount(1.001, 30)).toBe(31)
    expect(overlayFrameTime(0, 30)).toBe(0)
    expect(overlayFrameTime(29, 30)).toBeCloseTo(29 / 30)
  })
})
