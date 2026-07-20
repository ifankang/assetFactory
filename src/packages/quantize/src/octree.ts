import { RgbMap } from '@vectrace/core';
import type { RGB } from '@vectrace/core';
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

function shiftRGB(rgb: RGB, s: number): RGB {
  return { r: rgb.r >> s, g: rgb.g >> s, b: rgb.b >> s };
}

function eqRGB(rgb1: RGB, rgb2: RGB): boolean {
  return rgb1.r === rgb2.r && rgb1.g === rgb2.g && rgb1.b === rgb2.b;
}

export function childIndex(rgb: RGB): number {
  return ((rgb.r & 1) << 2) | ((rgb.g & 1) << 1) | (rgb.b & 1);
}

export function distRGB(rgb1: RGB, rgb2: RGB): number {
  return (rgb1.r - rgb2.r) ** 2 + (rgb1.g - rgb2.g) ** 2 + (rgb1.b - rgb2.b) ** 2
}

export function findRGB(palette: RGB[], ncolor: number, rgb: RGB): number {
  let index = -1;
  let bestDist = 0;
  for (let k = 0; k < ncolor; k++) {
    const d = distRGB(palette[k], rgb);
    if (index === -1 || d < bestDist) {
      bestDist = d;
      index = k;
    }
  }
  return index;
}

export function ocnodeNew(pool: Pool<Ocnode>): Ocnode {
  const node = pool.draw();
  node.ref = null;
  node.parent = null;
  node.nchild = 0;
  node.children = [];
  for (let i = 0; i < 8; i++) {
    node.children.push(new Ref<Ocnode | null>(null));
  }
  node.mi = 0;
  return node;
}

export function ocnodeFree(pool: Pool<Ocnode>, node: Ocnode): void {
  pool.drop(node);
}

export function ocnodeLeaf(pool: Pool<Ocnode>, ref: Ref<Ocnode | null>, rgb: RGB): void {
  const node = ocnodeNew(pool);
  node.width = 0;
  node.rgb = { r: rgb.r, g: rgb.g, b: rgb.b };
  node.rs = rgb.r;
  node.gs = rgb.g;
  node.bs = rgb.b;
  node.weight = 1;
  node.nleaf = 1;
  node.mi = 0;
  node.ref = ref;
  ref.value = node;
}

export function octreeDelete(pool: Pool<Ocnode>, node: Ocnode | null): void {
  if (!node) return;
  for (let i = 0; i < 8; i++) {
    octreeDelete(pool, node.children[i].value);
  }
  ocnodeFree(pool, node);
}

export function octreeMerge(
  pool: Pool<Ocnode>,
  parent: Ocnode | null,
  ref: Ref<Ocnode | null>,
  node1: Ocnode | null,
  node2: Ocnode | null,
): number {
  if (!node1 && !node2) return 0;

  if (parent && !ref.value) parent.nchild++;

  if (!node1) {
    ref.value = node2;
    node2!.ref = ref;
    node2!.parent = parent;
    return node2!.nleaf;
  }
  if (!node2) {
    ref.value = node1;
    node1.ref = ref;
    node1.parent = parent;
    return node1.nleaf;
  }

  const dwitdth = node1.width - node2.width;

  if (dwitdth > 0 && eqRGB(node1.rgb, shiftRGB(node2.rgb, dwitdth))) {
    ref.value = node1;
    node1.ref = ref;
    node1.parent = parent;
    const i = childIndex(shiftRGB(node2.rgb, dwitdth - 1));
    node1.rs += node2.rs;
    node1.gs += node2.gs;
    node1.bs += node2.bs;
    node1.weight += node2.weight;
    node1.mi = 0;
    if (node1.children[i].value) node1.nleaf -= node1.children[i].value!.nleaf;
    node1.nleaf += octreeMerge(pool, node1, node1.children[i], node1.children[i].value, node2);
    return node1.nleaf;
  } else if (dwitdth < 0 && eqRGB(node2.rgb, shiftRGB(node1.rgb, -dwitdth))) {
    ref.value = node2;
    node2.ref = ref;
    node2.parent = parent;
    const i = childIndex(shiftRGB(node1.rgb, -dwitdth - 1));
    node2.rs += node1.rs;
    node2.gs += node1.gs;
    node2.bs += node1.bs;
    node2.weight += node1.weight;
    node2.mi = 0;
    if (node2.children[i].value) node2.nleaf -= node2.children[i].value!.nleaf;
    node2.nleaf += octreeMerge(pool, node2, node2.children[i], node2.children[i].value, node1);
    return node2.nleaf;
  } else {
    const newnode = ocnodeNew(pool);
    newnode.rs = node1.rs + node2.rs;
    newnode.gs = node1.gs + node2.gs;
    newnode.bs = node1.bs + node2.bs;
    newnode.weight = node1.weight + node2.weight;
    ref.value = newnode;
    newnode.ref = ref;
    newnode.parent = parent;

    if (dwitdth === 0 && eqRGB(node1.rgb, node2.rgb)) {
      newnode.width = node1.width;
      newnode.rgb = { r: node1.rgb.r, g: node1.rgb.g, b: node1.rgb.b };
      newnode.nchild = 0;
      newnode.nleaf = 0;
      if (node1.nchild === 0 && node2.nchild === 0) {
        newnode.nleaf = 1;
      } else {
        for (let i = 0; i < 8; i++) {
          if (node1.children[i].value || node2.children[i].value) {
            newnode.nleaf += octreeMerge(
              pool, newnode, newnode.children[i],
              node1.children[i].value, node2.children[i].value,
            );
          }
        }
      }
      ocnodeFree(pool, node1);
      ocnodeFree(pool, node2);
      return newnode.nleaf;
    } else {
      let newwidth = Math.max(node1.width, node2.width);
      let rgb1 = shiftRGB(node1.rgb, newwidth - node1.width);
      let rgb2 = shiftRGB(node2.rgb, newwidth - node2.width);
      while (!eqRGB(rgb1, rgb2)) {
        rgb1 = shiftRGB(rgb1, 1);
        rgb2 = shiftRGB(rgb2, 1);
        newwidth++;
      }
      newnode.width = newwidth;
      newnode.rgb = { r: rgb1.r, g: rgb1.g, b: rgb1.b };
      newnode.nchild = 2;
      newnode.nleaf = node1.nleaf + node2.nleaf;
      const i1 = childIndex(shiftRGB(node1.rgb, newwidth - node1.width - 1));
      const i2 = childIndex(shiftRGB(node2.rgb, newwidth - node2.width - 1));
      node1.parent = newnode;
      node1.ref = newnode.children[i1];
      newnode.children[i1].value = node1;
      node2.parent = newnode;
      node2.ref = newnode.children[i2];
      newnode.children[i2].value = node2;
      return newnode.nleaf;
    }
  }
}

export function ocnodeMi(node: Ocnode): void {
  node.mi = node.parent ? node.weight << (2 * node.parent.width) : 0;
}

export function ocnodeStrip(
  pool: Pool<Ocnode>,
  ref: Ref<Ocnode | null>,
  count: Ref<number>,
  lvl: number,
): void {
  const node = ref.value;
  if (!node) return;

  if (node.nchild === 0) {
    if (!node.mi) ocnodeMi(node);
    if (node.mi > lvl) return;
    ocnodeFree(pool, node);
    ref.value = null;
    count.value--;
  } else {
    if (node.mi && node.mi > lvl) return;
    node.nchild = 0;
    node.nleaf = 0;
    node.mi = 0;
    let lonelychild: Ref<Ocnode | null> | null = null;
    for (let i = 0; i < 8; i++) {
      const child = node.children[i];
      if (child.value) {
        ocnodeStrip(pool, child, count, lvl);
        if (child.value) {
          lonelychild = child;
          node.nchild++;
          node.nleaf += child.value.nleaf;
          if (!node.mi || node.mi > child.value.mi) {
            node.mi = child.value.mi;
          }
        }
      }
    }
    if (node.nchild === 0) {
      count.value++;
      node.nleaf = 1;
      ocnodeMi(node);
    } else if (node.nchild === 1 && lonelychild) {
      const lc = lonelychild.value!;
      if (lc.nchild === 0) {
        node.nchild = 0;
        node.nleaf = 1;
        ocnodeMi(node);
        ocnodeFree(pool, lc);
        lonelychild.value = null;
      } else {
        lc.parent = node.parent;
        lc.ref = ref;
        ocnodeFree(pool, node);
        ref.value = lc;
      }
    }
  }
}

export function octreePrune(pool: Pool<Ocnode>, ref: Ref<Ocnode | null>, ncolor: number): void {
  if (!ref.value || ncolor <= 0) return;
  const n = new Ref(ref.value.nleaf - ncolor);
  if (n.value <= 0) return;
  while (n.value > 0) {
    ocnodeStrip(pool, ref, n, ref.value.mi);
  }
}

export function octreeBuildArea(
  pool: Pool<Ocnode>,
  rgbmap: RgbMap,
  ref: Ref<Ocnode | null>,
  x1: number, y1: number, x2: number, y2: number,
  ncolor: number,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const xm = x1 + Math.floor(dx / 2);
  const ym = y1 + Math.floor(dy / 2);

  if (dx === 1 && dy === 1) {
    ocnodeLeaf(pool, ref, rgbmap.getPixel(x1, y1));
  } else if (dx > dy) {
    const ref1 = new Ref<Ocnode | null>(null);
    const ref2 = new Ref<Ocnode | null>(null);
    octreeBuildArea(pool, rgbmap, ref1, x1, y1, xm, y2, ncolor);
    octreeBuildArea(pool, rgbmap, ref2, xm, y1, x2, y2, ncolor);
    octreeMerge(pool, null, ref, ref1.value, ref2.value);
  } else {
    const ref1 = new Ref<Ocnode | null>(null);
    const ref2 = new Ref<Ocnode | null>(null);
    octreeBuildArea(pool, rgbmap, ref1, x1, y1, x2, ym, ncolor);
    octreeBuildArea(pool, rgbmap, ref2, x1, ym, x2, y2, ncolor);
    octreeMerge(pool, null, ref, ref1.value, ref2.value);
  }
}

export function octreeBuild(pool: Pool<Ocnode>, rgbmap: RgbMap, ncolor: number): Ocnode | null {
  const ref = new Ref<Ocnode | null>(null);
  octreeBuildArea(pool, rgbmap, ref, 0, 0, rgbmap.width, rgbmap.height, ncolor);
  octreePrune(pool, ref, ncolor);
  return ref.value;
}

export function octreeIndex(node: Ocnode | null, rgba: RGB[], index: Ref<number>): void {
  if (!node) return;
  if (node.nchild === 0) {
    rgba[index.value] = {
      r: Math.round(node.rs / node.weight),
      g: Math.round(node.gs / node.weight),
      b: Math.round(node.bs / node.weight),
    };
    index.value++;
  } else {
    for (let i = 0; i < 8; i++) {
      if (node.children[i].value) {
        octreeIndex(node.children[i].value, rgba, index);
      }
    }
  }
}
