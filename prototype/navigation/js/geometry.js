
export class Geometry {
    constructor() {
        this.EPSILON = 1e-8;
    }

    /**
     * Compute NavMesh from outer polygon and holes using Hertel-Mehlhorn algorithm.
     * @param {Array<{x,y}>} outer
     * @param {Array<Array<{x,y}>>} holes
     */
    computeNavMesh(outer, holes) {
        // 1. Triangulate using poly2tri
        const triangles = this.triangulate(outer, holes);

        // 2. Merge triangles into larger convex polygons (Hertel-Mehlhorn)
        const polygons = this.mergeTriangles(triangles);

        // Debug: verify all polygons are convex
        this.verifyConvexity(polygons);

        return polygons;
    }

    /**
     * Compute NavMesh and return both triangles and merged polygons.
     * @param {Array<{x,y}>} outer
     * @param {Array<Array<{x,y}>>} holes
     * @returns {{triangles: Array, merged: Array}}
     */
    computeNavMeshWithTriangles(outer, holes) {
        // 1. Triangulate using poly2tri
        const triangles = this.triangulate(outer, holes);

        // 2. Merge triangles into larger convex polygons (Hertel-Mehlhorn)
        const merged = this.mergeTriangles(triangles);

        // Debug: verify all polygons are convex
        this.verifyConvexity(merged);

        return {
            triangles: triangles,
            merged: merged
        };
    }

    /**
     * Triangulate using poly2tri
     */
    triangulate(outer, holes) {
        const p2t = window.poly2tri;
        const swctx = new p2t.SweepContext(this.toPoints(outer));

        for (const hole of holes) {
            swctx.addHole(this.toPoints(hole));
        }

        swctx.triangulate();
        const triangles = swctx.getTriangles();

        return triangles.map(t => [
            { x: t.getPoint(0).x, y: t.getPoint(0).y },
            { x: t.getPoint(1).x, y: t.getPoint(1).y },
            { x: t.getPoint(2).x, y: t.getPoint(2).y }
        ]);
    }

    toPoints(poly) {
        return poly.map(p => new window.poly2tri.Point(p.x, p.y));
    }

    /**
     * Hertel-Mehlhorn: merge triangles into larger convex polygons
     */
    mergeTriangles(triangles) {
        let polygons = triangles.map(t => ({
            vertices: [...t],
            id: Math.random()
        }));

        let changed = true;
        while (changed) {
            changed = false;

            outer:
            for (let i = 0; i < polygons.length; i++) {
                for (let j = i + 1; j < polygons.length; j++) {
                    const sharedEdge = this.findSharedEdge(polygons[i].vertices, polygons[j].vertices);

                    if (sharedEdge) {
                        const merged = this.mergePolygons(polygons[i].vertices, polygons[j].vertices, sharedEdge);

                        if (merged && this.isConvex(merged)) {
                            polygons[i].vertices = merged;
                            polygons.splice(j, 1);
                            changed = true;
                            break outer;
                        }
                    }
                }
            }
        }

        return polygons.map(p => p.vertices);
    }

    findSharedEdge(polyA, polyB) {
        const common = [];

        for (const pA of polyA) {
            for (const pB of polyB) {
                if (this.pointsEqual(pA, pB)) {
                    if (!common.some(c => this.pointsEqual(c, pA))) {
                        common.push(pA);
                    }
                }
            }
        }

        if (common.length === 2) {
            return common;
        }
        return null;
    }

    mergePolygons(polyA, polyB, sharedEdge) {
        const [s1, s2] = sharedEdge;

        let idxA1 = -1, idxA2 = -1;
        let idxB1 = -1, idxB2 = -1;

        for (let i = 0; i < polyA.length; i++) {
            if (this.pointsEqual(polyA[i], s1)) idxA1 = i;
            if (this.pointsEqual(polyA[i], s2)) idxA2 = i;
        }

        for (let i = 0; i < polyB.length; i++) {
            if (this.pointsEqual(polyB[i], s1)) idxB1 = i;
            if (this.pointsEqual(polyB[i], s2)) idxB2 = i;
        }

        if (idxA1 === -1 || idxA2 === -1 || idxB1 === -1 || idxB2 === -1) {
            return null;
        }

        const result = [];
        let current = idxA1;
        const nA = polyA.length;

        while (current !== idxA2) {
            result.push({ ...polyA[current] });
            current = (current + 1) % nA;
        }

        current = idxB2;
        const nB = polyB.length;

        while (current !== idxB1) {
            result.push({ ...polyB[current] });
            current = (current + 1) % nB;
        }

        return this.removeDuplicateConsecutive(result);
    }

    removeDuplicateConsecutive(poly) {
        if (poly.length < 3) return poly;

        const result = [];
        for (let i = 0; i < poly.length; i++) {
            const next = poly[(i + 1) % poly.length];
            if (!this.pointsEqual(poly[i], next)) {
                result.push(poly[i]);
            }
        }

        return result.length >= 3 ? result : poly;
    }

    pointsEqual(p1, p2) {
        return Math.abs(p1.x - p2.x) < 0.5 && Math.abs(p1.y - p2.y) < 0.1;
    }

    /**
     * Check if polygon is convex
     */
    isConvex(poly) {
        if (poly.length < 3) return false;

        let sign = 0;

        for (let i = 0; i < poly.length; i++) {
            const p0 = poly[i];
            const p1 = poly[(i + 1) % poly.length];
            const p2 = poly[(i + 2) % poly.length];

            const cross = this.crossProduct2D(
                p1.x - p0.x, p1.y - p0.y,
                p2.x - p1.x, p2.y - p1.y
            );

            if (Math.abs(cross) > this.EPSILON) {
                const currentSign = cross > 0 ? 1 : -1;
                if (sign === 0) {
                    sign = currentSign;
                } else if (sign !== currentSign) {
                    return false;
                }
            }
        }

        return true;
    }

    crossProduct2D(ax, ay, bx, by) {
        return ax * by - ay * bx;
    }

    signedArea(poly) {
        let area = 0;
        for (let i = 0; i < poly.length; i++) {
            const j = (i + 1) % poly.length;
            area += poly[i].x * poly[j].y;
            area -= poly[j].x * poly[i].y;
        }
        return area / 2;
    }

    /**
     * Calculate area of polygon (absolute)
     */
    calculateArea(poly) {
        return Math.abs(this.signedArea(poly));
    }

    /**
     * Calculate statistics for navmesh
     */
    calculateStats(polygons) {
        if (!polygons || polygons.length === 0) {
            return { count: 0, minArea: 0, maxArea: 0, avgArea: 0 };
        }

        const areas = polygons.map(p => this.calculateArea(p));
        const count = polygons.length;
        const minArea = Math.min(...areas);
        const maxArea = Math.max(...areas);
        const avgArea = areas.reduce((a, b) => a + b, 0) / count;

        return { count, minArea, maxArea, avgArea };
    }

    /**
     * Debug: verify all polygons are convex
     */
    verifyConvexity(polygons) {
        let nonConvexCount = 0;
        for (let i = 0; i < polygons.length; i++) {
            if (!this.isConvex(polygons[i])) {
                nonConvexCount++;
                console.warn(`Polygon ${i} is NOT convex:`, polygons[i]);
                const poly = polygons[i];
                for (let j = 0; j < poly.length; j++) {
                    const p0 = poly[j];
                    const p1 = poly[(j + 1) % poly.length];
                    const p2 = poly[(j + 2) % poly.length];
                    const cross = this.crossProduct2D(
                        p1.x - p0.x, p1.y - p0.y,
                        p2.x - p1.x, p2.y - p1.y
                    );
                    console.log(`  Vertex ${j}: cross = ${cross.toFixed(4)}`);
                }
            }
        }

        if (nonConvexCount > 0) {
            console.warn(`${nonConvexCount} non-convex polygons out of ${polygons.length}`);
        } else {
            console.log(`All ${polygons.length} polygons are convex`);
        }
    }
    

    // ========================================================================
    // CONNECTED COMPONENTS: FIND CONNECTED BUILDINGS AND WALLS
    // ========================================================================

    /**
     * Find groups of connected elements (buildings, obstacles, walls)
     * Two elements are connected if a wall connects them via snap points.
     *
     * @param {Array<Wall>} walls - Array of walls
     * @param {Array<{id: string}>} buildings - Array of buildings
     * @param {Array<{id: string}>} obstacles - Array of obstacles
     * @returns {Array<{buildings: Array<string>, obstacles: Array<string>, walls: Array<string>}>}
     */
    findConnectedGroups(walls, buildings, obstacles) {
        // Build adjacency list for union-find
        const parent = new Map();
        const rank = new Map();

        // Initialize all elements as their own parent
        const allIds = [];
        for (const b of buildings) {
            allIds.push(`building:${b.id}`);
        }
        for (const o of obstacles) {
            allIds.push(`obstacle:${o.id}`);
        }
        for (const w of walls) {
            allIds.push(`wall:${w.id}`);
        }
        // Add outer perimeter as a special element
        allIds.push('outer:__outer__');

        for (const id of allIds) {
            parent.set(id, id);
            rank.set(id, 0);
        }

        // Find with path compression
        const find = (x) => {
            if (parent.get(x) !== x) {
                parent.set(x, find(parent.get(x)));
            }
            return parent.get(x);
        };

        // Union by rank
        const union = (x, y) => {
            const rootX = find(x);
            const rootY = find(y);
            if (rootX === rootY) return;

            if (rank.get(rootX) < rank.get(rootY)) {
                parent.set(rootX, rootY);
            } else if (rank.get(rootX) > rank.get(rootY)) {
                parent.set(rootY, rootX);
            } else {
                parent.set(rootY, rootX);
                rank.set(rootX, rank.get(rootX) + 1);
            }
        };

        // Process wall connections
        for (const wall of walls) {
            const wallKey = `wall:${wall.id}`;

            // Check start snap
            if (wall.startSnap) {
                const snap = wall.startSnap;
                let targetKey = null;

                if (snap.snapType === 'vertex' || snap.snapType === 'edge' || snap.edge) {
                    if (snap.type === 'building') {
                        targetKey = `building:${snap.targetId}`;
                    } else if (snap.type === 'obstacle') {
                        targetKey = `obstacle:${snap.targetId}`;
                    } else if (snap.type === 'wall') {
                        targetKey = `wall:${snap.targetId}`;
                    } else if (snap.type === 'outer') {
                        targetKey = 'outer:__outer__';
                    }
                }

                if (targetKey && parent.has(targetKey)) {
                    union(wallKey, targetKey);
                }
            }

            // Check end snap
            if (wall.endSnap) {
                const snap = wall.endSnap;
                let targetKey = null;

                if (snap.snapType === 'vertex' || snap.snapType === 'edge' || snap.edge) {
                    if (snap.type === 'building') {
                        targetKey = `building:${snap.targetId}`;
                    } else if (snap.type === 'obstacle') {
                        targetKey = `obstacle:${snap.targetId}`;
                    } else if (snap.type === 'wall') {
                        targetKey = `wall:${snap.targetId}`;
                    } else if (snap.type === 'outer') {
                        targetKey = 'outer:__outer__';
                    }
                }

                if (targetKey && parent.has(targetKey)) {
                    union(wallKey, targetKey);
                }
            }
        }

        // Group elements by their root
        const groups = new Map();
        for (const id of allIds) {
            const root = find(id);
            if (!groups.has(root)) {
                groups.set(root, {
                    buildings: [],
                    obstacles: [],
                    walls: [],
                    connectsToOuter: false
                });
            }

            const [type, elemId] = id.split(':');
            const group = groups.get(root);

            if (type === 'building') {
                group.buildings.push(elemId);
            } else if (type === 'obstacle') {
                group.obstacles.push(elemId);
            } else if (type === 'wall') {
                group.walls.push(elemId);
            } else if (type === 'outer') {
                group.connectsToOuter = true;
            }
        }

        // Filter out empty groups and the outer-only group
        const result = [];
        for (const group of groups.values()) {
            // Skip groups that only contain outer or are completely empty
            const hasContent = group.buildings.length > 0 ||
                group.obstacles.length > 0 ||
                group.walls.length > 0;

            if (hasContent) {
                result.push(group);
            }
        }

        return result;
    }

    /**
     * Merge multiple connected polygons into a single outline polygon.
     * This works by collecting all edges and removing the shared ones.
     *
     * @param {Array<Array<{x,y}>>} polygons - Array of polygon vertex arrays
     * @returns {{merged: Array<{x,y}>, success: boolean, error: string|null}}
     */
    mergeConnectedPolygons(polygons) {
        if (polygons.length === 0) {
            return { merged: [], success: true, error: null };
        }

        if (polygons.length === 1) {
            return { merged: [...polygons[0]], success: true, error: null };
        }

        // Collect all edges with direction tracking
        // Edge key format: "x1,y1->x2,y2" (normalized to smaller point first for undirected comparison)
        const edgeCount = new Map(); // edge key -> count
        const edgeData = new Map();  // edge key -> {p1, p2, polygon index}

        const makeEdgeKey = (p1, p2) => {
            // Create a canonical key that's the same regardless of direction
            const key1 = `${p1.x.toFixed(2)},${p1.y.toFixed(2)}`;
            const key2 = `${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
            return key1 < key2 ? `${key1}->${key2}` : `${key2}->${key1}`;
        };

        const makeDirectedKey = (p1, p2) => {
            return `${p1.x.toFixed(2)},${p1.y.toFixed(2)}->${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
        };

        // Collect all edges from all polygons
        const allDirectedEdges = [];

        for (let polyIdx = 0; polyIdx < polygons.length; polyIdx++) {
            const poly = polygons[polyIdx];
            for (let i = 0; i < poly.length; i++) {
                const p1 = poly[i];
                const p2 = poly[(i + 1) % poly.length];

                const undirectedKey = makeEdgeKey(p1, p2);
                edgeCount.set(undirectedKey, (edgeCount.get(undirectedKey) || 0) + 1);

                allDirectedEdges.push({
                    p1: { x: p1.x, y: p1.y },
                    p2: { x: p2.x, y: p2.y },
                    undirectedKey,
                    directedKey: makeDirectedKey(p1, p2),
                    polyIdx
                });
            }
        }

        // Filter out shared edges (edges that appear twice are internal)
        const outerEdges = allDirectedEdges.filter(edge => edgeCount.get(edge.undirectedKey) === 1);

        if (outerEdges.length === 0) {
            return { merged: [], success: false, error: 'No outer edges found - polygons may be identical' };
        }

        // Build adjacency map: point -> list of edges starting from that point
        const adjacency = new Map();
        const pointKey = (p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;

        for (const edge of outerEdges) {
            const key = pointKey(edge.p1);
            if (!adjacency.has(key)) {
                adjacency.set(key, []);
            }
            adjacency.get(key).push(edge);
        }

        // Walk the boundary starting from the leftmost point
        let startEdge = outerEdges[0];
        let minX = startEdge.p1.x;
        for (const edge of outerEdges) {
            if (edge.p1.x < minX) {
                minX = edge.p1.x;
                startEdge = edge;
            }
        }

        const result = [];
        const usedEdges = new Set();
        let currentEdge = startEdge;
        let maxIterations = outerEdges.length + 10;
        let iterations = 0;

        while (iterations < maxIterations) {
            iterations++;

            if (usedEdges.has(currentEdge.directedKey)) {
                // We've completed the loop
                break;
            }

            result.push({ x: currentEdge.p1.x, y: currentEdge.p1.y });
            usedEdges.add(currentEdge.directedKey);

            // Find next edge starting from current edge's p2
            const nextKey = pointKey(currentEdge.p2);
            const candidates = adjacency.get(nextKey);

            if (!candidates || candidates.length === 0) {
                // Dead end - the polygons might not be properly connected
                return {
                    merged: [],
                    success: false,
                    error: 'Cannot trace boundary - polygons may not be properly connected'
                };
            }

            // Pick the next edge (prefer one that continues the boundary smoothly)
            let nextEdge = null;
            for (const candidate of candidates) {
                if (!usedEdges.has(candidate.directedKey)) {
                    nextEdge = candidate;
                    break;
                }
            }

            if (!nextEdge) {
                // All edges used, we should be done
                break;
            }

            currentEdge = nextEdge;
        }

        if (result.length < 3) {
            return {
                merged: [],
                success: false,
                error: 'Merged polygon has fewer than 3 vertices'
            };
        }

        // Ensure correct winding (clockwise for holes)
        if (this.signedArea(result) > 0) {
            result.reverse();
        }

        return { merged: result, success: true, error: null };
    }

    /**
     * Process a connected group and return the merged hole polygon(s)
     *
     * @param {Object} group - Connected group from findConnectedGroups
     * @param {Object} mapData - MapData instance
     * @param {Array<{id, vertices}>} modifiedBuildings - Buildings with opened vertices
     * @param {Array<{id, vertices}>} modifiedObstacles - Obstacles with opened vertices
     * @returns {{holes: Array<Array<{x,y}>>, elements: Array<{type, id}>}}
     */
    processConnectedGroup(group, mapData, modifiedBuildings, modifiedObstacles) {
        const elements = [];

        // Simple case: single building with walls connected via edge snap
        // Build a merged polygon directly without relying on shared edge removal
        if (group.buildings.length === 1 && group.walls.length >= 1 && group.obstacles.length === 0) {
            const buildingId = group.buildings[0];
            const building = mapData.getBuildingById(buildingId);

            if (building) {
                const mergedResult = this.buildMergedPolygonWithWalls(
                    building,
                    group.walls.map(id => mapData.getWallById(id)).filter(w => w),
                    mapData
                );

                if (mergedResult.success) {
                    elements.push({ type: 'building', id: buildingId });
                    for (const wallId of group.walls) {
                        elements.push({ type: 'wall', id: wallId });
                    }

                    // Ensure clockwise winding for holes
                    let vertices = mergedResult.polygon;
                    if (this.signedArea(vertices) > 0) {
                        vertices.reverse();
                    }

                    return {
                        holes: [vertices],
                        elements,
                        merged: true,
                        debugComponents: mergedResult.debugComponents
                    };
                }
            }
        }

        // Fallback: collect polygons and try standard merge
        const polygonsToMerge = [];

        // Collect building polygons
        for (const buildingId of group.buildings) {
            const modified = modifiedBuildings.find(b => b.id === buildingId);
            if (modified) {
                polygonsToMerge.push(modified.vertices);
                elements.push({ type: 'building', id: buildingId });
            }
        }

        // Collect obstacle polygons
        for (const obstacleId of group.obstacles) {
            const modified = modifiedObstacles.find(o => o.id === obstacleId);
            if (modified) {
                polygonsToMerge.push(modified.vertices);
                elements.push({ type: 'obstacle', id: obstacleId });
            }
        }

        // Collect wall quadrilaterals (full outline, no subdivisions)
        for (const wallId of group.walls) {
            const wall = mapData.getWallById(wallId);
            if (wall) {
                // Use toPolygon() for full outline instead of toQuadrilaterals()
                const polygon = wall.toPolygonWithSnaps(mapData);
                if (polygon && polygon.length >= 3) {
                    polygonsToMerge.push(polygon);
                    elements.push({ type: 'wall', id: wallId });
                }
            }
        }

        // If only one polygon or group connects to outer, don't merge
        if (polygonsToMerge.length <= 1 || group.connectsToOuter) {
            // Return as separate holes
            const holes = polygonsToMerge.map(poly => {
                const vertices = poly.map(v => ({ x: v.x, y: v.y }));
                // Ensure clockwise winding
                if (this.signedArea(vertices) > 0) {
                    vertices.reverse();
                }
                return vertices;
            });
            return { holes, elements, merged: false };
        }

        // Try to merge the polygons
        const mergeResult = this.mergeConnectedPolygons(polygonsToMerge);

        if (mergeResult.success && mergeResult.merged.length >= 3) {
            return {
                holes: [mergeResult.merged],
                elements,
                merged: true
            };
        }

        // Merge failed - return as separate holes with warning
        console.warn('Failed to merge connected group:', mergeResult.error);
        const holes = polygonsToMerge.map(poly => {
            const vertices = poly.map(v => ({ x: v.x, y: v.y }));
            if (this.signedArea(vertices) > 0) {
                vertices.reverse();
            }
            return vertices;
        });
        return { holes, elements, merged: false };
    }

    /**
     * ================================================================================
     * BUILD MERGED POLYGON WITH WALLS - Costruisce un poligono unito edificio+muri
     * ================================================================================
     *
     * Questa funzione costruisce un singolo poligono che include sia l'edificio
     * che i muri ad esso collegati. Il risultato è un "buco" unico che può essere
     * usato per la triangolazione senza creare edge collineari.
     *
     * CONCETTO:
     *
     * Edificio originale:          Edificio + muro collegato:
     *
     *    0----1----2                   0----1----2
     *    |         |                   |         |
     *    |         |                   |    +----|----+  <-- muro
     *    |         |                   |    |    |    |
     *    5----4----3                   5----4----3----+
     *
     * Il poligono risultante segue il perimetro dell'edificio, ma quando
     * incontra un muro collegato, "devia" seguendo il perimetro del muro
     * per poi tornare all'edificio.
     *
     * @param {Building} building - L'edificio
     * @param {Array<Wall>} walls - Array dei muri collegati
     * @param {MapData} mapData - MapData per lookup
     * @returns {{success: boolean, polygon: Array<{x,y}>, error: string|null}}
     */
    buildMergedPolygonWithWalls(building, walls, mapData) {
        console.log('=== buildMergedPolygonWithWalls ===');
        console.log('Building:', building.id);
        console.log('Walls:', walls.map(w => w.id));

        const buildingVertices = building.getVertices();
        console.log('Building vertices:', buildingVertices);

        if (buildingVertices.length < 3) {
            return { success: false, polygon: [], error: 'Invalid building' };
        }

        // ============================================================================
        // STEP 1: Raccogli tutte le connessioni dei muri a questo edificio
        // ============================================================================
        const connections = [];

        for (const wall of walls) {
            // Controlla connessione all'inizio del muro
            if (wall.startSnap && wall.startSnap.targetId === building.id) {
                console.log(`Wall ${wall.id} has startSnap to this building`);
                const conn = this.analyzeWallConnection(wall, true, building, mapData);
                if (conn) {
                    console.log('  Connection analyzed:', conn);
                    connections.push(conn);
                } else {
                    console.log('  Failed to analyze connection');
                }
            }
            // Controlla connessione alla fine del muro
            if (wall.endSnap && wall.endSnap.targetId === building.id) {
                console.log(`Wall ${wall.id} has endSnap to this building`);
                const conn = this.analyzeWallConnection(wall, false, building, mapData);
                if (conn) {
                    console.log('  Connection analyzed:', conn);
                    connections.push(conn);
                } else {
                    console.log('  Failed to analyze connection');
                }
            }
        }

        console.log('Total connections found:', connections.length);

        if (connections.length === 0) {
            console.log('No connections, returning building vertices');
            return { success: true, polygon: buildingVertices, error: null };
        }

        // ============================================================================
        // STEP 2: Raggruppa le connessioni per tipo (vertex vs edge)
        // ============================================================================
        const connectionsByEdge = new Map();  // edgeIndex -> [connections]
        const vertexConnections = new Map();  // vertexIndex -> [connections]

        for (const conn of connections) {
            if (conn.snapType === 'vertex') {
                console.log(`Vertex connection at vertex ${conn.vertexIndex}`);
                if (!vertexConnections.has(conn.vertexIndex)) {
                    vertexConnections.set(conn.vertexIndex, []);
                }
                vertexConnections.get(conn.vertexIndex).push(conn);
            } else if (conn.snapType === 'edge') {
                console.log(`Edge connection at edge ${conn.edgeIndex}, param ${conn.edgeParam}`);
                if (!connectionsByEdge.has(conn.edgeIndex)) {
                    connectionsByEdge.set(conn.edgeIndex, []);
                }
                connectionsByEdge.get(conn.edgeIndex).push(conn);
            }
        }

        // Ordina le connessioni edge per parametro lungo l'edge
        for (const [edgeIdx, conns] of connectionsByEdge) {
            conns.sort((a, b) => (a.edgeParam || 0) - (b.edgeParam || 0));
        }

        // ============================================================================
        // STEP 3: Costruisci il poligono unito seguendo il perimetro
        // ============================================================================
        const result = [];
        const n = buildingVertices.length;

        console.log('Building merged polygon...');

        for (let i = 0; i < n; i++) {
            const currVertex = buildingVertices[i];
            const nextVertex = buildingVertices[(i + 1) % n];
            console.log(`\nProcessing vertex ${i}: (${currVertex.x}, ${currVertex.y})`);

            // ----------------------------------------------------------------------
            // GESTIONE VERTEX SNAP: il vertice viene sostituito dall'outline del muro
            // ----------------------------------------------------------------------
            const vConns = vertexConnections.get(i);
            if (vConns && vConns.length > 0) {
                for (const conn of vConns) {
                    const { left, right, leftIsPrev } = conn.capPoints;

                    if (leftIsPrev) {
                        // Entriamo nel muro dal lato Left (su E_prev) ed usciamo dal Right (su E_next)
                        result.push({ x: left.x, y: left.y });

                        // Il detour deve andare da Left a Right
                        const detour = this.getWallOutlineFromConnection(conn, true);
                        result.push(...detour);

                        result.push({ x: right.x, y: right.y });
                    } else {
                        // Entriamo dal lato Right (su E_prev) ed usciamo dal Left (su E_next)
                        result.push({ x: right.x, y: right.y });

                        // Il detour deve andare da Right a Left
                        const detour = this.getWallOutlineFromConnection(conn, false);
                        result.push(...detour);

                        result.push({ x: left.x, y: left.y });
                    }
                }
            } else {
                // Se non c'è snap al vertice, procedi normalmente
                // Ma attenzione: se il vertice è "coperto" da un edge snap precedente, 
                // potresti volerlo saltare, ma di solito l'aggiunta as-is va bene.
                result.push({ x: currVertex.x, y: currVertex.y });
            }

            // ----------------------------------------------------------------------
            // GESTIONE EDGE SNAP: aggiungi deviazione attraverso il muro
            // ----------------------------------------------------------------------
            const eConns = connectionsByEdge.get(i);
            if (eConns && eConns.length > 0) {
                console.log(`  Edge ${i} has ${eConns.length} edge connections`);
                for (const conn of eConns) {
                    if (!conn.capPoints) {
                        console.log('    No cap points for this connection, skipping');
                        continue;
                    }

                    // Ottieni l'outline del muro (la parte che "devia" dall'edge)
                    const wallOutline = this.getWallOutlineFromConnection(conn);
                    console.log(`    Wall outline points:`, wallOutline);

                    // I cap points sono i punti dove il muro tocca l'edge dell'edificio
                    const leftCap = conn.capPoints.left;
                    const rightCap = conn.capPoints.right;
                    console.log(`    leftCap: (${leftCap.x}, ${leftCap.y})`);
                    console.log(`    rightCap: (${rightCap.x}, ${rightCap.y})`);

                    // Determina quale cap point viene prima lungo l'edge
                    // (cioè quale è più vicino a currVertex)
                    // ... dentro buildMergedPolygonWithWalls, nel loop delle edge connections ...

                    const tLeft = this.getParameterOnEdge(leftCap, currVertex, nextVertex);
                    const tRight = this.getParameterOnEdge(rightCap, currVertex, nextVertex);

                    if (tLeft < tRight) {
                        // Incontriamo prima il lato SINISTRO del muro
                        console.log('Order: leftCap -> wallOutline -> rightCap');
                        result.push({ x: leftCap.x, y: leftCap.y });

                        // Chiediamo il detour che inizia da sinistra e finisce a destra
                        const detour = this.getWallOutlineFromConnection(conn, true);
                        result.push(...detour);

                        result.push({ x: rightCap.x, y: rightCap.y });
                    } else {
                        // Incontriamo prima il lato DESTRO del muro
                        console.log('Order: rightCap -> wallOutline -> leftCap');
                        result.push({ x: rightCap.x, y: rightCap.y });

                        // Chiediamo il detour che inizia da destra e finisce a sinistra
                        const detour = this.getWallOutlineFromConnection(conn, false);
                        result.push(...detour);

                        result.push({ x: leftCap.x, y: leftCap.y });
                    }
                }
            }
        }

        console.log('Result before cleanup:', result.length, 'points');

        // ============================================================================
        // STEP 4: Rimuovi punti duplicati consecutivi
        // ============================================================================
        const cleanResult = this.removeDuplicateConsecutivePoints(result);
        console.log('Result after cleanup:', cleanResult.length, 'points');
        console.log('Final polygon:', cleanResult);

        // Raccolta dei componenti per debug
        const debugComponents = {
            buildingPolygon: buildingVertices.map(v => ({ x: v.x, y: v.y })),
            wallPolygons: []
        };

        // Genera i poligoni dei muri per debug
        for (const wall of walls) {
            const wallPoly = wall.toPolygonWithSnaps(mapData);
            if (wallPoly && wallPoly.length >= 3) {
                debugComponents.wallPolygons.push(wallPoly.map(v => ({ x: v.x, y: v.y })));
            }
        }

        return { success: true, polygon: cleanResult, error: null, debugComponents };
    }

    /**
     * Analyze a wall connection to a building
     */
    analyzeWallConnection(wall, isStart, building, mapData) {
        const snap = isStart ? wall.startSnap : wall.endSnap;
        if (!snap) return null;

        const buildingVertices = building.getVertices();
        const n = buildingVertices.length;

        if (snap.snapType === 'vertex') {
            // Vertex snap
            const vertexIndex = snap.vertexIndex;
            const vertexInfo = mapData.getAdjacentEdges('building', building.id, vertexIndex);

            // Get the adapted cap points
            const capPoints = this.calculateWallCapProjection(wall, isStart, mapData);

            return {
                wall,
                isStart,
                snapType: 'vertex',
                vertexIndex,
                edgeIndex: vertexIndex, // For sorting purposes
                edgeParam: 0,
                capPoints,
                vertexInfo
            };
        } else if (snap.snapType === 'edge') {
            // Edge snap
            // Find which edge the snap is on
            let edgeIndex = -1;
            let edgeParam = 0;

            for (let i = 0; i < n; i++) {
                const p1 = buildingVertices[i];
                const p2 = buildingVertices[(i + 1) % n];

                // Check if snap.edge matches this edge
                if ((this.pointsEqual(p1, snap.edge.p1) && this.pointsEqual(p2, snap.edge.p2)) ||
                    (this.pointsEqual(p1, snap.edge.p2) && this.pointsEqual(p2, snap.edge.p1))) {
                    edgeIndex = i;

                    // Calculate parameter along edge (where the wall center connects)
                    const endpoint = isStart ? wall.points[0] : wall.points[wall.points.length - 1];
                    edgeParam = this.getParameterOnEdge(endpoint, p1, p2);
                    break;
                }
            }

            if (edgeIndex === -1) {
                return null;
            }

            // Get the cap points on the edge
            const capPoints = this.calculateWallCapProjectionForEdge(wall, isStart, mapData);

            return {
                wall,
                isStart,
                snapType: 'edge',
                edgeIndex,
                edgeParam,
                capPoints
            };
        }

        return null;
    }

    /**
    * Ottiene l'outline del muro ordinato correttamente per evitare incroci.
    * @param {Object} conn - La connessione analizzata
    * @param {boolean} enterFromLeft - Se true, iniziamo dal lato sinistro verso il destro
    */
    getWallOutlineFromConnection(conn, enterFromLeft) {
        const wall = conn.wall;
        const isStart = conn.isStart;
        const n = wall.points.length - 1;

        // Generiamo i lati completi (escludendo i cap adattati che gestisce il chiamante)
        const sides = this.calculateWallSides(wall); // Helper che restituisce {leftSide, rightSide}

        if (isStart) {
            // Se il muro inizia qui, la "punta" lontana è all'indice n
            if (enterFromLeft) {
                // Percorso: L[1] -> ... -> L[n] -> R[n] -> ... -> R[1]
                return [...sides.leftSide.slice(1), ...sides.rightSide.slice(1).reverse()];
            } else {
                // Percorso: R[1] -> ... -> R[n] -> L[n] -> ... -> L[1]
                return [...sides.rightSide.slice(1), ...sides.leftSide.slice(1).reverse()];
            }
        } else {
            // Se il muro finisce qui, la "punta" lontana è all'indice 0
            if (enterFromLeft) {
                // Percorso: L[n-1] -> ... -> L[0] -> R[0] -> ... -> R[n-1]
                return [...sides.leftSide.slice(0, n).reverse(), ...sides.rightSide.slice(0, n)];
            } else {
                // Percorso: R[n-1] -> ... -> R[0] -> L[0] -> ... -> L[n-1]
                return [...sides.rightSide.slice(0, n).reverse(), ...sides.leftSide.slice(0, n)];
            }
        }
    }

    /**
 * Helper per estrarre i lati sinistro e destro del muro.
 * Sfrutta il calcolo delle normali e dei miter joins già presente nella classe Wall.
 * * @param {Wall} wall - L'istanza del muro da analizzare
 * @returns {{leftSide: Array<{x,y}>, rightSide: Array<{x,y}>}}
 */
    calculateWallSides(wall) {
        // getThicknessLines restituisce un array di: 
        // { center: {x,y}, left: {x,y}, right: {x,y}, normal: {x,y} }
        const thicknessLines = wall.getThicknessLines();

        if (thicknessLines.length === 0) {
            return { leftSide: [], rightSide: [] };
        }

        return {
            // Estraiamo solo le coordinate x,y per i due lati
            leftSide: thicknessLines.map(line => ({ x: line.left.x, y: line.left.y })),
            rightSide: thicknessLines.map(line => ({ x: line.right.x, y: line.right.y }))
        };
    }


    /**
     * Remove duplicate consecutive points from a polygon
     */
    removeDuplicateConsecutivePoints(polygon) {
        if (polygon.length < 2) return polygon;

        const result = [polygon[0]];
        for (let i = 1; i < polygon.length; i++) {
            if (!this.pointsEqual(polygon[i], result[result.length - 1])) {
                result.push(polygon[i]);
            }
        }

        // Check first and last
        if (result.length > 1 && this.pointsEqual(result[0], result[result.length - 1])) {
            result.pop();
        }

        return result;
    }

    // ========================================================================
    // POLYGON OVERLAP DETECTION AND RESOLUTION
    // ========================================================================

    /**
     * Find intersection points between two polygon edges
     * @param {Array<{x,y}>} polyA - First polygon vertices
     * @param {Array<{x,y}>} polyB - Second polygon vertices
     * @returns {Array<{point: {x,y}, edgeA: number, edgeB: number, tA: number, tB: number}>}
     */
    findPolygonIntersections(polyA, polyB) {
        const intersections = [];

        for (let i = 0; i < polyA.length; i++) {
            const a1 = polyA[i];
            const a2 = polyA[(i + 1) % polyA.length];

            for (let j = 0; j < polyB.length; j++) {
                const b1 = polyB[j];
                const b2 = polyB[(j + 1) % polyB.length];

                const intersection = this.segmentIntersection(a1, a2, b1, b2);
                if (intersection) {
                    // Check if this intersection is not at a shared vertex
                    const isAtVertexA = (intersection.tA < this.EPSILON || intersection.tA > 1 - this.EPSILON);
                    const isAtVertexB = (intersection.tB < this.EPSILON || intersection.tB > 1 - this.EPSILON);

                    // Only add if it's a proper intersection (not at endpoints that might be shared)
                    if (!this.isDuplicateIntersection(intersections, intersection.point)) {
                        intersections.push({
                            point: intersection.point,
                            edgeA: i,
                            edgeB: j,
                            tA: intersection.tA,
                            tB: intersection.tB
                        });
                    }
                }
            }
        }

        return intersections;
    }

    /**
     * Check if an intersection point is a duplicate
     */
    isDuplicateIntersection(intersections, point) {
        for (const inter of intersections) {
            if (this.pointsEqual(inter.point, point)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Find intersection between two line segments
     * @returns {{point: {x,y}, tA: number, tB: number}|null}
     */
    segmentIntersection(a1, a2, b1, b2) {
        const dx1 = a2.x - a1.x;
        const dy1 = a2.y - a1.y;
        const dx2 = b2.x - b1.x;
        const dy2 = b2.y - b1.y;

        const denom = dx1 * dy2 - dy1 * dx2;

        // Parallel or coincident
        if (Math.abs(denom) < this.EPSILON) {
            return null;
        }

        const dx3 = b1.x - a1.x;
        const dy3 = b1.y - a1.y;

        const tA = (dx3 * dy2 - dy3 * dx2) / denom;
        const tB = (dx3 * dy1 - dy3 * dx1) / denom;

        // Check if intersection is within both segments
        if (tA >= -this.EPSILON && tA <= 1 + this.EPSILON &&
            tB >= -this.EPSILON && tB <= 1 + this.EPSILON) {
            return {
                point: {
                    x: a1.x + tA * dx1,
                    y: a1.y + tA * dy1
                },
                tA: Math.max(0, Math.min(1, tA)),
                tB: Math.max(0, Math.min(1, tB))
            };
        }

        return null;
    }

    /**
     * Check if a point is inside a polygon (ray casting)
     */
    pointInPolygon(point, polygon) {
        let inside = false;
        const n = polygon.length;

        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;

            if (((yi > point.y) !== (yj > point.y)) &&
                (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }

        return inside;
    }

    /**
     * Check if two polygons overlap
     * @returns {{valid: boolean, intersections: Array, error: string|null}}
     */
    checkPolygonOverlap(polyA, polyB) {
        const intersections = this.findPolygonIntersections(polyA, polyB);

        // No intersections - check if one is inside the other
        if (intersections.length === 0) {
            const aInsideB = this.pointInPolygon(polyA[0], polyB);
            const bInsideA = this.pointInPolygon(polyB[0], polyA);

            if (aInsideB || bInsideA) {
                return {
                    valid: false,
                    intersections: [],
                    error: 'One polygon is completely inside the other'
                };
            }

            // No overlap
            return {
                valid: true,
                intersections: [],
                error: null,
                hasOverlap: false
            };
        }

        // Exactly 2 intersections - valid overlap
        if (intersections.length === 2) {
            return {
                valid: true,
                intersections: intersections,
                error: null,
                hasOverlap: true
            };
        }

        // More or less than 2 intersections - complex overlap, invalid
        return {
            valid: false,
            intersections: intersections,
            error: `Complex overlap detected (${intersections.length} intersection points). Only simple overlaps with exactly 2 intersection points are supported.`
        };
    }

    /**
     * Split two overlapping polygons along their intersection line
     * Creates two contiguous polygons that share an edge
     * @param {Array<{x,y}>} polyA
     * @param {Array<{x,y}>} polyB
     * @param {Array} intersections - Array with exactly 2 intersection points
     * @returns {{polyA: Array<{x,y}>, polyB: Array<{x,y}>}}
     */
    splitOverlappingPolygons(polyA, polyB, intersections) {
        if (intersections.length !== 2) {
            throw new Error('splitOverlappingPolygons requires exactly 2 intersection points');
        }

        const p1 = intersections[0];
        const p2 = intersections[1];

        // Build new polygon A: keep vertices outside of B, add intersection points
        const newPolyA = this.buildSplitPolygon(polyA, polyB, p1, p2, false);

        // Build new polygon B: keep vertices outside of A, add intersection points
        const newPolyB = this.buildSplitPolygon(polyB, polyA, p1, p2, true);

        return { polyA: newPolyA, polyB: newPolyB };
    }

    /**
     * Build a new polygon by keeping vertices outside the other polygon
     * and inserting intersection points
     */
    buildSplitPolygon(poly, otherPoly, inter1, inter2, reverseIntersectionOrder) {
        const result = [];
        const n = poly.length;

        // Sort intersections by edge index and parameter
        let sortedInters = [inter1, inter2].sort((a, b) => {
            const edgeKeyA = a.edgeA !== undefined ? a.edgeA : a.edgeB;
            const edgeKeyB = b.edgeA !== undefined ? b.edgeA : b.edgeB;
            const tKeyA = a.edgeA !== undefined ? a.tA : a.tB;
            const tKeyB = b.edgeA !== undefined ? b.tA : b.tB;

            if (edgeKeyA !== edgeKeyB) return edgeKeyA - edgeKeyB;
            return tKeyA - tKeyB;
        });

        // Determine which intersection points to use based on which polygon we're building
        const edgeKey = inter1.edgeA !== undefined ? 'edgeA' : 'edgeB';
        const tKey = inter1.edgeA !== undefined ? 'tA' : 'tB';

        // Get edge indices for this polygon
        const edge1 = inter1[edgeKey];
        const edge2 = inter2[edgeKey];
        const t1 = inter1[tKey];
        const t2 = inter2[tKey];

        // Insert intersection points and filter out vertices inside the other polygon
        let insertedFirst = false;
        let insertedSecond = false;

        for (let i = 0; i < n; i++) {
            const vertex = poly[i];
            const nextI = (i + 1) % n;

            // Check if current vertex is outside the other polygon
            const isOutside = !this.pointInPolygon(vertex, otherPoly);

            if (isOutside) {
                result.push({ x: vertex.x, y: vertex.y });
            }

            // Check if we need to insert intersection points after this edge
            if (i === edge1 && !insertedFirst) {
                if (reverseIntersectionOrder) {
                    result.push({ x: inter2.point.x, y: inter2.point.y });
                    insertedSecond = true;
                } else {
                    result.push({ x: inter1.point.x, y: inter1.point.y });
                    insertedFirst = true;
                }
            }

            if (i === edge2 && !insertedSecond) {
                if (reverseIntersectionOrder) {
                    result.push({ x: inter1.point.x, y: inter1.point.y });
                    insertedFirst = true;
                } else {
                    result.push({ x: inter2.point.x, y: inter2.point.y });
                    insertedSecond = true;
                }
            }
        }

        // Remove duplicate consecutive vertices
        return this.removeDuplicateConsecutive(result);
    }

    // ========================================================================
    // WALL-TO-VERTEX CONNECTION: OPEN VERTICES
    // ========================================================================

    /**
     * Modify polygon vertices to "open" them where walls connect to vertices.
     * When a wall connects to a polygon vertex, the vertex is replaced by
     * the two cap projection points, creating a connection opening.
     *
     * @param {Array<{id: string, vertices: Array<{x,y}>}>} polygons - Array of polygon objects
     * @param {Array<Wall>} walls - Array of walls to check for vertex connections
     * @param {MapData} mapData - MapData instance for adjacent edge lookups
     * @returns {{modified: Array<{id: string, vertices: Array<{x,y}>}>, errors: Array<string>}}
     */
    openVerticesForWallConnections(polygons, walls, mapData) {
        // Create a deep copy to modify
        const modified = polygons.map(p => ({
            id: p.id,
            vertices: p.vertices.map(v => ({ x: v.x, y: v.y }))
        }));
        const errors = [];

        // Collect all vertex connections per polygon
        // Map: polygonId -> Map: vertexIndex -> Array of cap projections
        const vertexConnections = new Map();

        for (const wall of walls) {
            // Check start snap
            if (wall.startSnap && wall.startSnap.snapType === 'vertex') {
                const snap = wall.startSnap;
                // Only process building/obstacle/outer connections (not wall endpoints)
                if (snap.type === 'building' || snap.type === 'obstacle' || snap.type === 'outer') {
                    const key = snap.type === 'outer' ? '__outer__' : snap.targetId;
                    const projection = this.calculateWallCapProjection(wall, true, mapData);

                    if (projection) {
                        if (!vertexConnections.has(key)) {
                            vertexConnections.set(key, new Map());
                        }
                        const vertexMap = vertexConnections.get(key);
                        if (!vertexMap.has(snap.vertexIndex)) {
                            vertexMap.set(snap.vertexIndex, []);
                        }
                        vertexMap.get(snap.vertexIndex).push(projection);
                    } else {
                        errors.push(`Failed to calculate cap projection for wall ${wall.id} start`);
                    }
                }
            }

            // Check end snap
            if (wall.endSnap && wall.endSnap.snapType === 'vertex') {
                const snap = wall.endSnap;
                if (snap.type === 'building' || snap.type === 'obstacle' || snap.type === 'outer') {
                    const key = snap.type === 'outer' ? '__outer__' : snap.targetId;
                    const projection = this.calculateWallCapProjection(wall, false, mapData);

                    if (projection) {
                        if (!vertexConnections.has(key)) {
                            vertexConnections.set(key, new Map());
                        }
                        const vertexMap = vertexConnections.get(key);
                        if (!vertexMap.has(snap.vertexIndex)) {
                            vertexMap.set(snap.vertexIndex, []);
                        }
                        vertexMap.get(snap.vertexIndex).push(projection);
                    } else {
                        errors.push(`Failed to calculate cap projection for wall ${wall.id} end`);
                    }
                }
            }
        }

        // Now apply vertex openings to each polygon
        for (const polygon of modified) {
            const key = polygon.id;
            const vertexMap = vertexConnections.get(key);
            if (!vertexMap) continue;

            // Sort vertex indices in descending order to avoid index shifting issues
            const indices = Array.from(vertexMap.keys()).sort((a, b) => b - a);

            for (const vertexIndex of indices) {
                const projections = vertexMap.get(vertexIndex);
                // For now, handle single wall connection. Multiple connections would need merging.
                if (projections.length === 1) {
                    const proj = projections[0];
                    // Replace vertex with the two cap points
                    // Order matters: we insert left then right in the polygon order
                    polygon.vertices.splice(vertexIndex, 1, proj.left, proj.right);
                } else {
                    // Multiple walls connecting to same vertex - this requires more complex merging
                    errors.push(`Multiple walls connecting to same vertex (polygon ${key}, vertex ${vertexIndex}). Not yet supported.`);
                }
            }
        }

        return { modified, errors };
    }

    /**
     * Modify polygon edges to "open" them where walls connect via edge snap.
     * When a wall connects to a polygon edge, the edge is split by inserting
     * the wall cap intersection points as new vertices.
     *
     * @param {Array<{id: string, vertices: Array<{x,y}>}>} polygons - Array of polygon objects
     * @param {Array<Wall>} walls - Array of walls to check for edge connections
     * @param {MapData} mapData - MapData instance for lookups
     * @returns {{modified: Array<{id: string, vertices: Array<{x,y}>}>, errors: Array<string>}}
     */
    openEdgesForWallConnections(polygons, walls, mapData) {
        // Create a deep copy to modify
        const modified = polygons.map(p => ({
            id: p.id,
            vertices: p.vertices.map(v => ({ x: v.x, y: v.y }))
        }));
        const errors = [];

        // Collect all edge connections per polygon
        // Map: polygonId -> Array of {edgeIndex, leftPoint, rightPoint, wallId}
        const edgeConnections = new Map();

        for (const wall of walls) {
            // Check start snap
            if (wall.startSnap && wall.startSnap.snapType === 'edge') {
                const snap = wall.startSnap;
                if (snap.type === 'building' || snap.type === 'obstacle') {
                    const capPoints = this.calculateWallCapProjectionForEdge(wall, true, mapData);
                    if (capPoints) {
                        const key = snap.targetId;
                        if (!edgeConnections.has(key)) {
                            edgeConnections.set(key, []);
                        }
                        // Find which edge the snap is on
                        const polygon = modified.find(p => p.id === key);
                        if (polygon) {
                            const edgeIndex = this.findEdgeIndex(polygon.vertices, snap.edge);
                            if (edgeIndex !== -1) {
                                edgeConnections.get(key).push({
                                    edgeIndex,
                                    leftPoint: capPoints.left,
                                    rightPoint: capPoints.right,
                                    wallId: wall.id,
                                    snapEdge: snap.edge
                                });
                            }
                        }
                    } else {
                        errors.push(`Failed to calculate edge cap projection for wall ${wall.id} start`);
                    }
                }
            }

            // Check end snap
            if (wall.endSnap && wall.endSnap.snapType === 'edge') {
                const snap = wall.endSnap;
                if (snap.type === 'building' || snap.type === 'obstacle') {
                    const capPoints = this.calculateWallCapProjectionForEdge(wall, false, mapData);
                    if (capPoints) {
                        const key = snap.targetId;
                        if (!edgeConnections.has(key)) {
                            edgeConnections.set(key, []);
                        }
                        // Find which edge the snap is on
                        const polygon = modified.find(p => p.id === key);
                        if (polygon) {
                            const edgeIndex = this.findEdgeIndex(polygon.vertices, snap.edge);
                            if (edgeIndex !== -1) {
                                edgeConnections.get(key).push({
                                    edgeIndex,
                                    leftPoint: capPoints.left,
                                    rightPoint: capPoints.right,
                                    wallId: wall.id,
                                    snapEdge: snap.edge
                                });
                            }
                        }
                    } else {
                        errors.push(`Failed to calculate edge cap projection for wall ${wall.id} end`);
                    }
                }
            }
        }

        // Now apply edge openings to each polygon
        for (const polygon of modified) {
            const connections = edgeConnections.get(polygon.id);
            if (!connections || connections.length === 0) continue;

            // Group connections by edge index
            const edgeMap = new Map();
            for (const conn of connections) {
                if (!edgeMap.has(conn.edgeIndex)) {
                    edgeMap.set(conn.edgeIndex, []);
                }
                edgeMap.get(conn.edgeIndex).push(conn);
            }

            // Sort edge indices in descending order to avoid index shifting issues
            const sortedEdges = Array.from(edgeMap.keys()).sort((a, b) => b - a);

            for (const edgeIndex of sortedEdges) {
                const edgeConns = edgeMap.get(edgeIndex);
                const edge = {
                    p1: polygon.vertices[edgeIndex],
                    p2: polygon.vertices[(edgeIndex + 1) % polygon.vertices.length]
                };

                // Collect all points to insert on this edge
                const pointsToInsert = [];
                for (const conn of edgeConns) {
                    // Calculate parameter t along the edge for each point
                    const tLeft = this.getParameterOnEdge(conn.leftPoint, edge.p1, edge.p2);
                    const tRight = this.getParameterOnEdge(conn.rightPoint, edge.p1, edge.p2);

                    pointsToInsert.push({ point: conn.leftPoint, t: tLeft });
                    pointsToInsert.push({ point: conn.rightPoint, t: tRight });
                }

                // Sort points by parameter t (distance along edge)
                pointsToInsert.sort((a, b) => a.t - b.t);

                // Remove duplicate points (same t value)
                const uniquePoints = [];
                for (const p of pointsToInsert) {
                    if (uniquePoints.length === 0 || Math.abs(p.t - uniquePoints[uniquePoints.length - 1].t) > 0.001) {
                        uniquePoints.push(p);
                    }
                }

                // Insert points into the polygon (after edgeIndex, before edgeIndex+1)
                // We insert in reverse order of t so indices don't shift
                const insertIndex = edgeIndex + 1;
                for (let i = uniquePoints.length - 1; i >= 0; i--) {
                    polygon.vertices.splice(insertIndex, 0, { ...uniquePoints[i].point });
                }
            }
        }

        return { modified, errors };
    }

    /**
     * Calculate the cap projection points for a wall endpoint with edge snap
     */
    calculateWallCapProjectionForEdge(wall, isStart, mapData) {
        if (wall.points.length < 2) return null;

        const snap = isStart ? wall.startSnap : wall.endSnap;
        if (!snap || snap.snapType !== 'edge' || !snap.edge) return null;

        // Get the endpoint and direction
        let p1, p2;
        if (isStart) {
            p1 = wall.points[0];
            p2 = wall.points[1];
        } else {
            p1 = wall.points[wall.points.length - 1];
            p2 = wall.points[wall.points.length - 2];
        }

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length < 0.001) return null;

        const dir = { x: dx / length, y: dy / length };
        const normal = { x: -dir.y, y: dir.x };
        const halfThickness = wall.thickness / 2;

        // Use the wall's adaptCapToEdge method
        const adapted = wall.adaptCapToEdge(p1, dir, normal, halfThickness, snap.edge, isStart);

        return { left: adapted.left, right: adapted.right };
    }

    /**
     * Find the index of an edge in a polygon by matching its endpoints
     */
    findEdgeIndex(vertices, edge) {
        for (let i = 0; i < vertices.length; i++) {
            const p1 = vertices[i];
            const p2 = vertices[(i + 1) % vertices.length];

            // Check if this edge matches (in either direction)
            if ((this.pointsEqual(p1, edge.p1) && this.pointsEqual(p2, edge.p2)) ||
                (this.pointsEqual(p1, edge.p2) && this.pointsEqual(p2, edge.p1))) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Get the parameter t (0-1) of a point along an edge
     */
    getParameterOnEdge(point, edgeP1, edgeP2) {
        const dx = edgeP2.x - edgeP1.x;
        const dy = edgeP2.y - edgeP1.y;
        const lengthSq = dx * dx + dy * dy;

        if (lengthSq < 0.001) return 0;

        const t = ((point.x - edgeP1.x) * dx + (point.y - edgeP1.y) * dy) / lengthSq;
        return Math.max(0, Math.min(1, t));
    }

    /**
     * Validate all wall connections and return any errors
     * This can be called before baking to check for issues
     *
     * @param {Array<Wall>} walls - Array of walls to validate
     * @param {MapData} mapData - MapData instance for lookups
     * @returns {{valid: boolean, errors: Array<{wallId: string, endpoint: string, error: string}>}}
     */
    validateWallConnections(walls, mapData) {
        const errors = [];
        const vertexConnectionCount = new Map(); // key -> count

        for (const wall of walls) {
            // Validate start snap
            if (wall.startSnap && wall.startSnap.snapType === 'vertex') {
                const snap = wall.startSnap;

                if (snap.type === 'building' || snap.type === 'obstacle' || snap.type === 'outer') {
                    // Track vertex connections for multiple connection detection
                    const key = `${snap.type}:${snap.targetId || 'outer'}:${snap.vertexIndex}`;
                    vertexConnectionCount.set(key, (vertexConnectionCount.get(key) || 0) + 1);

                    // Validate cap projection
                    const projection = this.calculateWallCapProjection(wall, true, mapData);
                    if (!projection) {
                        errors.push({
                            wallId: wall.id,
                            endpoint: 'start',
                            error: 'Cap projection failed - wall may be too thick or angled incorrectly for this vertex'
                        });
                    }
                }
            }

            // Validate end snap
            if (wall.endSnap && wall.endSnap.snapType === 'vertex') {
                const snap = wall.endSnap;

                if (snap.type === 'building' || snap.type === 'obstacle' || snap.type === 'outer') {
                    const key = `${snap.type}:${snap.targetId || 'outer'}:${snap.vertexIndex}`;
                    vertexConnectionCount.set(key, (vertexConnectionCount.get(key) || 0) + 1);

                    const projection = this.calculateWallCapProjection(wall, false, mapData);
                    if (!projection) {
                        errors.push({
                            wallId: wall.id,
                            endpoint: 'end',
                            error: 'Cap projection failed - wall may be too thick or angled incorrectly for this vertex'
                        });
                    }
                }
            }
        }

        // Check for multiple walls connecting to same vertex
        for (const [key, count] of vertexConnectionCount) {
            if (count > 1) {
                const [type, targetId, vertexIndex] = key.split(':');
                errors.push({
                    wallId: 'multiple',
                    endpoint: 'vertex',
                    error: `${count} walls connect to the same vertex (${type} ${targetId}, vertex ${vertexIndex}). Multiple connections to a single vertex are not yet supported.`
                });
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Calculate the cap projection points for a wall endpoint
     * @param {Wall} wall
     * @param {boolean} isStart - true for start cap, false for end cap
     * @param {MapData} mapData
     * @returns {{left: {x,y}, right: {x,y}}|null}
     */
    calculateWallCapProjection(wall, isStart, mapData) {
        if (wall.points.length < 2) return null;

        const snap = isStart ? wall.startSnap : wall.endSnap;
        if (!snap || snap.snapType !== 'vertex') return null;

        // Get the endpoint and direction
        let p1, p2;
        if (isStart) {
            p1 = wall.points[0];
            p2 = wall.points[1];
        } else {
            p1 = wall.points[wall.points.length - 1];
            p2 = wall.points[wall.points.length - 2];
        }

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length < 0.001) return null;

        const dir = { x: dx / length, y: dy / length };
        const normal = { x: -dir.y, y: dir.x };
        const halfThickness = wall.thickness / 2;

        // Get adjacent edges info
        const vertexInfo = mapData.getAdjacentEdges(snap.type, snap.targetId, snap.vertexIndex);
        if (!vertexInfo) return null;

        // Use the wall's adaptCapToVertex method
        const adapted = wall.adaptCapToVertex(p1, dir, normal, halfThickness, vertexInfo, isStart);

        if (adapted.valid) {
            return { left: adapted.left, right: adapted.right };
        }

        return null;
    }

    /**
     * Process all building overlaps and return resolved polygons
     * @param {Array<{id: string, vertices: Array<{x,y}>}>} buildings
     * @returns {{resolved: Array<{id: string, vertices: Array<{x,y}>}>, errors: Array<{ids: Array, error: string}>}}
     */
    resolveAllOverlaps(buildings) {
        const resolved = buildings.map(b => ({
            id: b.id,
            vertices: [...b.vertices.map(v => ({ x: v.x, y: v.y }))]
        }));
        const errors = [];

        // Check each pair of buildings
        for (let i = 0; i < resolved.length; i++) {
            for (let j = i + 1; j < resolved.length; j++) {
                const result = this.checkPolygonOverlap(resolved[i].vertices, resolved[j].vertices);

                if (!result.valid) {
                    errors.push({
                        ids: [resolved[i].id, resolved[j].id],
                        error: result.error
                    });
                    continue;
                }

                if (result.hasOverlap && result.intersections.length === 2) {
                    // Split the polygons
                    const split = this.splitOverlappingPolygons(
                        resolved[i].vertices,
                        resolved[j].vertices,
                        result.intersections
                    );

                    resolved[i].vertices = split.polyA;
                    resolved[j].vertices = split.polyB;
                }
            }
        }

        return { resolved, errors };
    }
}
