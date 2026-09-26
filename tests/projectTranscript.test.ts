import { describe, expect, it, vi } from 'vitest'
import type { Project } from '@shared/types'

const mocks = vi.hoisted(() => ({ extractAudioChunks: vi.fn(), transcribeChunks: vi.fn() }))
vi.mock('../src/main/pipeline/ffmpeg', () => ({ extractAudioChunks: mocks.extractAudioChunks }))
vi.mock('../src/main/pipeline/transcribe', () => ({ transcribeChunks: mocks.transcribeChunks }))
vi.mock('../src/main/pipeline/energy', () => ({ annotateEnergy: vi.fn() }))
vi.mock('../src/main/pipeline/vad', () => ({ vadAvailable: () => false }))
import { ensureTranscript } from '../src/main/pipeline/projectTranscript'

describe('no-audio input', () => {
  it('reports an actionable outcome before invoking FFmpeg or a speech service', async () => {
    const progress = vi.fn()
    const project = { transcript: null, video: { hasAudio: false, path: 'does-not-exist.webm' } } as Project
    await expect(ensureTranscript(project, 'does-not-exist', {
      apiKey: 'unused', model: 'unused', language: 'en', span: { from: 0, to: 1 }, noSpeechError: 'No speech'
    }, progress)).rejects.toThrow('This video has no audio track')
    expect(progress).not.toHaveBeenCalled()
  })
  it('reuses a saved transcript without extracting audio or calling Whisper again', async () => {
    const transcript = { language: 'ru', durationSec: 20, segments: [{ id: 1, text: 'Привет', start: 0, end: 1, words: [] }], speech: [] }
    const project = { id: 'saved-transcript', transcript, video: { hasAudio: true, path: 'source.mp4' } } as unknown as Project

    await expect(ensureTranscript(project, 'unused', {
      apiKey: 'unused', model: 'unused', language: 'ru', span: { from: 0, to: 1 }, noSpeechError: 'No speech'
    }, () => {})).resolves.toBe(transcript)

    expect(mocks.extractAudioChunks).not.toHaveBeenCalled()
    expect(mocks.transcribeChunks).not.toHaveBeenCalled()
  })
  it('does not let a saved empty visual-only transcript bypass caption-mode speech requirements', async () => {
    const project = { transcript: { language: 'en', durationSec: 20, segments: [] }, video: { hasAudio: false } } as unknown as Project
    await expect(ensureTranscript(project, 'unused', {
      apiKey: '', model: '', language: 'en', span: { from: 0, to: 1 }, noSpeechError: 'No speech to caption'
    }, () => {})).rejects.toThrow('No speech to caption')
  })
})
