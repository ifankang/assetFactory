import { pixelsToGrayMap, pixelsToRgbMap } from './rgbMap.js';
export async function loadImage(source) {
    if (source instanceof ImageData) {
        return pixelsToRgbMap(source.width, source.height, source.data);
    }
    const bitmap = await createImageBitmap(source);
    try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        return pixelsToRgbMap(imageData.width, imageData.height, imageData.data);
    }
    finally {
        bitmap.close();
    }
}
export async function loadGrayMap(source) {
    if (source instanceof ImageData) {
        return pixelsToGrayMap(source.width, source.height, source.data);
    }
    const bitmap = await createImageBitmap(source);
    try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        return pixelsToGrayMap(imageData.width, imageData.height, imageData.data);
    }
    finally {
        bitmap.close();
    }
}
//# sourceMappingURL=browser.js.map