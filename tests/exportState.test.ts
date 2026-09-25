import { describe, expect, it } from 'vitest'
import type { Clip } from '@shared/types'
import { invalidateExportForClipSave } from '@shared/exportState'

const done = {
  id: 'clip', title: 'Title', hook: 'Hook', summary: 'Summary', caption: 'Social post', hashtags: [],
  broll: [], focusTrack: null, visualLayout: undefined,
  edit: { aspect: '9:16', start: 0, end: 10, captionsEnabled: true },
  export: { status: 'done', outputPath: '/exports/title.mp4', bytes: 100, exportedAt: 1 }
} as unknown as Clip

describe('invalidateExportForClipSave', () => {
  it('marks a completed export stale after a render-affecting edit', () => {
    const changed = { ...done, hook: 'New hook' }
    expect(invalidateExportForClipSave(changed, done).export?.status).toBe('stale')
  })

  it('does not invalidate a video for a separately generated social caption', () => {
    const changed = { ...done, caption: 'Different post copy' }
    expect(invalidateExportForClipSave(changed, done).export?.status).toBe('done')
  })
})
