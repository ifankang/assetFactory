const COMMAND_RE = /[MLHVCSQTAZmlhvcsqtaz]/g;
const ARGS_PER_COMMAND = {
    m: 2, l: 2, h: 1, v: 1,
    c: 6, s: 4, q: 4, t: 2, a: 7,
};
function add(mnx, mny, mxx, mxy, x, y) {
    if (x < mnx)
        mnx = x;
    if (x > mxx)
        mxx = x;
    if (y < mny)
        mny = y;
    if (y > mxy)
        mxy = y;
    return [mnx, mny, mxx, mxy];
}
/**
 * Tokenize SVG path d-attribute into commands with their argument arrays.
 * Groups all consecutive numbers after a command into one args array,
 * so implicit repeated commands are naturally handled.
 */
function tokenize(d) {
    COMMAND_RE.lastIndex = 0;
    const out = [];
    let lastIdx = 0;
    let m;
    while ((m = COMMAND_RE.exec(d)) !== null) {
        // Numbers between last command end and this command belong to previous command
        if (lastIdx > 0 && out.length > 0) {
            const raw = d.slice(lastIdx, m.index);
            const nums = raw.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g);
            if (nums)
                out[out.length - 1].args.push(...nums.map(Number));
        }
        out.push({ cmd: m[0].toLowerCase(), rel: m[0] === m[0].toLowerCase(), args: [] });
        lastIdx = m.index + m[0].length;
    }
    // Trailing numbers after last command
    if (lastIdx < d.length && out.length > 0) {
        const raw = d.slice(lastIdx);
        const nums = raw.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g);
        if (nums)
            out[out.length - 1].args.push(...nums.map(Number));
    }
    return out;
}
export function parsePathBounds(d) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let cx = 0, cy = 0;
    let startX = 0, startY = 0;
    const chunks = tokenize(d);
    for (const { cmd, rel, args } of chunks) {
        if (cmd === 'z') {
            cx = startX;
            cy = startY;
            continue;
        }
        const isRel = rel;
        if (cmd === 'm') {
            const pairs = Math.floor(args.length / 2);
            for (let i = 0; i < pairs; i++) {
                let x = args[i * 2], y = args[i * 2 + 1];
                if (isRel) {
                    x += cx;
                    y += cy;
                }
                if (i === 0) {
                    ;
                    [minX, minY, maxX, maxY] = add(minX, minY, maxX, maxY, x, y);
                    cx = x;
                    cy = y;
                    startX = x;
                    startY = y;
                }
                else {
                    // Implicit line-to after move
                    ;
                    [minX, minY, maxX, maxY] = add(minX, minY, maxX, maxY, x, y);
                    cx = x;
                    cy = y;
                }
            }
            continue;
        }
        if (cmd === 'l') {
            for (let i = 0; i + 1 < args.length; i += 2) {
                let x = args[i], y = args[i + 1];
                if (isRel) {
                    x += cx;
                    y += cy;
                }
                ;
                [minX, minY, maxX, maxY] = add(minX, minY, maxX, maxY, x, y);
                cx = x;
                cy = y;
            }
            continue;
        }
        if (cmd === 'h') {
            for (let i = 0; i < args.length; i++) {
                let x = args[i];
                if (isRel)
                    x += cx;
                [minX, minY, maxX, maxY] = add(minX, minY, maxX, maxY, x, cy);
                cx = x;
            }
            continue;
        }
        if (cmd === 'v') {
            for (let i = 0; i < args.length; i++) {
                let y = args[i];
                if (isRel)
                    y += cy;
                [minX, minY, maxX, maxY] = add(minX, minY, maxX, maxY, cx, y);
                cy = y;
            }
            continue;
        }
        if (cmd === 'c') {
            for (let i = 0; i + 5 < args.length; i += 6) {
                let x1 = args[i], y1 = args[i + 1];
                let x2 = args[i + 2], y2 = args[i + 3];
                let x = args[i + 4], y = args[i + 5];
                if (isRel) {
                    x1 += cx;
                    y1 += cy;
                    x2 += cx;
                    y2 += cy;
                    x += cx;
                    y += cy;
                }
                ;
                [minX, minY, maxX, maxY] = add(minX, minY, maxX, maxY, x1, y1);
                [minX, minY, maxX, maxY] = add(minX, minY, maxX, maxY, x2, y2);
                [minX, minY, maxX, maxY] = add(minX, minY, maxX, maxY, x, y);
                cx = x;
                cy = y;
            }
            continue;
        }
        if (cmd === 's') {
            for (let i = 0; i + 3 < args.length; i += 4) {
                let x2 = args[i], y2 = args[i + 1];
                let x = args[i + 2], y = args[i + 3];
                if (isRel) {
                    x2 += cx;
                    y2 += cy;
                    x += cx;
                    y += cy;
                }
                ;
                [minX, minY, maxX, maxY] = add(minX, minY, maxX, maxY, x2, y2);
                [minX, minY, maxX, maxY] = add(minX, minY, maxX, maxY, x, y);
                cx = x;
                cy = y;
            }
            continue;
        }
        if (cmd === 'q') {
            for (let i = 0; i + 3 < args.length; i += 4) {
                let x1 = args[i], y1 = args[i + 1];
                let x = args[i + 2], y = args[i + 3];
                if (isRel) {
                    x1 += cx;
                    y1 += cy;
                    x += cx;
                    y += cy;
                }
                ;
                [minX, minY, maxX, maxY] = add(minX, minY, maxX, maxY, x1, y1);
                [minX, minY, maxX, maxY] = add(minX, minY, maxX, maxY, x, y);
                cx = x;
                cy = y;
            }
            continue;
        }
        if (cmd === 't') {
            for (let i = 0; i + 1 < args.length; i += 2) {
                let x = args[i], y = args[i + 1];
                if (isRel) {
                    x += cx;
                    y += cy;
                }
                ;
                [minX, minY, maxX, maxY] = add(minX, minY, maxX, maxY, x, y);
                cx = x;
                cy = y;
            }
            continue;
        }
        if (cmd === 'a') {
            for (let i = 0; i + 6 < args.length; i += 7) {
                let x = args[i + 5], y = args[i + 6];
                if (isRel) {
                    x += cx;
                    y += cy;
                }
                ;
                [minX, minY, maxX, maxY] = add(minX, minY, maxX, maxY, x, y);
                cx = x;
                cy = y;
            }
            continue;
        }
    }
    if (!isFinite(minX)) {
        return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    }
    const dx = maxX - minX;
    const dy = maxY - minY;
    const pad = Math.max(dx * 0.05, dy * 0.05, 10);
    return {
        minX: minX - pad,
        minY: minY - pad,
        maxX: maxX + pad,
        maxY: maxY + pad,
    };
}
//# sourceMappingURL=pathBounds.js.map