// geometry.js - Funzioni geometriche di base

export function offsetPolygon(polygon, distance) {
    if (polygon.length < 3) return polygon;
    const result = [];
    for (let i = 0; i < polygon.length; i++) {
        const prev = polygon[(i - 1 + polygon.length) % polygon.length];
        const curr = polygon[i];
        const next = polygon[(i + 1) % polygon.length];

        const edge1 = { x: curr.x - prev.x, y: curr.y - prev.y };
        const edge2 = { x: next.x - curr.x, y: next.y - curr.y };

        const len1 = Math.hypot(edge1.x, edge1.y);
        const len2 = Math.hypot(edge2.x, edge2.y);

        if (len1 < 0.001 || len2 < 0.001) { result.push({ ...curr }); continue; }

        const n1 = { x: edge1.y / len1, y: -edge1.x / len1 };
        const n2 = { x: edge2.y / len2, y: -edge2.x / len2 };

        let nx = n1.x + n2.x;
        let ny = n1.y + n2.y;
        let nlen = Math.hypot(nx, ny);

        if (nlen < 0.001) {
            nx = n1.x; ny = n1.y; nlen = 1;
        }

        const dot = n1.x * (nx / nlen) + n1.y * (ny / nlen);
        const scale = dot > 0.1 ? 1 / dot : 1;
        const limit = 5.0;
        const finalScale = Math.min(scale, limit);

        result.push({
            x: curr.x + (nx / nlen) * distance * finalScale,
            y: curr.y + (ny / nlen) * distance * finalScale
        });
    }
    return result;
}

export function simplifyContour(contour, tolerance) {
    if (tolerance <= 0 || contour.length <= 3) return contour;
    const result = [contour[0]];
    for (let i = 1; i < contour.length; i++) {
        const last = result[result.length - 1];
        const curr = contour[i];
        if (Math.hypot(curr.x - last.x, curr.y - last.y) > tolerance) {
            result.push(curr);
        }
    }
    return result;
}

export function isPointInPolygon(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

export function segmentsIntersect(a, b, c, d) {
    const orientation = (p, q, r) => {
        const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
        if (Math.abs(val) < 0.001) return 0;
        return (val > 0) ? 1 : 2;
    };

    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);

    if (o1 !== o2 && o3 !== o4) return true;
    return false;
}

export function ensureCCW(polygon) {
    let area = 0;
    for (let i = 0; i < polygon.length; i++) {
        const j = (i + 1) % polygon.length;
        area += polygon[i].x * polygon[j].y;
        area -= polygon[j].x * polygon[i].y;
    }
    return area < 0 ? polygon.reverse() : polygon;
}

export function pointsClose(p1, p2, tolerance = 0.1) {
    return Math.abs(p1.x - p2.x) < tolerance && Math.abs(p1.y - p2.y) < tolerance;
}

export function getClosestPointOnSegment(p, a, b) {
    const atob = { x: b.x - a.x, y: b.y - a.y };
    const atop = { x: p.x - a.x, y: p.y - a.y };
    const lenSq = atob.x * atob.x + atob.y * atob.y;

    let dot = atop.x * atob.x + atop.y * atob.y;
    let t = Math.min(1, Math.max(0, dot / lenSq));

    return {
        x: a.x + atob.x * t,
        y: a.y + atob.y * t
    };
}

export function getPolygonCentroid(pts) {
    let x = 0, y = 0;
    for (const p of pts) { x += p.x; y += p.y; }
    return { x: x / pts.length, y: y / pts.length };
}

export function isPointWalkable(p, geometry) {
    if (!geometry.outer || geometry.outer.length === 0) return false;
    if (!isPointInPolygon(p.x, p.y, geometry.outer)) return false;
    for (const hole of geometry.holes) {
        if (isPointInPolygon(p.x, p.y, hole)) return false;
    }
    return true;
}

export function getBlockingSegments(processedGeometry) {
    const segs = [];
    const add = (poly) => {
        for (let i = 0; i < poly.length; i++) {
            segs.push({ p1: poly[i], p2: poly[(i + 1) % poly.length] });
        }
    };
    if (processedGeometry.outer) add(processedGeometry.outer);
    if (processedGeometry.holes) processedGeometry.holes.forEach(add);
    return segs;
}
