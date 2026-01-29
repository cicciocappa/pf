// ============================================================================
// CROWD SIMULATION - Implementazione basata su navcat/Detour
// ============================================================================

// ----------------------------------------------------------------------------
// VECTOR3 UTILITIES con Object Pooling
// ----------------------------------------------------------------------------
const Vec3Pool = {
    pool: [],
    get() {
        return this.pool.length > 0 ? this.pool.pop() : { x: 0, y: 0, z: 0 };
    },
    release(v) {
        if (v) this.pool.push(v);
    },
    create(x = 0, y = 0, z = 0) {
        const v = this.get();
        v.x = x; v.y = y; v.z = z;
        return v;
    }
};

const vec3 = {
    create: (x = 0, y = 0, z = 0) => ({ x, y, z }),
    copy: (out, a) => { out.x = a.x; out.y = a.y; out.z = a.z; return out; },
    set: (out, x, y, z) => { out.x = x; out.y = y; out.z = z; return out; },
    add: (out, a, b) => { out.x = a.x + b.x; out.y = a.y + b.y; out.z = a.z + b.z; return out; },
    sub: (out, a, b) => { out.x = a.x - b.x; out.y = a.y - b.y; out.z = a.z - b.z; return out; },
    scale: (out, a, s) => { out.x = a.x * s; out.y = a.y * s; out.z = a.z * s; return out; },
    scaleAndAdd: (out, a, b, s) => { out.x = a.x + b.x * s; out.y = a.y + b.y * s; out.z = a.z + b.z * s; return out; },
    dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
    cross: (out, a, b) => {
        const ax = a.x, ay = a.y, az = a.z;
        const bx = b.x, by = b.y, bz = b.z;
        out.x = ay * bz - az * by;
        out.y = az * bx - ax * bz;
        out.z = ax * by - ay * bx;
        return out;
    },
    length: (a) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z),
    lengthSq: (a) => a.x * a.x + a.y * a.y + a.z * a.z,
    distance: (a, b) => {
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    },
    distanceSq: (a, b) => {
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        return dx * dx + dy * dy + dz * dz;
    },
    distanceXZ: (a, b) => {
        const dx = b.x - a.x, dz = b.z - a.z;
        return Math.sqrt(dx * dx + dz * dz);
    },
    normalize: (out, a) => {
        const len = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
        if (len > 0.00001) {
            const invLen = 1 / len;
            out.x = a.x * invLen; out.y = a.y * invLen; out.z = a.z * invLen;
        } else {
            out.x = 0; out.y = 0; out.z = 0;
        }
        return out;
    },
    lerp: (out, a, b, t) => {
        out.x = a.x + (b.x - a.x) * t;
        out.y = a.y + (b.y - a.y) * t;
        out.z = a.z + (b.z - a.z) * t;
        return out;
    },
    clone: (a) => ({ x: a.x, y: a.y, z: a.z })
};

// 2D cross product (per il funnel algorithm)
function triArea2D(a, b, c) {
    return (c.x - a.x) * (b.z - a.z) - (b.x - a.x) * (c.z - a.z);
}

// ----------------------------------------------------------------------------
// AGENT STATE ENUM
// ----------------------------------------------------------------------------
const AgentState = {
    INVALID: 0,
    WALKING: 1,
    OFFMESH: 2
};

const AgentTargetState = {
    NONE: 0,
    FAILED: 1,
    VALID: 2,
    REQUESTING: 3,
    WAITING_FOR_QUEUE: 4,
    WAITING_FOR_PATH: 5,
    VELOCITY: 6
};

// Flag per controllare il comportamento degli agenti (come navcat CrowdUpdateFlags)
const CrowdUpdateFlags = {
    ANTICIPATE_TURNS: 1,      // Steering morbido con anticipazione curve
    OBSTACLE_AVOIDANCE: 2,    // Evita ostacoli con velocity sampling
    SEPARATION: 4,            // Separazione da altri agenti
    OPTIMIZE_VIS: 8,          // Ottimizzazione visibilità del path
    OPTIMIZE_TOPO: 16         // Ottimizzazione topologica del path
};

// ----------------------------------------------------------------------------
// NAVMESH STRUCTURE
// ----------------------------------------------------------------------------
class NavMesh {
    constructor() {
        this.vertices = [];      // Array di Vec3
        this.polygons = [];      // Array di Polygon
        this.bounds = { min: vec3.create(), max: vec3.create() };
    }

    loadFromJSON(json) {
        console.log("loading...");
        this.vertices = json.vertices.map(v => vec3.create(v[0], v[1], v[2]));

        this.polygons = json.polygons.map((polyData, index) => {
            const poly = new Polygon(index);
            poly.vertexIndices = polyData.vertices;
            poly.neighbors = polyData.neighbors || [];
            poly.computeCenter(this.vertices);
            poly.computeEdges(this.vertices);
            return poly;
        });

        this.computeBounds();
        this.buildAdjacency();
        console.log("done");
    }

    computeBounds() {
        if (this.vertices.length === 0) return;

        vec3.copy(this.bounds.min, this.vertices[0]);
        vec3.copy(this.bounds.max, this.vertices[0]);

        for (const v of this.vertices) {
            this.bounds.min.x = Math.min(this.bounds.min.x, v.x);
            this.bounds.min.y = Math.min(this.bounds.min.y, v.y);
            this.bounds.min.z = Math.min(this.bounds.min.z, v.z);
            this.bounds.max.x = Math.max(this.bounds.max.x, v.x);
            this.bounds.max.y = Math.max(this.bounds.max.y, v.y);
            this.bounds.max.z = Math.max(this.bounds.max.z, v.z);
        }
    }

    buildAdjacency() {
        // Costruisce le relazioni di adiacenza tra poligoni basandosi sui bordi condivisi
        const edgeMap = new Map();

        for (const poly of this.polygons) {
            const verts = poly.vertexIndices;
            for (let i = 0; i < verts.length; i++) {
                const v1 = verts[i];
                const v2 = verts[(i + 1) % verts.length];
                const edgeKey = v1 < v2 ? `${v1}-${v2}` : `${v2}-${v1}`;

                if (!edgeMap.has(edgeKey)) {
                    edgeMap.set(edgeKey, []);
                }
                edgeMap.get(edgeKey).push({ poly, edgeIndex: i });
            }
        }

        // Collega i poligoni adiacenti
        for (const [_, edges] of edgeMap) {
            if (edges.length === 2) {
                const p1 = edges[0].poly;
                const p2 = edges[1].poly;
                if (!p1.neighbors.includes(p2.index)) p1.neighbors.push(p2.index);
                if (!p2.neighbors.includes(p1.index)) p2.neighbors.push(p1.index);

                // Portale da p1 a p2: determina left/right in base alla posizione di p2
                const e1 = edges[0].edgeIndex;
                const va1 = this.vertices[p1.vertexIndices[e1]];
                const vb1 = this.vertices[p1.vertexIndices[(e1 + 1) % p1.vertexIndices.length]];

                // Portale da p2 a p1: determina left/right in base alla posizione di p1
                const e2 = edges[1].edgeIndex;
                const va2 = this.vertices[p2.vertexIndices[e2]];
                const vb2 = this.vertices[p2.vertexIndices[(e2 + 1) % p2.vertexIndices.length]];

                // Per determinare left/right, usiamo il centro del poligono di destinazione
                // Se il centro di p2 è a sinistra della linea va1->vb1, allora vb1 è left
                // (triArea2D > 0 significa che il terzo punto è a sinistra)
                const area1 = triArea2D(va1, vb1, p2.center);
                if (area1 >= 0) {
                    // p2.center è a sinistra di va1->vb1
                    p1.portals.set(p2.index, { left: vb1, right: va1 });
                } else {
                    // p2.center è a destra di va1->vb1
                    p1.portals.set(p2.index, { left: va1, right: vb1 });
                }

                const area2 = triArea2D(va2, vb2, p1.center);
                if (area2 >= 0) {
                    p2.portals.set(p1.index, { left: vb2, right: va2 });
                } else {
                    p2.portals.set(p1.index, { left: va2, right: vb2 });
                }
            }
        }
    }

    // Trova il poligono che contiene un punto (proiezione XZ)
    findPolygonAtPosition(pos) {
        for (const poly of this.polygons) {
            if (this.isPointInPolygon(pos, poly)) {
                return poly;
            }
        }
        return null;
    }

    // Ray casting algorithm - più robusto per qualsiasi ordine di vertici
    isPointInPolygon(point, poly) {
        const verts = poly.vertexIndices.map(i => this.vertices[i]);
        const n = verts.length;
        let inside = false;

        const px = point.x;
        const pz = point.z;

        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = verts[i].x, zi = verts[i].z;
            const xj = verts[j].x, zj = verts[j].z;

            // Ray casting: conta quante volte un raggio orizzontale interseca i bordi
            if (((zi > pz) !== (zj > pz)) &&
                (px < (xj - xi) * (pz - zi) / (zj - zi) + xi)) {
                inside = !inside;
            }
        }

        return inside;
    }

    // Proietta un punto sul poligono più vicino
    projectToNavMesh(pos) {
        let bestPoly = null;
        let bestDist = Infinity;
        let bestPoint = vec3.clone(pos);

        for (const poly of this.polygons) {
            const projected = this.projectToPolygon(pos, poly);
            const dist = vec3.distanceXZ(pos, projected);

            if (dist < bestDist) {
                bestDist = dist;
                bestPoly = poly;
                bestPoint = projected;
            }
        }

        return { point: bestPoint, polygon: bestPoly };
    }

    projectToPolygon(pos, poly) {
        // Se il punto è dentro il poligono, usa la posizione direttamente
        if (this.isPointInPolygon(pos, poly)) {
            return vec3.create(pos.x, poly.center.y, pos.z);
        }

        // Altrimenti trova il punto più vicino sui bordi
        const verts = poly.vertexIndices.map(i => this.vertices[i]);
        let bestPoint = vec3.clone(pos);
        let bestDist = Infinity;

        for (let i = 0; i < verts.length; i++) {
            const v1 = verts[i];
            const v2 = verts[(i + 1) % verts.length];
            const closest = this.closestPointOnSegment(pos, v1, v2);
            const dist = vec3.distanceXZ(pos, closest);

            if (dist < bestDist) {
                bestDist = dist;
                bestPoint = closest;
            }
        }

        return bestPoint;
    }

    closestPointOnSegment(p, a, b) {
        const ab = vec3.sub(vec3.create(), b, a);
        const ap = vec3.sub(vec3.create(), p, a);

        const t = Math.max(0, Math.min(1,
            (ap.x * ab.x + ap.z * ab.z) / (ab.x * ab.x + ab.z * ab.z + 0.0001)
        ));

        return vec3.create(
            a.x + ab.x * t,
            a.y + ab.y * t,
            a.z + ab.z * t
        );
    }

    // Trova i bordi del poligono (per local boundary)
    getPolygonEdges(poly) {
        const edges = [];
        const verts = poly.vertexIndices.map(i => this.vertices[i]);

        for (let i = 0; i < verts.length; i++) {
            const v1 = verts[i];
            const v2 = verts[(i + 1) % verts.length];

            // Verifica se questo bordo è condiviso con un altro poligono
            const isShared = poly.neighbors.some(neighborIdx => {
                const neighbor = this.polygons[neighborIdx];
                const portal = poly.portals.get(neighborIdx);
                if (!portal) return false;

                // Controlla se questo bordo corrisponde al portale
                const d1 = vec3.distanceXZ(v1, portal.left) + vec3.distanceXZ(v2, portal.right);
                const d2 = vec3.distanceXZ(v1, portal.right) + vec3.distanceXZ(v2, portal.left);
                return d1 < 0.01 || d2 < 0.01;
            });

            if (!isShared) {
                edges.push({ start: vec3.clone(v1), end: vec3.clone(v2) });
            }
        }

        return edges;
    }
}

class Polygon {
    constructor(index) {
        this.index = index;
        this.vertexIndices = [];
        this.neighbors = [];
        this.portals = new Map();  // neighborIndex -> {left, right}
        this.center = vec3.create();
        this.edges = [];
    }

    computeCenter(vertices) {
        this.center = vec3.create();
        for (const idx of this.vertexIndices) {
            vec3.add(this.center, this.center, vertices[idx]);
        }
        vec3.scale(this.center, this.center, 1 / this.vertexIndices.length);
    }

    computeEdges(vertices) {
        this.edges = [];
        for (let i = 0; i < this.vertexIndices.length; i++) {
            const v1 = vertices[this.vertexIndices[i]];
            const v2 = vertices[this.vertexIndices[(i + 1) % this.vertexIndices.length]];
            this.edges.push({ start: v1, end: v2 });
        }
    }
}

// ----------------------------------------------------------------------------
// QUERY FILTER - Filtro per poligoni accessibili (come navcat QueryFilter)
// ----------------------------------------------------------------------------
class QueryFilter {
    constructor() {
        // Set di indici di poligoni bloccati
        this.blockedPolygons = new Set();
        // Costi personalizzati per poligono (opzionale)
        this.polygonCosts = new Map();
        // Costo di default
        this.defaultCost = 1.0;
    }

    // Verifica se un poligono è attraversabile
    passFilter(polyIndex, navMesh) {
        return !this.blockedPolygons.has(polyIndex);
    }

    // Ottiene il costo di attraversamento di un poligono
    getCost(polyIndex) {
        return this.polygonCosts.get(polyIndex) ?? this.defaultCost;
    }

    // Blocca un poligono
    blockPolygon(polyIndex) {
        this.blockedPolygons.add(polyIndex);
    }

    // Sblocca un poligono
    unblockPolygon(polyIndex) {
        this.blockedPolygons.delete(polyIndex);
    }

    // Verifica se un poligono è bloccato
    isBlocked(polyIndex) {
        return this.blockedPolygons.has(polyIndex);
    }

    // Imposta il costo di un poligono (per pathfinding con costi variabili)
    setPolygonCost(polyIndex, cost) {
        this.polygonCosts.set(polyIndex, cost);
    }

    // Resetta tutti i blocchi
    clearAllBlocks() {
        this.blockedPolygons.clear();
    }

    // Resetta tutti i costi
    clearAllCosts() {
        this.polygonCosts.clear();
    }
}

// ----------------------------------------------------------------------------
// PATHFINDING - A* e Path Corridor
// ----------------------------------------------------------------------------
class PathFinder {
    constructor(navMesh) {
        this.navMesh = navMesh;
    }

    // A* per trovare il percorso tra due poligoni
    findPath(startPoly, endPoly, filter = null) {
        if (!startPoly || !endPoly) return null;
        if (startPoly.index === endPoly.index) return [startPoly.index];

        // Verifica che start e end non siano bloccati
        if (filter) {
            if (!filter.passFilter(startPoly.index, this.navMesh)) return null;
            if (!filter.passFilter(endPoly.index, this.navMesh)) return null;
        }

        const openSet = new Map();
        const closedSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        gScore.set(startPoly.index, 0);
        fScore.set(startPoly.index, this.heuristic(startPoly, endPoly));
        openSet.set(startPoly.index, fScore.get(startPoly.index));

        while (openSet.size > 0) {
            // Trova il nodo con fScore minore
            let current = null;
            let minF = Infinity;
            for (const [idx, f] of openSet) {
                if (f < minF) {
                    minF = f;
                    current = idx;
                }
            }

            if (current === endPoly.index) {
                return this.reconstructPath(cameFrom, current);
            }

            openSet.delete(current);
            closedSet.add(current);

            const currentPoly = this.navMesh.polygons[current];

            for (const neighborIdx of currentPoly.neighbors) {
                if (closedSet.has(neighborIdx)) continue;

                // Filtra poligoni bloccati
                if (filter && !filter.passFilter(neighborIdx, this.navMesh)) continue;

                const neighbor = this.navMesh.polygons[neighborIdx];
                // Calcola costo con filtro opzionale
                const baseCost = vec3.distanceXZ(currentPoly.center, neighbor.center);
                const cost = filter ? baseCost * filter.getCost(neighborIdx) : baseCost;
                const tentativeG = gScore.get(current) + cost;

                if (!gScore.has(neighborIdx) || tentativeG < gScore.get(neighborIdx)) {
                    cameFrom.set(neighborIdx, current);
                    gScore.set(neighborIdx, tentativeG);
                    fScore.set(neighborIdx, tentativeG + this.heuristic(neighbor, endPoly));

                    if (!openSet.has(neighborIdx)) {
                        openSet.set(neighborIdx, fScore.get(neighborIdx));
                    }
                }
            }
        }

        return null; // Nessun percorso trovato
    }

    heuristic(polyA, polyB) {
        return vec3.distanceXZ(polyA.center, polyB.center);
    }

    reconstructPath(cameFrom, current) {
        const path = [current];
        while (cameFrom.has(current)) {
            current = cameFrom.get(current);
            path.unshift(current);
        }
        return path;
    }
}

// ----------------------------------------------------------------------------
// FUNNEL ALGORITHM (String Pulling) - Implementazione fedele a navcat
// ----------------------------------------------------------------------------
class FunnelAlgorithm {
    constructor(navMesh) {
        this.navMesh = navMesh;
    }

    // Trova il percorso rettilineo attraverso i portali
    findStraightPath(startPos, endPos, polyPath) {
        if (!polyPath || polyPath.length === 0) {
            return [vec3.clone(startPos), vec3.clone(endPos)];
        }

        // Caso speciale: start e end nello stesso poligono
        if (polyPath.length === 1) {
            return [vec3.clone(startPos), vec3.clone(endPos)];
        }

        const path = [];

        // Aggiungi il punto di partenza
        path.push(vec3.clone(startPos));

        // Costruisci i portali dal path di poligoni
        const portals = [];

        for (let i = 0; i < polyPath.length - 1; i++) {
            const fromPoly = this.navMesh.polygons[polyPath[i]];
            const toPoly = this.navMesh.polygons[polyPath[i + 1]];
            const portal = fromPoly.portals.get(toPoly.index);

            if (portal) {
                portals.push({
                    left: vec3.clone(portal.left),
                    right: vec3.clone(portal.right)
                });
            } else {
                // Fallback: usa i centri dei poligoni
                portals.push({
                    left: vec3.clone(toPoly.center),
                    right: vec3.clone(toPoly.center)
                });
            }
        }

        // Aggiungi il punto finale come portale degenere
        portals.push({
            left: vec3.clone(endPos),
            right: vec3.clone(endPos)
        });

        // ===== FUNNEL ALGORITHM (Simple Stupid Funnel) =====
        // Inizializza l'apex e i lati del funnel alla posizione di partenza
        const portalApex = vec3.clone(startPos);
        const portalLeft = vec3.clone(startPos);
        const portalRight = vec3.clone(startPos);

        let apexIndex = 0;
        let leftIndex = 0;
        let rightIndex = 0;

        for (let i = 0; i < portals.length; i++) {
            const left = portals[i].left;
            const right = portals[i].right;

            // Aggiorna il vertice destro del funnel
            if (triArea2D(portalApex, portalRight, right) <= 0.0) {
                // Il nuovo punto destro è "dentro" o sul confine del funnel
                if (this.vequal(portalApex, portalRight) || triArea2D(portalApex, portalLeft, right) > 0.0) {
                    // Restringi il funnel a destra
                    vec3.copy(portalRight, right);
                    rightIndex = i;
                } else {
                    // Il lato destro attraversa il sinistro: il funnel si è invertito
                    // Aggiungi il punto sinistro come waypoint
                    path.push(vec3.clone(portalLeft));

                    // Resetta l'apex al punto sinistro
                    vec3.copy(portalApex, portalLeft);
                    apexIndex = leftIndex;

                    // Resetta il funnel
                    vec3.copy(portalLeft, portalApex);
                    vec3.copy(portalRight, portalApex);
                    leftIndex = apexIndex;
                    rightIndex = apexIndex;

                    // Riparti da questo punto
                    i = apexIndex;
                    continue;
                }
            }

            // Aggiorna il vertice sinistro del funnel
            if (triArea2D(portalApex, portalLeft, left) >= 0.0) {
                // Il nuovo punto sinistro è "dentro" o sul confine del funnel
                if (this.vequal(portalApex, portalLeft) || triArea2D(portalApex, portalRight, left) < 0.0) {
                    // Restringi il funnel a sinistra
                    vec3.copy(portalLeft, left);
                    leftIndex = i;
                } else {
                    // Il lato sinistro attraversa il destro: il funnel si è invertito
                    // Aggiungi il punto destro come waypoint
                    path.push(vec3.clone(portalRight));

                    // Resetta l'apex al punto destro
                    vec3.copy(portalApex, portalRight);
                    apexIndex = rightIndex;

                    // Resetta il funnel
                    vec3.copy(portalLeft, portalApex);
                    vec3.copy(portalRight, portalApex);
                    leftIndex = apexIndex;
                    rightIndex = apexIndex;

                    // Riparti da questo punto
                    i = apexIndex;
                    continue;
                }
            }
        }

        // Aggiungi il punto finale se diverso dall'ultimo punto
        const lastPoint = path[path.length - 1];
        if (!this.vequal(lastPoint, endPos)) {
            path.push(vec3.clone(endPos));
        }

        return path;
    }

    // Confronto vettori con tolleranza
    vequal(a, b) {
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        return (dx * dx + dz * dz) < 0.0001;
    }
}

// ----------------------------------------------------------------------------
// PATH CORRIDOR (implementazione navcat)
// ----------------------------------------------------------------------------
class PathCorridor {
    constructor() {
        this.path = [];           // Array di polygon indices
        this.corners = [];        // Array di Vec3 (waypoints)
        this.position = vec3.create();  // Posizione corrente vincolata (come navcat)
        this.target = vec3.create();    // Posizione target
        this.currentPoly = null;
    }

    reset(nodeRef = null, position = null) {
        if (position) {
            vec3.copy(this.position, position);
            vec3.copy(this.target, position);
        } else {
            vec3.set(this.position, 0, 0, 0);
            vec3.set(this.target, 0, 0, 0);
        }
        this.path = nodeRef !== null ? [nodeRef] : [];
        this.corners = [];
        this.currentPoly = null;
    }

    setPath(polyPath, corners, targetPos) {
        this.path = polyPath ? [...polyPath] : [];
        this.corners = corners ? corners.map(c => vec3.clone(c)) : [];
        vec3.copy(this.target, targetPos);
        // Alias per compatibilità
        this.targetPos = this.target;
    }

    // Verifica se il corridoio è valido (come navcat corridorIsValid)
    isValid(maxLookAhead, navMesh) {
        const n = Math.min(this.path.length, maxLookAhead);

        for (let i = 0; i < n; i++) {
            const polyIdx = this.path[i];
            if (polyIdx < 0 || polyIdx >= navMesh.polygons.length) {
                return false;
            }
        }

        return this.path.length > 0;
    }

    // Ottimizza il corridoio (versione semplificata di navcat optimizePathTopology)
    optimizePathTopology(agentPos, navMesh) {
        if (this.path.length < 3) return false;

        // Trova il poligono corrente dell'agente
        const currentPoly = navMesh.findPolygonAtPosition(agentPos);
        if (!currentPoly) return false;

        // Trova l'indice del poligono corrente nel path
        const currentIdx = this.path.indexOf(currentPoly.index);

        if (currentIdx > 0) {
            // Rimuovi i poligoni già attraversati
            this.path = this.path.slice(currentIdx);
        }

        this.currentPoly = currentPoly;

        // Prova a trovare scorciatoie nel path rimanente
        // Cerca se possiamo raggiungere direttamente un poligono più avanti
        if (this.path.length > 2) {
            const startPoly = navMesh.polygons[this.path[0]];
            if (startPoly) {
                // Controlla se possiamo saltare al secondo o terzo poligono
                for (let i = Math.min(this.path.length - 1, 3); i > 1; i--) {
                    const targetPolyIdx = this.path[i];
                    // Verifica se c'è un collegamento diretto
                    if (startPoly.neighbors.includes(targetPolyIdx)) {
                        // Possiamo saltare i poligoni intermedi
                        this.path = [this.path[0], ...this.path.slice(i)];
                        return true;
                    }
                }
            }
        }

        return false;
    }

    // Ottimizza il path con visibilità (raycast) - versione semplificata
    optimizePathVisibility(agentPos, targetCorner, range, navMesh) {
        if (this.path.length < 2) return;

        // Verifica se il target è direttamente visibile
        const startPoly = navMesh.polygons[this.path[0]];
        if (!startPoly) return;

        // Semplice check: se il target corner è nel poligono corrente o adiacente
        const targetPoly = navMesh.findPolygonAtPosition(targetCorner);
        if (!targetPoly) return;

        // Se il target è in un poligono adiacente, possiamo potenzialmente accorciare
        if (startPoly.neighbors.includes(targetPoly.index)) {
            const targetIdx = this.path.indexOf(targetPoly.index);
            if (targetIdx > 1) {
                // Accorcia il path
                this.path = [this.path[0], targetPoly.index, ...this.path.slice(targetIdx + 1)];
            }
        }
    }

    getNextCorner() {
        if (this.corners.length > 1) {
            return this.corners[1]; // Il primo corner è la posizione attuale
        }
        return this.target;
    }
}

// ----------------------------------------------------------------------------
// LOCAL BOUNDARY - Bordi statici per collision avoidance (implementazione navcat)
// ----------------------------------------------------------------------------
const MAX_LOCAL_SEGS = 8;
const MAX_LOCAL_POLYS = 16;

class LocalBoundary {
    constructor() {
        this.segments = [];  // Array di {start, end, dist}
        this.polys = [];     // Array di polygon indices
        this.center = vec3.create(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
    }

    reset() {
        vec3.set(this.center, Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
        this.segments = [];
        this.polys = [];
    }

    // Calcola distanza^2 da punto a segmento in 2D
    distancePtSegSqr2d(pt, segStart, segEnd) {
        const pqx = segEnd.x - segStart.x;
        const pqz = segEnd.z - segStart.z;
        const dx = pt.x - segStart.x;
        const dz = pt.z - segStart.z;

        const d = pqx * pqx + pqz * pqz;
        let t = pqx * dx + pqz * dz;
        if (d > 0) t /= d;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;

        const nearestX = segStart.x + t * pqx;
        const nearestZ = segStart.z + t * pqz;

        const distX = pt.x - nearestX;
        const distZ = pt.z - nearestZ;

        return distX * distX + distZ * distZ;
    }

    // Aggiunge un segmento ordinato per distanza (come navcat)
    addSegment(dist, start, end) {
        // Trova punto di inserimento basato sulla distanza
        let insertIdx = 0;
        for (let i = 0; i < this.segments.length; i++) {
            if (dist <= this.segments[i].dist) {
                insertIdx = i;
                break;
            }
            insertIdx = i + 1;
        }

        // Non superare il massimo di segmenti
        if (this.segments.length >= MAX_LOCAL_SEGS) {
            if (insertIdx >= MAX_LOCAL_SEGS) return;
            this.segments.pop();
        }

        // Crea nuovo segmento
        const segment = {
            start: vec3.clone(start),
            end: vec3.clone(end),
            dist: dist
        };

        // Inserisci nella posizione corretta
        this.segments.splice(insertIdx, 0, segment);
    }

    update(agentPos, navMesh, range) {
        vec3.copy(this.center, agentPos);
        this.segments = [];
        this.polys = [];

        const rangeSqr = range * range;

        // Trova tutti i poligoni nel range
        for (const poly of navMesh.polygons) {
            if (vec3.distanceXZ(agentPos, poly.center) > range * 2) continue;

            // Limita il numero di poligoni
            if (this.polys.length < MAX_LOCAL_POLYS) {
                this.polys.push(poly.index);
            }

            // Aggiungi i bordi non condivisi (muri)
            const edges = navMesh.getPolygonEdges(poly);
            for (const edge of edges) {
                // Calcola distanza dal segmento
                const distSqr = this.distancePtSegSqr2d(agentPos, edge.start, edge.end);

                // Salta segmenti troppo lontani
                if (distSqr > rangeSqr) continue;

                // Aggiungi ordinato per distanza
                this.addSegment(distSqr, edge.start, edge.end);
            }
        }
    }

    // Verifica se il boundary è ancora valido
    isValid(navMesh) {
        if (this.polys.length === 0) return false;

        for (const polyIdx of this.polys) {
            if (polyIdx < 0 || polyIdx >= navMesh.polygons.length) {
                return false;
            }
        }

        return true;
    }
}

// ----------------------------------------------------------------------------
// PROXIMITY GRID - Spatial Hashing per trovare i vicini
// ----------------------------------------------------------------------------
class ProximityGrid {
    constructor(cellSize = 2.0) {
        this.cellSize = cellSize;
        this.grid = new Map();
    }

    clear() {
        this.grid.clear();
    }

    hash(x, z) {
        const ix = Math.floor(x / this.cellSize);
        const iz = Math.floor(z / this.cellSize);
        return `${ix},${iz}`;
    }

    insert(agent) {
        const key = this.hash(agent.position.x, agent.position.z);
        if (!this.grid.has(key)) {
            this.grid.set(key, []);
        }
        this.grid.get(key).push(agent);
    }

    query(position, range) {
        const neighbors = [];
        const cellRange = Math.ceil(range / this.cellSize);
        const cx = Math.floor(position.x / this.cellSize);
        const cz = Math.floor(position.z / this.cellSize);

        for (let dx = -cellRange; dx <= cellRange; dx++) {
            for (let dz = -cellRange; dz <= cellRange; dz++) {
                const key = `${cx + dx},${cz + dz}`;
                const cell = this.grid.get(key);
                if (cell) {
                    for (const agent of cell) {
                        if (vec3.distanceXZ(position, agent.position) <= range) {
                            neighbors.push(agent);
                        }
                    }
                }
            }
        }

        return neighbors;
    }
}

// ----------------------------------------------------------------------------
// OBSTACLE AVOIDANCE - Velocity Sampling (implementazione navcat)
// ----------------------------------------------------------------------------
class ObstacleAvoidanceQuery {
    constructor() {
        this.params = {
            velBias: 0.4,
            weightDesVel: 2.0,
            weightCurVel: 0.75,
            weightSide: 0.75,
            weightToi: 2.5,
            horizTime: 2.5,
            gridSize: 33,
            adaptiveDivs: 7,
            adaptiveRings: 2,
            adaptiveDepth: 5
        };
        this.circles = [];
        this.segments = [];
        this.invHorizTime = 0;
        this.vmax = 0;
        this.invVmax = 0;
    }

    // Prepara gli ostacoli prima del sampling (come navcat)
    prepareObstacles(pos, desiredVel, neighbors, boundarySegments) {
        this.circles = [];
        this.segments = [];

        // Prepara ostacoli circolari (altri agenti)
        for (const neighbor of neighbors) {
            const circle = {
                p: neighbor.position,
                vel: neighbor.velocity,
                dvel: neighbor.desiredVelocity,
                rad: neighbor.radius,
                dp: vec3.create(),  // direzione verso l'ostacolo
                np: vec3.create()   // normale per side selection
            };

            // Calcola dp (direzione verso l'ostacolo)
            vec3.sub(circle.dp, circle.p, pos);
            vec3.normalize(circle.dp, circle.dp);

            // Calcola np (normale per side selection)
            const dv = vec3.create();
            vec3.sub(dv, circle.dvel, desiredVel);
            const orig = vec3.create();
            const a = this.triArea2D(orig, circle.dp, dv);

            if (a < 0.01) {
                circle.np.x = -circle.dp.z;
                circle.np.y = 0;
                circle.np.z = circle.dp.x;
            } else {
                circle.np.x = circle.dp.z;
                circle.np.y = 0;
                circle.np.z = -circle.dp.x;
            }

            this.circles.push(circle);
        }

        // Prepara segmenti (muri)
        for (const seg of boundarySegments) {
            const segment = {
                p: seg.start,
                q: seg.end,
                touch: false
            };

            // Controlla se l'agente è molto vicino al segmento
            const distSqr = this.distancePtSegSqr2D(pos, seg.start, seg.end);
            segment.touch = distSqr < 0.01 * 0.01;

            this.segments.push(segment);
        }
    }

    triArea2D(a, b, c) {
        const abx = b.x - a.x;
        const abz = b.z - a.z;
        const acx = c.x - a.x;
        const acz = c.z - a.z;
        return acx * abz - abx * acz;
    }

    distancePtSegSqr2D(pt, p, q) {
        const pqx = q.x - p.x;
        const pqz = q.z - p.z;
        const dx = pt.x - p.x;
        const dz = pt.z - p.z;

        const d = pqx * pqx + pqz * pqz;
        let t = pqx * dx + pqz * dz;
        if (d > 0) t /= d;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;

        const nearestX = p.x + t * pqx;
        const nearestZ = p.z + t * pqz;

        const distX = pt.x - nearestX;
        const distZ = pt.z - nearestZ;

        return distX * distX + distZ * distZ;
    }

    // Campionamento adattivo della velocità (algoritmo navcat)
    sampleVelocityAdaptive(pos, radius, vmax, vel, desiredVel, neighbors, segments) {
        if (neighbors.length === 0 && segments.length === 0) {
            return vec3.clone(desiredVel);
        }

        // Prepara gli ostacoli
        this.prepareObstacles(pos, desiredVel, neighbors, segments);

        this.invHorizTime = 1.0 / this.params.horizTime;
        this.vmax = vmax;
        this.invVmax = vmax > 0 ? 1.0 / vmax : Infinity;

        const nDivs = Math.max(1, Math.min(this.params.adaptiveDivs, 32));
        const nRings = Math.max(1, Math.min(this.params.adaptiveRings, 4));
        const depth = this.params.adaptiveDepth;

        // Genera pattern allineato alla velocità desiderata
        const pattern = this.generateAdaptivePattern(desiredVel, nDivs, nRings);

        // Inizia il sampling
        let cr = vmax * (1.0 - this.params.velBias);
        const res = vec3.create(
            desiredVel.x * this.params.velBias,
            0,
            desiredVel.z * this.params.velBias
        );

        const vmaxSqr = (vmax + 0.001) * (vmax + 0.001);

        for (let k = 0; k < depth; k++) {
            let minPenalty = Infinity;
            const bvel = vec3.create();

            for (const p of pattern) {
                const vcand = vec3.create(
                    res.x + p.x * cr,
                    0,
                    res.z + p.z * cr
                );

                // Verifica limiti velocità
                if (vcand.x * vcand.x + vcand.z * vcand.z > vmaxSqr) {
                    continue;
                }

                const penalty = this.processSample(vcand, pos, radius, vel, desiredVel, minPenalty);

                if (penalty < minPenalty) {
                    minPenalty = penalty;
                    vec3.copy(bvel, vcand);
                }
            }

            vec3.copy(res, bvel);
            cr *= 0.5;
        }

        return res;
    }

    generateAdaptivePattern(desiredVel, nDivs, nRings) {
        const pattern = [];
        const da = (1.0 / nDivs) * Math.PI * 2;
        const ca = Math.cos(da);
        const sa = Math.sin(da);

        // Direzione desiderata normalizzata
        const ddir = vec3.clone(desiredVel);
        const len = Math.sqrt(ddir.x * ddir.x + ddir.z * ddir.z);
        if (len > 0.001) {
            ddir.x /= len;
            ddir.z /= len;
        } else {
            ddir.x = 1;
            ddir.z = 0;
        }

        // Direzione ruotata di da/2
        const ddir2 = vec3.create(
            ddir.x * Math.cos(da * 0.5) - ddir.z * Math.sin(da * 0.5),
            0,
            ddir.x * Math.sin(da * 0.5) + ddir.z * Math.cos(da * 0.5)
        );

        // Aggiungi sempre il centro
        pattern.push(vec3.create(0, 0, 0));

        // Genera anelli
        for (let j = 0; j < nRings; j++) {
            const r = (nRings - j) / nRings;
            const baseDir = (j % 2 === 0) ? ddir : ddir2;

            let px = baseDir.x * r;
            let pz = baseDir.z * r;
            pattern.push(vec3.create(px, 0, pz));

            // Genera punti alternati a destra e sinistra
            for (let i = 1; i < nDivs; i++) {
                // Ruota
                const newPx = px * ca + pz * sa;
                const newPz = -px * sa + pz * ca;
                px = newPx;
                pz = newPz;
                pattern.push(vec3.create(px, 0, pz));
            }
        }

        return pattern;
    }

    processSample(vcand, pos, radius, vel, desiredVel, minPenalty) {
        // Penalità per distanza dalla velocità desiderata
        const vpen = this.params.weightDesVel * this.vdist2D(vcand, desiredVel) * this.invVmax;

        // Penalità per cambiamento dalla velocità corrente
        const vcpen = this.params.weightCurVel * this.vdist2D(vcand, vel) * this.invVmax;

        // Early out check
        const minPen = minPenalty - vpen - vcpen;
        const tThreshold = (this.params.weightToi / minPen - 0.1) * this.params.horizTime;
        if (tThreshold - this.params.horizTime > -0.0001) {
            return minPenalty;
        }

        let tmin = this.params.horizTime;
        let side = 0;
        let nside = 0;

        // Controlla ostacoli circolari (altri agenti) con RVO
        for (const cir of this.circles) {
            // RVO: vab = vcand * 2 - vel - cir.vel
            const vab = vec3.create(
                vcand.x * 2 - vel.x - cir.vel.x,
                0,
                vcand.z * 2 - vel.z - cir.vel.z
            );

            // Side bias calculation
            side += Math.max(0, Math.min(1, Math.min(
                this.vdot2D(cir.dp, vab) * 0.5 + 0.5,
                this.vdot2D(cir.np, vab) * 2
            )));
            nside++;

            // Sweep circle-circle
            const sweep = this.sweepCircleCircle(pos, radius, vab, cir.p, cir.rad);
            if (!sweep.hit) continue;

            let htmin = sweep.tmin;
            const htmax = sweep.tmax;

            // Gestisci sovrapposizioni
            if (htmin < 0.0 && htmax > 0.0) {
                htmin = -htmin * 0.5;
            }

            if (htmin >= 0.0 && htmin < tmin) {
                tmin = htmin;
                if (tmin < tThreshold) {
                    return minPenalty;
                }
            }
        }

        // Controlla segmenti (muri)
        for (const seg of this.segments) {
            let htmin;

            if (seg.touch) {
                // Caso speciale: agente molto vicino al segmento
                const sdir = vec3.create(seg.q.x - seg.p.x, 0, seg.q.z - seg.p.z);
                const snorm = vec3.create(-sdir.z, 0, sdir.x);

                if (this.vdot2D(snorm, vcand) < 0.0) continue;
                htmin = 0.0;
            } else {
                const intersection = this.intersectRaySegment(pos, vcand, seg.p, seg.q);
                if (!intersection.hit) continue;
                htmin = intersection.t;
            }

            // Evita meno i muri (moltiplica per 2)
            htmin *= 2.0;

            if (htmin < tmin) {
                tmin = htmin;
                if (tmin < tThreshold) {
                    return minPenalty;
                }
            }
        }

        // Normalizza side bias
        if (nside > 0) {
            side /= nside;
        }

        const spen = this.params.weightSide * side;
        const tpen = this.params.weightToi * (1.0 / (0.1 + tmin * this.invHorizTime));

        return vpen + vcpen + spen + tpen;
    }

    vdist2D(a, b) {
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        return Math.sqrt(dx * dx + dz * dz);
    }

    vdot2D(a, b) {
        return a.x * b.x + a.z * b.z;
    }

    vperp2D(a, b) {
        return a.x * b.z - a.z * b.x;
    }

    sweepCircleCircle(c0, r0, v, c1, r1) {
        const result = { hit: false, tmin: 0, tmax: 0 };

        const sx = c1.x - c0.x;
        const sz = c1.z - c0.z;
        const r = r0 + r1;

        const sSqr = sx * sx + sz * sz;
        const c = sSqr - r * r;

        const a = v.x * v.x + v.z * v.z;
        if (a < 0.0001) return result;

        const b = v.x * sx + v.z * sz;
        const d = b * b - a * c;

        if (d < 0.0) return result;

        const invA = 1.0 / a;
        const rd = Math.sqrt(d);
        result.hit = true;
        result.tmin = (b - rd) * invA;
        result.tmax = (b + rd) * invA;

        return result;
    }

    intersectRaySegment(ap, u, bp, bq) {
        const result = { hit: false, t: 0 };

        const vx = bq.x - bp.x;
        const vz = bq.z - bp.z;
        const wx = ap.x - bp.x;
        const wz = ap.z - bp.z;

        const d = this.vperp2D(u, { x: vx, z: vz });
        if (Math.abs(d) < 0.000001) return result;

        const invD = 1.0 / d;
        const t = (vx * wz - vz * wx) * invD;
        if (t < 0 || t > 1) return result;

        const s = (u.x * wz - u.z * wx) * invD;
        if (s < 0 || s > 1) return result;

        result.hit = true;
        result.t = t;
        return result;
    }
}

// ----------------------------------------------------------------------------
// AGENT
// ----------------------------------------------------------------------------
class Agent {
    constructor(id) {
        this.id = id;
        this.state = AgentState.WALKING;
        this.targetState = AgentTargetState.NONE;

        // Configurazione (come navcat AgentParams)
        this.radius = 0.3;
        this.height = 1.8;
        this.maxAcceleration = 8.0;
        this.maxSpeed = 3.5;
        this.collisionQueryRange = 3.0;
        this.pathOptimizationRange = 10.0;  // Default: radius * 30
        this.separationWeight = 2.0;

        // Flag di update (come navcat CrowdUpdateFlags)
        this.updateFlags = CrowdUpdateFlags.ANTICIPATE_TURNS |
                          CrowdUpdateFlags.OBSTACLE_AVOIDANCE |
                          CrowdUpdateFlags.SEPARATION |
                          CrowdUpdateFlags.OPTIMIZE_VIS |
                          CrowdUpdateFlags.OPTIMIZE_TOPO;

        // Stato cinematico
        this.position = vec3.create();
        this.velocity = vec3.create();
        this.desiredVelocity = vec3.create();
        this.desiredSpeed = 0;              // Velocità desiderata (magnitudine)
        this.newVelocity = vec3.create();
        this.displacement = vec3.create();  // Per collision resolution

        // Navigazione
        this.corridor = new PathCorridor();
        this.boundary = new LocalBoundary();
        this.targetPosition = vec3.create();
        this.corners = [];                  // Corner calcolati per steering

        // Vicini
        this.neighbors = [];

        // Timers per ottimizzazioni (come navcat)
        this.topologyOptTime = 0;

        // Selezione UI
        this.selected = false;
    }

    setTarget(targetPos, navMesh, pathFinder, funnelAlgo, filter = null) {
        vec3.copy(this.targetPosition, targetPos);

        const startPoly = navMesh.findPolygonAtPosition(this.position);
        const endPoly = navMesh.findPolygonAtPosition(targetPos);

        if (!startPoly || !endPoly) {
            this.targetState = AgentTargetState.FAILED;
            return false;
        }

        // Verifica che i poligoni non siano bloccati
        if (filter) {
            if (!filter.passFilter(startPoly.index, navMesh)) {
                this.targetState = AgentTargetState.FAILED;
                return false;
            }
            if (!filter.passFilter(endPoly.index, navMesh)) {
                this.targetState = AgentTargetState.FAILED;
                return false;
            }
        }

        // Trova il path usando il filtro
        const polyPath = pathFinder.findPath(startPoly, endPoly, filter);

        if (!polyPath) {
            this.targetState = AgentTargetState.FAILED;
            return false;
        }

        const corners = funnelAlgo.findStraightPath(this.position, targetPos, polyPath);
        this.corridor.setPath(polyPath, corners, targetPos);
        this.targetState = AgentTargetState.VALID;

        return true;
    }
}

// ----------------------------------------------------------------------------
// CROWD MANAGER
// ----------------------------------------------------------------------------
class Crowd {
    constructor() {
        this.agents = new Map();
        this.agentIdCounter = 0;
        this.navMesh = null;
        this.pathFinder = null;
        this.funnelAlgo = null;
        this.proximityGrid = new ProximityGrid(2.0);
        this.obstacleAvoidance = new ObstacleAvoidanceQuery();
        // Filtro globale per poligoni accessibili (navmesh dinamica)
        this.queryFilter = new QueryFilter();
    }

    setNavMesh(navMesh) {
        this.navMesh = navMesh;
        this.pathFinder = new PathFinder(navMesh);
        this.funnelAlgo = new FunnelAlgorithm(navMesh);
    }

    // ==================== GESTIONE POLIGONI DINAMICI ====================

    // Blocca un poligono (lo rende non attraversabile)
    blockPolygon(polyIndex) {
        this.queryFilter.blockPolygon(polyIndex);
        // Invalida i path degli agenti che usano questo poligono
        this.invalidatePathsThroughPolygon(polyIndex);
    }

    // Sblocca un poligono (lo rende attraversabile)
    unblockPolygon(polyIndex) {
        this.queryFilter.unblockPolygon(polyIndex);
        // Gli agenti con path falliti potrebbero ora trovare un percorso
        this.retryFailedPaths();
    }

    // Verifica se un poligono è bloccato
    isPolygonBlocked(polyIndex) {
        return this.queryFilter.isBlocked(polyIndex);
    }

    // Imposta il costo di attraversamento di un poligono (per evitamento soft)
    setPolygonCost(polyIndex, cost) {
        this.queryFilter.setPolygonCost(polyIndex, cost);
        // Opzionale: ripianifica gli agenti che passano per questo poligono
        // per cercare percorsi migliori
    }

    // Blocca/sblocca un poligono (toggle)
    togglePolygonBlock(polyIndex) {
        if (this.queryFilter.isBlocked(polyIndex)) {
            this.unblockPolygon(polyIndex);
            return false; // ora sbloccato
        } else {
            this.blockPolygon(polyIndex);
            return true; // ora bloccato
        }
    }

    // Invalida i path di tutti gli agenti che passano per un poligono
    invalidatePathsThroughPolygon(polyIndex) {
        for (const agent of this.agents.values()) {
            if (agent.targetState !== AgentTargetState.VALID) continue;

            // Controlla se il path dell'agente passa per il poligono bloccato
            if (agent.corridor.path.includes(polyIndex)) {
                // Salva il target e ripianifica
                const targetPos = vec3.clone(agent.targetPosition);
                agent.corridor.reset();
                agent.corners = [];
                agent.boundary.reset();

                // Prova a ripianificare
                const success = agent.setTarget(
                    targetPos,
                    this.navMesh,
                    this.pathFinder,
                    this.funnelAlgo,
                    this.queryFilter
                );

                if (!success) {
                    agent.targetState = AgentTargetState.FAILED;
                }
            }
        }
    }

    // Riprova a pianificare per gli agenti con path falliti
    retryFailedPaths() {
        for (const agent of this.agents.values()) {
            if (agent.targetState === AgentTargetState.FAILED) {
                // Prova a ripianificare verso il target originale
                agent.setTarget(
                    agent.targetPosition,
                    this.navMesh,
                    this.pathFinder,
                    this.funnelAlgo,
                    this.queryFilter
                );
            }
        }
    }

    // Ottieni lista di tutti i poligoni bloccati
    getBlockedPolygons() {
        return Array.from(this.queryFilter.blockedPolygons);
    }

    // Sblocca tutti i poligoni
    clearAllBlocks() {
        this.queryFilter.clearAllBlocks();
        this.retryFailedPaths();
    }

    addAgent(position, params = {}) {
        if (!this.navMesh) return null;

        // Verifica che la posizione sia sulla navmesh
        const { point, polygon } = this.navMesh.projectToNavMesh(position);
        if (!polygon) return null;

        const agent = new Agent(this.agentIdCounter++);
        vec3.copy(agent.position, point);
        agent.corridor.currentPoly = polygon;

        // Applica parametri personalizzati (supporto agenti di dimensioni diverse)
        if (params.radius !== undefined) agent.radius = params.radius;
        if (params.height !== undefined) agent.height = params.height;
        if (params.maxSpeed !== undefined) agent.maxSpeed = params.maxSpeed;
        if (params.maxAcceleration !== undefined) agent.maxAcceleration = params.maxAcceleration;
        if (params.collisionQueryRange !== undefined) agent.collisionQueryRange = params.collisionQueryRange;
        if (params.pathOptimizationRange !== undefined) agent.pathOptimizationRange = params.pathOptimizationRange;
        if (params.separationWeight !== undefined) agent.separationWeight = params.separationWeight;
        if (params.updateFlags !== undefined) agent.updateFlags = params.updateFlags;

        this.agents.set(agent.id, agent);
        return agent;
    }

    // Aggiorna la navmesh (supporto navmesh dinamiche)
    updateNavMesh(navMesh) {
        this.navMesh = navMesh;
        this.pathFinder = new PathFinder(navMesh);
        this.funnelAlgo = new FunnelAlgorithm(navMesh);

        // Invalida tutti i path degli agenti e forza ripianificazione
        for (const agent of this.agents.values()) {
            this.invalidateAgentPath(agent);
        }
    }

    // Invalida il path di un singolo agente
    invalidateAgentPath(agent) {
        // Salva il target corrente se valido
        const hadTarget = agent.targetState === AgentTargetState.VALID;
        const targetPos = vec3.clone(agent.targetPosition);

        // Reset del corridor e boundary
        agent.corridor.reset();
        agent.boundary.reset();
        agent.corners = [];

        // Riproietta l'agente sulla nuova navmesh
        const { point, polygon } = this.navMesh.projectToNavMesh(agent.position);
        if (polygon) {
            vec3.copy(agent.position, point);
            agent.corridor.currentPoly = polygon;
            agent.state = AgentState.WALKING;

            // Ripianifica verso il target precedente se esisteva
            if (hadTarget) {
                agent.setTarget(targetPos, this.navMesh, this.pathFinder, this.funnelAlgo);
            }
        } else {
            // Agente fuori dalla navmesh
            agent.state = AgentState.INVALID;
            agent.targetState = AgentTargetState.NONE;
        }
    }

    // Notifica che una regione della navmesh è cambiata
    notifyNavMeshRegionChanged(minBounds, maxBounds) {
        // Invalida i path degli agenti che passano per la regione modificata
        for (const agent of this.agents.values()) {
            // Controlla se l'agente è nella regione o se il suo path la attraversa
            if (this.agentAffectedByRegion(agent, minBounds, maxBounds)) {
                this.invalidateAgentPath(agent);
            }
        }
    }

    // Verifica se un agente è affetto da una modifica in una regione
    agentAffectedByRegion(agent, minBounds, maxBounds) {
        // Controlla se la posizione dell'agente è nella regione
        if (agent.position.x >= minBounds.x && agent.position.x <= maxBounds.x &&
            agent.position.z >= minBounds.z && agent.position.z <= maxBounds.z) {
            return true;
        }

        // Controlla se il target è nella regione
        if (agent.targetState === AgentTargetState.VALID) {
            if (agent.targetPosition.x >= minBounds.x && agent.targetPosition.x <= maxBounds.x &&
                agent.targetPosition.z >= minBounds.z && agent.targetPosition.z <= maxBounds.z) {
                return true;
            }
        }

        // Controlla se qualche corner attraversa la regione
        for (const corner of agent.corners) {
            if (corner.x >= minBounds.x && corner.x <= maxBounds.x &&
                corner.z >= minBounds.z && corner.z <= maxBounds.z) {
                return true;
            }
        }

        return false;
    }

    removeAgent(id) {
        this.agents.delete(id);
    }

    clearAgents() {
        this.agents.clear();
    }

    getSelectedAgents() {
        return Array.from(this.agents.values()).filter(a => a.selected);
    }

    setTargetForSelected(targetPos) {
        for (const agent of this.getSelectedAgents()) {
            agent.setTarget(targetPos, this.navMesh, this.pathFinder, this.funnelAlgo, this.queryFilter);
        }
    }

    // Ciclo di aggiornamento principale (segue l'architettura navcat)
    update(dt) {
        if (!this.navMesh || this.agents.size === 0) return;

        // Fase 1: Validazione posizione e corridoio
        this.checkPathValidity();

        // Fase 2: Ottimizzazione topologica del corridoio (con throttling)
        this.updateTopologyOptimization(dt);

        // Fase 3: Costruzione griglia di prossimità
        this.updateProximityGrid();

        // Fase 4: Trova vicini per ogni agente
        this.updateNeighbors();

        // Fase 5: Aggiorna local boundaries
        this.updateLocalBoundaries();

        // Fase 6: Calcola steering direction
        this.updateSteering();

        // Fase 7: Pianifica velocità con obstacle avoidance
        this.updateVelocityPlanning();

        // Fase 8: Integrazione fisica
        this.integrate(dt);

        // Fase 9: Gestisci collisioni tra agenti
        this.handleCollisions();

        // Fase 10: Vincola posizioni alla navmesh
        this.constrainToNavMesh();
    }

    updateProximityGrid() {
        this.proximityGrid.clear();
        for (const agent of this.agents.values()) {
            this.proximityGrid.insert(agent);
        }
    }

    checkPathValidity() {
        for (const agent of this.agents.values()) {
            if (agent.targetState !== AgentTargetState.VALID) continue;

            // Verifica che la posizione sia su un poligono valido
            const poly = this.navMesh.findPolygonAtPosition(agent.position);
            if (!poly) {
                // Riproietta sulla navmesh
                const { point, polygon } = this.navMesh.projectToNavMesh(agent.position);
                if (polygon) {
                    vec3.copy(agent.position, point);
                    agent.corridor.currentPoly = polygon;
                }
            } else {
                agent.corridor.currentPoly = poly;
            }
        }
    }

    updateTopologyOptimization(dt) {
        // Throttling come navcat: solo alcuni agenti per frame
        const OPT_TIME_THR = 0.5; // secondi
        const OPT_MAX_AGENTS = 1;

        const queue = [];

        for (const agent of this.agents.values()) {
            if (agent.state !== AgentState.WALKING) continue;
            if (agent.targetState !== AgentTargetState.VALID) continue;
            // Controlla flag OPTIMIZE_TOPO
            if ((agent.updateFlags & CrowdUpdateFlags.OPTIMIZE_TOPO) === 0) continue;

            agent.topologyOptTime += dt;

            if (agent.topologyOptTime >= OPT_TIME_THR) {
                // Inserisci in coda in base al tempo di attesa (più lungo = priorità maggiore)
                let inserted = false;
                for (let i = 0; i < queue.length; i++) {
                    if (agent.topologyOptTime >= queue[i].topologyOptTime) {
                        queue.splice(i, 0, agent);
                        inserted = true;
                        break;
                    }
                }
                if (!inserted && queue.length < OPT_MAX_AGENTS) {
                    queue.push(agent);
                }
                if (queue.length > OPT_MAX_AGENTS) {
                    queue.length = OPT_MAX_AGENTS;
                }
            }
        }

        // Ottimizza solo gli agenti in coda
        for (const agent of queue) {
            agent.corridor.optimizePathTopology(agent.position, this.navMesh);
            agent.topologyOptTime = 0;
        }
    }

    updateNeighbors() {
        for (const agent of this.agents.values()) {
            agent.neighbors = this.proximityGrid.query(
                agent.position,
                agent.collisionQueryRange
            ).filter(n => n.id !== agent.id);
        }
    }

    updateLocalBoundaries() {
        for (const agent of this.agents.values()) {
            if (agent.state !== AgentState.WALKING) continue;
            if (agent.corridor.path.length === 0) continue;

            // Aggiorna solo se l'agente si è mosso significativamente (come navcat)
            const updateThreshold = agent.collisionQueryRange * 0.25;
            const movedDistance = vec3.distanceXZ(agent.position, agent.boundary.center);

            if (movedDistance > updateThreshold || agent.boundary.segments.length === 0) {
                agent.boundary.update(
                    agent.position,
                    this.navMesh,
                    agent.collisionQueryRange
                );
            }
        }
    }

    updateSteering() {
        for (const agent of this.agents.values()) {
            if (agent.state !== AgentState.WALKING) {
                vec3.set(agent.desiredVelocity, 0, 0, 0);
                continue;
            }

            if (agent.targetState !== AgentTargetState.VALID) {
                vec3.set(agent.desiredVelocity, 0, 0, 0);
                continue;
            }

            // Ricalcola i corner usando il funnel algorithm
            if (agent.corridor.path.length > 0) {
                agent.corners = this.funnelAlgo.findStraightPath(
                    agent.position,
                    agent.corridor.target,
                    agent.corridor.path
                );
                agent.corridor.corners = agent.corners;
            }

            if (agent.corners.length === 0) {
                vec3.set(agent.desiredVelocity, 0, 0, 0);
                continue;
            }

            // Ottimizzazione visibilità (se flag attivo)
            if ((agent.updateFlags & CrowdUpdateFlags.OPTIMIZE_VIS) !== 0 && agent.corners.length > 0) {
                const targetIndex = Math.min(1, agent.corners.length - 1);
                const target = agent.corners[targetIndex];
                agent.corridor.optimizePathVisibility(agent.position, target, agent.pathOptimizationRange, this.navMesh);
            }

            // Calcola steering direction
            const anticipateTurns = (agent.updateFlags & CrowdUpdateFlags.ANTICIPATE_TURNS) !== 0;

            if (anticipateTurns && agent.corners.length > 1) {
                // Smooth steering con anticipazione (come navcat calcSmoothSteerDirection)
                this.calcSmoothSteerDirection(agent, agent.corners);
            } else {
                // Steering dritto verso il primo corner
                this.calcStraightSteerDirection(agent, agent.corners);
            }

            // Calcola distanza dal target per slowdown
            const distToGoal = this.getDistanceToGoal(agent, agent.radius * 2);

            // Scala la velocità per arrivo morbido
            agent.desiredSpeed = agent.maxSpeed;
            const slowDownRadius = agent.radius * 2;
            const speedScale = Math.min(1.0, distToGoal / slowDownRadius);
            vec3.scale(agent.desiredVelocity, agent.desiredVelocity, speedScale);

            // Se siamo arrivati
            if (distToGoal < agent.radius * 0.5) {
                vec3.set(agent.desiredVelocity, 0, 0, 0);
                agent.targetState = AgentTargetState.NONE;
                agent.corridor.reset();
                continue;
            }

            // Separazione da altri agenti (se flag attivo)
            if ((agent.updateFlags & CrowdUpdateFlags.SEPARATION) !== 0) {
                this.applySeparation(agent);
            }
        }
    }

    // Rimuove i corner troppo vicini alla posizione corrente (come navcat)
    pruneCorners(agent, corners) {
        const MIN_TARGET_DIST = 0.01;
        let pruned = corners;

        while (pruned.length > 1) {
            const firstCorner = pruned[0];
            const distance = vec3.distanceXZ(agent.position, firstCorner);

            // Se il primo corner è abbastanza lontano, stop
            if (distance > MIN_TARGET_DIST) {
                break;
            }

            // Rimuovi il primo corner perché troppo vicino
            pruned = pruned.slice(1);
        }

        return pruned;
    }

    // Steering dritto verso il primo corner (come navcat calcStraightSteerDirection)
    calcStraightSteerDirection(agent, corners) {
        // Rimuovi corner troppo vicini
        const prunedCorners = this.pruneCorners(agent, corners);

        if (prunedCorners.length === 0) {
            vec3.set(agent.desiredVelocity, 0, 0, 0);
            return;
        }

        const dir = vec3.create();
        vec3.sub(dir, prunedCorners[0], agent.position);
        dir.y = 0;
        vec3.normalize(dir, dir);

        vec3.scale(agent.desiredVelocity, dir, agent.maxSpeed);
    }

    // Steering morbido con anticipazione curve (come navcat calcSmoothSteerDirection)
    calcSmoothSteerDirection(agent, corners) {
        // Rimuovi corner troppo vicini
        const prunedCorners = this.pruneCorners(agent, corners);

        if (prunedCorners.length === 0) {
            vec3.set(agent.desiredVelocity, 0, 0, 0);
            return;
        }

        const p0 = prunedCorners[0];
        const p1 = prunedCorners[Math.min(1, prunedCorners.length - 1)];

        const dir0 = vec3.create();
        const dir1 = vec3.create();

        vec3.sub(dir0, p0, agent.position);
        vec3.sub(dir1, p1, agent.position);
        dir0.y = 0;
        dir1.y = 0;

        const len0 = vec3.length(dir0);
        const len1 = vec3.length(dir1);

        if (len1 > 0.001) {
            vec3.scale(dir1, dir1, 1.0 / len1);
        }

        // Blend delle direzioni
        const direction = vec3.create();
        direction.x = dir0.x - dir1.x * len0 * 0.5;
        direction.y = 0;
        direction.z = dir0.z - dir1.z * len0 * 0.5;

        vec3.normalize(direction, direction);
        vec3.scale(agent.desiredVelocity, direction, agent.maxSpeed);
    }

    // Calcola distanza dal goal (come navcat getDistanceToGoal)
    getDistanceToGoal(agent, range) {
        // Usa il target del corridor invece dell'ultimo corner
        const dist = vec3.distanceXZ(agent.position, agent.corridor.target);
        return Math.min(range, dist);
    }

    // Applica separazione da altri agenti (come navcat updateSteering separation)
    applySeparation(agent) {
        const separationDist = agent.collisionQueryRange;
        const invSeparationDist = 1.0 / separationDist;
        const separationWeight = agent.separationWeight;

        let w = 0;
        const disp = vec3.create();

        for (const nei of agent.neighbors) {
            const diff = vec3.create();
            vec3.sub(diff, agent.position, nei.position);
            diff.y = 0;

            const distSqr = diff.x * diff.x + diff.z * diff.z;
            if (distSqr < 0.00001) continue;
            if (distSqr > separationDist * separationDist) continue;

            const dist = Math.sqrt(distSqr);
            const weight = separationWeight * (1.0 - dist * invSeparationDist * (dist * invSeparationDist));

            // disp += diff * (weight / dist)
            vec3.scaleAndAdd(disp, disp, diff, weight / dist);
            w += 1.0;
        }

        if (w > 0.0001) {
            // Aggiusta velocità desiderata
            vec3.scaleAndAdd(agent.desiredVelocity, agent.desiredVelocity, disp, 1.0 / w);

            // Limita alla velocità desiderata
            const speedSqr = agent.desiredVelocity.x * agent.desiredVelocity.x +
                            agent.desiredVelocity.z * agent.desiredVelocity.z;
            const desiredSqr = agent.desiredSpeed * agent.desiredSpeed;

            if (speedSqr > desiredSqr && speedSqr > 0) {
                const scale = Math.sqrt(desiredSqr / speedSqr);
                vec3.scale(agent.desiredVelocity, agent.desiredVelocity, scale);
            }
        }
    }

    updateVelocityPlanning() {
        for (const agent of this.agents.values()) {
            if (agent.state !== AgentState.WALKING) continue;

            if (agent.targetState !== AgentTargetState.VALID) {
                // Decelera se non c'è target
                const speed = vec3.length(agent.velocity);
                if (speed > 0.01) {
                    const decel = Math.min(speed, agent.maxAcceleration * 0.016);
                    const dir = vec3.create();
                    vec3.normalize(dir, agent.velocity);
                    vec3.scale(dir, dir, -decel);
                    vec3.add(agent.velocity, agent.velocity, dir);
                } else {
                    vec3.set(agent.velocity, 0, 0, 0);
                }
                continue;
            }

            // Obstacle avoidance (se flag attivo)
            if ((agent.updateFlags & CrowdUpdateFlags.OBSTACLE_AVOIDANCE) !== 0) {
                // Velocity obstacle sampling
                agent.newVelocity = this.obstacleAvoidance.sampleVelocityAdaptive(
                    agent.position,
                    agent.radius,
                    agent.maxSpeed,
                    agent.velocity,
                    agent.desiredVelocity,
                    agent.neighbors,
                    agent.boundary.segments
                );
            } else {
                // Senza obstacle avoidance, usa direttamente la velocità desiderata
                vec3.copy(agent.newVelocity, agent.desiredVelocity);
            }
        }
    }

    integrate(dt) {
        for (const agent of this.agents.values()) {
            if (agent.targetState !== AgentTargetState.VALID) continue;

            // Applica accelerazione limitata
            const dv = vec3.create();
            vec3.sub(dv, agent.newVelocity, agent.velocity);

            const dvLen = vec3.length(dv);
            const maxDv = agent.maxAcceleration * dt;

            if (dvLen > maxDv) {
                vec3.scale(dv, dv, maxDv / dvLen);
            }

            vec3.add(agent.velocity, agent.velocity, dv);

            // Limita la velocità massima
            const speed = vec3.length(agent.velocity);
            if (speed > agent.maxSpeed) {
                vec3.scale(agent.velocity, agent.velocity, agent.maxSpeed / speed);
            }

            // Integra la posizione
            vec3.scaleAndAdd(agent.position, agent.position, agent.velocity, dt);
        }
    }

    handleCollisions() {
        // Risolvi le sovrapposizioni tra agenti (algoritmo navcat)
        const COLLISION_RESOLVE_FACTOR = 0.7;
        const agents = Array.from(this.agents.values());
        const agentIds = agents.map(a => a.id);

        for (let iter = 0; iter < 4; iter++) {
            // Primo passaggio: calcola displacement per ogni agente
            for (let i = 0; i < agents.length; i++) {
                const agent = agents[i];

                if (agent.state !== AgentState.WALKING) continue;

                vec3.set(agent.displacement, 0, 0, 0);
                let w = 0;

                for (const nei of agent.neighbors) {
                    const diff = vec3.create();
                    vec3.sub(diff, agent.position, nei.position);
                    diff.y = 0; // Ignora asse Y

                    const distSqr = diff.x * diff.x + diff.z * diff.z;
                    const combinedRadius = agent.radius + nei.radius;

                    if (distSqr > combinedRadius * combinedRadius) {
                        continue;
                    }

                    const dist = Math.sqrt(distSqr);
                    let pen = combinedRadius - dist;

                    if (dist < 0.0001) {
                        // Agenti sovrapposti: scegli direzioni di separazione divergenti
                        const idx0 = i;
                        const idx1 = agentIds.indexOf(nei.id);

                        if (idx0 > idx1) {
                            vec3.set(diff, -agent.desiredVelocity.z, 0, agent.desiredVelocity.x);
                        } else {
                            vec3.set(diff, agent.desiredVelocity.z, 0, -agent.desiredVelocity.x);
                        }
                        pen = 0.01;
                    } else {
                        pen = (1.0 / dist) * (pen * 0.5) * COLLISION_RESOLVE_FACTOR;
                    }

                    // Accumula displacement
                    vec3.scaleAndAdd(agent.displacement, agent.displacement, diff, pen);
                    w += 1.0;
                }

                if (w > 0.0001) {
                    vec3.scale(agent.displacement, agent.displacement, 1.0 / w);
                }
            }

            // Secondo passaggio: applica displacement a tutti gli agenti
            for (const agent of agents) {
                if (agent.state !== AgentState.WALKING) continue;

                vec3.add(agent.position, agent.position, agent.displacement);
            }
        }
    }

    constrainToNavMesh() {
        for (const agent of this.agents.values()) {
            if (agent.targetState !== AgentTargetState.VALID &&
                agent.targetState !== AgentTargetState.NONE) continue;

            // Implementazione ispirata a navcat moveAlongSurface
            const result = this.moveAlongSurface(agent);

            if (result.success) {
                vec3.copy(agent.position, result.position);
                agent.corridor.currentPoly = result.polygon;

                // Aggiorna il corridor path con i poligoni visitati
                if (result.visited.length > 0 && agent.corridor.path.length > 0) {
                    agent.corridor.path = this.mergeCorridorPath(
                        agent.corridor.path,
                        result.visited
                    );
                }
            }
        }
    }

    // Versione semplificata di navcat moveAlongSurface
    moveAlongSurface(agent) {
        const result = {
            success: false,
            position: vec3.clone(agent.position),
            polygon: agent.corridor.currentPoly,
            visited: []
        };

        if (!agent.corridor.currentPoly) {
            // Nessun poligono corrente, cerca il più vicino
            const projected = this.navMesh.projectToNavMesh(agent.position);
            if (projected.polygon) {
                result.success = true;
                result.position = projected.point;
                result.polygon = projected.polygon;
                result.visited = [projected.polygon.index];
            }
            return result;
        }

        const startPoly = agent.corridor.currentPoly;
        const endPos = agent.position;

        // Caso 1: La posizione è ancora nel poligono corrente
        if (this.navMesh.isPointInPolygon(endPos, startPoly)) {
            result.success = true;
            result.position = vec3.clone(endPos);
            result.polygon = startPoly;
            result.visited = [startPoly.index];
            return result;
        }

        // Caso 2: Cerca nei poligoni adiacenti
        for (const neighborIdx of startPoly.neighbors) {
            const neighbor = this.navMesh.polygons[neighborIdx];
            if (this.navMesh.isPointInPolygon(endPos, neighbor)) {
                result.success = true;
                result.position = vec3.clone(endPos);
                result.polygon = neighbor;
                result.visited = [startPoly.index, neighborIdx];
                return result;
            }
        }

        // Caso 3: Cerca nei poligoni a 2 hop di distanza
        for (const neighborIdx of startPoly.neighbors) {
            const neighbor = this.navMesh.polygons[neighborIdx];
            for (const neighbor2Idx of neighbor.neighbors) {
                if (neighbor2Idx === startPoly.index) continue;
                const neighbor2 = this.navMesh.polygons[neighbor2Idx];
                if (this.navMesh.isPointInPolygon(endPos, neighbor2)) {
                    result.success = true;
                    result.position = vec3.clone(endPos);
                    result.polygon = neighbor2;
                    result.visited = [startPoly.index, neighborIdx, neighbor2Idx];
                    return result;
                }
            }
        }

        // Caso 4: L'agente è uscito dalla navmesh - trova il punto più vicino
        // sul bordo del poligono corrente o dei vicini
        let bestPos = null;
        let bestDist = Infinity;
        let bestPoly = startPoly;
        const visited = [startPoly.index];

        // Cerca sul poligono corrente
        const projectedCurrent = this.navMesh.projectToPolygon(endPos, startPoly);
        const distCurrent = vec3.distanceXZ(endPos, projectedCurrent);
        if (distCurrent < bestDist) {
            bestDist = distCurrent;
            bestPos = projectedCurrent;
            bestPoly = startPoly;
        }

        // Cerca sui vicini
        for (const neighborIdx of startPoly.neighbors) {
            const neighbor = this.navMesh.polygons[neighborIdx];
            const projected = this.navMesh.projectToPolygon(endPos, neighbor);
            const dist = vec3.distanceXZ(endPos, projected);
            if (dist < bestDist) {
                bestDist = dist;
                bestPos = projected;
                bestPoly = neighbor;
                visited.push(neighborIdx);
            }
        }

        if (bestPos) {
            result.success = true;
            result.position = bestPos;
            result.polygon = bestPoly;
            result.visited = visited;
        }

        return result;
    }

    // Merge del corridor path con i poligoni visitati (ispirato a navcat mergeStartMoved)
    mergeCorridorPath(currentPath, visited) {
        if (visited.length === 0) return currentPath;

        // Trova il poligono comune più lontano
        let furthestPath = -1;
        let furthestVisited = -1;

        for (let i = currentPath.length - 1; i >= 0; i--) {
            for (let j = visited.length - 1; j >= 0; j--) {
                if (currentPath[i] === visited[j]) {
                    furthestPath = i;
                    furthestVisited = j;
                    break;
                }
            }
            if (furthestPath !== -1) break;
        }

        // Se non c'è intersezione, restituisci il path corrente
        if (furthestPath === -1 || furthestVisited === -1) {
            return currentPath;
        }

        // Concatena i path
        const req = visited.length - furthestVisited;
        const orig = Math.min(furthestPath + 1, currentPath.length);
        const size = Math.max(0, currentPath.length - orig);

        const newPath = [];

        // Aggiungi i poligoni visitati (in ordine inverso)
        for (let i = 0; i < req; i++) {
            newPath[i] = visited[visited.length - 1 - i];
        }

        // Aggiungi il resto del path corrente
        for (let i = 0; i < size; i++) {
            newPath[req + i] = currentPath[orig + i];
        }

        return newPath;
    }
}

// ----------------------------------------------------------------------------
// RENDERER
// ----------------------------------------------------------------------------
class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Camera (vista dall'alto)
        this.camera = {
            x: 0,
            z: 0,
            zoom: 30  // pixels per unit
        };

        this.resize();
    }

    resize() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
    }

    worldToScreen(worldPos) {
        return {
            x: (worldPos.x - this.camera.x) * this.camera.zoom + this.canvas.width / 2,
            y: (worldPos.z - this.camera.z) * this.camera.zoom + this.canvas.height / 2
        };
    }

    screenToWorld(screenX, screenY) {
        return vec3.create(
            (screenX - this.canvas.width / 2) / this.camera.zoom + this.camera.x,
            0,
            (screenY - this.canvas.height / 2) / this.camera.zoom + this.camera.z
        );
    }

    centerOnNavMesh(navMesh) {
        if (!navMesh || navMesh.vertices.length === 0) return;

        this.camera.x = (navMesh.bounds.min.x + navMesh.bounds.max.x) / 2;
        this.camera.z = (navMesh.bounds.min.z + navMesh.bounds.max.z) / 2;

        // Calcola lo zoom per far entrare la navmesh
        const width = navMesh.bounds.max.x - navMesh.bounds.min.x;
        const height = navMesh.bounds.max.z - navMesh.bounds.min.z;
        const maxSize = Math.max(width, height);

        this.camera.zoom = Math.min(this.canvas.width, this.canvas.height) / (maxSize * 1.2);
    }

    render(navMesh, crowd) {
        const ctx = this.ctx;

        // Clear
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (!navMesh) return;

        // Disegna la navmesh
        this.drawNavMesh(navMesh);

        // Disegna gli agenti
        if (crowd) {
            this.drawAgents(crowd);
        }
    }

    drawNavMesh(navMesh) {
        const ctx = this.ctx;

        // Disegna i poligoni
        for (const poly of navMesh.polygons) {
            const verts = poly.vertexIndices.map(i => navMesh.vertices[i]);

            ctx.beginPath();
            const first = this.worldToScreen(verts[0]);
            ctx.moveTo(first.x, first.y);

            for (let i = 1; i < verts.length; i++) {
                const p = this.worldToScreen(verts[i]);
                ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();

            // Fill
            ctx.fillStyle = 'rgba(15, 52, 96, 0.6)';
            ctx.fill();

            // Stroke
            ctx.strokeStyle = '#0f3460';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Disegna i bordi esterni (muri) con colore diverso
        ctx.strokeStyle = '#e94560';
        ctx.lineWidth = 2;

        for (const poly of navMesh.polygons) {
            const edges = navMesh.getPolygonEdges(poly);
            for (const edge of edges) {
                const p1 = this.worldToScreen(edge.start);
                const p2 = this.worldToScreen(edge.end);

                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }
        }
    }

    drawAgents(crowd) {
        const ctx = this.ctx;

        for (const agent of crowd.agents.values()) {
            const pos = this.worldToScreen(agent.position);
            const radius = agent.radius * this.camera.zoom;

            // Disegna il percorso
            if (agent.targetState === AgentTargetState.VALID && agent.corridor.corners.length > 1) {
                ctx.beginPath();
                ctx.strokeStyle = agent.selected ? '#ffcc00' : 'rgba(255, 200, 100, 0.4)';
                ctx.lineWidth = agent.selected ? 2 : 1;

                const start = this.worldToScreen(agent.position);
                ctx.moveTo(start.x, start.y);

                for (let i = 1; i < agent.corridor.corners.length; i++) {
                    const p = this.worldToScreen(agent.corridor.corners[i]);
                    ctx.lineTo(p.x, p.y);
                }
                ctx.stroke();
            }

            // Disegna l'agente (cerchio)
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);

            if (agent.selected) {
                ctx.fillStyle = '#ffcc00';
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
            } else {
                ctx.fillStyle = '#4fc3f7';
                ctx.strokeStyle = '#0288d1';
                ctx.lineWidth = 1;
            }

            ctx.fill();
            ctx.stroke();

            // Disegna la direzione (velocità)
            if (vec3.length(agent.velocity) > 0.1) {
                const velDir = vec3.create();
                vec3.normalize(velDir, agent.velocity);

                ctx.beginPath();
                ctx.strokeStyle = agent.selected ? '#ffffff' : '#4fc3f7';
                ctx.lineWidth = 2;
                ctx.moveTo(pos.x, pos.y);
                ctx.lineTo(
                    pos.x + velDir.x * radius * 1.5,
                    pos.y + velDir.z * radius * 1.5
                );
                ctx.stroke();
            }
        }
    }

    drawSelectionRect(rect) {
        if (!rect) return;

        const ctx = this.ctx;
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(255, 204, 0, 0.1)';
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
}

// ----------------------------------------------------------------------------
// APPLICATION
// ----------------------------------------------------------------------------
class Application {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.renderer = new Renderer(this.canvas);
        this.crowd = new Crowd();
        this.navMesh = null;

        // Stato input
        this.isDragging = false;
        this.isPanning = false;
        this.dragStart = { x: 0, y: 0 };
        this.selectionRect = null;

        // FPS counter
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.fps = 0;

        this.setupEventListeners();
        this.animate();
    }

    setupEventListeners() {
        // Resize
        window.addEventListener('resize', () => this.renderer.resize());

        // File input
        document.getElementById('loadBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });

        document.getElementById('fileInput').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.loadNavMesh(file);
        });

        // Buttons
        document.getElementById('clearAgents').addEventListener('click', () => {
            this.crowd.clearAgents();
            this.updateStatus('Agenti rimossi');
        });

        document.getElementById('generateSample').addEventListener('click', () => {
            this.generateSampleNavMesh();
        });

        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.onWheel(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    loadNavMesh(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target.result);
                this.navMesh = new NavMesh();
                this.navMesh.loadFromJSON(json);
                this.crowd.setNavMesh(this.navMesh);
                this.renderer.centerOnNavMesh(this.navMesh);
                this.updateStatus(`NavMesh caricata: ${this.navMesh.polygons.length} poligoni`);
            } catch (err) {
                this.updateStatus(`Errore: ${err.message}`);
            }
        };
        reader.readAsText(file);
    }

    generateSampleNavMesh() {
        // Genera una navmesh di esempio - griglia 3x3 con corridoio a destra
        const json = {
            vertices: [
                // Griglia principale 4x4 punti
                [-15, 0, -15], [-5, 0, -15], [5, 0, -15], [15, 0, -15],
                [-15, 0, -5],  [-5, 0, -5],  [5, 0, -5],  [15, 0, -5],
                [-15, 0, 5],   [-5, 0, 5],   [5, 0, 5],   [15, 0, 5],
                [-15, 0, 15],  [-5, 0, 15],  [5, 0, 15],  [15, 0, 15],
                // Corridoio
                [20, 0, -5], [30, 0, -5], [30, 0, 5], [20, 0, 5],
                // Stanza destra
                [30, 0, -12], [45, 0, -12], [45, 0, 12], [30, 0, 12]
            ],
            polygons: [
                // Riga 1
                { vertices: [0, 1, 5, 4], neighbors: [] },
                { vertices: [1, 2, 6, 5], neighbors: [] },
                { vertices: [2, 3, 7, 6], neighbors: [] },
                // Riga 2
                { vertices: [4, 5, 9, 8], neighbors: [] },
                { vertices: [5, 6, 10, 9], neighbors: [] },
                { vertices: [6, 7, 11, 10], neighbors: [] },
                // Riga 3
                { vertices: [8, 9, 13, 12], neighbors: [] },
                { vertices: [9, 10, 14, 13], neighbors: [] },
                { vertices: [10, 11, 15, 14], neighbors: [] },
                // Corridoio che collega alla stanza destra
                { vertices: [7, 16, 19, 11], neighbors: [] },
                { vertices: [16, 17, 18, 19], neighbors: [] },
                // Collegamento e stanza destra
                { vertices: [17, 20, 23, 18], neighbors: [] },
                { vertices: [20, 21, 22, 23], neighbors: [] }
            ]
        };

        this.navMesh = new NavMesh();
        this.navMesh.loadFromJSON(json);
        this.crowd.setNavMesh(this.navMesh);
        this.renderer.centerOnNavMesh(this.navMesh);
        this.updateStatus(`NavMesh di esempio generata: ${this.navMesh.polygons.length} poligoni`);
    }

    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (e.button === 0) { // Left click - selezione o spawn
            this.isDragging = true;
            this.dragStart = { x, y };
            this.selectionRect = { x, y, width: 0, height: 0 };
        } else if (e.button === 1) { // Middle click - pan
            this.isPanning = true;
            this.dragStart = { x, y };
        } else if (e.button === 2) { // Right click - muovi agenti selezionati
            const worldPos = this.renderer.screenToWorld(x, y);

            if (!this.navMesh) return;

            const selectedAgents = this.crowd.getSelectedAgents();

            if (selectedAgents.length > 0) {
                // Muovi gli agenti selezionati verso il punto
                this.crowd.setTargetForSelected(worldPos);
                this.updateStatus(`Target impostato per ${selectedAgents.length} agenti`);
            } else {
                this.updateStatus('Nessun agente selezionato da muovere');
            }
        }
    }

    onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (this.isDragging) {
            this.selectionRect = {
                x: Math.min(this.dragStart.x, x),
                y: Math.min(this.dragStart.y, y),
                width: Math.abs(x - this.dragStart.x),
                height: Math.abs(y - this.dragStart.y)
            };
        } else if (this.isPanning) {
            const dx = (x - this.dragStart.x) / this.renderer.camera.zoom;
            const dy = (y - this.dragStart.y) / this.renderer.camera.zoom;
            this.renderer.camera.x -= dx;
            this.renderer.camera.z -= dy;
            this.dragStart = { x, y };
        }
    }

    onMouseUp(e) {
        if (this.isDragging && this.selectionRect) {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Calcola le dimensioni del rettangolo di selezione
            const width = Math.abs(x - this.dragStart.x);
            const height = Math.abs(y - this.dragStart.y);

            const worldPos = this.renderer.screenToWorld(x, y);

            // Se il drag è piccolo, considera come click singolo
            if (width < 5 && height < 5) {
                // Cerca un agente sotto il cursore
                let closestAgent = null;
                let closestDist = Infinity;

                for (const agent of this.crowd.agents.values()) {
                    const dist = vec3.distanceXZ(worldPos, agent.position);
                    if (dist < agent.radius * 1.5 && dist < closestDist) {
                        closestDist = dist;
                        closestAgent = agent;
                    }
                }

                if (closestAgent) {
                    // Click su un agente: seleziona/deseleziona
                    if (!e.shiftKey) {
                        for (const agent of this.crowd.agents.values()) {
                            agent.selected = false;
                        }
                    }
                    closestAgent.selected = true;
                    this.updateStatus(`Agente ${closestAgent.id} selezionato`);
                } else {
                    // Click su spazio vuoto: spawn nuovo agente
                    if (!this.navMesh) {
                        this.updateStatus('Carica prima una NavMesh');
                    } else {
                        const agent = this.crowd.addAgent(worldPos);
                        if (agent) {
                            // Deseleziona tutti e seleziona il nuovo agente
                            for (const a of this.crowd.agents.values()) {
                                a.selected = false;
                            }
                            agent.selected = true;
                            this.updateStatus(`Agente aggiunto (ID: ${agent.id})`);
                        } else {
                            this.updateStatus('Impossibile aggiungere agente: posizione non valida');
                        }
                    }
                }
            } else {
                // Selezione rettangolare
                // Deseleziona tutti se non è premuto shift
                if (!e.shiftKey) {
                    for (const agent of this.crowd.agents.values()) {
                        agent.selected = false;
                    }
                }

                const minX = this.selectionRect.x;
                const maxX = this.selectionRect.x + this.selectionRect.width;
                const minY = this.selectionRect.y;
                const maxY = this.selectionRect.y + this.selectionRect.height;

                let selectedCount = 0;
                for (const agent of this.crowd.agents.values()) {
                    const screenPos = this.renderer.worldToScreen(agent.position);
                    if (screenPos.x >= minX && screenPos.x <= maxX &&
                        screenPos.y >= minY && screenPos.y <= maxY) {
                        agent.selected = true;
                        selectedCount++;
                    }
                }

                if (selectedCount > 0) {
                    this.updateStatus(`${selectedCount} agenti selezionati`);
                } else {
                    this.updateStatus('Nessun agente selezionato');
                }
            }

            this.selectionRect = null;
        }

        this.isDragging = false;
        this.isPanning = false;
    }

    onWheel(e) {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        this.renderer.camera.zoom *= zoomFactor;
        this.renderer.camera.zoom = Math.max(5, Math.min(200, this.renderer.camera.zoom));
    }

    updateStatus(message) {
        document.getElementById('status').textContent = message;
    }

    updateInfo() {
        document.getElementById('agentCount').textContent = this.crowd.agents.size;
        document.getElementById('selectedCount').textContent = this.crowd.getSelectedAgents().length;
        document.getElementById('fps').textContent = this.fps;
    }

    animate() {
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.05); // Cap a 50ms
        this.lastTime = now;

        // FPS counter
        this.frameCount++;
        if (this.frameCount >= 30) {
            this.fps = Math.round(30 / (dt * 30));
            this.frameCount = 0;
        }

        // Update simulation
        this.crowd.update(dt);

        // Render
        this.renderer.render(this.navMesh, this.crowd);

        // Disegna il rettangolo di selezione
        if (this.selectionRect) {
            this.renderer.drawSelectionRect(this.selectionRect);
        }

        // Update UI
        this.updateInfo();

        requestAnimationFrame(() => this.animate());
    }
}

// Avvia l'applicazione
const app = new Application();
