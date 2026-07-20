import { GrayMap, RgbMap } from '@vectrace/core'
import { rgbMapGaussian } from './gaussian.js'
import { rgbMapQuantize } from '@vectrace/quantize'

export function quantizeBand(rgbMap: RgbMap, nrColors: number): GrayMap {
  const gaussMap = rgbMapGaussian(rgbMap)
  const qMap = rgbMapQuantize(gaussMap, nrColors)
  const out = new GrayMap(rgbMap.width, rgbMap.height)

  for (let y = 0; y < rgbMap.height; y++) {
    for (let x = 0; x < rgbMap.width; x++) {
      const rgb = qMap.getPixelValue(x, y)
      if ((rgb.r + rgb.g + rgb.b) & 1) {
        out.setPixel(x, y, GrayMap.WHITE)
      } else {
        out.setPixel(x, y, GrayMap.BLACK)
      }
    }
  }

  return out
}
