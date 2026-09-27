import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Project } from '@shared/types'
import { activateClipGeneration, appendClipGeneration } from '@shared/clipGenerations'

const mock = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { getPath: () => mock.root } }))
import { loadProject, projectDir, saveProject, updateProject } from '../src/main/projects'
import { ensureTranscript } from '../src/main/pipeline/projectTranscript'

beforeAll(async () => { mock.root = await mkdtemp(join(tmpdir(), 'cutawan-project-persistence-')) })
afterAll(async () => { if (mock.root) await rm(mock.root, { recursive: true, force: true }) })

it('lets background readers see complete project JSON while edits are saved', async () => {
  const project: Project = {
    id: 'atomic-read-test', createdAt: 0, updatedAt: 0, name: 'Atomic read test',
    video: { path: join(mock.root, 'missing.mp4'), fileName: 'missing.mp4', durationSec: 5,
      width: 640, height: 360, fps: 25, sizeBytes: 0, hasAudio: true },
    transcript: null, clips: [], prompt: 'initial', videoType: 'auto'
  }
  await saveProject(project)
  const writer = async (): Promise<void> => {
    for (let i = 0; i < 40; i++) {
      await updateProject(project.id, fresh => { fresh.prompt = `${i}:${'x'.repeat(100_000)}` })
    }
  }
  const reader = async (): Promise<void> => {
    for (let i = 0; i < 120; i++) {
      const read = await loadProject(project.id)
      expect(read.prompt === 'initial' || /^\d+:x{100000}$/.test(read.prompt)).toBe(true)
    }
  }
  await Promise.all([writer(), reader(), reader()])
  expect((await loadProject(project.id)).prompt).toMatch(/^39:/)
  expect((await readdir(projectDir(project.id))).filter(name => name.endsWith('.tmp'))).toEqual([])
})

it('checkpoints an explicit empty transcript for visual discovery without invoking speech extraction', async () => {
  const project: Project = {
    id: 'silent-visual-input', createdAt: 0, updatedAt: 0, name: 'Silent input',
    video: { path: join(mock.root, 'silent.mp4'), fileName: 'silent.mp4', durationSec: 20,
      width: 640, height: 360, fps: 25, sizeBytes: 0, hasAudio: false },
    transcript: null, clips: [], prompt: '', videoType: 'auto'
  }
  await saveProject(project)
  const transcript = await ensureTranscript(project, mock.root, {
    apiKey: '', model: '', language: 'auto', span: { from: 0, to: .5 }, noSpeechError: 'No speech', allowNoSpeech: true
  }, () => {})
  expect(transcript).toMatchObject({ durationSec: 20, segments: [], speech: [] })
  expect((await loadProject(project.id)).transcript).toEqual(transcript)
})

it('migrates a legacy clip list to a saved first generation without losing its export path', async () => {
  const project: Project = {
    id: 'legacy-generation', createdAt: 1, updatedAt: 2, name: 'Legacy clips',
    video: { path: join(mock.root, 'legacy.mp4'), fileName: 'legacy.mp4', durationSec: 20,
      width: 640, height: 360, fps: 25, sizeBytes: 0, hasAudio: true },
    transcript: null, prompt: 'Original instructions', videoType: 'podcast',
    clips: [{
      id: 'legacy-clip', title: 'Clip', hook: '', summary: '', hashtags: [], viralityScore: 80, viralityReason: '',
      visualSummary: null, thumbnailPath: null, focusTrack: null, broll: [], suggestedStart: 0, suggestedEnd: 10,
      export: { status: 'done', outputPath: '/outside/keep.mp4', bytes: 10, exportedAt: 2 },
      edit: { start: 0, end: 10, aspect: '9:16', captionsEnabled: true }
    }]
  } as unknown as Project
  await mkdir(projectDir(project.id), { recursive: true })
  await writeFile(join(projectDir(project.id), 'project.json'), JSON.stringify(project), 'utf8')

  const loaded = await loadProject(project.id)
  expect(loaded.clipGenerations).toHaveLength(1)
  expect(loaded.clipGenerations?.[0].clips[0].export?.outputPath).toBe('/outside/keep.mp4')

  await updateProject(project.id, () => {})
  const persisted = await loadProject(project.id)
  expect(persisted.activeClipGenerationId).toBe(persisted.clipGenerations?.[0].id)
  expect(persisted.clipGenerations?.[0].clips[0].export?.outputPath).toBe('/outside/keep.mp4')

  const edited = await updateProject(project.id, current => {
    current.clips[0].hook = 'Updated hook'
    current.clips[0].edit.captionStyleId = 'beast'
    current.clips[0].edit.showTitle = true
    current.clips[0].edit.reframeMode = 'fit-letterbox'
    current.clips[0].edit.tightenCuts = true
  })
  expect(edited.clips[0].hook).toBe('Updated hook')
  expect(edited.clips[0].edit).toMatchObject({
    captionStyleId: 'beast', showTitle: true, reframeMode: 'fit-letterbox', tightenCuts: true
  })
  const reopened = await loadProject(project.id)
  expect(reopened.clips[0].edit.captionStyleId).toBe('beast')
  expect(reopened.clipGenerations?.[0].clips[0].edit.captionStyleId).toBe('beast')
})

it('persists edits in a new generation and restores each version after switching', async () => {
  const project: Project = {
    id: 'generation-edit-test', createdAt: 1, updatedAt: 1, name: 'Generated clips',
    video: { path: join(mock.root, 'generated.mp4'), fileName: 'generated.mp4', durationSec: 20,
      width: 640, height: 360, fps: 25, sizeBytes: 0, hasAudio: true },
    transcript: null, prompt: 'First prompt', videoType: 'podcast',
    clips: [{
      id: 'first-clip', title: 'First', hook: '', summary: '', hashtags: [], viralityScore: 80, viralityReason: '',
      visualSummary: null, thumbnailPath: null, focusTrack: null, broll: [], suggestedStart: 0, suggestedEnd: 10,
      edit: { start: 0, end: 10, aspect: '9:16', captionsEnabled: true, captionStyleId: 'default' }
    }]
  } as unknown as Project
  await saveProject(project)
  const firstId = (await loadProject(project.id)).activeClipGenerationId!

  await updateProject(project.id, current => {
    appendClipGeneration(current, {
      id: 'second-generation', createdAt: 2,
      options: { prompt: 'Second prompt', clipLength: 'short', broll: false, hookFirst: false, videoType: 'podcast' },
      clips: [{ ...structuredClone(current.clips[0]), id: 'second-clip' }]
    })
  })
  await updateProject(project.id, current => {
    current.clips[0].edit.captionStyleId = 'beast'
    current.clips[0].edit.showTitle = true
  })

  const edited = await loadProject(project.id)
  expect(edited.clips[0].edit).toMatchObject({ captionStyleId: 'beast', showTitle: true })
  expect(edited.clipGenerations?.[1].clips[0].edit.captionStyleId).toBe('beast')

  await updateProject(project.id, current => { activateClipGeneration(current, firstId) })
  expect((await loadProject(project.id)).clips[0].edit.captionStyleId).toBe('default')
  await updateProject(project.id, current => { activateClipGeneration(current, 'second-generation') })
  expect((await loadProject(project.id)).clips[0].edit.captionStyleId).toBe('beast')
})
