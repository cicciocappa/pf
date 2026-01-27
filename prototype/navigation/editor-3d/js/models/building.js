/**
 * Building model for 3D editor
 * Simplified standalone version
 */

// Building templates with default sizes
const BUILDING_TEMPLATES = {
    SMALL_HOUSE: { width: 6, depth: 6, sides: 4 },
    HOUSE: { width: 8, depth: 8, sides: 4 },
    LARGE_HOUSE: { width: 12, depth: 10, sides: 4 },
    BARRACKS: { width: 15, depth: 10, sides: 4 },
    TOWER: { width: 6, depth: 6, sides: 12 },
    MAGIC_TOWER: { width: 8, depth: 8, sides: 12 },
    CASTLE: { width: 30, depth: 30, sides: 4 },
    KEEP: { width: 20, depth: 20, sides: 4 },
    GATEHOUSE: { width: 12, depth: 8, sides: 4 },
    WALL_TOWER: { width: 8, depth: 8, sides: 8 },
    ngon_4: { width: 10, depth: 10, sides: 4 },
    ngon_6: { width: 10, depth: 10, sides: 6 },
    ngon_8: { width: 10, depth: 10, sides: 8 },
    ngon_12: { width: 10, depth: 10, sides: 12 }
};

export class Building {
    constructor(options = {}) {
        this.id = options.id || null;
        this.templateId = options.templateId || 'HOUSE';
        this.position = options.position || { x: 0, y: 0 }; // 2D position (x, z in 3D)
        this.rotation = options.rotation || 0;
        this.scaleX = options.scaleX || 1;
        this.scaleY = options.scaleY || 1;
        this.label = options.label || '';
        this.type = 'building';

        // Generated vertices
        this.vertices = [];
        this.baseVertices = [];

        this.regenerateBase();
    }

    /**
     * Generate base vertices from template
     */
    regenerateBase() {
        const template = BUILDING_TEMPLATES[this.templateId] || BUILDING_TEMPLATES.HOUSE;
        const { width, depth, sides } = template;

        this.baseVertices = [];

        if (sides === 4) {
            // Rectangle
            const hw = (width * this.scaleX) / 2;
            const hd = (depth * this.scaleY) / 2;
            this.baseVertices = [
                { x: -hw, y: -hd },
                { x: hw, y: -hd },
                { x: hw, y: hd },
                { x: -hw, y: hd }
            ];
        } else {
            // N-gon (circle approximation)
            const radius = Math.max(width, depth) * Math.max(this.scaleX, this.scaleY) / 2;
            for (let i = 0; i < sides; i++) {
                const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
                this.baseVertices.push({
                    x: Math.cos(angle) * radius,
                    y: Math.sin(angle) * radius
                });
            }
        }

        // Apply rotation and position
        this.vertices = this.baseVertices.map((v, i) => {
            const cos = Math.cos(this.rotation);
            const sin = Math.sin(this.rotation);
            const rx = v.x * cos - v.y * sin;
            const ry = v.x * sin + v.y * cos;
            return {
                x: rx + this.position.x,
                y: ry + this.position.y,
                id: `v_${this.id}_${i}`
            };
        });
    }

    getVertices() {
        return this.vertices;
    }

    getCenter() {
        return { ...this.position };
    }

    /**
     * Check if point is inside building polygon
     */
    containsPoint(x, y) {
        const vertices = this.vertices;
        let inside = false;
        for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
            const xi = vertices[i].x, yi = vertices[i].y;
            const xj = vertices[j].x, yj = vertices[j].y;
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    translate(dx, dy) {
        this.position.x += dx;
        this.position.y += dy;
        this.regenerateBase();
    }

    toJSON() {
        return {
            id: this.id,
            templateId: this.templateId,
            label: this.label,
            position: { ...this.position },
            rotation: this.rotation,
            scaleX: this.scaleX,
            scaleY: this.scaleY
        };
    }

    static fromJSON(json) {
        return new Building({
            id: json.id,
            templateId: json.templateId,
            label: json.label,
            position: json.position,
            rotation: json.rotation,
            scaleX: json.scaleX,
            scaleY: json.scaleY
        });
    }
}
