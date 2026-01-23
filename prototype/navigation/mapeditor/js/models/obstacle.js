import { Geometry } from "../geometry.js";

export class Obstacle {
    constructor(options = {}) {
        this.id = options.id;
        this.vertices = options.vertices || []; // Array of {x, y}
        this.type = 'obstacle';
        this.label = options.label || '';
    }

    containsPoint(x, y) {
        // Utilizziamo i vertici correnti (quelli eventualmente modificati dai bevel)
        return Geometry.isPointInPolygon(x, y, this.vertices);
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

    getVertices() {
        return this.vertices;
    }

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
     * Serialize to JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            id: this.id,
            label: this.label,
            vertices: this.vertices.map(v => ({ id: v.id, edgeId: v.edgeId, x: v.x, y: v.y }))
        };
    }

    /**
     * Create from JSON
     * @param {Object} json
     * @returns {Obstacle}
     */
    static fromJSON(json) {
        const vertices = (json.vertices || []).map(v => ({
            id: v.id,
            edgeId: v.edgeId,
            x: v.x,
            y: v.y
        }));
        return new Obstacle({
            id: json.id,
            label: json.label,
            vertices: vertices
        });
    }
}