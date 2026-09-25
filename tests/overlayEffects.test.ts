import { describe, expect, it } from 'vitest'
import { captionTextShadow } from '@shared/overlayEffects'

describe('captionTextShadow', () => {
  it('scales the legacy 640px-preview shadow geometry with the overlay height', () => {
    expect(captionTextShadow({ outlineWidth: 3.2, outlineColor: '#000000' })).toBe(
      '0 0 1cqh #000000, 0.3125cqh 0.3125cqh 0.5cqh #000000, -0.3125cqh 0.3125cqh 0.5cqh #000000, 0.3125cqh -0.3125cqh 0.5cqh #000000, -0.3125cqh -0.3125cqh 0.5cqh #000000'
    )
  })

  it('keeps styles without an outline shadow-free', () => {
    expect(captionTextShadow({ outlineWidth: 0, outlineColor: '#000000' })).toBe('none')
  })
})
