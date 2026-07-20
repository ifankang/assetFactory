export { Pool, Ref } from './pool.js';
export type { Ocnode } from './octree.js';
export {
  childIndex,
  distRGB,
  findRGB,
  ocnodeNew,
  ocnodeFree,
  ocnodeLeaf,
  octreeDelete,
  octreeMerge,
  ocnodeMi,
  ocnodeStrip,
  octreePrune,
  octreeBuildArea,
  octreeBuild,
  octreeIndex,
} from './octree.js';

import { RgbMap, IndexedMap } from '@vectrace/core';
import type { RGB } from '@vectrace/core';
import { Pool, Ref } from './pool.js';
import { octreeBuild, octreeIndex, octreeDelete, findRGB } from './octree.js';
import type { Ocnode } from './octree.js';
import { medianCutQuantize } from './median-cut.js';

// Spatial octree quantizer (original) — splits by position, may produce
// averaged colors from adjacent dissimilar-color regions.
export function rgbMapQuantizeSpatial(rgbmap: RgbMap, ncolor: number): IndexedMap {
  const imap = new IndexedMap(rgbmap.width, rgbmap.height);

  const pool = new Pool<Ocnode>();
  const tree = octreeBuild(pool, rgbmap, ncolor);

  // Extract up to ncolor palette entries from the pruned tree
  const rgbs: RGB[] = new Array(ncolor);
  for (let i = 0; i < ncolor; i++) {
    rgbs[i] = { r: 0, g: 0, b: 0 };
  }

  const index = new Ref(0);
  if (tree) octreeIndex(tree, rgbs, index);

  octreeDelete(pool, tree);

  // Sort palette by luminance (r+g+b)
  const palette = rgbs.slice(0, index.value);
  palette.sort((a, b) => (a.r + a.g + a.b) - (b.r + b.g + b.b));

  for (let i = 0; i < palette.length; i++) {
    imap.clut[i] = palette[i];
  }
  imap.nrColors = palette.length;

  // Map each pixel to nearest palette entry
  for (let y = 0; y < rgbmap.height; y++) {
    for (let x = 0; x < rgbmap.width; x++) {
      const rgb = rgbmap.getPixel(x, y);
      const idx = findRGB(palette, palette.length, rgb);
      imap.setPixel(x, y, idx);
    }
  }

  return imap;
}

export function rgbMapQuantizeMC(rgbmap: RgbMap, ncolor: number): IndexedMap {
  const { palette, mapping } = medianCutQuantize(rgbmap, ncolor)

  const imap = new IndexedMap(rgbmap.width, rgbmap.height)
  for (let i = 0; i < palette.length; i++) {
    imap.clut[i] = palette[i]
  }
  imap.nrColors = palette.length

  for (let y = 0; y < rgbmap.height; y++) {
    for (let x = 0; x < rgbmap.width; x++) {
      imap.setPixel(x, y, mapping[y * rgbmap.width + x])
    }
  }

  return imap
}

// Default: use median-cut (better color fidelity, no spatial merging artifacts)
export const rgbMapQuantize = rgbMapQuantizeMC
