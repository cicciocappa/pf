/**
 * Geometry utilities for NavMesh generation
 * - Polygon operations using Clipper.js
 * - Triangulation using poly2tri
 * - Hertel-Mehlhorn algorithm for convex polygon merging
 */
export class Geometry {
    constructor() {
        this.EPSILON = 1e-6;
        this.SCALE = 1000; // Scale factor for Clipper (uses integers)
    }

    /**
     * Compare two points with tolerance (used by Hertel-Mehlhorn)
     */
    pointsEqual(p1, p2) {
        return Math.abs(p1.x - p2.x) < 0.5 && Math.abs(p1.y - p2.y) < 0.5;
    }

    /**
     * Remove duplicate consecutive vertices from polygon
     */
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

    /**
     * Check if a point is inside a polygon using ray-casting
     */
    static isPointInPolygon(x, y, vertices) {
        const pt = { X: Math.round(x * 1000), Y: Math.round(y * 1000) };
        const path = vertices.map(v => ({ X: Math.round(v.x * 1000), Y: Math.round(v.y * 1000) }));

        // Ritorna: 0 se fuori, -1 se sul bordo, 1 se dentro
        return ClipperLib.Clipper.PointInPolygon(pt, path) !== 0;
    }

    /**
     * Calculate signed area of a polygon
     * Positive = counter-clockwise, Negative = clockwise
     */
    signedArea(polygon) {
        let area = 0;
        for (let i = 0; i < polygon.length; i++) {
            const j = (i + 1) % polygon.length;
            area += polygon[i].x * polygon[j].y;
            area -= polygon[j].x * polygon[i].y;
        }
        return area / 2;
    }

    /**
     * Ensure polygon has counter-clockwise winding (for outer boundary)
     */
    ensureCCW(polygon) {
        const cleaned = this.cleanPolygon(polygon);
        if (this.signedArea(cleaned) < 0) {
            return cleaned.reverse();
        }
        return cleaned;
    }

    /**
     * Ensure polygon has clockwise winding (for holes)
     */
    ensureCW(polygon) {
        const cleaned = this.cleanPolygon(polygon);
        if (this.signedArea(cleaned) > 0) {
            return cleaned.reverse();
        }
        return cleaned;
    }

    /**
     * Remove duplicate and nearly-duplicate points from polygon
     */
    cleanPolygon(polygon) {
        if (polygon.length < 3) return polygon;

        const result = [];
        for (let i = 0; i < polygon.length; i++) {
            const p = polygon[i];
            const prev = result.length > 0 ? result[result.length - 1] : null;

            // Skip if too close to previous point
            if (prev && Math.abs(p.x - prev.x) < this.EPSILON && Math.abs(p.y - prev.y) < this.EPSILON) {
                continue;
            }
            result.push({ x: p.x, y: p.y });
        }

        // Check if last point is too close to first
        if (result.length > 1) {
            const first = result[0];
            const last = result[result.length - 1];
            if (Math.abs(first.x - last.x) < this.EPSILON && Math.abs(first.y - last.y) < this.EPSILON) {
                result.pop();
            }
        }

        return result;
    }

    /**
     * Convert polygon to Clipper path format (scaled integers)
     */
    toClipperPath(polygon) {
        return polygon.map(p => ({
            X: Math.round(p.x * this.SCALE),
            Y: Math.round(p.y * this.SCALE)
        }));
    }

    /**
     * Convert Clipper path back to polygon format
     */
    fromClipperPath(path) {
        return path.map(p => ({
            x: p.X / this.SCALE,
            y: p.Y / this.SCALE
        }));
    }

    /**
     * Union multiple polygons using Clipper
     * @param {Array<Array<{x,y}>>} polygons - Array of polygons to union
     * @returns {Array<Array<{x,y}>>} - Array of resulting polygons (may be multiple if disjoint)
     */
    unionPolygons(polygons) {
        if (polygons.length === 0) return [];
        if (polygons.length === 1) return [this.cleanPolygon(polygons[0])];

        const cpr = new ClipperLib.Clipper();

        // Add all polygons as subjects (union them all together)
        for (let i = 0; i < polygons.length; i++) {
            const path = this.toClipperPath(polygons[i]);
            cpr.AddPath(path, ClipperLib.PolyType.ptSubject, true);
        }

        const solution = new ClipperLib.Paths();
        cpr.Execute(
            ClipperLib.ClipType.ctUnion,
            solution,
            ClipperLib.PolyFillType.pftNonZero,
            ClipperLib.PolyFillType.pftNonZero
        );

        // Convert back to our format and clean
        return solution.map(path => this.cleanPolygon(this.fromClipperPath(path)));
    }

    /**
     * Find connected groups of elements based on connections
     * @param {Map} walls - Map of walls
     * @param {Map} buildings - Map of buildings
     * @param {Map} obstacles - Map of obstacles
     * @param {Array} connections - Array of connection objects
     * @returns {Array<{walls: Set, buildings: Set, obstacles: Set}>}
     */
    findConnectedGroups(walls, buildings, obstacles, connections) {
        // Build adjacency map from connections
        const adjacency = new Map();

        const addEdge = (id1, id2) => {
            if (!adjacency.has(id1)) adjacency.set(id1, new Set());
            if (!adjacency.has(id2)) adjacency.set(id2, new Set());
            adjacency.get(id1).add(id2);
            adjacency.get(id2).add(id1);
        };

        // Process connections
        for (const conn of connections) {
            if (conn.wallId && conn.targetId) {
                addEdge(conn.wallId, conn.targetId);
            }
            if (conn.wallId && conn.targetWallId) {
                addEdge(conn.wallId, conn.targetWallId);
            }
        }

        // Add all elements to adjacency (even if not connected)
        for (const wall of walls.values()) {
            if (!adjacency.has(wall.id)) adjacency.set(wall.id, new Set());
        }
        for (const building of buildings.values()) {
            if (!adjacency.has(building.id)) adjacency.set(building.id, new Set());
        }
        for (const obstacle of obstacles.values()) {
            if (!adjacency.has(obstacle.id)) adjacency.set(obstacle.id, new Set());
        }

        // Find connected components using DFS
        const visited = new Set();
        const groups = [];

        const dfs = (startId, group) => {
            const stack = [startId];
            while (stack.length > 0) {
                const id = stack.pop();
                if (visited.has(id)) continue;
                visited.add(id);

                // Categorize by type
                if (walls.has(id)) group.walls.add(id);
                else if (buildings.has(id)) group.buildings.add(id);
                else if (obstacles.has(id)) group.obstacles.add(id);

                // Visit neighbors
                const neighbors = adjacency.get(id) || new Set();
                for (const neighborId of neighbors) {
                    if (!visited.has(neighborId)) {
                        stack.push(neighborId);
                    }
                }
            }
        };

        for (const id of adjacency.keys()) {
            if (!visited.has(id)) {
                const group = { walls: new Set(), buildings: new Set(), obstacles: new Set() };
                dfs(id, group);
                groups.push(group);
            }
        }

        return groups;
    }

    /**
     * Get polygons for a connected group and union them
     * @param {Object} group - {walls: Set, buildings: Set, obstacles: Set}
     * @param {Map} wallsMap
     * @param {Map} buildingsMap
     * @param {Map} obstaclesMap
     * @returns {Array<Array<{x,y}>>} - Merged polygon(s)
     */
    mergeGroupPolygons(group, wallsMap, buildingsMap, obstaclesMap) {
        const polygons = [];

        // Add building polygons
        for (const buildingId of group.buildings) {
            const building = buildingsMap.get(buildingId);
            if (building) {
                const vertices = building.getVertices().map(v => ({ x: v.x, y: v.y }));
                if (vertices.length >= 3) {
                    polygons.push(this.ensureCCW(vertices));
                }
            }
        }

        // Add obstacle polygons
        for (const obstacleId of group.obstacles) {
            const obstacle = obstaclesMap.get(obstacleId);
            if (obstacle) {
                const vertices = obstacle.getVertices().map(v => ({ x: v.x, y: v.y }));
                if (vertices.length >= 3) {
                    polygons.push(this.ensureCCW(vertices));
                }
            }
        }

        // Add wall unit polygons
        for (const wallId of group.walls) {
            const wall = wallsMap.get(wallId);
            if (wall && wall.units) {
                for (const unit of wall.units) {
                    const vertices = unit.vertices.map(v => ({ x: v.x, y: v.y }));
                    if (vertices.length >= 3) {
                        polygons.push(this.ensureCCW(vertices));
                    }
                }
            }
        }

        if (polygons.length === 0) return [];
        if (polygons.length === 1) return polygons;

        // Union all polygons in the group
        return this.unionPolygons(polygons);
    }

    /**
     * Slightly shrink a polygon to avoid edge-touching issues with poly2tri
     */
    shrinkPolygon(polygon, amount = 0.1) {
        // Calculate centroid
        let cx = 0, cy = 0;
        for (const p of polygon) {
            cx += p.x;
            cy += p.y;
        }
        cx /= polygon.length;
        cy /= polygon.length;

        // Shrink towards centroid
        return polygon.map(p => ({
            x: p.x + (cx - p.x) * amount,
            y: p.y + (cy - p.y) * amount
        }));
    }

    /**
     * Triangulate a polygon with holes using poly2tri
     * @param {Array<{x,y}>} outer - Counter-clockwise outer boundary
     * @param {Array<Array<{x,y}>>} holes - Clockwise hole polygons
     * @returns {Array<Array<{x,y}>>} - Array of triangles (each is array of 3 vertices)
     */
    triangulate(outer, holes) {
        // Clean and validate outer polygon
        const cleanedOuter = this.cleanPolygon(outer);
        if (cleanedOuter.length < 3) {
            console.error('Outer polygon has less than 3 vertices');
            return [];
        }

        // Create poly2tri contour from outer polygon
        const contour = cleanedOuter.map(p => new poly2tri.Point(p.x, p.y));

        let swctx;
        try {
            swctx = new poly2tri.SweepContext(contour);
        } catch (e) {
            console.error('Error creating SweepContext:', e);
            return [];
        }

        // Add holes - slightly shrink them to avoid touching edges
        for (let i = 0; i < holes.length; i++) {
            const hole = holes[i];
            if (hole.length < 3) continue;

            const cleanedHole = this.cleanPolygon(hole);
            if (cleanedHole.length < 3) continue;

            // Shrink hole slightly to avoid edge-touching
            const shrunkHole = this.shrinkPolygon(cleanedHole, 0.001);

            try {
                const holeContour = shrunkHole.map(p => new poly2tri.Point(p.x, p.y));
                swctx.addHole(holeContour);
            } catch (e) {
                console.warn(`Error adding hole ${i}:`, e);
                // Continue with other holes
            }
        }

        // Triangulate
        try {
            swctx.triangulate();
        } catch (e) {
            console.error('Triangulation error:', e);
            return [];
        }

        const triangles = swctx.getTriangles();

        // Convert to our format
        return triangles.map(tri => {
            const points = tri.getPoints();
            return [
                { x: points[0].x, y: points[0].y },
                { x: points[1].x, y: points[1].y },
                { x: points[2].x, y: points[2].y }
            ];
        });
    }

    /**
     * Find shared edge between two polygons (returns the two shared vertices)
     */
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

    /**
     * Check if a polygon is convex
     */
    isConvex(polygon) {
        if (polygon.length < 3) return false;

        let sign = 0;

        for (let i = 0; i < polygon.length; i++) {
            const p0 = polygon[i];
            const p1 = polygon[(i + 1) % polygon.length];
            const p2 = polygon[(i + 2) % polygon.length];

            const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);

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

    /**
     * Merge two polygons that share an edge (Hertel-Mehlhorn style)
     * Walks around both polygons to create a merged result
     */
    mergePolygonsHM(polyA, polyB, sharedEdge) {
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

        // Walk polyA from idxA1 to idxA2
        while (current !== idxA2) {
            result.push({ ...polyA[current] });
            current = (current + 1) % nA;
        }

        // Walk polyB from idxB2 to idxB1
        current = idxB2;
        const nB = polyB.length;

        while (current !== idxB1) {
            result.push({ ...polyB[current] });
            current = (current + 1) % nB;
        }

        return this.removeDuplicateConsecutive(result);
    }

    /**
     * Hertel-Mehlhorn algorithm to merge triangles into convex polygons
     * @param {Array<Array<{x,y}>>} triangles - Array of triangles
     * @returns {Array<Array<{x,y}>>} - Array of convex polygons
     */
    hertelMehlhorn(triangles) {
        if (triangles.length === 0) return [];

        // Copy triangles as initial polygons with IDs for tracking
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
                        const merged = this.mergePolygonsHM(polygons[i].vertices, polygons[j].vertices, sharedEdge);

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

    /**
     * Complete NavMesh generation pipeline
     * @param {Array<{x,y}>} outer - Outer boundary (CCW)
     * @param {Array<Array<{x,y}>>} holes - Hole polygons (will be made CW)
     * @param {Object} options - Options for navmesh generation
     * @param {boolean} options.mergeTriangles - Whether to merge triangles into convex polygons (default: true)
     * @returns {{triangles: Array, polygons: Array}}
     */
    generateNavMesh(rawOuter, rawHoles, options = {}) {
        const agentRadius = options.agentRadius || 15;
        const gridStep = options.gridStep || 100;

        // 1. CLEANING: Salda i vertici vicini
        const clean = this.prepareGeometry(rawOuter, rawHoles, 2.0);

        // 2. OFFSET: Espandi gli ostacoli per il raggio dell'agente
        // Questo previene che l'agente sbatta contro i muri e pulisce le micro-fessure
        const offsetHoles = this.offsetHoles(clean.holes, agentRadius);

        // 3. TRIANGOLAZIONE
        const contour = clean.outer.map(p => new poly2tri.Point(p.x, p.y));
        const swctx = new poly2tri.SweepContext(contour);

        // Aggiungi i buchi con offset
        offsetHoles.forEach(hole => {
            swctx.addHole(hole.map(p => new poly2tri.Point(p.x, p.y)));
        });

        // 4. INIEZIONE: Aggiungi i punti di supporto
        this.injectSteinerPoints(swctx, clean.outer, offsetHoles, gridStep);

        swctx.triangulate();
        const triangles = swctx.getTriangles().map(tri => {
            const pts = tri.getPoints();
            return [{ x: pts[0].x, y: pts[0].y }, { x: pts[1].x, y: pts[1].y }, { x: pts[2].x, y: pts[2].y }];
        });

        // 5. MERGING: Hertel-Mehlhorn sui nuovi triangoli regolari
        const polygons = this.hertelMehlhorn(triangles);

        return { triangles, polygons };
    }

    offsetHoles(holes, radius = 15) {
        if (radius <= 0) return holes;

        const co = new ClipperLib.ClipperOffset();
        const offsetPaths = new ClipperLib.Paths();

        // ClipperOffset lavora meglio se riceve tutti i buchi insieme
        const allHolesPaths = new ClipperLib.Paths();
        holes.forEach(hole => {
            allHolesPaths.push(this.toClipperPath(hole));
        });

        // Aggiungiamo i percorsi al gestore dell'offset
        // JoinType.jtMiter crea angoli netti, jtRound crea angoli smussati
        co.AddPaths(allHolesPaths, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);

        // Eseguiamo l'offset. 
        // ATTENZIONE: Se i buchi sono CW, un valore positivo li "gonfia" verso l'esterno
        co.Execute(offsetPaths, radius * this.SCALE);

        const result = [];
        for (let i = 0; i < offsetPaths.length; i++) {
            result.push(this.fromClipperPath(offsetPaths[i]));
        }
        return result;
    }

    injectSteinerPoints(swctx, outer, holes, step = 80) {
        // Calcola i bordi dell'area
        const minX = Math.min(...outer.map(p => p.x));
        const maxX = Math.max(...outer.map(p => p.x));
        const minY = Math.min(...outer.map(p => p.y));
        const maxY = Math.max(...outer.map(p => p.y));

        for (let x = minX + step; x < maxX; x += step) {
            for (let y = minY + step; y < maxY; y += step) {
                // Un punto è valido se è dentro il perimetro e NON è dentro alcun buco
                if (Geometry.isPointInPolygon(x, y, outer)) {
                    let inHole = false;
                    for (const hole of holes) {
                        if (Geometry.isPointInPolygon(x, y, hole)) {
                            inHole = true;
                            break;
                        }
                    }
                    if (!inHole) {
                        swctx.addPoint(new poly2tri.Point(x, y));
                    }
                }
            }
        }
    }

    prepareGeometry(outer, holes, snapDist = 2.0) {
        const scaleDist = snapDist * this.SCALE;

        // 1. Converti in Clipper Paths
        let outerPath = this.toClipperPath(outer);
        let holesPaths = holes.map(h => this.toClipperPath(h));

        // 2. Pulizia sicura
        // JS-Clipper solitamente ha CleanPolygon e CleanPaths come metodi statici di ClipperLib
        try {
            if (typeof ClipperLib.Clipper.CleanPolygon === 'function') {
                outerPath = ClipperLib.Clipper.CleanPolygon(outerPath, scaleDist);
            }

            // Se CleanPaths non esiste, puliamo ogni buco singolarmente
            holesPaths = holesPaths.map(path => {
                return ClipperLib.Clipper.CleanPolygon(path, scaleDist);
            });
        } catch (e) {
            console.warn("Clipper cleaning methods not found, using raw paths", e);
        }

        return {
            outer: this.fromClipperPath(outerPath),
            holes: holesPaths.map(p => this.fromClipperPath(p))
        };
    }

    /**
     * Calculate statistics for polygons
     */
    calculateStats(polygons) {
        if (polygons.length === 0) {
            return { count: 0, minArea: 0, maxArea: 0, avgArea: 0, totalArea: 0 };
        }

        const areas = polygons.map(poly => Math.abs(this.signedArea(poly)));
        const totalArea = areas.reduce((a, b) => a + b, 0);

        return {
            count: polygons.length,
            minArea: Math.min(...areas),
            maxArea: Math.max(...areas),
            avgArea: totalArea / polygons.length,
            totalArea
        };
    }
}
