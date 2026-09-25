import { describe, expect, it } from 'vitest'
import type { Clip } from '@shared/types'
import { clipInfoCsv, clipInfoMarkdown } from '../src/main/clipMetadata'

const clip = {
  title: 'Почему это работает?',
  hook: 'Смотри до конца',
  summary: 'Короткое объяснение механики.',
  caption: 'Do not use this social caption',
  hashtags: ['продажи', '#маркетинг'],
  viralityScore: 84,
  edit: { aspect: '9:16', start: 754, end: 796 }
} as Clip

describe('clip metadata export', () => {
  it('creates a client-readable Markdown package from detected clip metadata', () => {
    const markdown = clipInfoMarkdown([clip])
    expect(markdown).toContain('## 01_Почему это работает (9x16).mp4')
    expect(markdown).toContain('Description: Короткое объяснение механики.')
    expect(markdown).toContain('Hashtags: #продажи #маркетинг')
    expect(markdown).toContain('Score: 84')
    expect(markdown).toContain('Source: 12:34–13:16')
    expect(markdown).not.toContain('Do not use this social caption')
  })

  it('uses the actual filename after a successful export', () => {
    const exported = { ...clip, export: { status: 'done' as const, outputPath: '/tmp/client-ready.mp4', bytes: 42, exportedAt: 0 } }
    expect(clipInfoMarkdown([exported])).toContain('## 01_client-ready.mp4')
  })

  it('creates CSV with the same detected metadata', () => {
    const csv = clipInfoCsv([clip])
    expect(csv).toContain('rank,filename,title,hook,summary,hashtags,virality_score,start,end')
    expect(csv).toContain('"Короткое объяснение механики."')
    expect(csv).not.toContain('Do not use this social caption')
  })
})
