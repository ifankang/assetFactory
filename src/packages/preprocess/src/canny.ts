import { GrayMap } from '@vectrace/core'

const SOBEL_X = [-1, 0, 1, -2, 0, 2, -1, 0, 1]
const SOBEL_Y = [1, 2, 1, 0, 0, 0, -1, -2, -1]

export function grayMapCanny(
  gm: GrayMap,
  lowThreshold: number,
  highThreshold: number,
): GrayMap {
  const w = gm.width
  const h = gm.height
  const out = new GrayMap(w, h, GrayMap.WHITE)
  const mag = new Float64Array(w * h)
  const dir = new Int8Array(w * h)

  const highVal = highThreshold * GrayMap.WHITE
  const lowVal = lowThreshold * GrayMap.WHITE

  // Pass 1: Sobel gradients, magnitude, direction
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sumX = 0
      let sumY = 0
      let kidx = 0

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const p = gm.getPixel(x + kx, y + ky)
          sumX += p * SOBEL_X[kidx]
          sumY += p * SOBEL_Y[kidx]
          kidx++
        }
      }

      const magVal = Math.abs(sumX) + Math.abs(sumY)
      mag[y * w + x] = Math.max(0, Math.min(GrayMap.WHITE, magVal))

      if (sumX === 0) {
        dir[y * w + x] = (sumY !== 0) ? 90 : 0
      } else {
        const slope = (sumY * 1024) / sumX
        if (slope > 2472) {
          dir[y * w + x] = 90
        } else if (slope > 414) {
          dir[y * w + x] = 45
        } else if (slope < -414) {
          dir[y * w + x] = 135
        } else {
          dir[y * w + x] = 0
        }
      }
    }
  }

  // Pass 2: Non-max suppression + double threshold
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const offset = y * w + x
      const sum = mag[offset]

      const d = dir[offset]
      let n1: number
      let n2: number

      switch (d) {
        case 0:
          n1 = mag[offset - 1]
          n2 = mag[offset + 1]
          break
        case 45:
          n1 = mag[(y + 1) * w + (x - 1)]
          n2 = mag[(y - 1) * w + (x + 1)]
          break
        case 90:
          n1 = mag[offset - w]
          n2 = mag[offset + w]
          break
        case 135:
          n1 = mag[(y - 1) * w + (x - 1)]
          n2 = mag[(y + 1) * w + (x + 1)]
          break
        default:
          n1 = 0
          n2 = 0
      }

      if (sum < n1 || sum < n2) continue

      if (sum >= highVal) {
        out.setPixel(x, y, GrayMap.BLACK)
      } else if (sum >= lowVal) {
        let strong = false
        neighborLoop:
        for (let ny = -1; ny <= 1; ny++) {
          for (let nx = -1; nx <= 1; nx++) {
            if (nx === 0 && ny === 0) continue
            if (mag[(y + ny) * w + (x + nx)] > highVal) {
              strong = true
              break neighborLoop
            }
          }
        }
        if (strong) {
          out.setPixel(x, y, GrayMap.BLACK)
        }
      }
    }
  }

  return out
}
