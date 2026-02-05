// ========================================
// editor-geometry.js
// GeometryFactory (30+ template) + utilità geometriche
// ========================================

export const GeometryFactory = {

    // Footprint dei tipi di edificio per il rendering nell'editor
    // Questi definiscono la sagoma 2D (pianta) dell'edificio
    // I modelli 3D effettivi sono caricati da file GLTF nel gioco
    getTemplate(buildingType) {
        const templates = {
            // === TORRI (difensive) ===
            'GUARD_TOWER': [
                // Torre quadrata con angoli smussati (ottagonale)
                { x: -0.8, y: -1 }, { x: 0.8, y: -1 },
                { x: 1, y: -0.8 }, { x: 1, y: 0.8 },
                { x: 0.8, y: 1 }, { x: -0.8, y: 1 },
                { x: -1, y: 0.8 }, { x: -1, y: -0.8 }
            ],
            'BALLISTA_TOWER': [
                // Torre più grande per la ballista
                { x: -1, y: -1.2 }, { x: 1, y: -1.2 },
                { x: 1.2, y: -1 }, { x: 1.2, y: 1 },
                { x: 1, y: 1.2 }, { x: -1, y: 1.2 },
                { x: -1.2, y: 1 }, { x: -1.2, y: -1 }
            ],

            // === EDIFICI MILITARI ===
            'BARRACKS': [
                // Caserma rettangolare allungata
                { x: -1.5, y: -0.8 }, { x: 1.5, y: -0.8 },
                { x: 1.5, y: 0.8 }, { x: -1.5, y: 0.8 }
            ],

            // === EDIFICI SPECIALI ===
            'TEMPLE': [
                // Tempio con forma a pentagono (entrata sul lato corto)
                { x: 0, y: -1.5 }, { x: 1.2, y: -0.5 },
                { x: 1.2, y: 1 }, { x: -1.2, y: 1 },
                { x: -1.2, y: -0.5 }
            ],
            'TREASURY': [
                // Tesoro esagonale (ben difendibile)
                { x: 0, y: -1 },
                { x: 0.87, y: -0.5 }, { x: 0.87, y: 0.5 },
                { x: 0, y: 1 },
                { x: -0.87, y: 0.5 }, { x: -0.87, y: -0.5 }
            ],

            // === FORTIFICAZIONI ===
            'GATEHOUSE': [
                // Porta nelle mura - rettangolare
                { x: -1.5, y: -1 }, { x: 1.5, y: -1 },
                { x: 1.5, y: 1 }, { x: -1.5, y: 1 }
            ]
        };

        // Fallback: quadrato semplice se tipo sconosciuto
        return templates[buildingType] || [
            { x: -1, y: -1 }, { x: 1, y: -1 },
            { x: 1, y: 1 }, { x: -1, y: 1 }
        ];
    },

    getAvailableTemplates() {
        return [
            'GUARD_TOWER',
            'BALLISTA_TOWER',
            'BARRACKS',
            'TEMPLE',
            'TREASURY',
            'GATEHOUSE'
        ];
    },

    // Informazioni aggiuntive per ogni tipo (per UI editor)
    getBuildingInfo(buildingType) {
        const info = {
            'GUARD_TOWER': {
                label: 'Guard Tower',
                category: 'Towers',
                description: 'Basic defensive tower with archers'
            },
            'BALLISTA_TOWER': {
                label: 'Ballista Tower',
                category: 'Towers',
                description: 'Heavy siege defense tower'
            },
            'BARRACKS': {
                label: 'Barracks',
                category: 'Military',
                description: 'Spawns defender units'
            },
            'TEMPLE': {
                label: 'Temple',
                category: 'Special',
                description: 'Sacred building with magical properties'
            },
            'TREASURY': {
                label: 'Treasury',
                category: 'Special',
                description: 'Objective building - player must reach this'
            },
            'GATEHOUSE': {
                label: 'Gatehouse',
                category: 'Fortifications',
                description: 'Gate in walls - can be opened/closed'
            }
        };
        return info[buildingType] || { label: buildingType, category: 'Unknown', description: '' };
    }
};

// ========================================
// Utilità geometriche
// ========================================

export function pointInPolygon(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

export function pointInPolygonArray(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1];
        const xj = poly[j][0], yj = poly[j][1];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

export function polygonArea(poly) {
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
        const j = (i + 1) % poly.length;
        area += poly[i].x * poly[j].y;
        area -= poly[j].x * poly[i].y;
    }
    return area / 2;
}

export function polygonAreaArray(poly) {
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
        const j = (i + 1) % poly.length;
        area += poly[i][0] * poly[j][1];
        area -= poly[j][0] * poly[i][1];
    }
    return area / 2;
}

export function isConvex(poly) {
    const n = poly.length;
    if (n < 3) return false;

    let sign = 0;
    for (let i = 0; i < n; i++) {
        const i1 = (i + 1) % n;
        const i2 = (i + 2) % n;
        const dx1 = poly[i1].x - poly[i].x;
        const dy1 = poly[i1].y - poly[i].y;
        const dx2 = poly[i2].x - poly[i1].x;
        const dy2 = poly[i2].y - poly[i1].y;
        const cross = dx1 * dy2 - dy1 * dx2;

        if (Math.abs(cross) < 1e-10) continue;

        if (sign === 0) {
            sign = cross > 0 ? 1 : -1;
        } else if ((cross > 0 ? 1 : -1) !== sign) {
            return false;
        }
    }
    return true;
}

export function isConvexIndices(indices, vertices) {
    const n = indices.length;
    if (n < 3) return false;

    let sign = 0;
    for (let i = 0; i < n; i++) {
        const i1 = (i + 1) % n;
        const i2 = (i + 2) % n;
        const p0 = vertices[indices[i]];
        const p1 = vertices[indices[i1]];
        const p2 = vertices[indices[i2]];
        const dx1 = p1[0] - p0[0];
        const dy1 = p1[1] - p0[1];
        const dx2 = p2[0] - p1[0];
        const dy2 = p2[1] - p1[1];
        const cross = dx1 * dy2 - dy1 * dx2;

        if (Math.abs(cross) < 1e-10) continue;

        if (sign === 0) {
            sign = cross > 0 ? 1 : -1;
        } else if ((cross > 0 ? 1 : -1) !== sign) {
            return false;
        }
    }
    return true;
}

export function findSharedEdge(indicesA, indicesB) {
    for (let i = 0; i < indicesA.length; i++) {
        const a1 = indicesA[i];
        const a2 = indicesA[(i + 1) % indicesA.length];
        for (let j = 0; j < indicesB.length; j++) {
            const b1 = indicesB[j];
            const b2 = indicesB[(j + 1) % indicesB.length];
            if ((a1 === b1 && a2 === b2) || (a1 === b2 && a2 === b1)) {
                return [a1, a2];
            }
        }
    }
    return null;
}

export function mergePolygons(indicesA, indicesB, sharedEdge) {
    const [se0, se1] = sharedEdge;
    const result = [];

    // Walk around A; when we hit the shared edge, detour through B
    for (let i = 0; i < indicesA.length; i++) {
        const curr = indicesA[i];
        const next = indicesA[(i + 1) % indicesA.length];
        result.push(curr);
        if ((curr === se0 && next === se1) || (curr === se1 && next === se0)) {
            // Walk B from curr to next the "long way" (skipping the shared edge),
            // inserting B's non-shared vertices in between.
            const startInB = indicesB.indexOf(curr);
            for (let j = 1; j < indicesB.length; j++) {
                const bIdx = indicesB[(startInB + j) % indicesB.length];
                if (bIdx === next) break;
                result.push(bIdx);
            }
        }
    }

    return result;
}

export function lineLineIntersection(p1, dir1, p2, dir2) {
    const det = dir1.x * dir2.y - dir1.y * dir2.x;
    if (Math.abs(det) < 0.0001) return null;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const t = (dx * dir2.y - dy * dir2.x) / det;

    return { x: p1.x + t * dir1.x, y: p1.y + t * dir1.y };
}

export function normalize(v) {
    const l = Math.sqrt(v.x * v.x + v.y * v.y);
    return l < 0.0001 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
}

export function distPointToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - ax, py - ay);

    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));

    const projX = ax + t * dx;
    const projY = ay + t * dy;
    return {
        dist: Math.hypot(px - projX, py - projY),
        x: projX,
        y: projY,
        t: t
    };
}
