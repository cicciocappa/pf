import { Building } from './building.js';
import { Wall } from './wall.js';
import { Obstacle } from './obstacle.js';
import { ConnectionManager } from './connection-manager.js';
import { Geometry } from '../geometry.js';

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
        this._needsUpdate = true; // Forza la ricostruzione della cache al prossimo snap/render
        this.updateAllGeometry(); // Ricalcola subito per sicurezza
    }

    /**
     * Remove a building by ID or reference
     * @param {string|Building} buildingOrId
     */
    removeBuilding(buildingOrId) {
        const id = typeof buildingOrId === 'string' ? buildingOrId : buildingOrId.id;
        const deleted = this.buildings.delete(id);
        if (deleted) {
            this._needsUpdate = true;
            this.updateAllGeometry();
        }
        return deleted;
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
        this._needsUpdate = true; // Forza la ricostruzione della cache al prossimo snap/render
        this.updateAllGeometry(); // Ricalcola subito per sicurezza

    }

    /**
     * Remove a wall by ID or reference
     * @param {string|Wall} wallOrId
     */
    removeWall(wallOrId) {
        const id = typeof wallOrId === 'string' ? wallOrId : wallOrId.id;
        const deleted = this.walls.delete(id);
        if (deleted) {
            this._needsUpdate = true;
            this.updateAllGeometry();
        }
        return deleted;
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
        if (!obstacle.id) obstacle.id = `obs_${this.nextId++}`;

        this.obstacles.set(obstacle.id, obstacle);
        this._needsUpdate = true;
    }

    /**
     * Remove an obstacle by ID or reference
     * @param {string|Obstacle} obstacleOrId
     */
    removeObstacle(obstacleOrId) {
        const id = typeof obstacleOrId === 'string' ? obstacleOrId : obstacleOrId.id;
        return this.obstacles.delete(id);
    }

    /**
     * Get obstacle by ID
     */
    getObstacleById(id) {
        return this.obstacles.get(id);
    }

    /**
     * Find object at given coordinates (for hit testing)
     * @param {number} x
     * @param {number} y
     * @returns {Building|Wall|Obstacle|null}
     */
    findObjectAt(x, y) {
        // Iterate in reverse for z-index (top to bottom)
        // Convert to array to reverse
        const buildings = Array.from(this.buildings.values());
        for (let i = buildings.length - 1; i >= 0; i--) {
            if (buildings[i].containsPoint(x, y)) {
                return buildings[i];
            }
        }

        const walls = Array.from(this.walls.values());
        for (let i = walls.length - 1; i >= 0; i--) {
            if (walls[i].containsPoint(x, y)) {
                return walls[i];
            }
        }

        const obstacles = Array.from(this.obstacles.values());
        for (let i = obstacles.length - 1; i >= 0; i--) {
            if (obstacles[i].containsPoint(x, y)) {
                return obstacles[i];
            }
        }

        return null;
    }

    /**
     * Get all objects (buildings, walls, and obstacles)
     */
    getAllObjects() {
        return [...this.buildings.values(), ...this.walls.values(), ...this.obstacles.values()];
    }

    /**
     * Get object by ID (any type)
     */
    getObjectById(id) {
        return this.getBuildingById(id) || this.getWallById(id) || this.getObstacleById(id);
    }

    /**
  * Calcola i confini minimi e massimi della mappa basandosi sul perimetro esterno.
  */
    getBounds() {
        if (!this.outerPoly || this.outerPoly.length === 0) {
            return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const p of this.outerPoly) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }

        // Aggiungiamo un piccolo margine (padding) per evitare problemi di clipping
        // durante la rasterizzazione sui bordi esatti.
        const padding = 10;
        return {
            minX: minX - padding,
            minY: minY - padding,
            maxX: maxX + padding,
            maxY: maxY + padding,
            width: (maxX - minX) + (padding * 2),
            height: (maxY - minY) + (padding * 2)
        };
    }

    /**
     * Remove object by ID (any type)
     */
    /**
  * Rimuove un oggetto dalla mappa e pulisce le connessioni orfane
  */
    removeObject(obj) {
        if (!obj) return;

        // 1. Rimuoviamo l'oggetto dalla sua collezione specifica
        if (obj.type === 'building') {
            this.buildings.delete(obj.id);
        } else if (obj.type === 'wall') {
            this.walls.delete(obj.id);
        } else if (obj.type === 'obstacle') {
            this.obstacles.delete(obj.id);
        }

        // 2. GARBAGE COLLECTION DELLE CONNESSIONI
        // Filtriamo le connessioni: manteniamo solo quelle che NON coinvolgono l'ID rimosso
        const initialConnectionsCount = this.connections.length;
        this.connections = this.connections.filter(conn => {
            const isSource = conn.wallId === obj.id;
            const isTarget = conn.targetId === obj.id || conn.targetWallId === obj.id;
            return !isSource && !isTarget;
        });

        if (this.connections.length < initialConnectionsCount) {
            console.log(`Pulizia: rimosse ${initialConnectionsCount - this.connections.length} connessioni orfane.`);
        }

        // 3. Notifichiamo la necessità di aggiornare cache e geometria
        this._needsUpdate = true;
        this.updateAllGeometry();
    }

    /**
     * Set outer polygon
     * @param {Array<{x, y}>} points
     */
    setOuterPoly(points) {
        // Trasformiamo i semplici punti [x, y] in oggetti con ID
        this.outerPoly = points.map((p, i) => ({
            id: `p_outer_${Date.now()}_${i}`,
            x: p.x,
            y: p.y
        }));
        for (let i = 0; i < this.outerPoly.length; i++) {
            this.outerPoly[i].edgeId = `e_${this.outerPoly[i].id}`;
        }
        this._needsUpdate = true;
    }

    /**
     * Check if outer polygon is defined
     */
    hasOuterPoly() {
        return this.outerPoly.length >= 3;
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
                    targetEdgeId: edge.edgeId, // <--- Usiamo l'ID!
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
                    id: v.id,           // <--- AGGIUNTO: targetVertexId per la connessione
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

    findObjectsInRect(x1, y1, x2, y2) {
        const results = [];

        // Controlla edifici (usando la posizione o i vertici)
        this.buildings.forEach(b => {
            if (b.position.x >= x1 && b.position.x <= x2 && b.position.y >= y1 && b.position.y <= y2) {
                results.push(b);
            }
        });

        // Controlla muri (se almeno un punto è nel rettangolo)
        this.walls.forEach(w => {
            const isInside = w.points.some(p => p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2);
            if (isInside) results.push(w);
        });

        return results;
    }


    findBuildingAt(x, y) {
        // Ritorna il primo edificio che contiene il punto (x,y)
        // Usa un semplice algoritmo di Point-in-Polygon
        for (const b of this.buildings.values()) {
            if (this._isPointInPoly({ x, y }, b.vertices)) return b;
        }
        return null;
    }

    findWallVertexAt(x, y, threshold) {
        for (const w of this.walls.values()) {
            for (let i = 0; i < w.points.length; i++) {
                const p = w.points[i];
                const dist = Math.hypot(p.x - x, p.y - y);
                if (dist < threshold) return { wall: w, index: i };
            }
        }
        return null;
    }

    /**
     * Serialize to JSON  
     */
    toJSON() {
        return {
            nextId: this.nextId,
            // Salviamo id e edgeId per mantenere i riferimenti delle connessioni
            outer: this.outerPoly.map(p => ({ id: p.id, edgeId: p.edgeId, x: p.x, y: p.y })),
            // Convertiamo le Map in Array
            buildings: Array.from(this.buildings.values()).map(b => b.toJSON()),
            walls: Array.from(this.walls.values()).map(w => w.toJSON()),
            obstacles: Array.from(this.obstacles.values()).map(o => o.toJSON()),
            // SALVATAGGIO CONNESSIONI: Cruciale per il ConnectionManager
            connections: [...this.connections]
        };
    }

    /**
     * Load from JSON
     */
    fromJSON(json) {
        this.clear();

        // 1. Ripristina ID e Poligono Esterno
        this.nextId = json.nextId || 1;
        this.outerPoly = (json.outer || []).map(p => ({
            id: p.id,
            edgeId: p.edgeId,
            x: p.x,
            y: p.y
        }));

        // 2. Ripristina Edifici
        (json.buildings || []).forEach(bData => {
            const building = Building.fromJSON(bData);
            this.buildings.set(building.id, building);
        });

        // 3. Ripristina Muri
        (json.walls || []).forEach(wData => {
            const wall = Wall.fromJSON(wData);
            this.walls.set(wall.id, wall);
        });

        // 4. Ripristina Ostacoli
        (json.obstacles || []).forEach(oData => {
            const obstacle = Obstacle.fromJSON(oData);
            this.obstacles.set(obstacle.id, obstacle);
        });

        // 5. RIPRISTINA CONNESSIONI
        this.connections = json.connections ? [...json.connections] : [];

        // 6. RICALCOLO GEOMETRICO
        // Ora che tutto è in memoria (inclusi i targetId delle connessioni),
        // possiamo rigenerare gli smussi e le mesh dei muri.
        this.updateAllGeometry();
    }

    /**
     * Pulisce completamente i dati della mappa
     */
    clear() {
        this.buildings.clear();
        this.walls.clear();
        this.obstacles.clear();
        this.connections = [];
        this.outerPoly = [];
        // 2. Resetta il contatore degli ID univoci
        // Fondamentale per evitare che una nuova mappa inizi con ID altissimi
        this.nextId = 1;
        this._needsUpdate = true;
    }

    updateAllGeometry() {
        this.buildings.forEach(b => b.regenerateBase());

        this.connectionManager.resolveAll();

        this.walls.forEach(w => w.updateVertices());
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
                    ownerId: id,
                    edgeId: p1.edgeId // Memorizziamo l'ID stabile dell'edge
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
                    id: w.points[i].id,
                    type: 'wall',
                    ownerId: w.id,
                    index: i,
                    isEndpoint: isStart || isEnd,
                    endpointType: isStart ? 'start' : (isEnd ? 'end' : null)
                });

                // Aggiunta degli edge (linea centrale per snap tra muri)
                if (i < w.points.length - 1) {
                    const p1 = w.points[i];
                    const p2 = w.points[i + 1];

                    this._cachedEdges.push({
                        p1: p1,
                        p2: p2,
                        type: 'wall',
                        ownerId: w.id,
                        edgeId: `e_${p1.id}` // Memorizziamo l'ID stabile dell'edge
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

    /**
     * Genera il formato intermedio: un Outer e una lista di Holes.
     * @param {boolean} preserveUnitVertices - Se true (default), conserva i vertici delle suddivisioni
     *                                         delle mura per usarli come punti Steiner nella triangolazione.
     */
    getNavInputData(preserveUnitVertices = true) {
        const rawHoles = [];

        // 1. Identifica gruppi connessi (edifici + muri collegati)
        const groups = this._identifyConnectedGroups();

        // 2. Per ogni gruppo, costruisci il contorno appropriato
        for (const group of groups) {
            const contour = this._buildGroupContour(group, preserveUnitVertices);
            if (contour && contour.length >= 3) {
                rawHoles.push(contour);
            }
        }

        // 3. Ostacoli (non hanno mai connessioni, sempre separati)
        this.obstacles.forEach(o => {
            const verts = o.getVertices();
            if (verts.length >= 3) {
                rawHoles.push(verts.map(v => ({ x: v.x, y: v.y })));
            }
        });

        // 4. Semplifichiamo il poligono esterno
        const simplifiedOuter = Geometry.simplifyPolygon(
            this.outerPoly.map(p => ({ x: p.x, y: p.y }))
        );

        // 5. Semplifichiamo i contorni solo se NON preserviamo i vertici delle unit
        const finalHoles = preserveUnitVertices
            ? rawHoles
            : rawHoles.map(hole => Geometry.simplifyPolygon(hole));

        return {
            metadata: {
                generatedAt: Date.now(),
                version: "1.0"
            },
            outer: simplifiedOuter,
            holes: finalHoles
        };
    }

    /**
     * Identifica i gruppi di oggetti connessi (edifici + muri).
     * Usa le connessioni per costruire un grafo e trova le componenti connesse.
     */
    _identifyConnectedGroups() {
        const adjacency = new Map();
        const allObjectIds = new Set();

        // Aggiungi tutti gli oggetti al grafo
        this.buildings.forEach((_, id) => {
            allObjectIds.add(id);
            adjacency.set(id, new Set());
        });
        this.walls.forEach((_, id) => {
            allObjectIds.add(id);
            adjacency.set(id, new Set());
        });

        // Aggiungi archi basati sulle connessioni
        for (const conn of this.connections) {
            const wallId = conn.wallId;
            let targetId = conn.targetId || conn.targetWallId;

            if (wallId && targetId && adjacency.has(wallId) && adjacency.has(targetId)) {
                adjacency.get(wallId).add(targetId);
                adjacency.get(targetId).add(wallId);
            }
        }

        // Trova componenti connesse con DFS
        const visited = new Set();
        const groups = [];

        for (const objId of allObjectIds) {
            if (visited.has(objId)) continue;

            const group = {
                objectIds: new Set(),
                buildings: [],
                walls: [],
                connections: []
            };

            const stack = [objId];
            while (stack.length > 0) {
                const current = stack.pop();
                if (visited.has(current)) continue;
                visited.add(current);
                group.objectIds.add(current);

                if (this.buildings.has(current)) {
                    group.buildings.push(this.buildings.get(current));
                } else if (this.walls.has(current)) {
                    group.walls.push(this.walls.get(current));
                }

                for (const neighbor of adjacency.get(current)) {
                    if (!visited.has(neighbor)) {
                        stack.push(neighbor);
                    }
                }
            }

            // Raccogli le connessioni rilevanti per questo gruppo
            for (const conn of this.connections) {
                const wallId = conn.wallId;
                const targetId = conn.targetId || conn.targetWallId;
                if (group.objectIds.has(wallId) || group.objectIds.has(targetId)) {
                    group.connections.push(conn);
                }
            }

            groups.push(group);
        }

        return groups;
    }

    /**
     * Costruisce il contorno di un gruppo connesso.
     */
    _buildGroupContour(group, preserveUnitVertices) {
        // Caso: solo un muro senza connessioni
        if (group.buildings.length === 0 && group.walls.length === 1 && group.connections.length === 0) {
            const wall = group.walls[0];
            return preserveUnitVertices ? wall.getOutlineDetailed() : wall.getOutline();
        }

        // Caso: solo un edificio senza connessioni
        if (group.walls.length === 0 && group.buildings.length === 1 && group.connections.length === 0) {
            return group.buildings[0].getVertices().map(v => ({ x: v.x, y: v.y }));
        }

        // Caso: catena di muri senza edifici
        if (group.buildings.length === 0 && group.walls.length > 0) {
            return this._buildWallChainContour(group, preserveUnitVertices);
        }

        // Caso: edifici con muri connessi
        if (group.buildings.length > 0) {
            return this._buildBuildingWithWallsContour(group, preserveUnitVertices);
        }

        return null;
    }

    /**
     * Costruisce il contorno di una catena di muri (senza edifici).
     */
    _buildWallChainContour(group, preserveUnitVertices) {
        if (group.walls.length === 1) {
            const wall = group.walls[0];
            return preserveUnitVertices ? wall.getOutlineDetailed() : wall.getOutline();
        }

        // Per catene di muri, dobbiamo seguire le connessioni WALL_TO_WALL_*
        // Trova il muro di "partenza" (uno con un estremo libero)
        const wallEndConnections = new Map(); // wallId -> { start: conn|null, end: conn|null }

        for (const wall of group.walls) {
            wallEndConnections.set(wall.id, { start: null, end: null });
        }

        for (const conn of group.connections) {
            if (conn.type === 'WALL_TO_WALL_VERTEX' || conn.type === 'WALL_TO_WALL_EDGE') {
                const entry = wallEndConnections.get(conn.wallId);
                if (entry) {
                    entry[conn.wallEnd] = conn;
                }
            }
        }

        // Trova un muro con almeno un estremo libero
        let startWall = null;
        let startFromEnd = 'start'; // da quale estremo iniziare

        for (const wall of group.walls) {
            const ends = wallEndConnections.get(wall.id);
            if (!ends.start) {
                startWall = wall;
                startFromEnd = 'start';
                break;
            }
            if (!ends.end) {
                startWall = wall;
                startFromEnd = 'end';
                break;
            }
        }

        if (!startWall) {
            // Tutti i muri sono connessi ad entrambi gli estremi (loop chiuso)
            // Prendi il primo muro come partenza
            startWall = group.walls[0];
            startFromEnd = 'start';
        }

        // Costruisci il contorno seguendo la catena
        return this._walkWallChain(startWall, startFromEnd, group, wallEndConnections, preserveUnitVertices);
    }

    /**
     * Percorre una catena di muri costruendo il contorno.
     */
    _walkWallChain(startWall, startFromEnd, group, wallEndConnections, preserveUnitVertices) {
        const contour = [];
        const visitedWalls = new Set();
        const leftSidePoints = [];
        const rightSidePoints = [];

        let currentWall = startWall;
        let enteringFrom = startFromEnd; // da quale lato stiamo "entrando" nel muro

        while (currentWall && !visitedWalls.has(currentWall.id)) {
            visitedWalls.add(currentWall.id);

            // Ottieni i punti del contorno del muro
            const wallContour = preserveUnitVertices
                ? currentWall.getOutlineDetailed()
                : currentWall.getOutline();

            // Il contorno del muro è: lato sinistro in avanti, poi lato destro all'indietro
            const numPoints = wallContour.length;
            const halfPoints = numPoints / 2;

            let leftPoints, rightPoints;
            if (enteringFrom === 'start') {
                // Entriamo dall'inizio: lato sinistro va da 0 a halfPoints
                leftPoints = wallContour.slice(0, halfPoints);
                rightPoints = wallContour.slice(halfPoints).reverse();
            } else {
                // Entriamo dalla fine: invertiamo tutto
                leftPoints = wallContour.slice(halfPoints).reverse();
                rightPoints = wallContour.slice(0, halfPoints);
            }

            leftSidePoints.push(...leftPoints);
            rightSidePoints.push(...rightPoints);

            // Trova la connessione all'altro estremo
            const exitEnd = enteringFrom === 'start' ? 'end' : 'start';
            const conn = wallEndConnections.get(currentWall.id)?.[exitEnd];

            if (conn && (conn.type === 'WALL_TO_WALL_VERTEX' || conn.type === 'WALL_TO_WALL_EDGE')) {
                // Passa al muro connesso
                const nextWallId = conn.targetWallId || conn.targetId;
                const nextWall = this.walls.get(nextWallId);

                if (nextWall && !visitedWalls.has(nextWall.id)) {
                    // Determina da quale lato entriamo nel prossimo muro
                    const nextEnteringFrom = conn.targetWallEnd || 'start';
                    currentWall = nextWall;
                    enteringFrom = nextEnteringFrom;
                } else {
                    currentWall = null;
                }
            } else {
                currentWall = null;
            }
        }

        // Combina: lato sinistro in avanti, poi lato destro all'indietro
        contour.push(...leftSidePoints);
        contour.push(...rightSidePoints.reverse());

        return contour;
    }

    /**
     * Costruisce il contorno di edifici con muri connessi.
     */
    _buildBuildingWithWallsContour(group, preserveUnitVertices) {
        // Mappa delle connessioni per vertice bevel
        const bevelToWall = new Map(); // "buildingId:vertexId" -> { wall, wallEnd, conn }

        for (const conn of group.connections) {
            if (conn.type === 'WALL_TO_BUILDING_VERTEX') {
                const wall = this.walls.get(conn.wallId);
                if (wall) {
                    // Il vertice originale è stato diviso in _bevel_L e _bevel_R
                    const bevelLKey = `${conn.targetId}:${conn.targetVertexId}_bevel_L`;
                    bevelToWall.set(bevelLKey, {
                        wall,
                        wallEnd: conn.wallEnd,
                        conn
                    });
                }
            }
        }

        // Mappa dei muri e delle loro connessioni agli estremi
        const wallConnections = new Map(); // wallId -> { start: { type, target }, end: { type, target } }

        for (const wall of group.walls) {
            wallConnections.set(wall.id, { start: null, end: null });
        }

        for (const conn of group.connections) {
            const entry = wallConnections.get(conn.wallId);
            if (!entry) continue;

            if (conn.type === 'WALL_TO_BUILDING_VERTEX') {
                entry[conn.wallEnd] = {
                    type: 'building_vertex',
                    buildingId: conn.targetId,
                    vertexId: conn.targetVertexId
                };
            } else if (conn.type === 'WALL_TO_EDGE') {
                entry[conn.wallEnd] = {
                    type: 'edge',
                    targetType: conn.targetType,
                    targetId: conn.targetId
                };
            } else if (conn.type === 'WALL_TO_WALL_VERTEX' || conn.type === 'WALL_TO_WALL_EDGE') {
                entry[conn.wallEnd] = {
                    type: 'wall',
                    targetWallId: conn.targetWallId || conn.targetId,
                    targetWallEnd: conn.targetWallEnd
                };
            }
        }

        // Partiamo dal primo edificio e costruiamo il contorno
        const building = group.buildings[0];
        const vertices = building.getVertices();
        const contour = [];

        let i = 0;
        const startI = 0;
        const maxIterations = vertices.length * 10 + group.walls.length * 100;
        let iterations = 0;

        while (iterations < maxIterations) {
            iterations++;
            const v = vertices[i];
            const nextI = (i + 1) % vertices.length;

            // Controlla se questo è un vertice bevel_L (inizio di una connessione a muro)
            const bevelKey = `${building.id}:${v.id}`;
            const wallInfo = bevelToWall.get(bevelKey);

            if (wallInfo && v.id.endsWith('_bevel_L')) {
                // Aggiungi il vertice corrente (bevel_L)
                contour.push({ x: v.x, y: v.y });

                // Segui il muro e aggiungi i suoi vertici
                const wallContourPoints = this._getWallContourBetweenConnections(
                    wallInfo.wall,
                    wallInfo.wallEnd,
                    wallConnections,
                    group,
                    preserveUnitVertices,
                    new Set()
                );

                contour.push(...wallContourPoints);

                // Salta al vertice dopo bevel_R (il prossimo vertice non-bevel)
                // Il vertice successivo a bevel_L è bevel_R, quindi saltiamo entrambi
                i = (nextI + 1) % vertices.length;

                // Se siamo tornati all'inizio, abbiamo finito
                if (i === startI) break;
            } else {
                contour.push({ x: v.x, y: v.y });
                i = nextI;
                if (i === startI) break;
            }
        }

        return contour;
    }

    /**
     * Ottiene i punti del contorno di un muro tra le sue connessioni.
     *
     * Il contorno del muro da getOutlineDetailed() è strutturato così:
     * [L0, L1, ..., L_n, R_n, R_{n-1}, ..., R_0]
     * Dove:
     *   - L0 = punto sinistro all'inizio (start) del muro
     *   - L_n = punto sinistro alla fine (end) del muro
     *   - R_n = punto destro alla fine (end) del muro
     *   - R_0 = punto destro all'inizio (start) del muro
     *
     * Se il muro è connesso a un edificio, L0/R0 coincidono con i bevel dell'edificio.
     */
    _getWallContourBetweenConnections(wall, enteringEnd, wallConnections, group, preserveUnitVertices, visitedWalls) {
        if (visitedWalls.has(wall.id)) return [];
        visitedWalls.add(wall.id);

        const wallContour = preserveUnitVertices
            ? wall.getOutlineDetailed()
            : wall.getOutline();

        const n = wallContour.length;
        const half = Math.floor(n / 2);

        // Separa i due lati per chiarezza
        // leftSide:  [L0, L1, L2, ..., L_{half-1}]  (indices 0 to half-1)
        // rightSide: [R_{half-1}, R_{half-2}, ..., R_0]  (indices half to n-1)
        const leftSide = wallContour.slice(0, half);
        const rightSide = wallContour.slice(half);

        const exitEnd = enteringEnd === 'start' ? 'end' : 'start';
        const exitConn = wallConnections.get(wall.id)?.[exitEnd];

        const points = [];

        if (enteringEnd === 'start') {
            // Entriamo da L0 (bevel_L, già aggiunto dall'edificio)
            // Percorriamo il lato sinistro: L1, L2, ..., L_{half-2}
            // (escludiamo L0 già aggiunto e L_{half-1} che è la punta o bevel dell'altro oggetto)
            for (let i = 1; i < half - 1; i++) {
                points.push({ x: leftSide[i].x, y: leftSide[i].y });
            }

            if (!exitConn) {
                // Estremo libero: aggiungi la punta e torna sul lato destro
                points.push({ x: leftSide[half - 1].x, y: leftSide[half - 1].y }); // L_{half-1} (punta L)
                points.push({ x: rightSide[0].x, y: rightSide[0].y });             // R_{half-1} (punta R)

                // Lato destro: R_{half-2}, R_{half-3}, ..., R_1 (escludiamo R_0 che è bevel_R)
                for (let i = 1; i < half - 1; i++) {
                    points.push({ x: rightSide[i].x, y: rightSide[i].y });
                }
            } else if (exitConn.type === 'wall') {
                // Connesso a un altro muro: aggiungi la giunzione e segui la catena
                points.push({ x: leftSide[half - 1].x, y: leftSide[half - 1].y }); // L_{half-1}

                const nextWall = this.walls.get(exitConn.targetWallId);
                if (nextWall && !visitedWalls.has(nextWall.id)) {
                    const nextPoints = this._getWallContourBetweenConnections(
                        nextWall,
                        exitConn.targetWallEnd,
                        wallConnections,
                        group,
                        preserveUnitVertices,
                        visitedWalls
                    );
                    points.push(...nextPoints);
                }

                // Torna sul lato destro (escludendo R_{half-1} che è alla giunzione e R_0 che è bevel_R)
                points.push({ x: rightSide[0].x, y: rightSide[0].y }); // R_{half-1}
                for (let i = 1; i < half - 1; i++) {
                    points.push({ x: rightSide[i].x, y: rightSide[i].y });
                }
            } else if (exitConn.type === 'building_vertex') {
                // Connesso a un altro vertice dello stesso o altro edificio
                // L_{half-1} e R_{half-1} sono i bevel dell'altro vertice
                // Non li aggiungiamo, il contorno dell'edificio gestirà il passaggio
                // Ma dobbiamo comunque tornare sul lato destro!

                // Lato destro: R_{half-2}, ..., R_1 (escludiamo R_{half-1} bevel e R_0 bevel)
                for (let i = 1; i < half - 1; i++) {
                    points.push({ x: rightSide[i].x, y: rightSide[i].y });
                }
            } else if (exitConn.type === 'edge') {
                // Connesso a un edge: il muro termina sull'edge
                // Aggiungi la punta e torna
                points.push({ x: leftSide[half - 1].x, y: leftSide[half - 1].y });
                points.push({ x: rightSide[0].x, y: rightSide[0].y });
                for (let i = 1; i < half - 1; i++) {
                    points.push({ x: rightSide[i].x, y: rightSide[i].y });
                }
            }
        } else {
            // enteringEnd === 'end'
            // Entriamo da L_{half-1} (bevel_L alla fine, già aggiunto)
            // Percorriamo il lato sinistro all'indietro: L_{half-2}, L_{half-3}, ..., L_1
            for (let i = half - 2; i > 0; i--) {
                points.push({ x: leftSide[i].x, y: leftSide[i].y });
            }

            if (!exitConn) {
                // Estremo libero (start): aggiungi la punta e torna sul lato destro
                points.push({ x: leftSide[0].x, y: leftSide[0].y });               // L_0 (punta L)
                points.push({ x: rightSide[half - 1].x, y: rightSide[half - 1].y }); // R_0 (punta R)

                // Lato destro: R_1, R_2, ..., R_{half-2}
                for (let i = half - 2; i > 0; i--) {
                    points.push({ x: rightSide[i].x, y: rightSide[i].y });
                }
            } else if (exitConn.type === 'wall') {
                points.push({ x: leftSide[0].x, y: leftSide[0].y }); // L_0

                const nextWall = this.walls.get(exitConn.targetWallId);
                if (nextWall && !visitedWalls.has(nextWall.id)) {
                    const nextPoints = this._getWallContourBetweenConnections(
                        nextWall,
                        exitConn.targetWallEnd,
                        wallConnections,
                        group,
                        preserveUnitVertices,
                        visitedWalls
                    );
                    points.push(...nextPoints);
                }

                points.push({ x: rightSide[half - 1].x, y: rightSide[half - 1].y }); // R_0
                for (let i = half - 2; i > 0; i--) {
                    points.push({ x: rightSide[i].x, y: rightSide[i].y });
                }
            } else if (exitConn.type === 'building_vertex') {
                for (let i = half - 2; i > 0; i--) {
                    points.push({ x: rightSide[i].x, y: rightSide[i].y });
                }
            } else if (exitConn.type === 'edge') {
                points.push({ x: leftSide[0].x, y: leftSide[0].y });
                points.push({ x: rightSide[half - 1].x, y: rightSide[half - 1].y });
                for (let i = half - 2; i > 0; i--) {
                    points.push({ x: rightSide[i].x, y: rightSide[i].y });
                }
            }
        }

        return points;
    }

}