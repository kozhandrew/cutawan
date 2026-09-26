import { describe, expect, it } from 'vitest'
import { applyClipSettings, type ClipSettingsSelection } from '@shared/clipSettings'
import type { Clip } from '@shared/types'

const selection: ClipSettingsSelection = {
  captions: true,
  hookVisibility: true,
  hookText: true,
  composition: true
}

const source = {
  id: 'source', hook: 'Use this hook', broll: [{ id: 'source-broll' }], focusTrack: [{ t: 1, x: 0.2 }],
  visualLayout: { start: 0, end: 8 },
  edit: {
    captionsEnabled: true, captionStyleId: 'beast', captionFontFamily: 'Montserrat', showTitle: true,
    aspect: '9:16', reframeMode: 'crop', framing: 'manual', focusX: 0.2, autoZoom: true,
    compositionPreference: 'content-first', speakerSplit: false, start: 0, end: 8, cuts: [{ start: 2, end: 3 }]
  }
} as unknown as Clip

const target = {
  id: 'target', hook: 'Keep this hook', broll: [{ id: 'target-broll' }], focusTrack: [{ t: 20, x: 0.8 }],
  visualLayout: { start: 20, end: 30 },
  edit: {
    captionsEnabled: false, captionStyleId: 'clean', captionFontFamily: null, showTitle: false,
    aspect: '1:1', reframeMode: 'fit-letterbox', framing: 'auto', focusX: 0.8, autoZoom: false,
    start: 20, end: 30, cuts: [{ start: 22, end: 23 }]
  }
} as unknown as Clip

describe('applyClipSettings', () => {
  it('copies selected presentation settings without overwriting source-timed data', () => {
    const applied = applyClipSettings(source, target, selection)
    expect(applied.hook).toBe('Use this hook')
    expect(applied.edit).toMatchObject({ captionStyleId: 'beast', aspect: '9:16', layoutChosen: true })
    expect(applied.edit.start).toBe(20)
    expect(applied.edit.cuts).toEqual([{ start: 22, end: 23 }])
    expect(applied.broll).toEqual([{ id: 'target-broll' }])
    expect(applied.focusTrack).toEqual([{ t: 20, x: 0.8 }])
    expect(applied.visualLayout).toEqual({ start: 20, end: 30 })
  })

  it('leaves a generated hook untouched unless hook text is selected', () => {
    const applied = applyClipSettings(source, target, { ...selection, hookText: false })
    expect(applied.hook).toBe('Keep this hook')
  })
})
