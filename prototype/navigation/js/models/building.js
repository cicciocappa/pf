/**
 * Building class - represents a regular polygon obstacle
 */
export class Building {
    constructor(options = {}) {
        this.id = options.id || Building.generateId();
        this.position = options.position || { x: 0, y: 0 };
        this.rotation = options.rotation || 0; // radians
        this.scaleX = options.scaleX || 50;
        this.scaleY = options.scaleY || 50;
        this.sides = options.sides || 4;
        this.type = 'building';
    }

    static generateId() {
        return 'bld_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Generate transformed vertices of the polygon
     * @returns {Array<{x: number, y: number}>}
     */
    getVertices() {
        const vertices = [];
        const angleStep = (2 * Math.PI) / this.sides;

        // Start from top (-PI/2) for even-sided polygons to have flat bottom
        const startAngle = -Math.PI / 2;

        for (let i = 0; i < this.sides; i++) {
            const angle = startAngle + i * angleStep + this.rotation;
            const x = this.position.x + Math.cos(angle) * this.scaleX;
            const y = this.position.y + Math.sin(angle) * this.scaleY;
            vertices.push({ x, y });
        }

        return vertices;
    }

    /**
     * Check if a point is inside this building
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     */
    containsPoint(x, y) {
        const vertices = this.getVertices();
        return Building.pointInPolygon(x, y, vertices);
    }

    /**
     * Get bounding box
     * @returns {{minX: number, minY: number, maxX: number, maxY: number}}
     */
    getBounds() {
        const vertices = this.getVertices();
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const v of vertices) {
            minX = Math.min(minX, v.x);
            minY = Math.min(minY, v.y);
            maxX = Math.max(maxX, v.x);
            maxY = Math.max(maxY, v.y);
        }

        return { minX, minY, maxX, maxY };
    }

    /**
     * Point in polygon test using ray casting
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
     * Clone this building
     */
    clone() {
        return new Building({
            id: Building.generateId(),
            position: { ...this.position },
            rotation: this.rotation,
            scaleX: this.scaleX,
            scaleY: this.scaleY,
            sides: this.sides
        });
    }

    /**
     * Serialize to JSON
     */
    toJSON() {
        return {
            id: this.id,
            position: { ...this.position },
            rotation: this.rotation,
            scaleX: this.scaleX,
            scaleY: this.scaleY,
            sides: this.sides
        };
    }

    /**
     * Create from JSON
     */
    static fromJSON(json) {
        return new Building(json);
    }
}
