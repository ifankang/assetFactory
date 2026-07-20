import { RGB, RgbMap } from '@vectrace/core';
import { Pool, Ref } from './pool.js';
export interface Ocnode {
    parent: Ocnode | null;
    ref: Ref<Ocnode | null> | null;
    children: Ref<Ocnode | null>[];
    nchild: number;
    width: number;
    rgb: RGB;
    weight: number;
    rs: number;
    gs: number;
    bs: number;
    nleaf: number;
    mi: number;
}
export declare function childIndex(rgb: RGB): number;
export declare function distRGB(rgb1: RGB, rgb2: RGB): number;
export declare function findRGB(palette: RGB[], ncolor: number, rgb: RGB): number;
export declare function ocnodeNew(pool: Pool<Ocnode>): Ocnode;
export declare function ocnodeFree(pool: Pool<Ocnode>, node: Ocnode): void;
export declare function ocnodeLeaf(pool: Pool<Ocnode>, ref: Ref<Ocnode | null>, rgb: RGB): void;
export declare function octreeDelete(pool: Pool<Ocnode>, node: Ocnode | null): void;
export declare function octreeMerge(pool: Pool<Ocnode>, parent: Ocnode | null, ref: Ref<Ocnode | null>, node1: Ocnode | null, node2: Ocnode | null): number;
export declare function ocnodeMi(node: Ocnode): void;
export declare function ocnodeStrip(pool: Pool<Ocnode>, ref: Ref<Ocnode | null>, count: Ref<number>, lvl: number): void;
export declare function octreePrune(pool: Pool<Ocnode>, ref: Ref<Ocnode | null>, ncolor: number): void;
export declare function octreeBuildArea(pool: Pool<Ocnode>, rgbmap: RgbMap, ref: Ref<Ocnode | null>, x1: number, y1: number, x2: number, y2: number, ncolor: number): void;
export declare function octreeBuild(pool: Pool<Ocnode>, rgbmap: RgbMap, ncolor: number): Ocnode | null;
export declare function octreeIndex(node: Ocnode | null, rgba: RGB[], index: Ref<number>): void;
//# sourceMappingURL=octree.d.ts.map