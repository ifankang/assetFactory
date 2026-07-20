import {
  GrayMap, RgbMap, IndexedMap,
  DEFAULT_TRACE_PARAMS,
} from '@vectrace/core'
import type {
  TraceParams, TraceResult, TraceResultEntry,
  PotraceParams,
} from '@vectrace/core'
import {
  grayMapGaussian, rgbMapGaussian,
  brightnessThreshold, grayMapCanny,
  quantizeBand,
} from '@vectrace/preprocess'
import { rgbMapQuantize } from '@vectrace/quantize'
import { grayMapToPath, ensurePotraceInit } from './potrace.js'

function toPotraceParams(params: TraceParams): PotraceParams {
  return {
    turdsize: params.turdsize,
    turnpolicy: 4,
    alphamax: params.alphamax,
    opticurve: params.opticurve,
    opttolerance: params.opttolerance,
  }
}

function rgbMapToGrayMap(rgb: RgbMap): GrayMap {
  const gm = new GrayMap(rgb.width, rgb.height)
  for (let y = 0; y < rgb.height; y++) {
    for (let x = 0; x < rgb.width; x++) {
      const p = rgb.getPixel(x, y)
      gm.setPixel(x, y, p.r + p.g + p.b)
    }
  }
  return gm
}

function filter(rgbMap: RgbMap, params: TraceParams): GrayMap | null {
  if (params.mode === 'QUANT') {
    return quantizeBand(rgbMap, params.quantizationColors)
  }

  if (params.mode === 'BRIGHTNESS' || params.mode === 'BRIGHTNESS_MULTI') {
    const gm = rgbMapToGrayMap(rgbMap)
    return brightnessThreshold(gm, params.brightnessThreshold, params.brightnessFloor)
  }

  if (params.mode === 'CANNY') {
    const gm = rgbMapToGrayMap(rgbMap)
    return grayMapCanny(gm, 0.1, params.cannyHighThreshold)
  }

  return null
}

function filterIndexed(rgbMap: RgbMap, params: TraceParams): IndexedMap {
  let map = rgbMap
  if (params.multiScanSmooth) {
    map = rgbMapGaussian(map)
  }

  const imap = rgbMapQuantize(map, params.multiScanColors)

  if (params.mode === 'QUANT_MONO' || params.mode === 'BRIGHTNESS_MULTI') {
    for (let i = 0; i < imap.nrColors; i++) {
      const c = imap.clut[i]
      const s = (c.r + c.g + c.b) / 3
      imap.clut[i] = { r: s, g: s, b: s }
    }
  }

  return imap
}

function hex2(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0')
}

function colorBrightness(fill: string): number {
  return parseInt(fill.slice(1, 3), 16) +
    parseInt(fill.slice(3, 5), 16) +
    parseInt(fill.slice(5, 7), 16)
}

async function traceSingle(rgbMap: RgbMap, params: TraceParams): Promise<TraceResult> {
  const grayMap = filter(rgbMap, params)
  if (!grayMap) return []

  const pathData = await grayMapToPath(grayMap, toPotraceParams(params))
  if (!pathData) return []

  return [{ fill: '#000000', paths: pathData }]
}

async function traceBrightnessMulti(
  rgbMap: RgbMap,
  params: TraceParams,
): Promise<TraceResult> {
  const low = 0.2
  const high = 0.9
  const delta = (high - low) / params.multiScanColors
  const results: TraceResult = []

  for (let i = 0; i < params.multiScanColors; i++) {
    const threshold = low + delta * i
    params.brightnessThreshold = threshold
    params.brightnessFloor = 0.0

    const grayMap = filter(rgbMap, params)
    if (!grayMap) continue

    const pathData = await grayMapToPath(grayMap, toPotraceParams(params))
    if (!pathData) continue

    const grayVal = Math.floor(256 * threshold)
      const fill = `#${hex2(grayVal)}${hex2(grayVal)}${hex2(grayVal)}`
    results.push({ fill, paths: pathData })

    if (!params.multiScanStack) {
      params.brightnessFloor = threshold
    }
  }

  if (params.multiScanRemoveBackground && results.length > 1) {
    results.pop()
  }

  return results
}

function dilateMask(gm: GrayMap): GrayMap {
  const d = new GrayMap(gm.width, gm.height, GrayMap.WHITE)
  for (let y = 0; y < gm.height; y++) {
    for (let x = 0; x < gm.width; x++) {
      if (gm.getPixel(x, y) !== GrayMap.BLACK) continue
      d.setPixel(x, y, GrayMap.BLACK)
      if (x > 0) d.setPixel(x - 1, y, GrayMap.BLACK)
      if (x + 1 < gm.width) d.setPixel(x + 1, y, GrayMap.BLACK)
      if (y > 0) d.setPixel(x, y - 1, GrayMap.BLACK)
      if (y + 1 < gm.height) d.setPixel(x, y + 1, GrayMap.BLACK)
    }
  }
  return d
}

async function traceQuant(
  rgbMap: RgbMap,
  params: TraceParams,
): Promise<TraceResult> {
  const imap = filterIndexed(rgbMap, params)
  const results: TraceResult = []

  for (let colorIndex = 0; colorIndex < imap.nrColors; colorIndex++) {
    const gm = new GrayMap(imap.width, imap.height, GrayMap.WHITE)
    for (let row = 0; row < imap.height; row++) {
      for (let col = 0; col < imap.width; col++) {
        if (imap.getPixel(col, row) === colorIndex) {
          gm.setPixel(col, row, GrayMap.BLACK)
        }
      }
    }

    const dilated = dilateMask(gm)
    const pathData = await grayMapToPath(dilated, toPotraceParams(params))
    if (pathData) {
      const rgb = imap.clut[colorIndex]
      const fill = `#${hex2(rgb.r)}${hex2(rgb.g)}${hex2(rgb.b)}`
      results.push({ fill, paths: pathData })
    }
  }

  results.sort((a, b) => colorBrightness(b.fill) - colorBrightness(a.fill))

  if (params.multiScanRemoveBackground && results.length > 1) {
    results.shift()
  }

  return results
}

export async function trace(
  rgbMap: RgbMap,
  params: TraceParams,
): Promise<TraceResult> {
  await ensurePotraceInit()

  switch (params.mode) {
    case 'QUANT_COLOR':
    case 'QUANT_MONO':
      return traceQuant(rgbMap, params)
    case 'BRIGHTNESS_MULTI':
      return traceBrightnessMulti(rgbMap, params)
    default:
      return traceSingle(rgbMap, params)
  }
}
