import { useMemo } from 'react'
import type { BrandingSettings, Clip, Project, WatermarkPosition } from '@shared/types'
import { hexToRgba, resolveCaptionStyle } from '@shared/captionStyles'
import { captionLayoutBudget, groupDisplayEnd, groupWords, wordsInRange } from '@shared/captionLayout'
import { compositionHidesTitle, detailCaptionRanges } from '@shared/contentType'
import { captionPositionAt } from '@shared/contentRegion'
import { captionPopScale, hookEntrance } from '@shared/overlayTiming'

export interface ExportOverlayProps {
  clip: Clip
  transcript: Project['transcript']
  branding?: BrandingSettings | null
  mediaTime: number
  aspectRatio: number
  mediaUrl: (path: string) => string
}

/** Canonical visual overlay shared by the editor preview and Chromium export. */
export function ExportOverlay({ clip, transcript, branding, mediaTime, aspectRatio, mediaUrl }: ExportOverlayProps): React.JSX.Element {
  const duration = Math.max(0.1, clip.edit.end - clip.edit.start)
  const showHook = clip.edit.showTitle && !compositionHidesTitle(clip) && Boolean(clip.hook || clip.title) &&
    mediaTime - clip.edit.start < Math.min(4, duration)
  return <>
    <BrollOverlay clip={clip} time={mediaTime} mediaUrl={mediaUrl} />
    <WatermarkOverlay branding={branding} mediaUrl={mediaUrl} />
    {clip.edit.captionsEnabled && transcript && <CaptionOverlay transcript={transcript} clip={clip} time={mediaTime}
      aspectRatio={aspectRatio} brandColors={branding?.colors} />}
    {showHook && <HookOverlay clip={clip} time={mediaTime} branding={branding} />}
  </>
}

export function WatermarkOverlay({ branding, mediaUrl }: Pick<ExportOverlayProps, 'branding' | 'mediaUrl'>): React.JSX.Element | null {
  if (!branding?.enabled || !branding.imagePath) return null
  const margin = '3cqw'
  const corner: Record<WatermarkPosition, React.CSSProperties> = {
    'top-left': { top: margin, left: margin }, 'top-right': { top: margin, right: margin },
    'bottom-left': { bottom: margin, left: margin }, 'bottom-right': { bottom: margin, right: margin }
  }
  return <img src={mediaUrl(branding.imagePath)} alt="" className="pointer-events-none absolute" style={{
    width: `${Math.min(0.5, Math.max(0.04, branding.scale)) * 100}cqw`,
    opacity: Math.min(1, Math.max(0.05, branding.opacity)), ...corner[branding.position]
  }} />
}

export function HookOverlay({ clip, time, branding }: Pick<ExportOverlayProps, 'clip' | 'branding'> & { time: number }): React.JSX.Element {
  const style = resolveCaptionStyle(clip.edit.captionStyleId, branding?.colors, clip.edit.captionFontFamily)
  const animation = hookEntrance(time, clip.edit.start)
  const hookTextColor = branding?.colors.enabled ? branding.colors.hookTextColor : '#FFFFFF'
  const hookBackgroundColor = branding?.colors.enabled ? hexToRgba(branding.colors.hookBackgroundColor, 0.75) : 'rgba(0,0,0,0.75)'
  return <div className="pointer-events-none absolute inset-x-0 flex justify-center px-[6cqw]" style={{ top: '7cqh' }}>
    <span className="inline-block max-w-[80cqw] text-center" style={{
      fontFamily: `'${style.fontFamily}', sans-serif`, fontWeight: 700, fontSize: '4.4cqh', lineHeight: 1.2,
      color: hookTextColor, padding: '0.7cqh 1.4cqh', borderRadius: '0.8cqh', backgroundColor: hookBackgroundColor,
      boxShadow: '0 0.4cqh 1.4cqh rgba(0,0,0,0.45)', textWrap: 'balance', opacity: animation.opacity,
      transform: `translateY(${animation.translateCqh}cqh)`
    }}>{clip.hook || clip.title}</span>
  </div>
}

export function BrollOverlay({ clip, time, mediaUrl }: Pick<ExportOverlayProps, 'clip' | 'mediaUrl'> & { time: number }): React.JSX.Element | null {
  const active = clip.broll.find((item) => item.enabled && item.imagePath && time >= item.start && time <= item.end)
  if (!active?.imagePath) return null
  const src = mediaUrl(active.imagePath)
  if (active.mode === 'fullscreen') return <img src={src} alt={active.trigger}
    className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
  return <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ top: '10cqh' }}>
    <img src={src} alt={active.trigger} className="border-4 border-white shadow-2xl" style={{ width: '62%', height: 'auto' }} />
  </div>
}

export function CaptionOverlay({ transcript, clip, time, aspectRatio, brandColors }: {
  transcript: NonNullable<Project['transcript']>; clip: Clip; time: number; aspectRatio: number;
  brandColors?: BrandingSettings['colors']
}): React.JSX.Element | null {
  const style = useMemo(() => resolveCaptionStyle(clip.edit.captionStyleId, brandColors, clip.edit.captionFontFamily),
    [clip.edit.captionStyleId, brandColors, clip.edit.captionFontFamily])
  const groups = useMemo(() => groupWords(wordsInRange(transcript, clip.edit.start, clip.edit.end), captionLayoutBudget(style, aspectRatio)),
    [transcript, clip.edit.start, clip.edit.end, style, aspectRatio])
  const groupIndex = groups.findIndex((group, index) => time >= group.start && time < groupDisplayEnd(groups, index, clip.edit.end))
  if (groupIndex === -1) return null
  const group = groups[groupIndex]
  let activeIndex = -1
  for (let i = 0; i < group.words.length; i++) if (time >= group.words[i].start) activeIndex = i
  let index = 0
  return <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center text-center" style={{
    top: `${captionPositionAt(detailCaptionRanges(clip), time, style.positionY) * 100}cqh`, transform: 'translateY(-50%)'
  }}>
    {group.lines.map((line, lineIndex) => <div key={lineIndex} className="whitespace-nowrap" style={{
      fontFamily: `'${style.fontFamily}', sans-serif`, fontSize: `${style.fontScale * 100}cqh`,
      fontWeight: style.bold ? 700 : 400, lineHeight: 1.25,
      textShadow: style.outlineWidth > 0
        ? `0 0 ${style.outlineWidth * 2}px ${style.outlineColor}, 2px 2px ${style.outlineWidth}px ${style.outlineColor}, -2px 2px ${style.outlineWidth}px ${style.outlineColor}, 2px -2px ${style.outlineWidth}px ${style.outlineColor}, -2px -2px ${style.outlineWidth}px ${style.outlineColor}`
        : 'none'
    }}>
      {line.map((word, wordInLine) => {
        const wordIndex = index++
        const active = wordIndex === activeIndex
        return <span key={`${word.start}-${wordIndex}`} className="inline-block" style={{
          color: active ? style.highlightColor : style.textColor,
          backgroundColor: active && style.highlightBoxColor ? style.highlightBoxColor : 'transparent',
          borderRadius: style.highlightBoxColor ? '0.35em' : undefined,
          padding: style.highlightBoxColor ? '0 0.18em' : undefined,
          marginRight: wordInLine === line.length - 1 ? undefined : '0.28em',
          transform: active ? `scale(${captionPopScale(time, word.start)})` : undefined
        }}>{style.uppercase ? word.text.toUpperCase() : word.text}</span>
      })}
    </div>)}
  </div>
}
