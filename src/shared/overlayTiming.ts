export const CAPTION_POP_SECONDS = 0.09
export const HOOK_ENTRANCE_SECONDS = 0.22

function progress(now: number, start: number, duration: number): number {
  const elapsed = now - start
  if (elapsed <= 0) return 0
  if (elapsed >= duration - 1e-9) return 1
  return elapsed / duration
}

/** CSS `ease-out` timing function: cubic-bezier(0, 0, 0.58, 1). */
function cssEaseOut(value: number): number {
  if (value <= 0 || value >= 1) return value
  const bezier = (time: number, first: number, second: number): number => {
    const inverse = 1 - time
    return 3 * inverse * inverse * time * first + 3 * inverse * time * time * second + time ** 3
  }
  let low = 0
  let high = 1
  for (let iteration = 0; iteration < 16; iteration++) {
    const time = (low + high) / 2
    if (bezier(time, 0, 0.58) < value) low = time
    else high = time
  }
  return bezier((low + high) / 2, 0, 1)
}

export function captionPopScale(mediaTime: number, wordStart: number): number {
  return 0.94 + 0.06 * cssEaseOut(progress(mediaTime, wordStart, CAPTION_POP_SECONDS))
}

export function hookEntrance(
  mediaTime: number,
  clipStart: number
): { opacity: number; translateCqh: number } {
  const eased = cssEaseOut(progress(mediaTime, clipStart, HOOK_ENTRANCE_SECONDS))
  return { opacity: eased, translateCqh: 0.8 * (1 - eased) }
}

export function overlayFrameCount(duration: number, fps: number): number {
  return Math.max(1, Math.ceil(duration * fps - 1e-9))
}

export function overlayFrameTime(index: number, fps: number): number {
  return index / fps
}
