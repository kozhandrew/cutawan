import { Loader2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useStore } from '../store'

function generationLabel(index: number, createdAt: number, clipCount: number, prompt: string): string {
  const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(createdAt)
  const summary = prompt.trim().replace(/\s+/g, ' ')
  const shortPrompt = summary ? ` · ${summary.slice(0, 42)}${summary.length > 42 ? '…' : ''}` : ''
  return `Generation ${index + 1} · ${date} · ${clipCount} clip${clipCount === 1 ? '' : 's'}${shortPrompt}`
}

/** Compact shared selector for the active AI clip-finding result. */
export default function ClipGenerationSelector(): React.JSX.Element | null {
  const project = useStore((state) => state.project)
  const activate = useStore((state) => state.activateClipGeneration)
  const remove = useStore((state) => state.deleteClipGeneration)
  const [busy, setBusy] = useState(false)
  const generations = project?.clipGenerations ?? []

  if (!project || generations.length === 0) return null

  const activeId = project.activeClipGenerationId ?? generations[generations.length - 1].id
  const activeIndex = generations.findIndex((generation) => generation.id === activeId)
  const active = generations[activeIndex < 0 ? generations.length - 1 : activeIndex]

  return (
    <div className="flex min-w-0 items-center gap-2">
      <select
        aria-label="Clip generation"
        value={active.id}
        disabled={busy}
        title={active.options.prompt || 'No custom AI instructions'}
        onChange={(event) => {
          setBusy(true)
          void activate(event.target.value).finally(() => setBusy(false))
        }}
        className="min-w-0 max-w-72 rounded-lg border border-surface-600 bg-surface-850 px-2.5 py-2 text-xs text-zinc-300 outline-none transition focus:border-white/30 disabled:opacity-60"
      >
        {generations.map((generation, index) => (
          <option key={generation.id} value={generation.id}>
            {generationLabel(index, generation.createdAt, generation.clips.length, generation.options.prompt)}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy || generations.length <= 1}
        title={generations.length <= 1 ? 'Keep at least one clip generation' : 'Delete this generation. Exported MP4 files stay on disk.'}
        onClick={() => {
          if (!window.confirm('Delete this saved clip generation? Its clips and project-owned thumbnails/B-roll may be removed. Exported MP4 files will stay on disk.')) return
          setBusy(true)
          void remove(active.id).finally(() => setBusy(false))
        }}
        className="rounded-lg border border-surface-600 p-2 text-zinc-400 transition hover:border-red-400/50 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-35"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
      </button>
    </div>
  )
}
