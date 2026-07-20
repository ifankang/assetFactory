import { RgbMap } from '@vectrace/core'
import type { RGB } from '@vectrace/core'

interface ColorBox {
  rMin: number; rMax: number
  gMin: number; gMax: number
  bMin: number; bMax: number
  pixels: { r: number; g: number; b: number }[]
}

function colorRange(box: ColorBox): { dim: 'r' | 'g' | 'b'; range: number } {
  const rr = box.rMax - box.rMin
  const rg = box.gMax - box.gMin
  const rb = box.bMax - box.bMin
  if (rr >= rg && rr >= rb) return { dim: 'r', range: rr }
  if (rg >= rr && rg >= rb) return { dim: 'g', range: rg }
  return { dim: 'b', range: rb }
}

function splitBox(box: ColorBox): [ColorBox, ColorBox] {
  const { dim } = colorRange(box)
  const sorted = [...box.pixels].sort((a, b) => a[dim] - b[dim])
  const mid = Math.floor(sorted.length / 2)

  const leftPixels = sorted.slice(0, mid)
  const rightPixels = sorted.slice(mid)

  const leftBox = boxFromPixels(leftPixels)
  const rightBox = boxFromPixels(rightPixels)

  return [leftBox, rightBox]
}

function boxFromPixels(pixels: { r: number; g: number; b: number }[]): ColorBox {
  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0
  for (const p of pixels) {
    if (p.r < rMin) rMin = p.r
    if (p.r > rMax) rMax = p.r
    if (p.g < gMin) gMin = p.g
    if (p.g > gMax) gMax = p.g
    if (p.b < bMin) bMin = p.b
    if (p.b > bMax) bMax = p.b
  }
  return { rMin, rMax, gMin, gMax, bMin, bMax, pixels }
}

function boxAverage(box: ColorBox): RGB {
  let sumR = 0, sumG = 0, sumB = 0
  for (const p of box.pixels) {
    sumR += p.r; sumG += p.g; sumB += p.b
  }
  const n = box.pixels.length
  return {
    r: n > 0 ? Math.round(sumR / n) : 0,
    g: n > 0 ? Math.round(sumG / n) : 0,
    b: n > 0 ? Math.round(sumB / n) : 0,
  }
}

export function medianCutQuantize(rgbmap: RgbMap, ncolor: number): { palette: RGB[]; mapping: number[] } {
  const w = rgbmap.width, h = rgbmap.height

  // Collect all pixels
  const pixels: { r: number; g: number; b: number }[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = rgbmap.getPixel(x, y)
      pixels.push({ r: p.r, g: p.g, b: p.b })
    }
  }

  // Build initial box
  let boxes = [boxFromPixels(pixels)]

  // Split until we have enough boxes
  while (boxes.length < ncolor && boxes.length < pixels.length) {
    // Find the box with the largest color range to split
    let bestIdx = -1
    let bestRange = -1
    for (let i = 0; i < boxes.length; i++) {
      const { range } = colorRange(boxes[i])
      if (range > bestRange) {
        bestRange = range
        bestIdx = i
      }
    }
    if (bestIdx === -1 || boxes[bestIdx].pixels.length < 2) break

    const [left, right] = splitBox(boxes[bestIdx])
    boxes[bestIdx] = left
    boxes.push(right)
  }

  // Remove empty boxes (can happen if all pixels are identical)
  boxes = boxes.filter(b => b.pixels.length > 0)

  // Compute palette from box averages
  const palette = boxes.map(boxAverage)
  palette.sort((a, b) => (a.r + a.g + a.b) - (b.r + b.g + b.b))

  // Map each pixel to nearest palette entry
  const mapping = new Array<number>(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = rgbmap.getPixel(x, y)
      let bestIdx = 0
      let bestDist = Infinity
      for (let k = 0; k < palette.length; k++) {
        const d =
          (palette[k].r - p.r) ** 2 +
          (palette[k].g - p.g) ** 2 +
          (palette[k].b - p.b) ** 2
        if (d < bestDist) {
          bestDist = d
          bestIdx = k
        }
      }
      mapping[y * w + x] = bestIdx
    }
  }

  return { palette, mapping }
}
