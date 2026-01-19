import { Building } from './building.js';
import { Wall } from './wall.js';
import { Obstacle } from './obstacle.js';

/**
 * MapData - container for all map data
 */
export class MapData {
    constructor() {
        this.outerPoly = []; // Array of {x, y}
        this.buildings = []; // Array of Building
        this.walls = []; // Array of Wall
        this.obstacles = []; // Array of Obstacle (non-destructible)
        this.nextId = 1;
    }

    /**
     * Add a building
     * @param {Building} building
     */
    addBuilding(building) {
        this.buildings.push(building);
    }

    /**
     * Remove a building by ID or reference
     * @param {string|Building} buildingOrId
     */
    removeBuilding(buildingOrId) {
        const id = typeof buildingOrId === 'string' ? buildingOrId : buildingOrId.id;
        const index = this.buildings.findIndex(b => b.id === id);
        if (index !== -1) {
            this.buildings.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Get building by ID
     */
    getBuildingById(id) {
        return this.buildings.find(b => b.id === id);
    }

    /**
     * Add a wall
     * @param {Wall} wall
     */
    addWall(wall) {
        this.walls.push(wall);
    }

    /**
     * Remove a wall by ID or reference
     * @param {string|Wall} wallOrId
     */
    removeWall(wallOrId) {
        const id = typeof wallOrId === 'string' ? wallOrId : wallOrId.id;
        const index = this.walls.findIndex(w => w.id === id);
        if (index !== -1) {
            this.walls.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Get wall by ID
     */
    getWallById(id) {
        return this.walls.find(w => w.id === id);
    }

    /**
     * Add an obstacle
     * @param {Obstacle} obstacle
     */
    addObstacle(obstacle) {
        this.obstacles.push(obstacle);
    }

    /**
     * Remove an obstacle by ID or reference
     * @param {string|Obstacle} obstacleOrId
     */
    removeObstacle(obstacleOrId) {
        const id = typeof obstacleOrId === 'string' ? obstacleOrId : obstacleOrId.id;
        const index = this.obstacles.findIndex(o => o.id === id);
        if (index !== -1) {
            this.obstacles.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Get obstacle by ID
     */
    getObstacleById(id) {
        return this.obstacles.find(o => o.id === id);
    }

    /**
     * Find object at given coordinates (for hit testing)
     * @param {number} x
     * @param {number} y
     * @returns {Building|Wall|Obstacle|null}
     */
    findObjectAt(x, y) {
        // Check buildings first (on top)
        for (let i = this.buildings.length - 1; i >= 0; i--) {
            if (this.buildings[i].containsPoint(x, y)) {
                return this.buildings[i];
            }
        }

        // Then check walls
        for (let i = this.walls.length - 1; i >= 0; i--) {
            if (this.walls[i].containsPoint(x, y)) {
                return this.walls[i];
            }
        }

        // Then check obstacles
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            if (this.obstacles[i].containsPoint(x, y)) {
                return this.obstacles[i];
            }
        }

        return null;
    }

    /**
     * Get all objects (buildings, walls, and obstacles)
     */
    getAllObjects() {
        return [...this.buildings, ...this.walls, ...this.obstacles];
    }

    /**
     * Get object by ID (any type)
     */
    getObjectById(id) {
        return this.getBuildingById(id) || this.getWallById(id) || this.getObstacleById(id);
    }

    /**
     * Remove object by ID (any type)
     */
    removeObject(obj) {
        if (obj.type === 'building') {
            return this.removeBuilding(obj);
        } else if (obj.type === 'wall') {
            return this.removeWall(obj);
        } else if (obj.type === 'obstacle') {
            return this.removeObstacle(obj);
        }
        return false;
    }

    /**
     * Set outer polygon
     * @param {Array<{x, y}>} points
     */
    setOuterPoly(points) {
        this.outerPoly = points.map(p => ({ x: p.x, y: p.y }));
    }

    /**
     * Check if outer polygon is defined
     */
    hasOuterPoly() {
        return this.outerPoly.length >= 3;
    }

    /**
     * Clear all data
     */
    clear() {
        this.outerPoly = [];
        this.buildings = [];
        this.walls = [];
        this.obstacles = [];
    }

    // TODO: gli holes devo essere dei singoli poligoni
    // risultanti dall'unione di mura ed edifici, se connessi fra loro
    // possiamo usare una logica ricorsiva, per cercare tutti gli elementi connessi 


    /**
     * Get all holes for navmesh computation
     * Converts buildings, walls, and obstacles to polygon holes
     * Uses quadrilaterals for walls to avoid overlaps
     * @returns {Array<Array<{x, y}>>}
     */
    getHoles() {
        const holes = [];

        // Add obstacle vertices as holes (non-destructible, go first)
        for (const obstacle of this.obstacles) {
            const vertices = obstacle.getVertices();
            // Ensure clockwise winding for holes
            if (this.signedArea(vertices) > 0) {
                vertices.reverse();
            }
            holes.push(vertices);
        }

        // Add building vertices as holes
        for (const building of this.buildings) {
            const vertices = building.getVertices();
            // Ensure clockwise winding for holes
            if (this.signedArea(vertices) > 0) {
                vertices.reverse();
            }
            holes.push(vertices);
        }

        // Add wall quadrilaterals as holes (one per subdivision)
        // Pass 'this' to allow vertex snap lookups
        for (const wall of this.walls) {
            const quads = wall.toQuadrilaterals(this);
            for (const quad of quads) {
                if (quad.length >= 3) {
                    // Ensure clockwise winding for holes
                    if (this.signedArea(quad) > 0) {
                        quad.reverse();
                    }
                    holes.push(quad);
                }
            }
        }

        return holes;
    }

    /**
     * Get all holes for navmesh computation using pre-resolved building polygons
     * This is used after overlap resolution to ensure non-overlapping holes
     * @param {Array<{id: string, vertices: Array<{x,y}>}>} resolvedBuildings - Pre-resolved building polygons
     * @returns {Array<Array<{x, y}>>}
     */
    getHolesWithResolvedBuildings(resolvedBuildings) {
        const holes = [];

        // Add obstacle vertices as holes (non-destructible, go first)
        for (const obstacle of this.obstacles) {
            const vertices = obstacle.getVertices();
            // Ensure clockwise winding for holes
            if (this.signedArea(vertices) > 0) {
                vertices.reverse();
            }
            holes.push(vertices);
        }

        // Add resolved building vertices as holes
        for (const building of resolvedBuildings) {
            const vertices = building.vertices.map(v => ({ x: v.x, y: v.y }));
            // Ensure clockwise winding for holes
            if (this.signedArea(vertices) > 0) {
                vertices.reverse();
            }
            holes.push(vertices);
        }

        // Add wall quadrilaterals as holes (one per subdivision)
        // Pass 'this' to allow vertex snap lookups
        for (const wall of this.walls) {
            const quads = wall.toQuadrilaterals(this);
            for (const quad of quads) {
                if (quad.length >= 3) {
                    // Ensure clockwise winding for holes
                    if (this.signedArea(quad) > 0) {
                        quad.reverse();
                    }
                    holes.push(quad);
                }
            }
        }

        return holes;
    }

    /**
     * Get all edges from all objects for snap-to-edge functionality
     * @param {string|null} excludeWallId - Wall ID to exclude (for the wall being drawn)
     * @returns {Array<{p1: {x,y}, p2: {x,y}, type: string, targetId: string|null}>}
     */
    getAllEdges(excludeWallId = null) {
        const edges = [];

        // Outer polygon edges
        if (this.outerPoly.length >= 2) {
            for (let i = 0; i < this.outerPoly.length; i++) {
                const j = (i + 1) % this.outerPoly.length;
                edges.push({
                    p1: { ...this.outerPoly[i] },
                    p2: { ...this.outerPoly[j] },
                    type: 'outer',
                    targetId: null
                });
            }
        }

        // Obstacle edges
        for (const obstacle of this.obstacles) {
            const vertices = obstacle.getVertices();
            for (let i = 0; i < vertices.length; i++) {
                const j = (i + 1) % vertices.length;
                edges.push({
                    p1: { ...vertices[i] },
                    p2: { ...vertices[j] },
                    type: 'obstacle',
                    targetId: obstacle.id
                });
            }
        }

        // Building edges
        for (const building of this.buildings) {
            const vertices = building.getVertices();
            for (let i = 0; i < vertices.length; i++) {
                const j = (i + 1) % vertices.length;
                edges.push({
                    p1: { ...vertices[i] },
                    p2: { ...vertices[j] },
                    type: 'building',
                    targetId: building.id
                });
            }
        }

        // Wall thickness edges (left and right lines)
        for (const wall of this.walls) {
            if (excludeWallId && wall.id === excludeWallId) continue;

            const thicknessEdges = wall.getThicknessEdges();
            for (const edge of thicknessEdges) {
                edges.push({
                    p1: { ...edge.p1 },
                    p2: { ...edge.p2 },
                    type: 'wall',
                    targetId: wall.id,
                    side: edge.side
                });
            }
        }

        return edges;
    }

    /**
     * Find nearest edge within threshold
     * @param {number} x
     * @param {number} y
     * @param {number} threshold
     * @param {string|null} excludeWallId - Wall ID to exclude
     * @returns {{point: {x,y}, edge: {p1, p2}, type: string, targetId: string|null, distance: number}|null}
     */
    findNearestEdge(x, y, threshold = 15, excludeWallId = null) {
        const edges = this.getAllEdges(excludeWallId);
        let nearest = null;
        let minDist = threshold;

        for (const edge of edges) {
            const result = this.pointToEdge(x, y, edge.p1, edge.p2);

            if (result.distance < minDist) {
                minDist = result.distance;
                nearest = {
                    point: result.point,
                    edge: { p1: edge.p1, p2: edge.p2 },
                    type: edge.type,
                    targetId: edge.targetId,
                    distance: result.distance
                };
            }
        }

        return nearest;
    }

    /**
     * Calculate closest point on edge and distance
     * @returns {{point: {x,y}, distance: number}}
     */
    pointToEdge(px, py, p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const lengthSq = dx * dx + dy * dy;

        if (lengthSq === 0) {
            const dist = Math.sqrt((px - p1.x) ** 2 + (py - p1.y) ** 2);
            return { point: { ...p1 }, distance: dist };
        }

        let t = ((px - p1.x) * dx + (py - p1.y) * dy) / lengthSq;
        t = Math.max(0, Math.min(1, t));

        const point = {
            x: p1.x + t * dx,
            y: p1.y + t * dy
        };

        const distance = Math.sqrt((px - point.x) ** 2 + (py - point.y) ** 2);

        return { point, distance };
    }

    /**
     * Calculate signed area of polygon
     */
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
     * Get all vertices for snap functionality
     * @returns {Array<{x, y}>}
     */
    getAllVertices() {
        alert("all vertices!");
        const vertices = [];

        // Outer polygon vertices
        for (const p of this.outerPoly) {
            vertices.push({ ...p });
        }

        // Obstacle vertices
        for (const obstacle of this.obstacles) {
            for (const v of obstacle.getVertices()) {
                vertices.push(v);
            }
        }

        // Building vertices
        for (const building of this.buildings) {
            for (const v of building.getVertices()) {
                vertices.push(v);
            }
        }

        // Wall center points (endpoints of the polyline)
        for (const wall of this.walls) {
            for (const p of wall.points) {
                vertices.push({ ...p });
            }
        }

        return vertices;
    }

    /**
     * Find nearest vertex within threshold
     * @param {number} x
     * @param {number} y
     * @param {number} threshold
     * @returns {{x, y}|null}
     */
    findNearestVertex(x, y, threshold = 15) {
        const vertices = this.getAllVertices();
        let nearest = null;
        let minDist = threshold;

        for (const v of vertices) {
            const dist = Math.sqrt((v.x - x) ** 2 + (v.y - y) ** 2);
            if (dist < minDist) {
                minDist = dist;
                nearest = v;
            }
        }

        return nearest;
    }

    /**
     * Get the front cap edge of a wall endpoint
     * This is the perpendicular edge at the start or end of a wall
     * @param {string} wallId - ID of the wall
     * @param {string} endpointType - 'start' or 'end'
     * @returns {{p1: {x,y}, p2: {x,y}}|null}
     */
    getWallEndpointEdge(wallId, endpointType) {
        const wall = this.getWallById(wallId);
        if (!wall || wall.points.length < 2) return null;

        const thicknessLines = wall.getThicknessLines();
        if (thicknessLines.length < 1) return null;

        if (endpointType === 'start') {
            const first = thicknessLines[0];
            return {
                p1: { x: first.left.x, y: first.left.y },
                p2: { x: first.right.x, y: first.right.y }
            };
        } else if (endpointType === 'end') {
            const last = thicknessLines[thicknessLines.length - 1];
            return {
                p1: { x: last.left.x, y: last.left.y },
                p2: { x: last.right.x, y: last.right.y }
            };
        }

        return null;
    }

    /**
     * Get the two edges adjacent to a vertex in a polygon
     * @param {string} type - 'outer', 'building', 'obstacle'
     * @param {string|null} targetId - ID of the object (null for outer)
     * @param {number} vertexIndex - Index of the vertex
     * @returns {{point: {x,y}, prevEdge: {p1, p2}, nextEdge: {p1, p2}}|null}
     */
    getAdjacentEdges(type, targetId, vertexIndex) {
        let vertices = null;

        if (type === 'outer') {
            vertices = this.outerPoly;
        } else if (type === 'building') {
            const building = this.getBuildingById(targetId);
            if (building) {
                vertices = building.getVertices();
            }
        } else if (type === 'obstacle') {
            const obstacle = this.getObstacleById(targetId);
            if (obstacle) {
                vertices = obstacle.getVertices();
            }
        }

        if (!vertices || vertices.length < 3 || vertexIndex < 0 || vertexIndex >= vertices.length) {
            return null;
        }

        const n = vertices.length;
        const prevIndex = (vertexIndex - 1 + n) % n;
        const nextIndex = (vertexIndex + 1) % n;

        const point = vertices[vertexIndex];
        const prevPoint = vertices[prevIndex];
        const nextPoint = vertices[nextIndex];

        return {
            point: { x: point.x, y: point.y },
            // prevEdge: from previous vertex TO this vertex
            prevEdge: {
                p1: { x: prevPoint.x, y: prevPoint.y },
                p2: { x: point.x, y: point.y }
            },
            // nextEdge: from this vertex TO next vertex
            nextEdge: {
                p1: { x: point.x, y: point.y },
                p2: { x: nextPoint.x, y: nextPoint.y }
            }
        };
    }

    /**
     * Find nearest vertex within threshold with full info about the source
     * @param {number} x
     * @param {number} y
     * @param {number} threshold
     * @param {string|null} excludeWallId - Wall ID to exclude
     * @returns {{point: {x,y}, type: string, targetId: string|null, vertexIndex: number, distance: number}|null}
     */
    findNearestVertexWithInfo(x, y, threshold = 15, excludeWallId = null) {
        let nearest = null;
        let minDist = threshold;

        // Check outer polygon vertices
        for (let i = 0; i < this.outerPoly.length; i++) {
            const v = this.outerPoly[i];
            const dist = Math.sqrt((v.x - x) ** 2 + (v.y - y) ** 2);
            if (dist < minDist) {
                minDist = dist;
                nearest = {
                    point: { x: v.x, y: v.y },
                    type: 'outer',
                    targetId: null,
                    vertexIndex: i,
                    distance: dist
                };
            }
        }

        // Check obstacle vertices
        for (const obstacle of this.obstacles) {
            const vertices = obstacle.getVertices();
            for (let i = 0; i < vertices.length; i++) {
                const v = vertices[i];
                const dist = Math.sqrt((v.x - x) ** 2 + (v.y - y) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = {
                        point: { x: v.x, y: v.y },
                        type: 'obstacle',
                        targetId: obstacle.id,
                        vertexIndex: i,
                        distance: dist
                    };
                }
            }
        }

        // Check building vertices
        for (const building of this.buildings) {
            const vertices = building.getVertices();
            for (let i = 0; i < vertices.length; i++) {
                const v = vertices[i];
                const dist = Math.sqrt((v.x - x) ** 2 + (v.y - y) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = {
                        point: { x: v.x, y: v.y },
                        type: 'building',
                        targetId: building.id,
                        vertexIndex: i,
                        distance: dist
                    };
                }
            }
        }

        // Check wall endpoints (first and last point of each wall)
        for (const wall of this.walls) {
            if (excludeWallId && wall.id === excludeWallId) continue;

            // First point (start)
            if (wall.points.length > 0) {
                const v = wall.points[0];
                const dist = Math.sqrt((v.x - x) ** 2 + (v.y - y) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = {
                        point: { x: v.x, y: v.y },
                        type: 'wall',
                        targetId: wall.id,
                        vertexIndex: 0,
                        isEndpoint: true,
                        endpointType: 'start',
                        distance: dist
                    };
                }
            }

            // Last point (end)
            if (wall.points.length > 1) {
                const v = wall.points[wall.points.length - 1];
                const dist = Math.sqrt((v.x - x) ** 2 + (v.y - y) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = {
                        point: { x: v.x, y: v.y },
                        type: 'wall',
                        targetId: wall.id,
                        vertexIndex: wall.points.length - 1,
                        isEndpoint: true,
                        endpointType: 'end',
                        distance: dist
                    };
                }
            }
        }

        return nearest;
    }

    /**
     * Serialize to JSON (v3 format)
     */
    toJSON() {
        return {
            version: 3,
            outer: this.outerPoly.map(p => ({ x: p.x, y: p.y })),
            buildings: this.buildings.map(b => b.toJSON()),
            walls: this.walls.map(w => w.toJSON()),
            obstacles: this.obstacles.map(o => o.toJSON())
        };
    }

    /**
     * Load from JSON
     */
    fromJSON(json) {
        this.clear();

        // Handle v3 format
        if (json.version === 3) {
            this.outerPoly = (json.outer || []).map(p => ({ x: p.x, y: p.y }));
            this.buildings = (json.buildings || []).map(b => Building.fromJSON(b));
            this.walls = (json.walls || []).map(w => Wall.fromJSON(w));
            this.obstacles = (json.obstacles || []).map(o => Obstacle.fromJSON(o));
        } else if (json.version === 2) {
            // v2 format - no obstacles
            this.outerPoly = (json.outer || []).map(p => ({ x: p.x, y: p.y }));
            this.buildings = (json.buildings || []).map(b => Building.fromJSON(b));
            this.walls = (json.walls || []).map(w => Wall.fromJSON(w));
            this.obstacles = [];
        } else {
            // Legacy format (v1) - only outer and holes
            console.warn('Loading legacy map format (v1). Buildings, walls, and obstacles not available.');
            this.outerPoly = (json.outer || []).map(p => ({ x: p.x, y: p.y }));
            // Can't convert holes back to buildings/walls
        }
    }

    /**
     * Create from JSON (static factory)
     */
    static fromJSON(json) {
        const mapData = new MapData();
        mapData.fromJSON(json);
        return mapData;
    }
}
