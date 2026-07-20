import { GrayMap, RgbMap } from '@vectrace/core'

const KERNEL = [
   2,  4,  5,  4, 2,
   4,  9, 12,  9, 4,
   5, 12, 15, 12, 5,
   4,  9, 12,  9, 4,
   2,  4,  5,  4, 2
]

const KERNEL_SUM = 159
const BORDER = 2

function clamp(val: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, val))
}

export function grayMapGaussian(gm: GrayMap): GrayMap {
  const w = gm.width
  const h = gm.height
  const out = new GrayMap(w, h)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < BORDER || x >= w - BORDER || y < BORDER || y >= h - BORDER) {
        out.setPixel(x, y, gm.getPixel(x, y))
      } else {
        let sum = 0
        for (let ky = 0; ky < 5; ky++) {
          for (let kx = 0; kx < 5; kx++) {
            const px = x + kx - BORDER
            const py = y + ky - BORDER
            sum += KERNEL[ky * 5 + kx] * gm.getPixel(px, py)
          }
        }
        const val = Math.round(sum / KERNEL_SUM)
        out.setPixel(x, y, clamp(val, 0, GrayMap.WHITE))
      }
    }
  }
  return out
}

export function rgbMapGaussian(rgb: RgbMap): RgbMap {
  const w = rgb.width
  const h = rgb.height
  const out = new RgbMap(w, h)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < BORDER || x >= w - BORDER || y < BORDER || y >= h - BORDER) {
        out.setPixel(x, y, rgb.getPixel(x, y))
      } else {
        let r = 0, g = 0, b = 0
        for (let ky = 0; ky < 5; ky++) {
          for (let kx = 0; kx < 5; kx++) {
            const weight = KERNEL[ky * 5 + kx]
            const p = rgb.getPixel(x + kx - BORDER, y + ky - BORDER)
            r += weight * p.r
            g += weight * p.g
            b += weight * p.b
          }
        }
        out.setPixel(x, y, {
          r: clamp(Math.round(r / KERNEL_SUM), 0, 255),
          g: clamp(Math.round(g / KERNEL_SUM), 0, 255),
          b: clamp(Math.round(b / KERNEL_SUM), 0, 255),
        })
      }
    }
  }
  return out
}
