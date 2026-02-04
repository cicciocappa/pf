// ========================================
// editor3d-models.js
// 3D Data Models: Building3D, Wall3D, Obstacle3D, Terrain
// ========================================

// ========================================
// Building3D
// ========================================
export class Building3D {
    constructor(data = {}) {
        this.id = data.id;
        this.type = 'building';
        this.position = data.position || { x: 0, y: 0, z: 0 };
        this.rotation = data.rotation || 0; // rotation around Z axis
        this.scaleX = data.scaleX || 5;
        this.scaleY = data.scaleY || 5;
        this.height = data.height || 3;
        this.baseShape = data.baseShape || 'rect'; // 'rect', 'ngon_N', 'template'
        this.sides = data.sides || 4; // for ngon
        this.vertices = data.vertices || []; // 2D footprint [{x, y}, ...]

        if (this.vertices.length === 0) {
            this.regenerateBase();
        }
    }

    regenerateBase() {
        // Generate base footprint based on shape
        let baseVerts = [];

        if (this.baseShape === 'rect') {
            baseVerts = [
                { x: -0.5, y: -0.5 },
                { x: 0.5, y: -0.5 },
                { x: 0.5, y: 0.5 },
                { x: -0.5, y: 0.5 }
            ];
        } else if (this.baseShape.startsWith('ngon')) {
            const n = this.sides;
            baseVerts = [];
            for (let i = 0; i < n; i++) {
                const angle = (i / n) * Math.PI * 2;
                baseVerts.push({
                    x: Math.cos(angle) * 0.5,
                    y: Math.sin(angle) * 0.5
                });
            }
        }

        // Apply scale and rotation
        const cos = Math.cos(this.rotation);
        const sin = Math.sin(this.rotation);

        this.vertices = baseVerts.map(v => {
            const sx = v.x * this.scaleX;
            const sy = v.y * this.scaleY;
            const rx = sx * cos - sy * sin;
            const ry = sx * sin + sy * cos;
            return {
                x: rx + this.position.x,
                y: ry + this.position.y
            };
        });
    }

    containsPoint(x, y) {
        // 2D point-in-polygon test
        let inside = false;
        const verts = this.vertices;
        for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
            const xi = verts[i].x, yi = verts[i].y;
            const xj = verts[j].x, yj = verts[j].y;
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    translate(dx, dy) {
        this.position.x += dx;
        this.position.y += dy;
        this.vertices.forEach(v => { v.x += dx; v.y += dy; });
    }

    getCenter() {
        if (this.vertices.length === 0) return { x: this.position.x, y: this.position.y };
        let cx = 0, cy = 0;
        for (const v of this.vertices) { cx += v.x; cy += v.y; }
        return { x: cx / this.vertices.length, y: cy / this.vertices.length };
    }

    toJSON() {
        return {
            id: this.id,
            type: 'building',
            position: { ...this.position },
            rotation: this.rotation,
            scaleX: this.scaleX,
            scaleY: this.scaleY,
            height: this.height,
            baseShape: this.baseShape,
            sides: this.sides,
            vertices: this.vertices.map(v => ({ x: v.x, y: v.y }))
        };
    }

    static fromJSON(json) {
        return new Building3D({
            id: json.id,
            position: json.position,
            rotation: json.rotation,
            scaleX: json.scaleX,
            scaleY: json.scaleY,
            height: json.height,
            baseShape: json.baseShape,
            sides: json.sides,
            vertices: json.vertices
        });
    }
}

// ========================================
// Wall3D
// ========================================
export class Wall3D {
    constructor(data = {}) {
        this.id = data.id;
        this.type = 'wall';
        this.points = data.points || []; // [{x, y, z}, ...]
        this.thickness = data.thickness || 0.5;
        this.height = data.height || 3;
    }

    containsPoint(x, y) {
        // Check if point is inside wall footprint
        const halfThick = this.thickness / 2;
        for (let i = 0; i < this.points.length - 1; i++) {
            const p1 = this.points[i];
            const p2 = this.points[i + 1];

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 0.01) continue;

            const nx = -dy / len;
            const ny = dx / len;

            // Check if point is within segment bounds
            const t = ((x - p1.x) * dx + (y - p1.y) * dy) / (len * len);
            if (t < 0 || t > 1) continue;

            const px = p1.x + t * dx;
            const py = p1.y + t * dy;
            const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);

            if (dist <= halfThick) return true;
        }
        return false;
    }

    translate(dx, dy) {
        this.points.forEach(p => { p.x += dx; p.y += dy; });
    }

    getCenter() {
        if (this.points.length === 0) return { x: 0, y: 0 };
        let cx = 0, cy = 0;
        for (const p of this.points) { cx += p.x; cy += p.y; }
        return { x: cx / this.points.length, y: cy / this.points.length };
    }

    toJSON() {
        return {
            id: this.id,
            type: 'wall',
            points: this.points.map(p => ({ x: p.x, y: p.y, z: p.z })),
            thickness: this.thickness,
            height: this.height
        };
    }

    static fromJSON(json) {
        return new Wall3D({
            id: json.id,
            points: json.points,
            thickness: json.thickness,
            height: json.height
        });
    }
}

// ========================================
// Obstacle3D
// ========================================
export class Obstacle3D {
    constructor(data = {}) {
        this.id = data.id;
        this.type = 'obstacle';
        this.obstacleType = data.obstacleType || 'hole'; // 'hole' or 'prism'
        this.vertices = data.vertices || []; // 2D footprint [{x, y}, ...]
        this.depth = data.depth || 1; // for holes
        this.height = data.height || 1; // for prisms
    }

    containsPoint(x, y) {
        let inside = false;
        const verts = this.vertices;
        for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
            const xi = verts[i].x, yi = verts[i].y;
            const xj = verts[j].x, yj = verts[j].y;
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    translate(dx, dy) {
        this.vertices.forEach(v => { v.x += dx; v.y += dy; });
    }

    getCenter() {
        if (this.vertices.length === 0) return { x: 0, y: 0 };
        let cx = 0, cy = 0;
        for (const v of this.vertices) { cx += v.x; cy += v.y; }
        return { x: cx / this.vertices.length, y: cy / this.vertices.length };
    }

    toJSON() {
        return {
            id: this.id,
            type: 'obstacle',
            obstacleType: this.obstacleType,
            vertices: this.vertices.map(v => ({ x: v.x, y: v.y })),
            depth: this.depth,
            height: this.height
        };
    }

    static fromJSON(json) {
        return new Obstacle3D({
            id: json.id,
            obstacleType: json.obstacleType,
            vertices: json.vertices,
            depth: json.depth,
            height: json.height
        });
    }
}

// ========================================
// Terrain
// ========================================
export class Terrain {
    constructor(data = {}) {
        this.bounds = data.bounds || { minX: -25, maxX: 25, minY: -25, maxY: 25 };
    }

    toJSON() {
        return {
            bounds: { ...this.bounds }
        };
    }

    static fromJSON(json) {
        return new Terrain({
            bounds: json.bounds
        });
    }
}

// ========================================
// EditorData3D
// ========================================
export class EditorData3D {
    constructor() {
        this.terrain = new Terrain();
        this.buildings = new Map();
        this.walls = new Map();
        this.obstacles = new Map();

        this._idCounter = 0;
    }

    generateId(prefix) {
        return `${prefix}_${++this._idCounter}`;
    }

    // --- CRUD ---
    addBuilding(building) {
        this.buildings.set(building.id, building);
    }

    removeBuilding(id) {
        this.buildings.delete(id);
    }

    addWall(wall) {
        this.walls.set(wall.id, wall);
    }

    removeWall(id) {
        this.walls.delete(id);
    }

    addObstacle(obstacle) {
        this.obstacles.set(obstacle.id, obstacle);
    }

    removeObstacle(id) {
        this.obstacles.delete(id);
    }

    findObjectAt(x, y) {
        // Check buildings
        for (const [id, bldg] of this.buildings) {
            if (bldg.containsPoint(x, y)) return bldg;
        }
        // Check walls
        for (const [id, wall] of this.walls) {
            if (wall.containsPoint(x, y)) return wall;
        }
        // Check obstacles
        for (const [id, obs] of this.obstacles) {
            if (obs.containsPoint(x, y)) return obs;
        }
        return null;
    }

    // --- Serialization ---
    toJSON() {
        return {
            terrain: this.terrain.toJSON(),
            buildings: [...this.buildings.values()].map(b => b.toJSON()),
            walls: [...this.walls.values()].map(w => w.toJSON()),
            obstacles: [...this.obstacles.values()].map(o => o.toJSON()),
            _idCounter: this._idCounter
        };
    }

    fromJSON(data) {
        this.clear();

        this._idCounter = data._idCounter || 0;

        if (data.terrain) {
            this.terrain = Terrain.fromJSON(data.terrain);
        }

        if (data.buildings) {
            for (const b of data.buildings) {
                const bldg = Building3D.fromJSON(b);
                this.buildings.set(bldg.id, bldg);
            }
        }

        if (data.walls) {
            for (const w of data.walls) {
                const wall = Wall3D.fromJSON(w);
                this.walls.set(wall.id, wall);
            }
        }

        if (data.obstacles) {
            for (const o of data.obstacles) {
                const obs = Obstacle3D.fromJSON(o);
                this.obstacles.set(obs.id, obs);
            }
        }
    }

    clear() {
        this.terrain = new Terrain();
        this.buildings.clear();
        this.walls.clear();
        this.obstacles.clear();
    }
}
