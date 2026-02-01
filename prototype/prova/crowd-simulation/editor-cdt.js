// ========================================
// editor-cdt.js
// Pipeline CDT, triangolazione parziale, merge/split, export
// ========================================

import { pointInPolygonArray, pointInPolygon, isConvexIndices, findSharedEdge, mergePolygons } from './editor-geometry.js';

/**
 * buildNavMesh - Costruisce la navmesh CDT con triangolazione parziale
 *
 * 1. Raccolta vertici unificati: boundary → buildings → wall units → obstacles
 * 2. Edge constraints per tutti i bordi
 * 3. Delaunator + Constrainautor
 * 4. Filtro triangoli terreno (centroide inside boundary, outside buildings/walls/obstacles)
 * 5. Riassemblaggio: triangoli terreno + poligoni building + quad wall_unit
 */
export function buildNavMesh(editorData, Delaunator, Constrainautor) {
    if (editorData.boundaries.length === 0) return null;

    const allPoints = [];
    const edgeConstraints = [];
    const vertexRanges = {};

    // --- 1. Boundary vertices ---
    for (const boundary of editorData.boundaries) {
        const bStart = allPoints.length;
        for (const p of boundary.vertices) {
            allPoints.push([p[0], p[1]]);
        }
        const bCount = boundary.vertices.length;
        vertexRanges[boundary.id] = { start: bStart, count: bCount, type: 'boundary' };

        for (let i = 0; i < bCount; i++) {
            edgeConstraints.push([bStart + i, bStart + (i + 1) % bCount]);
        }
    }

    // --- 2. Building vertices ---
    editorData.buildings.forEach(bldg => {
        const bStart = allPoints.length;
        const verts = bldg.vertices;
        for (const v of verts) {
            allPoints.push([v.x, v.y]);
        }
        const bCount = verts.length;
        vertexRanges[bldg.id] = { start: bStart, count: bCount, type: 'building' };

        for (let i = 0; i < bCount; i++) {
            edgeConstraints.push([bStart + i, bStart + (i + 1) % bCount]);
        }
    });

    // --- 3. Wall unit vertices ---
    editorData.walls.forEach(wall => {
        for (const unit of wall.units) {
            const uStart = allPoints.length;
            for (const v of unit.vertices) {
                allPoints.push([v.x, v.y]);
            }
            const uCount = unit.vertices.length;
            vertexRanges[unit.id] = { start: uStart, count: uCount, type: 'wall_unit', wallId: wall.id };

            for (let i = 0; i < uCount; i++) {
                edgeConstraints.push([uStart + i, uStart + (i + 1) % uCount]);
            }
        }
    });

    // --- 4. Obstacle vertices ---
    editorData.obstacles.forEach(obs => {
        const oStart = allPoints.length;
        const verts = obs.vertices;
        for (const v of verts) {
            allPoints.push([v.x, v.y]);
        }
        const oCount = verts.length;
        vertexRanges[obs.id] = { start: oStart, count: oCount, type: 'obstacle' };

        for (let i = 0; i < oCount; i++) {
            edgeConstraints.push([oStart + i, oStart + (i + 1) % oCount]);
        }
    });

    if (allPoints.length < 3) return null;

    // --- 5. Deduplicate vertices ---
    // Adjacent wall units share vertex positions but get separate indices.
    // Duplicate points and overlapping constraints can hang the CDT.
    const DEDUP_PRECISION = 10000; // round to 0.0001
    const pointKeyMap = new Map(); // "rx,ry" -> new index
    const uniquePoints = [];
    const remapIndex = new Int32Array(allPoints.length);

    for (let i = 0; i < allPoints.length; i++) {
        const rx = Math.round(allPoints[i][0] * DEDUP_PRECISION);
        const ry = Math.round(allPoints[i][1] * DEDUP_PRECISION);
        const key = rx + ',' + ry;

        if (pointKeyMap.has(key)) {
            remapIndex[i] = pointKeyMap.get(key);
        } else {
            const newIdx = uniquePoints.length;
            uniquePoints.push(allPoints[i]);
            pointKeyMap.set(key, newIdx);
            remapIndex[i] = newIdx;
        }
    }

    // Remap edge constraints, remove self-edges and duplicates
    const edgeSet = new Set();
    const cleanEdges = [];
    for (const [a, b] of edgeConstraints) {
        const ra = remapIndex[a];
        const rb = remapIndex[b];
        if (ra === rb) continue; // self-edge from merged duplicates
        const key = Math.min(ra, rb) + ',' + Math.max(ra, rb);
        if (edgeSet.has(key)) continue; // duplicate edge
        edgeSet.add(key);
        cleanEdges.push([ra, rb]);
    }

    // Remap vertexRanges to use deduplicated indices
    for (const key in vertexRanges) {
        const range = vertexRanges[key];
        range.mappedIndices = [];
        for (let i = 0; i < range.count; i++) {
            range.mappedIndices.push(remapIndex[range.start + i]);
        }
    }

    // --- 5b. Process WALL_TO_EDGE connections to split building edges ---
    // When a wall connects to a building edge A→B, the wall's cap vertices (W1, W2)
    // lie on segment A→B. We need to:
    //   a) Split the constraint edge A→B into A→W1, W1→W2, W2→B for correct CDT
    //   b) Later (step 10) expand the building polygon to include W1, W2
    const buildingEdgeInserts = new Map(); // buildingId → Map(edgeIndex → [{idx, t}])

    for (const conn of editorData.connections) {
        if (conn.type !== 'WALL_TO_EDGE' || conn.targetType !== 'building') continue;

        const wall = editorData.walls.get(conn.wallId);
        if (!wall || wall.units.length === 0) continue;

        const bldg = editorData.buildings.get(conn.targetId);
        if (!bldg) continue;

        // Find building edge index from targetEdgeId
        const bldgVerts = bldg.vertices;
        let edgeIdx = -1;
        for (let i = 0; i < bldgVerts.length; i++) {
            if (`e_${bldgVerts[i].id}` === conn.targetEdgeId) {
                edgeIdx = i;
                break;
            }
        }
        if (edgeIdx === -1) continue;

        // Identify the connecting wall unit and its cap vertices
        const isStart = conn.wallEnd === 'start';
        const unitIdx = isStart ? 0 : wall.units.length - 1;
        const unit = wall.units[unitIdx];
        const unitRange = vertexRanges[unit.id];
        if (!unitRange || !unitRange.mappedIndices) continue;

        // Wall unit vertices: [startL, endL, endR, startR]
        // 'end' connection: cap is endL (idx 1) and endR (idx 2)
        // 'start' connection: cap is startL (idx 0) and startR (idx 3)
        const capIndices = isStart
            ? [unitRange.mappedIndices[0], unitRange.mappedIndices[3]]
            : [unitRange.mappedIndices[1], unitRange.mappedIndices[2]];

        // Get building edge endpoints (CDT indices)
        const bldgRange = vertexRanges[bldg.id];
        const bldgN = bldgRange.mappedIndices.length;
        const edgeA = bldgRange.mappedIndices[edgeIdx];
        const edgeB = bldgRange.mappedIndices[(edgeIdx + 1) % bldgN];

        const pA = uniquePoints[edgeA];
        const pB = uniquePoints[edgeB];
        const edgeDx = pB[0] - pA[0];
        const edgeDy = pB[1] - pA[1];
        const edgeLen2 = edgeDx * edgeDx + edgeDy * edgeDy;
        if (edgeLen2 < 1e-10) continue;

        if (!buildingEdgeInserts.has(bldg.id)) {
            buildingEdgeInserts.set(bldg.id, new Map());
        }
        const edgeMap = buildingEdgeInserts.get(bldg.id);
        if (!edgeMap.has(edgeIdx)) {
            edgeMap.set(edgeIdx, []);
        }
        const inserts = edgeMap.get(edgeIdx);

        for (const capIdx of capIndices) {
            if (capIdx === edgeA || capIdx === edgeB) continue; // merged with corner
            const p = uniquePoints[capIdx];
            const dx = p[0] - pA[0];
            const dy = p[1] - pA[1];
            const t = (dx * edgeDx + dy * edgeDy) / edgeLen2;
            inserts.push({ idx: capIdx, t });
        }
    }

    // Sort inserts by t for each edge
    for (const [, edgeMap] of buildingEdgeInserts) {
        for (const [, inserts] of edgeMap) {
            inserts.sort((a, b) => a.t - b.t);
        }
    }

    // --- 5c. Split constraint edges at building-wall connection points ---
    // Build a lookup: "min,max" → split info for building edges with inserts
    const edgesToSplit = new Map();
    for (const [bldgId, edgeMap] of buildingEdgeInserts) {
        const bldgRange = vertexRanges[bldgId];
        const bldgN = bldgRange.mappedIndices.length;
        for (const [edgeIdx, inserts] of edgeMap) {
            if (inserts.length === 0) continue;
            const eA = bldgRange.mappedIndices[edgeIdx];
            const eB = bldgRange.mappedIndices[(edgeIdx + 1) % bldgN];
            const key = Math.min(eA, eB) + ',' + Math.max(eA, eB);
            edgesToSplit.set(key, { a: eA, b: eB, inserts });
        }
    }

    const finalEdges = [];
    const finalEdgeSet = new Set();

    for (const [a, b] of cleanEdges) {
        const key = Math.min(a, b) + ',' + Math.max(a, b);
        const split = edgesToSplit.get(key);

        if (split && split.inserts.length > 0) {
            // Split: a → W1 → W2 → ... → b (following original direction)
            const forward = (a === split.a);
            const ordered = forward ? split.inserts : [...split.inserts].reverse();
            let prev = a;
            for (const im of ordered) {
                const ek = Math.min(prev, im.idx) + ',' + Math.max(prev, im.idx);
                if (!finalEdgeSet.has(ek)) {
                    finalEdgeSet.add(ek);
                    finalEdges.push([prev, im.idx]);
                }
                prev = im.idx;
            }
            const ek = Math.min(prev, b) + ',' + Math.max(prev, b);
            if (!finalEdgeSet.has(ek)) {
                finalEdgeSet.add(ek);
                finalEdges.push([prev, b]);
            }
        } else {
            if (!finalEdgeSet.has(key)) {
                finalEdgeSet.add(key);
                finalEdges.push([a, b]);
            }
        }
    }

    // --- 6. CDT ---
    const flatPoints = new Float64Array(uniquePoints.length * 2);
    for (let i = 0; i < uniquePoints.length; i++) {
        flatPoints[i * 2] = uniquePoints[i][0];
        flatPoints[i * 2 + 1] = uniquePoints[i][1];
    }

    let del, con;
    try {
        del = new Delaunator(flatPoints);
        con = new Constrainautor(del);
        for (const [a, b] of finalEdges) {
            try {
                con.constrainOne(a, b);
            } catch (e) {
                console.warn('Constraint failed:', a, b, e.message);
            }
        }
    } catch (e) {
        console.error('CDT failed:', e);
        return null;
    }

    // --- 8. Collect boundary polygons for containment tests ---
    const boundaryPolys = editorData.boundaries.map(b => b.vertices);

    // Building polygons for containment (use {x,y} format)
    const buildingPolys = [];
    editorData.buildings.forEach(bldg => {
        buildingPolys.push(bldg.vertices);
    });

    // Wall unit polygons for containment
    const wallUnitPolys = [];
    editorData.walls.forEach(wall => {
        for (const unit of wall.units) {
            wallUnitPolys.push(unit.vertices);
        }
    });

    // Obstacle polygons for containment
    const obstaclePolys = [];
    editorData.obstacles.forEach(obs => {
        obstaclePolys.push(obs.vertices);
    });

    // --- 9. Filter terrain triangles ---
    const polygons = [];
    const numTriangles = del.triangles.length / 3;

    for (let t = 0; t < numTriangles; t++) {
        const i0 = del.triangles[t * 3];
        const i1 = del.triangles[t * 3 + 1];
        const i2 = del.triangles[t * 3 + 2];

        const p0 = uniquePoints[i0];
        const p1 = uniquePoints[i1];
        const p2 = uniquePoints[i2];

        const cx = (p0[0] + p1[0] + p2[0]) / 3;
        const cy = (p0[1] + p1[1] + p2[1]) / 3;

        // Must be inside at least one boundary
        let inBoundary = false;
        for (const bPoly of boundaryPolys) {
            if (pointInPolygonArray(cx, cy, bPoly)) {
                inBoundary = true;
                break;
            }
        }
        if (!inBoundary) continue;

        // Must be outside all buildings
        let inBuilding = false;
        for (const bPoly of buildingPolys) {
            if (pointInPolygon(cx, cy, bPoly)) {
                inBuilding = true;
                break;
            }
        }
        if (inBuilding) continue;

        // Must be outside all wall units
        let inWallUnit = false;
        for (const wPoly of wallUnitPolys) {
            if (pointInPolygon(cx, cy, wPoly)) {
                inWallUnit = true;
                break;
            }
        }
        if (inWallUnit) continue;

        // Must be outside all obstacles
        let inObstacle = false;
        for (const oPoly of obstaclePolys) {
            if (pointInPolygon(cx, cy, oPoly)) {
                inObstacle = true;
                break;
            }
        }
        if (inObstacle) continue;

        polygons.push({
            indices: [i0, i1, i2],
            type: 'terrain'
        });
    }

    // --- 10. Add building polygons ---
    // Two issues to handle:
    //
    // A) Winding: Building vertices from createNGon are CCW, same as Delaunator's
    //    terrain triangles. navcat's buildMeshAdjacency detects adjacency only when
    //    shared edges are traversed in opposite directions. Reversing to CW fixes
    //    this (wall units are already CW and work correctly).
    //
    // B) Wall-to-edge connections: When a wall connects to a building edge A→B,
    //    the wall's cap vertices (W1, W2) lie ON edge A→B. We insert them into the
    //    building's vertex list so the square [A,B,C,D] becomes [A,W1,W2,B,C,D].
    //    This hexagon is then fan-triangulated into CW sub-polygons so every edge
    //    (A→W1, W1→W2, W2→B) appears explicitly — matching terrain triangles and
    //    the wall unit cap edge. All sub-polygons share sourceId for grouped toggle.
    //    The wall unit polygon itself remains intact (not triangulated).
    editorData.buildings.forEach(bldg => {
        const range = vertexRanges[bldg.id];
        if (!range || !range.mappedIndices) return;

        const bldgIndices = range.mappedIndices;
        const n = bldgIndices.length;
        const edgeMap = buildingEdgeInserts.get(bldg.id);

        if (!edgeMap || edgeMap.size === 0) {
            // No wall-edge connections: single polygon, reversed for CW winding
            polygons.push({
                indices: [...bldgIndices].reverse(),
                type: 'building',
                sourceId: bldg.id
            });
            return;
        }

        // Build expanded vertex list: for each edge, insert wall cap vertices
        // e.g. square [A,B,C,D] with W1,W2 on edge D→A becomes [A,B,C,D,W1,W2]
        const expandedIndices = [];
        for (let i = 0; i < n; i++) {
            expandedIndices.push(bldgIndices[i]);
            const inserts = edgeMap.get(i);
            if (inserts) {
                for (const im of inserts) {
                    expandedIndices.push(im.idx);
                }
            }
        }

        // Find a good fan hub: a building vertex NOT on any connection edge.
        // Vertices on connection edges are collinear with the inserts, producing
        // degenerate zero-area triangles. E.g. for square [A,B,C,D] with W1,W2
        // on edge D→A, fanning from D or A creates [D,W1,W2] with zero area.
        // Fanning from B or C avoids this.
        let hubBldgIdx = 0;
        for (let i = 0; i < n; i++) {
            const edgeFrom = i;                    // edge starting at vertex i
            const edgeTo = (i - 1 + n) % n;       // edge ending at vertex i
            if (!edgeMap.has(edgeFrom) && !edgeMap.has(edgeTo)) {
                hubBldgIdx = i;
                break;
            }
        }

        // Fan-triangulate the expanded polygon in CW order.
        // Reverse CCW→CW, then rotate so the hub vertex is at position 0.
        const reversed = expandedIndices.slice().reverse();
        const hubCdtIdx = bldgIndices[hubBldgIdx];
        const hubPos = reversed.indexOf(hubCdtIdx);
        const rotated = [...reversed.slice(hubPos), ...reversed.slice(0, hubPos)];

        for (let i = 1; i < rotated.length - 1; i++) {
            polygons.push({
                indices: [rotated[0], rotated[i], rotated[i + 1]],
                type: 'building',
                sourceId: bldg.id
            });
        }
    });

    // --- 11. Add wall unit quads (NOT triangulated) ---
    editorData.walls.forEach(wall => {
        for (const unit of wall.units) {
            const range = vertexRanges[unit.id];
            if (range && range.mappedIndices) {
                polygons.push({
                    indices: [...range.mappedIndices],
                    type: 'wall_unit',
                    sourceId: unit.id
                });
            }
        }
    });

    return {
        vertices: uniquePoints,
        polygons: polygons,
        vertexRanges: vertexRanges
    };
}

/**
 * mergeTriangles - Unisce due poligoni terrain adiacenti
 * @returns {boolean} true se il merge è riuscito
 */
export function mergeTriangles(navmeshData, polyIdxA, polyIdxB) {
    const polyA = navmeshData.polygons[polyIdxA];
    const polyB = navmeshData.polygons[polyIdxB];

    if (!polyA || !polyB) return false;
    if (polyA.type !== 'terrain' || polyB.type !== 'terrain') return false;

    // Find shared edge
    const sharedEdge = findSharedEdge(polyA.indices, polyB.indices);
    if (!sharedEdge) return false;

    // Merge
    const merged = mergePolygons(polyA.indices, polyB.indices, sharedEdge);

    // Check convexity
    if (!isConvexIndices(merged, navmeshData.vertices)) return false;

    // Apply: replace polyA with merged, remove polyB
    navmeshData.polygons[polyIdxA] = {
        indices: merged,
        type: 'terrain'
    };

    navmeshData.polygons.splice(polyIdxB, 1);

    return true;
}

/**
 * splitEdge - Divide un edge inserendo un midpoint
 * Divide il triangolo che contiene l'edge (e l'eventuale adiacente) in 2+2
 */
export function splitEdge(navmeshData, polyIdx, edgeVA, edgeVB) {
    const poly = navmeshData.polygons[polyIdx];
    if (!poly || poly.type !== 'terrain') return false;

    const vA = navmeshData.vertices[edgeVA];
    const vB = navmeshData.vertices[edgeVB];

    // Calculate midpoint
    const midX = (vA[0] + vB[0]) / 2;
    const midY = (vA[1] + vB[1]) / 2;

    // Add new vertex
    const midIdx = navmeshData.vertices.length;
    navmeshData.vertices.push([midX, midY]);

    // Split the polygon
    const splitResults = _splitPolyAtEdge(poly, edgeVA, edgeVB, midIdx);
    if (!splitResults) return false;

    // Replace original polygon with first split
    navmeshData.polygons[polyIdx] = splitResults[0];

    // Insert second split after
    navmeshData.polygons.splice(polyIdx + 1, 0, splitResults[1]);

    // Find and split adjacent polygon sharing the same edge
    let adjacentIdx = -1;
    for (let i = 0; i < navmeshData.polygons.length; i++) {
        if (i === polyIdx || i === polyIdx + 1) continue;
        const p = navmeshData.polygons[i];
        if (p.type !== 'terrain') continue;

        const indices = p.indices;
        for (let j = 0; j < indices.length; j++) {
            const a = indices[j];
            const b = indices[(j + 1) % indices.length];
            if ((a === edgeVA && b === edgeVB) || (a === edgeVB && b === edgeVA)) {
                adjacentIdx = i;
                break;
            }
        }
        if (adjacentIdx >= 0) break;
    }

    if (adjacentIdx >= 0) {
        const adjPoly = navmeshData.polygons[adjacentIdx];
        const adjSplitResults = _splitPolyAtEdge(adjPoly, edgeVA, edgeVB, midIdx);
        if (adjSplitResults) {
            navmeshData.polygons[adjacentIdx] = adjSplitResults[0];
            navmeshData.polygons.splice(adjacentIdx + 1, 0, adjSplitResults[1]);
        }
    }

    return true;
}

function _splitPolyAtEdge(poly, edgeVA, edgeVB, midIdx) {
    const indices = poly.indices;
    const n = indices.length;

    // Find the edge in the polygon
    let edgePos = -1;
    let va, vb;
    for (let i = 0; i < n; i++) {
        const a = indices[i];
        const b = indices[(i + 1) % n];
        if ((a === edgeVA && b === edgeVB) || (a === edgeVB && b === edgeVA)) {
            edgePos = i;
            va = a;
            vb = b;
            break;
        }
    }

    if (edgePos === -1) return null;

    if (n === 3) {
        // Triangle: split into 2 triangles
        const third = indices.find((v, i) => i !== edgePos && i !== (edgePos + 1) % n);
        const thirdIdx = indices.indexOf(third);

        return [
            { indices: [va, midIdx, third], type: 'terrain' },
            { indices: [midIdx, vb, third], type: 'terrain' }
        ];
    }

    // General polygon: split by replacing the edge with midpoint and creating two polygons
    // Polygon 1: from va through the rest of the polygon to vb, replacing edge with midpoint
    const poly1 = [va, midIdx];
    let i = (edgePos + 1) % n;
    // Walk backwards from va
    const otherVertices = [];
    for (let step = 0; step < n - 2; step++) {
        const idx = (edgePos + n - 1 - step) % n;
        otherVertices.push(indices[idx]);
    }

    // Actually, let's be more careful:
    // The polygon has vertices: [..., va, vb, ...]
    // We want two polygons:
    //   1. [va, midIdx, vertices after vb until we get back to va]
    //   2. [midIdx, vb, vertices after vb until va, then va... no]
    // For a triangle (n=3), this is straightforward.
    // For larger polygons, we need to walk around.

    // Rebuild: the edge is at position edgePos (va) -> edgePos+1 (vb)
    // Poly1: va, midIdx, then continue from (edgePos+1) skipping vb...
    // Actually for general case, just insert midIdx between va and vb
    const newIndices = [];
    for (let j = 0; j < n; j++) {
        newIndices.push(indices[j]);
        if (j === edgePos) {
            newIndices.push(midIdx);
        }
    }

    // Now split this (n+1)-gon into two parts through midIdx and the vertex opposite
    // For simplicity with terrain, we split at midIdx and the vertex farthest from the edge
    const midPosInNew = edgePos + 1;
    const oppositePos = (midPosInNew + Math.floor(newIndices.length / 2)) % newIndices.length;

    const poly1Indices = [];
    const poly2Indices = [];

    let pos = midPosInNew;
    while (pos !== oppositePos) {
        poly1Indices.push(newIndices[pos]);
        pos = (pos + 1) % newIndices.length;
    }
    poly1Indices.push(newIndices[oppositePos]);

    pos = oppositePos;
    while (pos !== midPosInNew) {
        poly2Indices.push(newIndices[pos]);
        pos = (pos + 1) % newIndices.length;
    }
    poly2Indices.push(newIndices[midPosInNew]);

    return [
        { indices: poly1Indices, type: 'terrain' },
        { indices: poly2Indices, type: 'terrain' }
    ];
}

/**
 * exportNavMesh - Esporta la navmesh in formato JSON per il simulatore
 */
export function exportNavMesh(navmeshData, offMeshLinks) {
    if (!navmeshData || navmeshData.polygons.length === 0) return null;

    // 1. Compact vertices (remove unused, remap indices)
    const usedVertices = new Set();
    for (const poly of navmeshData.polygons) {
        for (const idx of poly.indices) {
            usedVertices.add(idx);
        }
    }

    const vertexMap = new Map();
    const outVertices = [];
    let newIdx = 0;
    for (const vi of [...usedVertices].sort((a, b) => a - b)) {
        vertexMap.set(vi, newIdx++);
        const p = navmeshData.vertices[vi];
        // Convert 2D to 3D: [x, y] -> [x, 0, y]
        outVertices.push([p[0], 0, p[1]]);
    }

    // 2. Remap polygon indices
    const outPolygons = navmeshData.polygons.map(poly => {
        const result = {
            vertices: poly.indices.map(i => vertexMap.get(i)),
            type: poly.type
        };
        if (poly.sourceId) result.sourceId = poly.sourceId;
        return result;
    });

    // 3. Off-mesh connections
    const outLinks = (offMeshLinks || []).map(link => ({
        start: [link.start[0], 0, link.start[1]],
        end: [link.end[0], 0, link.end[1]],
        radius: link.radius || 0.5,
        bidirectional: link.bidirectional !== false
    }));

    return {
        vertices: outVertices,
        polygons: outPolygons,
        offMeshConnections: outLinks
    };
}
