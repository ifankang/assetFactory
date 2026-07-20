// ========================================================================
// @vectrace/core — bitmap-to-SVG tracing types (Inkscape trace ports)
// ========================================================================

// -----------------------------------------------------------------------
// 1. PixelMap<T> — generic 2-D buffer (port of imagemap.h MapBase<T>)
// -----------------------------------------------------------------------

export class PixelMap<T> {
  width: number;
  height: number;
  pixels: T[];

  constructor(width: number, height: number, fill?: T | (() => T)) {
    this.width = width;
    this.height = height;
    const size = width * height;

    if (fill === undefined) {
      this.pixels = new Array<T>(size);
    } else if (typeof fill === 'function') {
      const fn = fill as () => T;
      this.pixels = Array.from({ length: size }, () => fn());
    } else {
      this.pixels = new Array<T>(size).fill(fill);
    }
  }

  /** offset(x, y) — port of MapBase::offset() */
  offset(x: number, y: number): number {
    return x + y * this.width;
  }

  /** getPixel(x, y) — port of MapBase::getPixel() */
  getPixel(x: number, y: number): T {
    return this.pixels[this.offset(x, y)];
  }

  /** setPixel(x, y, val) — port of MapBase::setPixel() */
  setPixel(x: number, y: number, val: T): void {
    this.pixels[this.offset(x, y)] = val;
  }

  /** row(y) — port of MapBase::row() (returns a COPY) */
  row(y: number): T[] {
    const start = y * this.width;
    return this.pixels.slice(start, start + this.width);
  }

  /** Clone this map */
  clone(): PixelMap<T> {
    const m = new PixelMap<T>(this.width, this.height);
    m.pixels = this.pixels.slice();
    return m;
  }

  /** Iterate all pixels in row-major order */
  forEach(fn: (val: T, x: number, y: number) => void): void {
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

export class GrayMap extends PixelMap<number> {
  static readonly WHITE = 765; // 3 * 255
  static readonly BLACK = 0;

  constructor(width: number, height: number, fill?: number) {
    super(width, height, fill);
  }
}

// -----------------------------------------------------------------------
// 3. RGB type + RgbMap — port of imagemap.h RGB / RgbMap
// -----------------------------------------------------------------------

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export class RgbMap extends PixelMap<RGB> {
  constructor(width: number, height: number, fill?: RGB) {
    super(width, height, fill);
  }
}

// -----------------------------------------------------------------------
// 4. IndexedMap — port of imagemap.h IndexedMap
// -----------------------------------------------------------------------

export class IndexedMap extends PixelMap<number> {
  clut: RGB[];
  nrColors: number;

  constructor(width: number, height: number) {
    super(width, height);
    this.clut = [];
    this.nrColors = 0;
  }

  /** getPixelValue(x, y) — port of IndexedMap::getPixelValue() */
  getPixelValue(x: number, y: number): RGB {
    return this.clut[this.getPixel(x, y) % this.clut.length];
  }
}

// -----------------------------------------------------------------------
// 5. Trace params — port of inkscape-potrace.h
// -----------------------------------------------------------------------

export type TraceMode =
  | 'BRIGHTNESS'
  | 'BRIGHTNESS_MULTI'
  | 'CANNY'
  | 'QUANT'
  | 'QUANT_COLOR'
  | 'QUANT_MONO';

export interface TraceParams {
  mode: TraceMode;
  invert: boolean;
  brightnessThreshold: number; // [0-1], default 0.45
  brightnessFloor: number; // [0-1], default 0
  cannyHighThreshold: number; // [0-1], default 0.65
  quantizationColors: number; // [2-256], default 8
  multiScanColors: number; // [2-256], default 8
  multiScanStack: boolean; // default true
  multiScanSmooth: boolean; // default false
  multiScanRemoveBackground: boolean; // default false
  turdsize: number; // default 2
  alphamax: number; // default 1
  opticurve: number; // default 1
  opttolerance: number; // default 0.2
}

/** Default trace params matching Inkscape defaults */
export const DEFAULT_TRACE_PARAMS: TraceParams = {
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

// -----------------------------------------------------------------------
// 6. Trace result types
// -----------------------------------------------------------------------

export interface TraceResultEntry {
  fill: string; // e.g. "fill:#ff8800" or "fill-opacity:1.0;fill:#808080"
  paths: string; // SVG <path> d attribute value
}

export type TraceResult = TraceResultEntry[];

// -----------------------------------------------------------------------
// 7. PotraceParams — matching esm-potrace-wasm API
// -----------------------------------------------------------------------

export interface PotraceParams {
  turdsize: number;
  turnpolicy: number; // 4 = minority (Inkscape default)
  alphamax: number;
  opticurve: number;
  opttolerance: number;
}
