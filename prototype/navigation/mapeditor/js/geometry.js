export class Geometry {
    constructor() {
        this.EPSILON = 1e-8;
    }
    static isPointInPolygon(px, py, vertices) {
        if (!vertices || vertices.length < 3) return false;
        
        let isInside = false;
        for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
            const vi = vertices[i];
            const vj = vertices[j];

            // Algoritmo Ray-Casting
            const intersect = ((vi.y > py) !== (vj.y > py)) &&
                (px < (vj.x - vi.x) * (py - vi.y) / (vj.y - vi.y) + vi.x);
            
            if (intersect) isInside = !isInside;
        }
        return isInside;
    }
}