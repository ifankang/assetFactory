import { GrayMap } from '@vectrace/core'

export function brightnessThreshold(
  gm: GrayMap,
  threshold: number,
  floor: number,
): GrayMap {
  const out = gm.clone()
  const floorVal = 3.0 * floor * 256.0
  const cutoff = 3.0 * threshold * 256.0

  out.forEach((val, x, y) => {
    if (val >= floorVal && val < cutoff) {
      out.setPixel(x, y, GrayMap.BLACK)
    } else {
      out.setPixel(x, y, GrayMap.WHITE)
    }
  })

  return out
}
