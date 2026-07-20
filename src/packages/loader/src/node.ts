import { GrayMap, RgbMap } from '@vectrace/core'
import { pixelsToGrayMap, pixelsToRgbMap } from './rgbMap.js'

export async function loadImage(source: string | Buffer): Promise<RgbMap> {
  let sharp
  try {
    sharp = (await import('sharp')).default
  } catch {
    throw new Error(
      'The "sharp" package is required for Node.js image loading.\n' +
      'Install it with: pnpm add sharp\n' +
      'Or use @vectrace/loader/browser for browser-based image loading.'
    )
  }
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return pixelsToRgbMap(info.width, info.height, new Uint8Array(data))
}

export async function loadGrayMap(source: string | Buffer): Promise<GrayMap> {
  let sharp
  try {
    sharp = (await import('sharp')).default
  } catch {
    throw new Error(
      'The "sharp" package is required for Node.js image loading.\n' +
      'Install it with: pnpm add sharp\n' +
      'Or use @vectrace/loader/browser for browser-based image loading.'
    )
  }
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return pixelsToGrayMap(info.width, info.height, new Uint8Array(data))
}
