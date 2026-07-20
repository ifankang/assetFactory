// Use CLI to trace a test image
import { GrayMap } from '../core/dist/index.js';
import { loadImage } from '../loader/dist/node.js';
import { writeFile } from 'fs/promises';

// First, read the input.png to understand its dimensions
const rgbMap = await loadImage('../../input.png');
console.log('Input image:', rgbMap.width, 'x', rgbMap.height);

// Check a few pixels at top and bottom
const topPixel = rgbMap.getPixel(Math.floor(rgbMap.width / 2), 0);
const midPixel = rgbMap.getPixel(Math.floor(rgbMap.width / 2), Math.floor(rgbMap.height / 2));
const botPixel = rgbMap.getPixel(Math.floor(rgbMap.width / 2), rgbMap.height - 1);
console.log('Center Top pixel (r,g,b):', topPixel);
console.log('Center Mid pixel (r,g,b):', midPixel);
console.log('Center Bot pixel (r,g,b):', botPixel);

// Rows 0-3 and last 4 rows
for (let y = 0; y < 4; y++) {
  const pixel = rgbMap.getPixel(50, y);
  console.log('Pixel at (50,', y, '):', pixel);
}
for (let y = rgbMap.height - 4; y < rgbMap.height; y++) {
  const pixel = rgbMap.getPixel(50, y);
  console.log('Pixel at (50,', y, '):', pixel);
}
