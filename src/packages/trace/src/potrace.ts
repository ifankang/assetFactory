import { GrayMap } from '@vectrace/core'
import type { PotraceParams } from '@vectrace/core'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import * as path from 'path'

let initialized = false

/**
 * esm-potrace-wasm uses CommonJS globals (require, __dirname, __filename, module)
 * internally. In Node.js ESM, these are not available, so we provide them
 * on globalThis before the dynamic import executes the module's top-level code.
 */
function provideCjsGlobals(): void {
  if (typeof (globalThis as any).require !== 'function') {
    const req = createRequire(import.meta.url)
    ;(globalThis as any).require = req
  }
  if (typeof (globalThis as any).__dirname === 'undefined') {
    ;(globalThis as any).__dirname = path.dirname(fileURLToPath(import.meta.url))
  }
  if (typeof (globalThis as any).__filename === 'undefined') {
    ;(globalThis as any).__filename = fileURLToPath(import.meta.url)
  }
  if (typeof (globalThis as any).module === 'undefined') {
    ;(globalThis as any).module = { exports: {} }
  }
  if (typeof (globalThis as any).ImageData === 'undefined') {
    ;(globalThis as any).ImageData = class ImageData {
      data: Uint8ClampedArray
      width: number
      height: number
      constructor(pixels: Uint8ClampedArray, w: number, h: number) {
        this.data = pixels
        this.width = w
        this.height = h
      }
    } as any
  }
}

export async function ensurePotraceInit(): Promise<void> {
  if (!initialized) {
    provideCjsGlobals()
    const mod = await import('esm-potrace-wasm')
    await mod.init()
    initialized = true
  }
}

export async function grayMapToPath(
  gm: GrayMap,
  params: PotraceParams,
): Promise<string> {
  await ensurePotraceInit()

  provideCjsGlobals()
  const { potrace: potraceFn } = await import('esm-potrace-wasm')

  const pixels = new Uint8ClampedArray(gm.width * gm.height * 4)
  for (let y = 0; y < gm.height; y++) {
    const srcY = gm.height - 1 - y
    for (let x = 0; x < gm.width; x++) {
      const idx = (y * gm.width + x) * 4
      const val = gm.getPixel(x, srcY)
      if (val === GrayMap.BLACK) {
        pixels[idx] = 0
        pixels[idx + 1] = 0
        pixels[idx + 2] = 0
      } else {
        pixels[idx] = 255
        pixels[idx + 1] = 255
        pixels[idx + 2] = 255
      }
      pixels[idx + 3] = 255
    }
  }

  const imageData = new ImageData(pixels, gm.width, gm.height)

  const result = await potraceFn(imageData, {
    turdsize: params.turdsize,
    turnpolicy: params.turnpolicy ?? 4,
    alphamax: params.alphamax,
    opticurve: params.opticurve,
    opttolerance: params.opttolerance,
    pathonly: true,
    extractcolors: false,
    posterizelevel: 2,
  })

  // potraceFn can return string | string[] — normalize to string
  const svg = Array.isArray(result) ? result.join('') : result
  return svg
}
