// ========================================================================
// @vectrace/core — bitmap-to-SVG tracing types (Inkscape trace ports)
// ========================================================================
// -----------------------------------------------------------------------
// 1. PixelMap<T> — generic 2-D buffer (port of imagemap.h MapBase<T>)
// -----------------------------------------------------------------------
export class PixelMap {
    width;
    height;
    pixels;
    constructor(width, height, fill) {
        this.width = width;
        this.height = height;
        const size = width * height;
        if (fill === undefined) {
            this.pixels = new Array(size);
        }
        else if (typeof fill === 'function') {
            const fn = fill;
            this.pixels = Array.from({ length: size }, () => fn());
        }
        else {
            this.pixels = new Array(size).fill(fill);
        }
    }
    /** offset(x, y) — port of MapBase::offset() */
    offset(x, y) {
        return x + y * this.width;
    }
    /** getPixel(x, y) — port of MapBase::getPixel() */
    getPixel(x, y) {
        return this.pixels[this.offset(x, y)];
    }
    /** setPixel(x, y, val) — port of MapBase::setPixel() */
    setPixel(x, y, val) {
        this.pixels[this.offset(x, y)] = val;
    }
    /** row(y) — port of MapBase::row() (returns a COPY) */
    row(y) {
        const start = y * this.width;
        return this.pixels.slice(start, start + this.width);
    }
    /** Clone this map */
    clone() {
        const m = new PixelMap(this.width, this.height);
        m.pixels = this.pixels.slice();
        return m;
    }
    /** Iterate all pixels in row-major order */
    forEach(fn) {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                fn(this.pixels[this.offset(x, y)], x, y);
            }
        }
    }
}
// -----------------------------------------------------------------------
// 2. GrayMap — port of imagemap.h GrayMap
// -----------------------------------------------------------------------
export class GrayMap extends PixelMap {
    static WHITE = 765; // 3 * 255
    static BLACK = 0;
    constructor(width, height, fill) {
        super(width, height, fill);
    }
}
export class RgbMap extends PixelMap {
    constructor(width, height, fill) {
        super(width, height, fill);
    }
}
// -----------------------------------------------------------------------
// 4. IndexedMap — port of imagemap.h IndexedMap
// -----------------------------------------------------------------------
export class IndexedMap extends PixelMap {
    clut;
    nrColors;
    constructor(width, height) {
        super(width, height);
        this.clut = [];
        this.nrColors = 0;
    }
    /** getPixelValue(x, y) — port of IndexedMap::getPixelValue() */
    getPixelValue(x, y) {
        return this.clut[this.getPixel(x, y) % this.clut.length];
    }
}
/** Default trace params matching Inkscape defaults */
export const DEFAULT_TRACE_PARAMS = {
    mode: 'BRIGHTNESS',
    invert: false,
    brightnessThreshold: 0.45,
    brightnessFloor: 0,
    cannyHighThreshold: 0.65,
    quantizationColors: 16,
    multiScanColors: 16,
    multiScanStack: true,
    multiScanSmooth: false,
    multiScanRemoveBackground: false,
    turdsize: 2,
    alphamax: 1,
    opticurve: 1,
    opttolerance: 0.2,
};
//# sourceMappingURL=index.js.map