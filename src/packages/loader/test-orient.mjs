import { loadImage } from './dist/node.js';
import { writeFileSync } from 'fs';

// Load test image and check which y-coordinates the potrace output produces
const rgbMap = await loadImage('../../input.png');
console.log('Image:', rgbMap.width, 'x', rgbMap.height);

// Import trace modules
await import('../trace/dist/potrace.js');

const { grayMapToPath, ensurePotraceInit } = await import('../trace/dist/index.js');
const { brightnessThreshold, grayMapCanny } = await import('../preprocess/dist/index.js');
import { GrayMap } from '../core/dist/index.js';

await ensurePotraceInit();

// Convert to GrayMap
const gm = new GrayMap(rgbMap.width, rgbMap.height);
for (let y = 0; y < rgbMap.height; y++) {
  for (let x = 0; x < rgbMap.width; x++) {
    const p = rgbMap.getPixel(x, y);
    gm.setPixel(x, y, p.r + p.g + p.b);
  }
}

// Apply brightness threshold
const thresh = brightnessThreshold(gm, 0.45, 0);
const path = await grayMapToPath(thresh, { turdsize: 2, turnpolicy: 4, alphamax: 1, opticurve: 1, opttolerance: 0.2 });

// Find y-range of the path
const nums = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
let minY = Infinity, maxY = -Infinity;
for (let i = 1; i < nums.length; i += 2) {
  if (nums[i] < minY) minY = nums[i];
  if (nums[i] > maxY) maxY = nums[i];
}
console.log('Path y-range:', minY, 'to', maxY);
console.log('Image height at 5x:', rgbMap.height * 5);
console.log('If minY is near 0 and maxY near height*5, orientation is likely correct');
console.log('First 200 chars:', path.substring(0, 200));
