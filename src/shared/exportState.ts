import type { Clip } from './types'

function renderState(clip: Clip): string {
  return JSON.stringify({
    title: clip.title,
    hook: clip.hook,
    broll: clip.broll,
    focusTrack: clip.focusTrack,
    visualLayout: clip.visualLayout,
    edit: clip.edit
  })
}

/** Preserve the old MP4 reference but require a new render after visual edits. */
export function invalidateExportForClipSave(next: Clip, previous: Clip): Clip {
  if (previous.export?.status !== 'done' || renderState(next) === renderState(previous)) return next
  return { ...next, export: { ...previous.export, status: 'stale' } }
}

export function staleExportForTranscriptChange(clip: Clip): Clip {
  return clip.export?.status === 'done'
    ? { ...clip, export: { ...clip.export, status: 'stale' } }
    : clip
}
