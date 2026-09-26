import { describe, expect, it } from 'vitest'
import type { AnalyzeOptions, Clip, Project } from '@shared/types'
import {
  activateClipGeneration,
  appendClipGeneration,
  deleteClipGeneration,
  ensureClipGenerationHistory
} from '@shared/clipGenerations'

const firstOptions: AnalyzeOptions = {
  prompt: 'Find pricing moments', clipLength: 'short', broll: true, hookFirst: true,
  videoType: 'podcast', visualDiscovery: true, editorialRanking: true
}

const secondOptions: AnalyzeOptions = {
  prompt: 'Find contrarian takes', clipLength: 'medium', broll: false, hookFirst: false,
  videoType: 'talking-head', visualDiscovery: false, editorialRanking: false
}

function clip(id: string, title: string): Clip {
  return {
    id, title, hook: '', summary: '', hashtags: [], viralityScore: 80, viralityReason: '',
    visualSummary: null, thumbnailPath: null, broll: [], focusTrack: null,
    suggestedStart: 0, suggestedEnd: 30,
    edit: { start: 0, end: 30, aspect: '9:16', captionsEnabled: true }
  } as unknown as Clip
}

function project(): Project {
  return {
    id: 'project-1', createdAt: 1, updatedAt: 1, name: 'Podcast',
    video: { path: '/source.mp4', fileName: 'source.mp4', durationSec: 120, width: 1920, height: 1080, fps: 30, sizeBytes: 1, hasAudio: true },
    transcript: null, clips: [
      { ...clip('first', 'First clip'), export: { status: 'done', outputPath: '/exports/first.mp4', bytes: 42, exportedAt: 1 } }
    ],
    prompt: firstOptions.prompt, videoType: firstOptions.videoType,
    visualDiscovery: true, rankingEnabled: true
  }
}

describe('clip generation history', () => {
  it('migrates an existing project into its first active generation without losing exports', () => {
    const value = project()

    ensureClipGenerationHistory(value, firstOptions)

    expect(value.clipGenerations).toHaveLength(1)
    expect(value.activeClipGenerationId).toBe(value.clipGenerations![0].id)
    expect(value.clipGenerations![0].clips[0].export?.outputPath).toBe('/exports/first.mp4')
  })

  it('keeps prior edits and exports when a successful regeneration becomes active', () => {
    const value = project()
    ensureClipGenerationHistory(value, firstOptions)

    appendClipGeneration(value, {
      id: 'generation-2', createdAt: 2, options: secondOptions, clips: [clip('second', 'Second clip')]
    })

    expect(value.clips.map(item => item.id)).toEqual(['second'])
    expect(value.prompt).toBe(secondOptions.prompt)
    expect(value.clipGenerations![0].clips[0].export?.outputPath).toBe('/exports/first.mp4')
  })

  it('activates an older generation with its clips and saved setup options', () => {
    const value = project()
    ensureClipGenerationHistory(value, firstOptions)
    appendClipGeneration(value, {
      id: 'generation-2', createdAt: 2, options: secondOptions, clips: [clip('second', 'Second clip')]
    })

    activateClipGeneration(value, value.clipGenerations![0].id)

    expect(value.clips.map(item => item.id)).toEqual(['first'])
    expect(value.prompt).toBe(firstOptions.prompt)
    expect(value.videoType).toBe('podcast')
    expect(value.visualDiscovery).toBe(true)
    expect(value.rankingEnabled).toBe(true)
  })

  it('keeps a captioned whole-video edit outside clip generation history', () => {
    const value = project()
    const wholeVideo = { ...clip('whole', 'Full video'), origin: 'whole-video' as const }
    value.clips = [wholeVideo, ...value.clips]
    ensureClipGenerationHistory(value, firstOptions)

    appendClipGeneration(value, {
      id: 'generation-2', createdAt: 2, options: secondOptions, clips: [clip('second', 'Second clip')]
    })

    expect(value.clips.map(item => item.id)).toEqual(['whole', 'second'])
    expect(value.clipGenerations![0].clips.map(item => item.id)).toEqual(['first'])
  })

  it('removes only the selected generation and never mutates its exported file', () => {
    const value = project()
    ensureClipGenerationHistory(value, firstOptions)
    appendClipGeneration(value, {
      id: 'generation-2', createdAt: 2, options: secondOptions, clips: [clip('second', 'Second clip')]
    })

    const removed = deleteClipGeneration(value, value.clipGenerations![0].id)

    expect(removed.clips[0].export?.outputPath).toBe('/exports/first.mp4')
    expect(value.clipGenerations).toHaveLength(1)
    expect(value.clips.map(item => item.id)).toEqual(['second'])
  })
})
