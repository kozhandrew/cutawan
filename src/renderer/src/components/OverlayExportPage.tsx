import { useLayoutEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { resolveCaptionStyle } from '@shared/captionStyles'
import type { CustomFont } from '@shared/types'
import type { OverlayExportPageApi, OverlayExportPayload } from '@shared/overlayExport'
import { ExportOverlay } from './ExportOverlay'

declare global {
  interface Window {
    cutawanOverlayExport?: OverlayExportPageApi
  }
}

const mediaUrl = (path: string): string => `media://file/${encodeURIComponent(path)}`

async function nextPaint(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

async function decodeImages(): Promise<void> {
  const images = Array.from(document.images)
  await Promise.all(images.map(async (image) => {
    if (!image.complete) await new Promise<void>((resolve, reject) => {
      image.addEventListener('load', () => resolve(), { once: true })
      image.addEventListener('error', () => reject(new Error(`Overlay image failed to load: ${image.src}`)), { once: true })
    })
    await image.decode().catch(() => undefined)
  }))
}

async function registerFonts(fonts: CustomFont[]): Promise<void> {
  for (const font of fonts) {
    const face = new FontFace(font.family, `url("${mediaUrl(font.path)}")`)
    await face.load()
    document.fonts.add(face)
  }
}

async function assertSelectedFont(payload: OverlayExportPayload): Promise<void> {
  const family = resolveCaptionStyle(
    payload.clip.edit.captionStyleId,
    payload.branding?.colors,
    payload.clip.edit.captionFontFamily
  ).fontFamily
  const availableFamilies = new Set([
    'Anton', 'Poppins', 'Poppins Medium',
    ...payload.customFonts.map((font) => font.family)
  ])
  if (!availableFamilies.has(family)) throw new Error(`Selected overlay font file is unavailable: ${family}`)
  await document.fonts.load(`700 84px "${family.replaceAll('"', '\\"')}"`)
  await document.fonts.ready
  if (!document.fonts.check(`700 84px "${family.replaceAll('"', '\\"')}"`)) {
    throw new Error(`Selected overlay font is unavailable: ${family}`)
  }
}

export default function OverlayExportPage(): React.JSX.Element {
  const [payload, setPayload] = useState<OverlayExportPayload | null>(null)
  const [mediaTime, setMediaTime] = useState(0)

  useLayoutEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    document.body.style.margin = '0'
    window.cutawanOverlayExport = {
      initialize: async (next) => {
        await registerFonts(next.customFonts)
        flushSync(() => {
          setPayload(next)
          setMediaTime(next.clip.edit.start)
        })
        await decodeImages()
        await assertSelectedFont(next)
        await nextPaint()
      },
      setTime: async (time) => {
        flushSync(() => setMediaTime(time))
        await decodeImages()
        await document.fonts.ready
        await nextPaint()
      }
    }
    return () => { delete window.cutawanOverlayExport }
  }, [])

  if (!payload) return <></>
  return <div style={{
    position: 'relative', width: payload.width, height: payload.height,
    overflow: 'hidden', containerType: 'size', background: 'transparent'
  }}>
    <ExportOverlay
      clip={payload.clip}
      transcript={payload.transcript}
      branding={payload.branding}
      mediaTime={mediaTime}
      aspectRatio={payload.width / payload.height}
      mediaUrl={mediaUrl}
    />
  </div>
}
