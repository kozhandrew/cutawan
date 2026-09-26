import type { Clip } from './types'

/** Groups that can safely be copied between clips in the same project. */
export interface ClipSettingsSelection {
  captions: boolean
  hookVisibility: boolean
  hookText: boolean
  composition: boolean
}

/**
 * Copies only presentation choices. Source-time fields (trim, cuts, B-roll,
 * focus track and analysed layout) intentionally remain tied to each clip.
 */
export function applyClipSettings(source: Clip, target: Clip, selection: ClipSettingsSelection): Clip {
  const edit = { ...target.edit }
  if (selection.captions) {
    edit.captionsEnabled = source.edit.captionsEnabled
    edit.captionStyleId = source.edit.captionStyleId
    edit.captionFontFamily = source.edit.captionFontFamily
  }
  if (selection.hookVisibility) edit.showTitle = source.edit.showTitle
  if (selection.composition) {
    edit.aspect = source.edit.aspect
    edit.reframeMode = source.edit.reframeMode
    edit.framing = source.edit.framing
    edit.focusX = source.edit.focusX
    edit.autoZoom = source.edit.autoZoom
    edit.compositionPreference = source.edit.compositionPreference
    edit.speakerSplit = source.edit.speakerSplit
    edit.layoutChosen = true
  }
  return {
    ...target,
    hook: selection.hookText ? source.hook : target.hook,
    edit
  }
}
