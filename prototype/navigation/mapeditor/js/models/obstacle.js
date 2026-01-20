import { Geometry } from "../geometry.js";

export class Obstacle {
    constructor(options = {}) {
        this.id = options.id;
        this.vertices = options.vertices || []; // Array of {x, y}
        this.type = 'obstacle';
    }

    containsPoint(x, y) {
        // Utilizziamo i vertici correnti (quelli eventualmente modificati dai bevel)
        return Geometry.isPointInPolygon(x, y, this.vertices);
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