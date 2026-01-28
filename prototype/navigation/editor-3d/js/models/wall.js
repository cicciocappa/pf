/**
 * Wall model for 3D editor
 * Simplified standalone version
 */

export class Wall {
    constructor(options = {}) {
        this.id = options.id || null;
        this.points = (options.points || []).map((p, i) => ({
            x: p.x,
            y: p.y,
            id: p.id || `wp_${i}`
        }));
        this.thickness = options.thickness || 2;
        this.label = options.label || '';
        this.type = 'wall';

        // Generated outline vertices
        this.outlineVertices = [];
        this.updateVertices();
    }

    /**
     * Update outline vertices based on points and thickness
     */
    updateVertices() {
        if (this.points.length < 2) {
            this.outlineVertices = [];
            return;
        }

        const halfThickness = this.thickness / 2;
        const leftSide = [];
        const rightSide = [];

        for (let i = 0; i < this.points.length; i++) {
            const p = this.points[i];
            const prev = this.points[i - 1];
            const next = this.points[i + 1];

            let normal;

            if (!prev) {
                // First point - use direction to next
                const dx = next.x - p.x;
                const dy = next.y - p.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                normal = { x: -dy / len, y: dx / len };
            } else if (!next) {
                // Last point - use direction from prev
                const dx = p.x - prev.x;
                const dy = p.y - prev.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                normal = { x: -dy / len, y: dx / len };
            } else {
                // Middle point - average of both directions (miter)
                const dx1 = p.x - prev.x;
                const dy1 = p.y - prev.y;
                const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
                const n1 = { x: -dy1 / len1, y: dx1 / len1 };

                const dx2 = next.x - p.x;
                const dy2 = next.y - p.y;
                const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                const n2 = { x: -dy2 / len2, y: dx2 / len2 };

                // Average normal
                normal = {
                    x: (n1.x + n2.x) / 2,
                    y: (n1.y + n2.y) / 2
                };

                // Normalize
                const nlen = Math.sqrt(normal.x * normal.x + normal.y * normal.y);
                if (nlen > 0.001) {
                    normal.x /= nlen;
                    normal.y /= nlen;
                }
            }

            leftSide.push({
                x: p.x + normal.x * halfThickness,
                y: p.y + normal.y * halfThickness
            });

            rightSide.push({
                x: p.x - normal.x * halfThickness,
                y: p.y - normal.y * halfThickness
            });
        }

        // Outline: left side forward, then right side backward
        this.outlineVertices = [...leftSide, ...rightSide.reverse()];
    }

    getOutline() {
        return this.outlineVertices.map(v => ({ x: v.x, y: v.y }));
    }

    getOutlineDetailed() {
        return this.getOutline();
    }

    /**
     * Check if point is inside wall outline
     */
    containsPoint(x, y) {
        const vertices = this.outlineVertices;
        if (vertices.length < 3) return false;

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

    getCenter() {
        if (this.points.length === 0) return { x: 0, y: 0 };
        let sumX = 0, sumY = 0;
        for (const p of this.points) {
            sumX += p.x;
            sumY += p.y;
        }
        return {
            x: sumX / this.points.length,
            y: sumY / this.points.length
        };
    }

    toJSON() {
        return {
            id: this.id,
            label: this.label,
            points: this.points.map(p => ({ x: p.x, y: p.y, id: p.id })),
            thickness: this.thickness,
            subdivisionDistance: this.subdivisionDistance || 4
        };
    }

    static fromJSON(json) {
        const wall = new Wall({
            id: json.id,
            label: json.label,
            points: json.points,
            thickness: json.thickness
        });
        wall.subdivisionDistance = json.subdivisionDistance || 4;
        return wall;
    }
}
