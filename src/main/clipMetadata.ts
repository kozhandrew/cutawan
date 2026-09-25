import type { Clip } from '@shared/types'
import { basename } from 'node:path'
import { sanitizeFileName } from './exportPath'

function plannedFileName(clip: Clip): string {
  if (clip.export?.outputPath) return basename(clip.export.outputPath)
  const suffix = clip.edit.aspect === 'original' ? '' : ` (${clip.edit.aspect.replace(':', 'x')})`
  return `${sanitizeFileName(clip.title)}${suffix}.mp4`
}

function timestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const padded = (value: number): string => String(value).padStart(2, '0')
  return hours > 0 ? `${padded(hours)}:${padded(minutes)}:${padded(secs)}` : `${padded(minutes)}:${padded(secs)}`
}

function hashtags(clip: Clip): string {
  return clip.hashtags.map((tag) => tag.startsWith('#') ? tag : `#${tag}`).join(' ')
}

function csv(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`
}

export function clipInfoMarkdown(clips: Clip[]): string {
  const sections = clips.map((clip, index) => [
    `## ${String(index + 1).padStart(2, '0')}_${plannedFileName(clip)}`,
    `Title: ${clip.title}`,
    `Hook: ${clip.hook}`,
    `Description: ${clip.summary}`,
    `Hashtags: ${hashtags(clip)}`,
    `Score: ${clip.viralityScore}`,
    `Source: ${timestamp(clip.edit.start)}–${timestamp(clip.edit.end)}`
  ].join('\n'))
  return `# Cutawan clip info\n\n${sections.join('\n\n')}\n`
}

export function clipInfoCsv(clips: Clip[]): string {
  const header = 'rank,filename,title,hook,summary,hashtags,virality_score,start,end'
  const rows = clips.map((clip, index) => [
    index + 1, plannedFileName(clip), clip.title, clip.hook, clip.summary, hashtags(clip),
    clip.viralityScore, timestamp(clip.edit.start), timestamp(clip.edit.end)
  ].map(csv).join(','))
  return `${header}\n${rows.join('\n')}\n`
}
