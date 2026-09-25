import { describe, expect, it } from 'vitest'
import { customBuildLabel } from '@shared/buildIdentifier'

describe('customBuildLabel', () => {
  it('keeps the identifier compact and explicitly marks the build as custom', () => {
    expect(customBuildLabel('33aee7a94d8c')).toBe('CUSTOM DEV · 33aee7a9')
  })

  it('has a visible fallback outside a git checkout', () => {
    expect(customBuildLabel('')).toBe('CUSTOM DEV · unknown')
  })
})
