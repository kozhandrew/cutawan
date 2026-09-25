/**
 * Preview effects were tuned against the editor's usual 640px-tall portrait
 * canvas. Convert that pixel geometry into container-height units so the
 * exact same visual proportion reaches a 1080x1920 export.
 */
const PREVIEW_REFERENCE_HEIGHT = 640
const CQH_PIXELS = PREVIEW_REFERENCE_HEIGHT / 100

function cqhFromLegacyPixels(pixels: number): string {
  return `${Number((pixels / CQH_PIXELS).toFixed(4))}cqh`
}

export function captionTextShadow(style: { outlineWidth: number; outlineColor: string }): string {
  if (style.outlineWidth <= 0) return 'none'
  const width = cqhFromLegacyPixels(style.outlineWidth)
  const blur = cqhFromLegacyPixels(style.outlineWidth * 2)
  const offset = cqhFromLegacyPixels(2)
  return [
    `0 0 ${blur} ${style.outlineColor}`,
    `${offset} ${offset} ${width} ${style.outlineColor}`,
    `-${offset} ${offset} ${width} ${style.outlineColor}`,
    `${offset} -${offset} ${width} ${style.outlineColor}`,
    `-${offset} -${offset} ${width} ${style.outlineColor}`
  ].join(', ')
}
