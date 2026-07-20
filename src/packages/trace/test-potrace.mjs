import { GrayMap } from '../core/dist/index.js';
import { parsePathBounds } from '../export/dist/pathBounds.js';
import { potrace } from 'esm-potrace-wasm';
import { ensurePotraceInit } from './dist/index.js';

await ensurePotraceInit();

class ImageData_ {
  constructor(p, w, h) { this.data = p; this.width = w; this.height = h; }
}
globalThis.ImageData = ImageData_;

const gm = new GrayMap(20, 20, GrayMap.WHITE);
for (let y = 2; y < 10; y++) {
  for (let x = 2; x < 10; x++) {
    gm.setPixel(x, y, GrayMap.BLACK);
  }
}

const pixels = new Uint8ClampedArray(20 * 20 * 4);
for (let y = 0; y < 20; y++) {
  for (let x = 0; x < 20; x++) {
    const idx = (y * 20 + x) * 4;
    const val = gm.getPixel(x, y);
    pixels[idx] = val === GrayMap.BLACK ? 0 : 255;
    pixels[idx+1] = val === GrayMap.BLACK ? 0 : 255;
    pixels[idx+2] = val === GrayMap.BLACK ? 0 : 255;
    pixels[idx+3] = 255;
  }
}

const result = await potrace(new ImageData_(pixels, 20, 20), {
  turdsize: 2, turnpolicy: 4, alphamax: 1, opticurve: 1, opttolerance: 0.2,
  pathonly: true, extractcolors: false, posterizelevel: 2
});
const svg = Array.isArray(result) ? result.join('') : result;
console.log('SVG:', svg);
const b = parsePathBounds(svg);
console.log('Bounds:', JSON.stringify(b));

console.log('\nGrayMap rows (top):');
for (let y = 0; y < 3; y++) {
  let row = '';
  for (let x = 0; x < 20; x++) {
    row += gm.getPixel(x, y) === GrayMap.BLACK ? '#' : '.';
  }
  console.log('  y=' + y + ': ' + row);
}
console.log('GrayMap rows (middle):');
for (let y = 2; y < 10; y++) {
  let row = '';
  for (let x = 0; x < 20; x++) {
    row += gm.getPixel(x, y) === GrayMap.BLACK ? '#' : '.';
  }
  console.log('  y=' + y + ': ' + row);
}
console.log('GrayMap rows (bottom):');
for (let y = 17; y < 20; y++) {
  let row = '';
  for (let x = 0; x < 20; x++) {
    row += gm.getPixel(x, y) === GrayMap.BLACK ? '#' : '.';
  }
  console.log('  y=' + y + ': ' + row);
}
