import { useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import type { Clip } from '@shared/types'
import type { ClipSettingsSelection } from '@shared/clipSettings'

const DEFAULT_SELECTION: ClipSettingsSelection = {
  captions: true,
  hookVisibility: true,
  hookText: false,
  composition: false
}

const OPTIONS: Array<{ key: keyof ClipSettingsSelection; label: string; hint: string }> = [
  { key: 'captions', label: 'Captions style', hint: 'On/off, preset and selected font' },
  { key: 'hookVisibility', label: 'Hook visibility', hint: 'Show or hide the title at the start' },
  { key: 'hookText', label: 'Hook text', hint: 'Copy this exact hook to every clip' },
  { key: 'composition', label: 'Composition', hint: 'Aspect, crop mode and auto zoom; tracked points stay per clip' }
]

export default function ApplyClipSettingsDialog({
  sourceClip,
  targetCount,
  onClose,
  onApply
}: {
  sourceClip: Clip
  targetCount: number
  onClose: () => void
  onApply: (selection: ClipSettingsSelection) => Promise<void>
}): React.JSX.Element {
  const [selection, setSelection] = useState(DEFAULT_SELECTION)
  const [applying, setApplying] = useState(false)
  const selectedCount = Object.values(selection).filter(Boolean).length

  const apply = async (): Promise<void> => {
    if (selectedCount === 0) return
    setApplying(true)
    try {
      await onApply(selection)
      onClose()
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="apply-clip-settings-title"
        className="w-full max-w-md rounded-2xl border border-white/10 bg-surface-900 p-5 shadow-2xl shadow-black/60"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="apply-clip-settings-title" className="flex items-center gap-2 text-base font-semibold">
              <Copy size={16} className="text-accent-400" /> Apply to other clips
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Use the presentation choices from “{sourceClip.title}” on {targetCount} other clips.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-surface-800 hover:text-zinc-200">
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setSelection((current) => ({ ...current, [option.key]: !current[option.key] }))}
              className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${
                selection[option.key]
                  ? 'border-white/30 bg-white/[0.07]'
                  : 'border-surface-600 hover:bg-surface-800'
              }`}
            >
              <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                selection[option.key] ? 'border-zinc-100 bg-zinc-100 text-zinc-900' : 'border-surface-600'
              }`}>
                {selection[option.key] && <Check size={12} />}
              </span>
              <span>
                <span className="block text-xs font-medium text-zinc-200">{option.label}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-500">{option.hint}</span>
              </span>
            </button>
          ))}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
          Clip timing, cuts, B-roll and face tracking are never copied. Existing exports for changed clips become ready to re-export.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} disabled={applying} className="rounded-lg px-3 py-2 text-xs font-medium text-zinc-400 transition hover:bg-surface-800 hover:text-zinc-200">
            Cancel
          </button>
          <button
            onClick={() => void apply()}
            disabled={applying || selectedCount === 0 || targetCount === 0}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-900 transition hover:bg-white disabled:opacity-50"
          >
            <Copy size={13} /> {applying ? 'Applying…' : `Apply to ${targetCount} clips`}
          </button>
        </div>
      </div>
    </div>
  )
}
