/**
 * Obstacle class - represents a non-destructible polygon obstacle (hole in navmesh)
 * Unlike buildings, obstacles are free-form polygons (can be concave)
 * and are not included in the list of traversable obstacles
 */
export class Obstacle {
    constructor(options = {}) {
        this.id = options.id || Obstacle.generateId();
        this.vertices = options.vertices || []; // Array of {x, y}
        this.type = 'obstacle';
    }

    static generateId() {
        return 'obs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Get vertices (returns a copy)
     * @returns {Array<{x: number, y: number}>}
     */
    getVertices() {
        return this.vertices.map(v => ({ x: v.x, y: v.y }));
    }

    /**
     * Set vertices
     * @param {Array<{x: number, y: number}>} vertices
     */
    setVertices(vertices) {
        this.vertices = vertices.map(v => ({ x: v.x, y: v.y }));
    }

    /**
     * Get a specific vertex
     * @param {number} index
     * @returns {{x: number, y: number}|null}
     */
    getVertex(index) {
        if (index >= 0 && index < this.vertices.length) {
            return { ...this.vertices[index] };
        }
        return null;
    }

    /**
     * Set a specific vertex
     * @param {number} index
     * @param {number} x
     * @param {number} y
     */
    setVertex(index, x, y) {
        if (index >= 0 && index < this.vertices.length) {
            this.vertices[index] = { x, y };
        }
    }

    /**
     * Add a vertex at the end
     * @param {number} x
     * @param {number} y
     */
    addVertex(x, y) {
        this.vertices.push({ x, y });
    }

    /**
     * Insert a vertex at a specific index
     * @param {number} index
     * @param {number} x
     * @param {number} y
     */
    insertVertex(index, x, y) {
        this.vertices.splice(index, 0, { x, y });
    }

    /**
     * Remove a vertex at a specific index
     * @param {number} index
     */
    removeVertex(index) {
        if (this.vertices.length > 3 && index >= 0 && index < this.vertices.length) {
            this.vertices.splice(index, 1);
        }
    }

    /**
     * Get the number of vertices
     * @returns {number}
     */
    get vertexCount() {
        return this.vertices.length;
    }

    /**
     * Check if a point is inside this obstacle
     * Uses ray casting algorithm
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     */
    containsPoint(x, y) {
        return Obstacle.pointInPolygon(x, y, this.vertices);
    }

    /**
     * Get bounding box
     * @returns {{minX: number, minY: number, maxX: number, maxY: number}}
     */
    getBounds() {
        if (this.vertices.length === 0) {
            return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        }

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const v of this.vertices) {
            minX = Math.min(minX, v.x);
            minY = Math.min(minY, v.y);
            maxX = Math.max(maxX, v.x);
            maxY = Math.max(maxY, v.y);
        }

        return { minX, minY, maxX, maxY };
    }

    /**
     * Get the center (centroid) of the obstacle
     * @returns {{x: number, y: number}}
     */
    getCenter() {
        if (this.vertices.length === 0) {
            return { x: 0, y: 0 };
        }

        let cx = 0, cy = 0;
        for (const v of this.vertices) {
            cx += v.x;
            cy += v.y;
        }
        return {
            x: cx / this.vertices.length,
            y: cy / this.vertices.length
        };
    }

    /**
     * Calculate signed area of the polygon
     * Positive = counter-clockwise, Negative = clockwise
     * @returns {number}
     */
    signedArea() {
        let area = 0;
        const n = this.vertices.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += this.vertices[i].x * this.vertices[j].y;
            area -= this.vertices[j].x * this.vertices[i].y;
        }
        return area / 2;
    }

    /**
     * Check if the polygon is valid (at least 3 vertices)
     * @returns {boolean}
     */
    isValid() {
        return this.vertices.length >= 3;
    }

    /**
     * Point in polygon test using ray casting
     * @param {number} x
     * @param {number} y
     * @param {Array<{x: number, y: number}>} vertices
     * @returns {boolean}
     */
    static pointInPolygon(x, y, vertices) {
        let inside = false;
        const n = vertices.length;

        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = vertices[i].x, yi = vertices[i].y;
            const xj = vertices[j].x, yj = vertices[j].y;

            if (((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }

        return inside;
    }

    /**
     * Clone this obstacle
     * @returns {Obstacle}
     */
    clone() {
        return new Obstacle({
            id: Obstacle.generateId(),
            vertices: this.vertices.map(v => ({ x: v.x, y: v.y }))
        });
    }

    /**
     * Serialize to JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            id: this.id,
            vertices: this.vertices.map(v => ({ x: v.x, y: v.y }))
        };
    }

    /**
     * Create from JSON
     * @param {Object} json
     * @returns {Obstacle}
     */
    static fromJSON(json) {
        return new Obstacle({
            id: json.id,
            vertices: json.vertices || []
        });
    }
}
