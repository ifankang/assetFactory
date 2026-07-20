import { GrayMap } from '@vectrace/core';
import { parsePathBounds } from './pathBounds.js';
function unionBounds(all) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of all) {
        if (b.minX < minX)
            minX = b.minX;
        if (b.minY < minY)
            minY = b.minY;
        if (b.maxX > maxX)
            maxX = b.maxX;
        if (b.maxY > maxY)
            maxY = b.maxY;
    }
    return { minX, minY, maxX, maxY };
}
export function traceResultToSvg(results, width, height) {
    const xmlns = 'http://www.w3.org/2000/svg';
    if (results.length === 0) {
        return `<svg viewBox="0 0 ${width} ${height}" xmlns="${xmlns}"></svg>`;
    }
    const bounds = unionBounds(results.map(r => parsePathBounds(r.paths)));
    const viewBox = `${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`;
    const paths = results
        .map((e) => `<path fill="${e.fill}" d="${e.paths}"/>`)
        .join('\n');
    return `<svg viewBox="${viewBox}" xmlns="${xmlns}">\n${paths}\n</svg>`;
}
export function grayMapToSvg(gm, params) {
    const viewBox = `0 0 ${params.width} ${params.height}`;
    const xmlns = 'http://www.w3.org/2000/svg';
    let paths = '';
    for (let y = 0; y < gm.height; y++) {
        for (let x = 0; x < gm.width; x++) {
            const v = gm.getPixel(x, y);
            if (v !== GrayMap.WHITE) {
                const hex = Math.round((v / GrayMap.WHITE) * 255).toString(16).padStart(2, '0');
                paths += `<rect x="${x}" y="${y}" width="1" height="1" fill="#${hex}${hex}${hex}"/>`;
            }
        }
    }
    if (!paths) {
        return `<svg viewBox="${viewBox}" xmlns="${xmlns}"></svg>`;
    }
    return `<svg viewBox="${viewBox}" xmlns="${xmlns}">\n${paths}\n</svg>`;
}
//# sourceMappingURL=svg.js.map