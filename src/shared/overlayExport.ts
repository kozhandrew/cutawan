import type { BrandingSettings, Clip, CustomFont, Transcript } from './types'

export interface OverlayExportPayload {
  clip: Clip
  transcript: Transcript | null
  branding?: BrandingSettings | null
  customFonts: CustomFont[]
  width: number
  height: number
}

export interface OverlayExportPageApi {
  initialize(payload: OverlayExportPayload): Promise<void>
  setTime(mediaTime: number): Promise<void>
}
