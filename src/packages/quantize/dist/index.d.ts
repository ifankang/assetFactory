export { Pool, Ref } from './pool.js';
export type { Ocnode } from './octree.js';
export { childIndex, distRGB, findRGB, ocnodeNew, ocnodeFree, ocnodeLeaf, octreeDelete, octreeMerge, ocnodeMi, ocnodeStrip, octreePrune, octreeBuildArea, octreeBuild, octreeIndex, } from './octree.js';
import { RgbMap, IndexedMap } from '@vectrace/core';
export declare function rgbMapQuantizeSpatial(rgbmap: RgbMap, ncolor: number): IndexedMap;
export declare function rgbMapQuantizeMC(rgbmap: RgbMap, ncolor: number): IndexedMap;
export declare const rgbMapQuantize: typeof rgbMapQuantizeMC;
//# sourceMappingURL=index.d.ts.map