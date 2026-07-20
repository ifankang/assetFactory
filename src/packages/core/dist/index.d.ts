export declare class PixelMap<T> {
    width: number;
    height: number;
    pixels: T[];
    constructor(width: number, height: number, fill?: T | (() => T));
    /** offset(x, y) — port of MapBase::offset() */
    offset(x: number, y: number): number;
    /** getPixel(x, y) — port of MapBase::getPixel() */
    getPixel(x: number, y: number): T;
    /** setPixel(x, y, val) — port of MapBase::setPixel() */
    setPixel(x: number, y: number, val: T): void;
    /** row(y) — port of MapBase::row() (returns a COPY) */
    row(y: number): T[];
    /** Clone this map */
    clone(): PixelMap<T>;
    /** Iterate all pixels in row-major order */
    forEach(fn: (val: T, x: number, y: number) => void): void;
}
export declare class GrayMap extends PixelMap<number> {
    static readonly WHITE = 765;
    static readonly BLACK = 0;
    constructor(width: number, height: number, fill?: number);
}
export interface RGB {
    r: number;
    g: number;
    b: number;
}
export declare class RgbMap extends PixelMap<RGB> {
    constructor(width: number, height: number, fill?: RGB);
}
export declare class IndexedMap extends PixelMap<number> {
    clut: RGB[];
    nrColors: number;
    constructor(width: number, height: number);
    /** getPixelValue(x, y) — port of IndexedMap::getPixelValue() */
    getPixelValue(x: number, y: number): RGB;
}
export type TraceMode = 'BRIGHTNESS' | 'BRIGHTNESS_MULTI' | 'CANNY' | 'QUANT' | 'QUANT_COLOR' | 'QUANT_MONO';
export interface TraceParams {
    mode: TraceMode;
    invert: boolean;
    brightnessThreshold: number;
    brightnessFloor: number;
    cannyHighThreshold: number;
    quantizationColors: number;
    multiScanColors: number;
    multiScanStack: boolean;
    multiScanSmooth: boolean;
    multiScanRemoveBackground: boolean;
    turdsize: number;
    alphamax: number;
    opticurve: number;
    opttolerance: number;
}
/** Default trace params matching Inkscape defaults */
export declare const DEFAULT_TRACE_PARAMS: TraceParams;
export interface TraceResultEntry {
    fill: string;
    paths: string;
}
export type TraceResult = TraceResultEntry[];
export interface PotraceParams {
    turdsize: number;
    turnpolicy: number;
    alphamax: number;
    opticurve: number;
    opttolerance: number;
}
//# sourceMappingURL=index.d.ts.map