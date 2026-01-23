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
     * Check if a point is inside a polygon using ray-casting
     */
    static isPointInPolygon(px, py, vertices) {
        if (!vertices || vertices.length < 3) return false;

        let isInside = false;
        for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
            const vi = vertices[i];
            const vj = vertices[j];
            const intersect = ((vi.y > py) !== (vj.y > py)) &&
                (px < (vj.x - vi.x) * (py - vi.y) / (vj.y - vi.y) + vi.x);
            if (intersect) isInside = !isInside;
        }
        return isInside;
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
     * Check if two triangles share an edge
     * @returns {Object|null} - {edge: [idx1, idx2], sharedVertices: [{x,y}, {x,y}]} or null
     */
    getSharedEdge(tri1, tri2) {
        const shared = [];
        const indices1 = [];
        const indices2 = [];

        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (Math.abs(tri1[i].x - tri2[j].x) < this.EPSILON &&
                    Math.abs(tri1[i].y - tri2[j].y) < this.EPSILON) {
                    shared.push({ v1: tri1[i], v2: tri2[j] });
                    indices1.push(i);
                    indices2.push(j);
                }
            }
        }

        if (shared.length === 2) {
            return {
                indices1,
                indices2,
                sharedVertices: [shared[0].v1, shared[1].v1]
            };
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
            const p1 = polygon[i];
            const p2 = polygon[(i + 1) % polygon.length];
            const p3 = polygon[(i + 2) % polygon.length];

            const cross = (p2.x - p1.x) * (p3.y - p2.y) - (p2.y - p1.y) * (p3.x - p2.x);

            if (Math.abs(cross) > this.EPSILON) {
                if (sign === 0) {
                    sign = cross > 0 ? 1 : -1;
                } else if ((cross > 0 ? 1 : -1) !== sign) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Merge two triangles/polygons that share an edge
     * @returns {Array<{x,y}>|null} - Merged polygon or null if can't merge
     */
    mergePolygons(poly1, poly2, sharedEdge) {
        // Find the non-shared vertices and construct merged polygon
        const merged = [];

        // Start from first polygon, skip shared edge
        for (let i = 0; i < poly1.length; i++) {
            const isShared = sharedEdge.indices1.includes(i);
            if (!isShared) {
                merged.push(poly1[i]);
            } else {
                // Add first shared vertex if we haven't added non-shared yet
                if (merged.length > 0 && !sharedEdge.indices1.includes((i + poly1.length - 1) % poly1.length)) {
                    merged.push(poly1[i]);
                }
            }
        }

        // Insert vertices from second polygon (non-shared ones)
        const insertIdx = merged.length;
        for (let i = 0; i < poly2.length; i++) {
            const isShared = sharedEdge.indices2.includes(i);
            if (!isShared) {
                merged.splice(insertIdx, 0, poly2[i]);
            }
        }

        return merged;
    }

    /**
     * Hertel-Mehlhorn algorithm to merge triangles into convex polygons
     * @param {Array<Array<{x,y}>>} triangles - Array of triangles
     * @returns {Array<Array<{x,y}>>} - Array of convex polygons
     */
    hertelMehlhorn(triangles) {
        if (triangles.length === 0) return [];

        // Copy triangles as initial polygons
        let polygons = triangles.map(tri => [...tri]);

        // Build adjacency info
        let changed = true;
        let iterations = 0;
        const maxIterations = polygons.length * 2;

        while (changed && iterations < maxIterations) {
            changed = false;
            iterations++;

            for (let i = 0; i < polygons.length && !changed; i++) {
                for (let j = i + 1; j < polygons.length && !changed; j++) {
                    const sharedEdge = this.getSharedEdge(polygons[i], polygons[j]);

                    if (sharedEdge) {
                        // Try to merge
                        const merged = this.tryMergeConvex(polygons[i], polygons[j]);

                        if (merged && this.isConvex(merged)) {
                            // Replace i with merged, remove j
                            polygons[i] = merged;
                            polygons.splice(j, 1);
                            changed = true;
                        }
                    }
                }
            }
        }

        return polygons;
    }

    /**
     * Try to merge two adjacent polygons while maintaining convexity
     */
    tryMergeConvex(poly1, poly2) {
        // Find shared edge
        const sharedVerts = [];
        const idx1 = [];
        const idx2 = [];

        for (let i = 0; i < poly1.length; i++) {
            for (let j = 0; j < poly2.length; j++) {
                if (Math.abs(poly1[i].x - poly2[j].x) < this.EPSILON &&
                    Math.abs(poly1[i].y - poly2[j].y) < this.EPSILON) {
                    sharedVerts.push(i);
                    idx1.push(i);
                    idx2.push(j);
                }
            }
        }

        if (sharedVerts.length !== 2) return null;

        // Check if shared vertices are adjacent in both polygons
        const adj1 = (Math.abs(idx1[0] - idx1[1]) === 1) ||
                     (idx1[0] === 0 && idx1[1] === poly1.length - 1) ||
                     (idx1[1] === 0 && idx1[0] === poly1.length - 1);
        const adj2 = (Math.abs(idx2[0] - idx2[1]) === 1) ||
                     (idx2[0] === 0 && idx2[1] === poly2.length - 1) ||
                     (idx2[1] === 0 && idx2[0] === poly2.length - 1);

        if (!adj1 || !adj2) return null;

        // Build merged polygon by walking around both polygons
        const merged = [];

        // Sort indices for poly1
        let start1 = Math.min(idx1[0], idx1[1]);
        let end1 = Math.max(idx1[0], idx1[1]);

        // Handle wrap-around case
        if (end1 - start1 > 1 && !(start1 === 0 && end1 === poly1.length - 1)) {
            return null; // Non-adjacent
        }

        // Walk poly1, excluding one shared vertex
        let wrapAround1 = (start1 === 0 && end1 === poly1.length - 1);
        if (wrapAround1) {
            // Shared edge spans from end to start
            for (let i = end1; i >= start1 + 1; i--) {
                merged.push({ ...poly1[i] });
            }
        } else {
            // Normal case
            for (let i = 0; i < poly1.length; i++) {
                let idx = (end1 + 1 + i) % poly1.length;
                if (idx === start1) break;
                merged.push({ ...poly1[idx] });
            }
            merged.push({ ...poly1[start1] });
        }

        // Find which vertex of poly2 to start from
        let start2 = idx2.find(i => {
            const p2v = poly2[i];
            const p1v = poly1[start1];
            return Math.abs(p2v.x - p1v.x) < this.EPSILON && Math.abs(p2v.y - p1v.y) < this.EPSILON;
        });

        let other2 = idx2.find(i => i !== start2);

        // Walk poly2, excluding shared vertices
        let current = (start2 + 1) % poly2.length;
        while (current !== other2) {
            merged.push({ ...poly2[current] });
            current = (current + 1) % poly2.length;
        }

        return merged;
    }

    /**
     * Complete NavMesh generation pipeline
     * @param {Array<{x,y}>} outer - Outer boundary (CCW)
     * @param {Array<Array<{x,y}>>} holes - Hole polygons (will be made CW)
     * @returns {{triangles: Array, polygons: Array}}
     */
    generateNavMesh(outer, holes) {
        console.log('generateNavMesh - Input:', {
            outerPoints: outer.length,
            holesCount: holes.length
        });

        // Ensure correct winding: outer = CCW, holes = CW
        const ccwOuter = this.ensureCCW(outer);
        console.log('Outer area (should be positive for CCW):', this.signedArea(ccwOuter));

        const cwHoles = [];
        for (let i = 0; i < holes.length; i++) {
            const hole = holes[i];
            if (hole.length < 3) {
                console.warn(`Hole ${i} has less than 3 vertices, skipping`);
                continue;
            }
            const cwHole = this.ensureCW(hole);
            console.log(`Hole ${i} area (should be negative for CW):`, this.signedArea(cwHole));
            cwHoles.push(cwHole);
        }

        // Triangulate
        const triangles = this.triangulate(ccwOuter, cwHoles);
        console.log('Triangulation result:', triangles.length, 'triangles');

        if (triangles.length === 0) {
            console.error('Triangulation failed - no triangles generated');
            return { triangles: [], polygons: [] };
        }

        // Merge triangles into convex polygons
        const polygons = this.hertelMehlhorn(triangles);
        console.log('Hertel-Mehlhorn result:', polygons.length, 'convex polygons');

        return {
            triangles,
            polygons
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
