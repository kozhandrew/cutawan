import { once } from 'node:events'
import { join } from 'node:path'
import type { Writable } from 'node:stream'
import { BrowserWindow } from 'electron'
import type { BrandingSettings, Clip, CustomFont, Transcript } from '@shared/types'
import type { OverlayExportPayload } from '@shared/overlayExport'
import { overlayFrameCount, overlayFrameTime } from '@shared/overlayTiming'

export interface OverlayFrameRequest {
  clip: Clip
  transcript: Transcript | null
  branding?: BrandingSettings | null
  customFonts: CustomFont[]
  width: number
  height: number
  duration: number
  fps: number
  signal?: AbortSignal
}

async function loadOverlayPage(window: BrowserWindow): Promise<void> {
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    url.searchParams.set('mode', 'overlay-export')
    await window.loadURL(url.toString())
  } else {
    await window.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { mode: 'overlay-export' }
    })
  }
}

async function waitForOverlayApi(window: BrowserWindow): Promise<void> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const ready = await window.webContents.executeJavaScript(
      `typeof window.cutawanOverlayExport?.initialize === 'function'`
    )
    if (ready) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('Overlay renderer did not initialize')
}

async function writeFrame(stream: Writable, frame: Buffer): Promise<void> {
  if (!stream.write(frame)) await once(stream, 'drain')
}

/** Streams deterministic transparent PNG frames from the canonical React overlay. */
export async function streamChromiumOverlayFrames(
  request: OverlayFrameRequest,
  stream: Writable
): Promise<void> {
  const window = new BrowserWindow({
    width: request.width,
    height: request.height,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    paintWhenInitiallyHidden: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  try {
    request.signal?.throwIfAborted()
    await loadOverlayPage(window)
    await waitForOverlayApi(window)
    window.setContentSize(request.width, request.height)
    window.webContents.setZoomFactor(1)

    const payload: OverlayExportPayload = {
      clip: request.clip,
      transcript: request.transcript,
      branding: request.branding,
      customFonts: request.customFonts,
      width: request.width,
      height: request.height
    }
    await window.webContents.executeJavaScript(
      `window.cutawanOverlayExport.initialize(${JSON.stringify(payload)})`
    )

    const frames = overlayFrameCount(request.duration, request.fps)
    for (let index = 0; index < frames; index++) {
      request.signal?.throwIfAborted()
      const mediaTime = request.clip.edit.start + overlayFrameTime(index, request.fps)
      await window.webContents.executeJavaScript(
        `window.cutawanOverlayExport.setTime(${JSON.stringify(mediaTime)})`
      )
      const image = await window.webContents.capturePage(
        { x: 0, y: 0, width: request.width, height: request.height },
        { stayHidden: true, stayAwake: true }
      )
      const size = image.getSize(1)
      if (size.width !== request.width || size.height !== request.height) {
        throw new Error(`Overlay frame size mismatch: ${size.width}x${size.height}`)
      }
      await writeFrame(stream, image.toPNG({ scaleFactor: 1 }))
    }
  } finally {
    if (!window.isDestroyed()) window.destroy()
  }
}
