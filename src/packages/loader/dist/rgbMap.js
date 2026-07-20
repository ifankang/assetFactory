import { GrayMap, RgbMap } from '@vectrace/core';
export function pixelsToRgbMap(width, height, data) {
    const map = new RgbMap(width, height);
    let i = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const alpha = data[i + 3];
            const white = 255 - alpha;
            map.setPixel(x, y, {
                r: (r * alpha / 256 + white) & 0xff,
                g: (g * alpha / 256 + white) & 0xff,
                b: (b * alpha / 256 + white) & 0xff,
            });
            i += 4;
        }
    }
    return map;
}
export function pixelsToGrayMap(width, height, data) {
    const map = new GrayMap(width, height);
    let i = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const alpha = data[i + 3];
            const white = 3 * (255 - alpha);
            const brightness = (data[i] + data[i + 1] + data[i + 2]) * alpha / 256 + white;
            map.setPixel(x, y, Math.min(brightness, GrayMap.WHITE));
            i += 4;
        }
    }
    return map;
}
//# sourceMappingURL=rgbMap.js.map