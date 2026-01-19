import { Building } from './building.js';
import { Wall } from './wall.js';
import { Obstacle } from './obstacle.js';
import { ConnectionManager } from './connection-manager.js';

/**
 * MapData - container for all map data
 */
export class MapData {
    constructor() {
        this.outerPoly = []; // Array of {x, y}
        this.buildings = new Map(); // Array of Building
        this.walls = new Map(); // Array of Wall
        this.obstacles = new Map(); // Array of Obstacle (non-destructible)
        this.connections = []; // Il "registro" delle connessioni (Array di oggetti)
        this.nextId = 1;
        // this.onChanged = onChangedCallback;
        // ... altre proprietà
        this._cachedVertices = [];
        this._cachedEdges = [];
        this._needsUpdate = true;

        // --- Gestore (Logica) ---
        // Passiamo 'this' per permettere al manager di accedere a edifici e mura
        this.connectionManager = new ConnectionManager(this);
    }

    /**
     * Add a building
     * @param {Building} building
     */
    addBuilding(building) {
        if (!building.id) building.id = `bldg_${this.nextId++}`;

        this.buildings.set(building.id, building);
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
        return this.buildings.get(id);
    }

    generateId(prefix) {
        return `${prefix}_${this.nextId++}`;
    }

    /**
     * Add a wall
     * @param {Wall} wall
     */
    addWall(wall) {
        if (!wall.id) wall.id = `wall_${this.nextId++}`;
        this.walls.set(wall.id, wall);

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
        return this.walls.get(id);
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
        // 1. Svuota gli oggetti esistenti senza cambiare il riferimento (più sicuro)
        console.log(this.walls);
        this.outerPoly.length = 0;
        this.buildings.clear();
        this.walls.clear();
        this.obstacles.clear();

        // 2. Resetta il contatore degli ID univoci
        // Fondamentale per evitare che una nuova mappa inizi con ID altissimi
        this.nextId = 1;

        // 3. Notifica il sistema e resetta la cache
        // Questo è il metodo che abbiamo aggiunto per l'Undo e il Caching
        this._triggerChange();

        console.log("Mappa resettata correttamente.");
    }

    getAllVertices() {
        if (this._needsUpdate) {
            this._updateCache();
        }
        return this._cachedVertices;
    }

    /**
 * Trova l'edge più vicino alla posizione data
 */
    findNearestEdge(x, y, threshold, options = { excludeOuter: false }) {
        if (this._needsUpdate) this._updateCache();

        let nearest = null;
        let minDistSq = threshold * threshold;

        for (const edge of this._cachedEdges) {
            if (options.excludeOuter && edge.type === 'outer') continue;

            // Calcoliamo la proiezione del punto sull'edge
            const result = this._pointToSegment(x, y, edge.p1, edge.p2);

            if (result.distSq < minDistSq) {
                minDistSq = result.distSq;
                nearest = {
                    point: result.closest,   // Il punto esatto sull'edge dove "attaccarsi"
                    edge: { p1: edge.p1, p2: edge.p2 },
                    type: edge.type,         // 'building', 'wall', etc.
                    targetId: edge.ownerId,
                    distance: Math.sqrt(result.distSq)
                };
            }
        }
        return nearest;
    }

    /**
     * Helper geometrico per calcolare la distanza punto-segmento
     */
    _pointToSegment(px, py, p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const l2 = dx * dx + dy * dy;

        if (l2 === 0) return {
            closest: { ...p1 },
            distSq: (px - p1.x) ** 2 + (py - p1.y) ** 2
        };

        let t = ((px - p1.x) * dx + (py - p1.y) * dy) / l2;
        t = Math.max(0, Math.min(1, t));

        const closest = {
            x: p1.x + t * dx,
            y: p1.y + t * dy
        };

        const distSq = (px - closest.x) ** 2 + (py - closest.y) ** 2;
        return { closest, distSq };
    }

    /**
     * Trova il vertice più vicino e restituisce tutte le info associate
     */
    findNearestVertex(x, y, threshold, options = { excludeOuter: false }) {
        if (this._needsUpdate) this._updateCache();

        let nearest = null;
        let minDistSq = threshold * threshold;

        for (const v of this._cachedVertices) {
            if (options.excludeOuter && v.type === 'outer') continue;

            const dx = v.ref.x - x;
            const dy = v.ref.y - y;
            const dSq = dx * dx + dy * dy;

            if (dSq < minDistSq) {
                minDistSq = dSq;
                // Restituiamo una copia dell'oggetto in cache per non sporcare l'originale
                nearest = {
                    point: v.ref,            // Riferimento al punto {x, y} reale
                    type: v.type,            // 'building', 'wall', etc.
                    targetId: v.ownerId,
                    vertexIndex: v.index,    // Indice nel poligono originale
                    isEndpoint: v.isEndpoint, // Solo per i muri (inizio/fine)
                    endpointType: v.endpointType // 'start' o 'end'
                };
            }
        }
        return nearest;
    }


    /**
     * Serialize to JSON  
     */
    toJSON() {
        return {
            nextId: this.nextId,
            outer: this.outerPoly.map(p => ({ x: p.x, y: p.y })),
            // Convertiamo le Map in Array di oggetti JSON
            buildings: Array.from(this.buildings.values()).map(b => b.toJSON()),
            walls: Array.from(this.walls.values()).map(w => w.toJSON()),
            obstacles: Array.from(this.obstacles.values()).map(o => o.toJSON())
        };
    }

    /**
     * Load from JSON
     */
    fromJSON(json) {
        this.clear(); // Metodo che ora deve fare this.buildings.clear(), etc.


        this.outerPoly = (json.outer || []).map(p => ({ x: p.x, y: p.y }));

        // Ripopoliamo le Map
        (json.buildings || []).forEach(bData => {
            const building = Building.fromJSON(bData);
            this.buildings.set(building.id, building);
        });

        (json.walls || []).forEach(wData => {
            const wall = Wall.fromJSON(wData);
            this.walls.set(wall.id, wall);
        });

        (json.obstacles || []).forEach(oData => {
            const obstacle = Obstacle.fromJSON(oData);
            this.obstacles.set(obstacle.id, obstacle);
        });

        this.updateAllGeometry();

    }

    updateAllGeometry() {
        // 1. Reset: ogni oggetto ricalcola la sua geometria base
        this.buildings.forEach(b => b.updateVertices());
        this.walls.forEach(w => w.updateVertices());

        // 2. Risoluzione: il manager modifica i vertici in base alle connessioni
        this.connectionManager.resolveAll();

        // 3. Notifica il cambiamento per cache e render
        this._triggerChange();
    }

    /**
 * Esempio di come popolare la cache nella classe MapData
 */
    _updateCache() {
        this._cachedVertices = [];
        this._cachedEdges = [];

        // Funzione helper per evitare ripetizioni
        const processPolygon = (vertices, type, id) => {
            for (let i = 0; i < vertices.length; i++) {
                const p1 = vertices[i];
                const p2 = vertices[(i + 1) % vertices.length];

                // Memorizziamo il riferimento al punto originale (NON una copia)
                // Questo permette allo snap di modificare direttamente l'oggetto se necessario
                this._cachedVertices.push({
                    ref: p1,
                    type: type,
                    ownerId: id,
                    index: i
                });

                // Cache degli Edge per lo Snap to Edge
                this._cachedEdges.push({
                    p1: p1,
                    p2: p2,
                    type: type,
                    ownerId: id
                });
            }
        };

        // Elabora tutti gli oggetti
        if (this.outerPoly.length > 0) processPolygon(this.outerPoly, 'outer', null);
        this.buildings.forEach(b => processPolygon(b.getVertices(), 'building', b.id));
        this.obstacles.forEach(o => processPolygon(o.getVertices(), 'obstacle', o.id));

        // Esempio di aggiunta alla cache per i muri in _updateCache
        this.walls.forEach(w => {
            for (let i = 0; i < w.points.length; i++) {
                const isStart = (i === 0);
                const isEnd = (i === w.points.length - 1);

                this._cachedVertices.push({
                    ref: w.points[i],
                    type: 'wall',
                    ownerId: w.id,
                    index: i,
                    isEndpoint: isStart || isEnd,
                    endpointType: isStart ? 'start' : (isEnd ? 'end' : null)
                });

                // Aggiunta degli edge (linea centrale per snap tra muri)
                if (i < w.points.length - 1) {
                    this._cachedEdges.push({
                        p1: w.points[i],
                        p2: w.points[i + 1],
                        type: 'wall',
                        ownerId: w.id
                    });
                }
            }
        });

        this._needsUpdate = false;
    }

    _triggerChange() {
        this._needsUpdate = true; // Segnala che i dati sono sporchi
        if (this.onChanged) this.onChanged();
    }

}