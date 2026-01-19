export class Obstacle {
    constructor(options = {}) {
        this.id = options.id;
        this.vertices = options.vertices || []; // Array of {x, y}
        this.type = 'obstacle';
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