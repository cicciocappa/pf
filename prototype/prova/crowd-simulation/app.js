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
    REQUESTING: 3
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
// PATHFINDING - A* e Path Corridor
// ----------------------------------------------------------------------------
class PathFinder {
    constructor(navMesh) {
        this.navMesh = navMesh;
    }

    // A* per trovare il percorso tra due poligoni
    findPath(startPoly, endPoly) {
        if (!startPoly || !endPoly) return null;
        if (startPoly.index === endPoly.index) return [startPoly.index];

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

                const neighbor = this.navMesh.polygons[neighborIdx];
                const tentativeG = gScore.get(current) +
                    vec3.distanceXZ(currentPoly.center, neighbor.center);

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
// PATH CORRIDOR
// ----------------------------------------------------------------------------
class PathCorridor {
    constructor() {
        this.path = [];           // Array di polygon indices
        this.corners = [];        // Array di Vec3 (waypoints)
        this.currentPoly = null;
        this.targetPos = vec3.create();
    }

    reset() {
        this.path = [];
        this.corners = [];
        this.currentPoly = null;
    }

    setPath(polyPath, corners, targetPos) {
        this.path = polyPath ? [...polyPath] : [];
        this.corners = corners ? corners.map(c => vec3.clone(c)) : [];
        vec3.copy(this.targetPos, targetPos);
    }

    // Ottimizza il corridoio rimuovendo i poligoni già attraversati
    optimizePathTopology(agentPos, navMesh) {
        if (this.path.length <= 1) return;

        // Trova il poligono corrente dell'agente
        const currentPoly = navMesh.findPolygonAtPosition(agentPos);
        if (!currentPoly) return;

        // Trova l'indice del poligono corrente nel path
        const currentIdx = this.path.indexOf(currentPoly.index);
        if (currentIdx > 0) {
            // Rimuovi i poligoni già attraversati
            this.path = this.path.slice(currentIdx);
        }

        this.currentPoly = currentPoly;
    }

    getNextCorner() {
        if (this.corners.length > 1) {
            return this.corners[1]; // Il primo corner è la posizione attuale
        }
        return this.targetPos;
    }
}

// ----------------------------------------------------------------------------
// LOCAL BOUNDARY - Bordi statici per collision avoidance
// ----------------------------------------------------------------------------
class LocalBoundary {
    constructor() {
        this.segments = [];
        this.center = vec3.create();
    }

    update(agentPos, navMesh, range) {
        this.segments = [];
        vec3.copy(this.center, agentPos);

        // Trova tutti i poligoni nel range
        for (const poly of navMesh.polygons) {
            if (vec3.distanceXZ(agentPos, poly.center) > range * 2) continue;

            // Aggiungi i bordi non condivisi (muri)
            const edges = navMesh.getPolygonEdges(poly);
            for (const edge of edges) {
                // Verifica se il bordo è nel range
                const closest = navMesh.closestPointOnSegment(agentPos, edge.start, edge.end);
                if (vec3.distanceXZ(agentPos, closest) <= range) {
                    this.segments.push({
                        start: vec3.clone(edge.start),
                        end: vec3.clone(edge.end)
                    });
                }
            }
        }
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
// OBSTACLE AVOIDANCE - Velocity Sampling
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
    }

    // Campionamento adattivo della velocità
    sampleVelocityAdaptive(pos, radius, vmax, vel, desiredVel, neighbors, segments) {
        const result = vec3.clone(desiredVel);

        if (neighbors.length === 0 && segments.length === 0) {
            return result;
        }

        // Prepara gli ostacoli circolari (altri agenti)
        const circles = neighbors.map(n => ({
            position: n.position,
            velocity: n.velocity,
            radius: n.radius
        }));

        let bestPenalty = Infinity;
        let bestVel = vec3.clone(desiredVel);

        const invHorizTime = 1.0 / this.params.horizTime;
        const invVmax = 1.0 / Math.max(vmax, 0.001);

        // Campionamento adattivo
        const nDivs = this.params.adaptiveDivs;
        const nRings = this.params.adaptiveRings;
        const depth = this.params.adaptiveDepth;

        let cr = vmax;
        const center = vec3.clone(desiredVel);

        for (let d = 0; d < depth; d++) {
            const pattern = this.generatePattern(center, cr, nDivs, nRings);

            for (const vcand of pattern) {
                // Verifica che la velocità candidata sia valida
                const speed = Math.sqrt(vcand.x * vcand.x + vcand.z * vcand.z);
                if (speed > vmax + 0.001) continue;

                const penalty = this.evaluateVelocity(
                    pos, radius, vcand, vel, desiredVel,
                    circles, segments, invHorizTime, invVmax
                );

                if (penalty < bestPenalty) {
                    bestPenalty = penalty;
                    vec3.copy(bestVel, vcand);
                }
            }

            // Affina intorno alla migliore velocità trovata
            vec3.copy(center, bestVel);
            cr *= 0.5;
        }

        return bestVel;
    }

    generatePattern(center, radius, nDivs, nRings) {
        const pattern = [];

        // Centro
        pattern.push(vec3.clone(center));

        // Anelli concentrici
        for (let ring = 1; ring <= nRings; ring++) {
            const r = radius * (ring / nRings);
            const nSamples = nDivs * ring;

            for (let i = 0; i < nSamples; i++) {
                const angle = (2 * Math.PI * i) / nSamples;
                pattern.push(vec3.create(
                    center.x + Math.cos(angle) * r,
                    0,
                    center.z + Math.sin(angle) * r
                ));
            }
        }

        return pattern;
    }

    evaluateVelocity(pos, radius, vcand, vel, desiredVel, circles, segments, invHorizTime, invVmax) {
        // Penalità per distanza dalla velocità desiderata
        const dv = vec3.create();
        vec3.sub(dv, vcand, desiredVel);
        const vpen = this.params.weightDesVel * Math.sqrt(dv.x * dv.x + dv.z * dv.z) * invVmax;

        // Penalità per cambiamento dalla velocità corrente
        vec3.sub(dv, vcand, vel);
        const vcpen = this.params.weightCurVel * Math.sqrt(dv.x * dv.x + dv.z * dv.z) * invVmax;

        // Penalità per direzione laterale (preferenza per un lato)
        let spen = 0;
        if (desiredVel.x * vcand.z - desiredVel.z * vcand.x > 0) {
            spen = this.params.weightSide;
        }

        // Penalità per tempo alla collisione
        let minToi = Infinity;

        // Controlla collisioni con altri agenti
        for (const circle of circles) {
            const toi = this.timeToCollisionCircle(pos, radius, vcand, circle);
            if (toi < minToi) minToi = toi;
        }

        // Controlla collisioni con segmenti (muri)
        for (const seg of segments) {
            const toi = this.timeToCollisionSegment(pos, radius, vcand, seg);
            if (toi < minToi) minToi = toi;
        }

        const tpen = this.params.weightToi * (1.0 / (0.1 + minToi * invHorizTime));

        return vpen + vcpen + spen + tpen;
    }

    timeToCollisionCircle(pos, radius, vel, circle) {
        // Calcola il tempo alla collisione con un ostacolo circolare
        const dx = circle.position.x - pos.x;
        const dz = circle.position.z - pos.z;
        const dvx = vel.x - circle.velocity.x;
        const dvz = vel.z - circle.velocity.z;
        const r = radius + circle.radius;

        const a = dvx * dvx + dvz * dvz;
        if (a < 0.0001) return Infinity;

        const b = 2 * (dx * dvx + dz * dvz);
        const c = dx * dx + dz * dz - r * r;

        const discriminant = b * b - 4 * a * c;
        if (discriminant < 0) return Infinity;

        const t = (-b - Math.sqrt(discriminant)) / (2 * a);
        return t > 0 ? t : Infinity;
    }

    timeToCollisionSegment(pos, radius, vel, segment) {
        // Calcola il tempo alla collisione con un segmento
        const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
        if (speed < 0.001) return Infinity;

        // Direzione del movimento
        const dirX = vel.x / speed;
        const dirZ = vel.z / speed;

        // Vettore del segmento
        const segDx = segment.end.x - segment.start.x;
        const segDz = segment.end.z - segment.start.z;

        // Calcola l'intersezione ray-segment
        const denom = dirX * segDz - dirZ * segDx;
        if (Math.abs(denom) < 0.0001) return Infinity;

        const dx = segment.start.x - pos.x;
        const dz = segment.start.z - pos.z;

        const t = (dx * segDz - dz * segDx) / denom;
        const u = (dx * dirZ - dz * dirX) / denom;

        if (t > 0 && u >= 0 && u <= 1) {
            // Considera il raggio dell'agente
            const adjustedT = (t * speed - radius) / speed;
            return adjustedT > 0 ? adjustedT : 0;
        }

        return Infinity;
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

        // Configurazione
        this.radius = 0.3;
        this.height = 1.8;
        this.maxAcceleration = 8.0;
        this.maxSpeed = 3.5;
        this.collisionQueryRange = 3.0;
        this.pathOptimizationRange = 10.0;
        this.separationWeight = 2.0;

        // Stato
        this.position = vec3.create();
        this.velocity = vec3.create();
        this.desiredVelocity = vec3.create();
        this.newVelocity = vec3.create();

        // Navigazione
        this.corridor = new PathCorridor();
        this.boundary = new LocalBoundary();
        this.targetPosition = vec3.create();

        // Vicini
        this.neighbors = [];

        // Selezione UI
        this.selected = false;
    }

    setTarget(targetPos, navMesh, pathFinder, funnelAlgo) {
        vec3.copy(this.targetPosition, targetPos);

        const startPoly = navMesh.findPolygonAtPosition(this.position);
        const endPoly = navMesh.findPolygonAtPosition(targetPos);

        if (!startPoly || !endPoly) {
            this.targetState = AgentTargetState.FAILED;
            return false;
        }

        const polyPath = pathFinder.findPath(startPoly, endPoly);

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
    }

    setNavMesh(navMesh) {
        this.navMesh = navMesh;
        this.pathFinder = new PathFinder(navMesh);
        this.funnelAlgo = new FunnelAlgorithm(navMesh);
    }

    addAgent(position) {
        if (!this.navMesh) return null;

        // Verifica che la posizione sia sulla navmesh
        const { point, polygon } = this.navMesh.projectToNavMesh(position);
        if (!polygon) return null;

        const agent = new Agent(this.agentIdCounter++);
        vec3.copy(agent.position, point);
        agent.corridor.currentPoly = polygon;

        this.agents.set(agent.id, agent);
        return agent;
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
            agent.setTarget(targetPos, this.navMesh, this.pathFinder, this.funnelAlgo);
        }
    }

    // Ciclo di aggiornamento principale (segue l'architettura navcat)
    update(dt) {
        if (!this.navMesh || this.agents.size === 0) return;

        // Fase 1: Costruzione griglia di prossimità
        this.updateProximityGrid();

        // Fase 2: Validazione posizione e corridoio
        this.checkPathValidity();

        // Fase 3: Ottimizzazione topologica del corridoio
        this.updateTopologyOptimization();

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

    updateTopologyOptimization() {
        for (const agent of this.agents.values()) {
            if (agent.targetState !== AgentTargetState.VALID) continue;
            agent.corridor.optimizePathTopology(agent.position, this.navMesh);
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
            agent.boundary.update(
                agent.position,
                this.navMesh,
                agent.collisionQueryRange
            );
        }
    }

    updateSteering() {
        for (const agent of this.agents.values()) {
            if (agent.targetState !== AgentTargetState.VALID) {
                vec3.set(agent.desiredVelocity, 0, 0, 0);
                continue;
            }

            // Ricalcola i corner usando il funnel algorithm
            if (agent.corridor.path.length > 0) {
                agent.corridor.corners = this.funnelAlgo.findStraightPath(
                    agent.position,
                    agent.corridor.targetPos,
                    agent.corridor.path
                );
            }

            // Trova il prossimo waypoint
            const nextCorner = agent.corridor.getNextCorner();

            // Calcola distanza dal target
            const distToTarget = vec3.distanceXZ(agent.position, agent.corridor.targetPos);

            // Se siamo arrivati
            if (distToTarget < agent.radius * 0.5) {
                vec3.set(agent.desiredVelocity, 0, 0, 0);
                agent.targetState = AgentTargetState.NONE;
                agent.corridor.reset();
                continue;
            }

            // Calcola direzione verso il prossimo corner
            const dir = vec3.create();
            vec3.sub(dir, nextCorner, agent.position);
            dir.y = 0;
            vec3.normalize(dir, dir);

            // Scala la velocità in base alla distanza (arrivo morbido)
            const slowDownRadius = agent.radius * 4;
            let speedScale = 1.0;
            if (distToTarget < slowDownRadius) {
                speedScale = distToTarget / slowDownRadius;
            }

            vec3.scale(agent.desiredVelocity, dir, agent.maxSpeed * speedScale);
        }
    }

    updateVelocityPlanning() {
        for (const agent of this.agents.values()) {
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
        // Risolvi le sovrapposizioni tra agenti
        const agents = Array.from(this.agents.values());
        const iterations = 4;

        for (let iter = 0; iter < iterations; iter++) {
            for (let i = 0; i < agents.length; i++) {
                const a1 = agents[i];

                for (let j = i + 1; j < agents.length; j++) {
                    const a2 = agents[j];

                    const dx = a2.position.x - a1.position.x;
                    const dz = a2.position.z - a1.position.z;
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    const minDist = a1.radius + a2.radius;

                    if (dist < minDist && dist > 0.0001) {
                        const overlap = (minDist - dist) * 0.5;
                        const nx = dx / dist;
                        const nz = dz / dist;

                        a1.position.x -= nx * overlap;
                        a1.position.z -= nz * overlap;
                        a2.position.x += nx * overlap;
                        a2.position.z += nz * overlap;
                    }
                }
            }
        }
    }

    constrainToNavMesh() {
        for (const agent of this.agents.values()) {
            const poly = this.navMesh.findPolygonAtPosition(agent.position);

            if (!poly) {
                // Proietta sulla navmesh
                const { point, polygon } = this.navMesh.projectToNavMesh(agent.position);
                if (polygon) {
                    vec3.copy(agent.position, point);
                    agent.corridor.currentPoly = polygon;
                }
            }
        }
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

        if (e.button === 0) { // Left click - selezione
            this.isDragging = true;
            this.dragStart = { x, y };
            this.selectionRect = { x, y, width: 0, height: 0 };
        } else if (e.button === 1) { // Middle click - pan
            this.isPanning = true;
            this.dragStart = { x, y };
        } else if (e.button === 2) { // Right click
            const worldPos = this.renderer.screenToWorld(x, y);

            if (!this.navMesh) return;

            const selectedAgents = this.crowd.getSelectedAgents();

            if (selectedAgents.length > 0) {
                // Muovi gli agenti selezionati verso il punto
                this.crowd.setTargetForSelected(worldPos);
                this.updateStatus(`Target impostato per ${selectedAgents.length} agenti`);
            } else {
                // Aggiungi un nuovo agente
                const agent = this.crowd.addAgent(worldPos);
                if (agent) {
                    this.updateStatus(`Agente aggiunto (ID: ${agent.id})`);
                } else {
                    this.updateStatus('Impossibile aggiungere agente: posizione non valida');
                }
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

            // Deseleziona tutti se non è premuto shift
            if (!e.shiftKey) {
                for (const agent of this.crowd.agents.values()) {
                    agent.selected = false;
                }
            }

            let selectedCount = 0;

            // Se il drag è piccolo, considera come click singolo
            if (width < 5 && height < 5) {
                // Cerca un agente sotto il cursore
                const worldPos = this.renderer.screenToWorld(x, y);
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
                    closestAgent.selected = true;
                    selectedCount = 1;
                }
            } else {
                // Selezione rettangolare
                const minX = this.selectionRect.x;
                const maxX = this.selectionRect.x + this.selectionRect.width;
                const minY = this.selectionRect.y;
                const maxY = this.selectionRect.y + this.selectionRect.height;

                for (const agent of this.crowd.agents.values()) {
                    const screenPos = this.renderer.worldToScreen(agent.position);
                    if (screenPos.x >= minX && screenPos.x <= maxX &&
                        screenPos.y >= minY && screenPos.y <= maxY) {
                        agent.selected = true;
                        selectedCount++;
                    }
                }
            }

            this.selectionRect = null;

            if (selectedCount > 0) {
                this.updateStatus(`${selectedCount} agenti selezionati`);
            } else {
                this.updateStatus('Nessun agente selezionato');
            }
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
