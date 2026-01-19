export class ConnectionManager {
    constructor(mapData) {
        this.mapData = mapData;
    }

    add(conn) {
        this.mapData.connections.push(conn);
        this.mapData.updateAllGeometry();
    }

    resolveAll() {
        // Ordine di risoluzione suggerito:
        // 1. Unioni di edifici (Caso 5-6)
        // 2. Connessioni Muro-Edificio (Caso 1-2)
        // 3. Connessioni Muro-Muro (Caso 3-4)

        this.mapData.walls.forEach(w => {
            w.startCapOverride = null;
            w.endCapOverride = null;
        });

        // Ordiniamo le connessioni per indice decrescente
        const sortedConnections = [...this.mapData.connections].sort((a, b) =>
            (b.targetVertexIndex || 0) - (a.targetVertexIndex || 0)
        );

        for (const conn of sortedConnections) {
            switch (conn.type) {
                case 'WALL_TO_BUILDING_EDGE':
                    this._resolveWallToBuildingEdge(conn);
                    break;
                case 'WALL_TO_BUILDING_VERTEX':
                    this._resolveWallToBuildingVertex(conn);
                    break;
                case 'WALL_TO_WALL_END':
                    this._resolveWallToWallEnd(conn);
                    break;
                case 'WALL_TO_WALL_EDGE':
                    this._resolveWallToWallEdge(conn);
                    break;
                // ... altri casi
            }
        }
    }

    resolveAll() {
        // 1. Reset temporaneo degli override dei muri
        this.mapData.walls.forEach(w => {
            w.startCapOverride = null;
            w.endCapOverride = null;
        });

        // 2. Raggruppiamo le connessioni per edificio
        const connectionsByBuilding = new Map();
        this.mapData.connections.forEach(conn => {
            if (!connectionsByBuilding.has(conn.targetId)) {
                connectionsByBuilding.set(conn.targetId, []);
            }
            connectionsByBuilding.get(conn.targetId).push(conn);
        });

        // 3. Processiamo ogni edificio in modo isolato
        connectionsByBuilding.forEach((conns, bldgId) => {
            const bldg = this.mapData.buildings.get(bldgId);
            if (!bldg) return;

            // --- CRUCIALE: Ordine decrescente per evitare lo slittamento degli indici ---
            const sortedConns = conns.sort((a, b) => b.targetVertexIndex - a.targetVertexIndex);

            for (const conn of sortedConns) {
                if (conn.type === 'WALL_TO_BUILDING_VERTEX') {
                    this._resolveWallToBuildingVertex(conn, bldg);
                }
                // Aggiungi qui gli altri casi (EDGE, ecc.)
                if (conn.type === 'WALL_TO_BUILDING_EDGE') {
                    this._resolveWallToBuildingEdge(conn, bldg);
                }
            }
        });
    }

    _resolveWallToBuildingVertex(conn, bldg) {
        const wall = this.mapData.walls.get(conn.wallId);
        console.log(conn);
        // 1. CERCHIAMO L'INDICE ATTUALE TRAMITE ID
        // Non importa se altri splice hanno spostato il vertice, lo troveremo sempre.
        const vIdx = bldg.vertices.findIndex(v => v.id === conn.targetVertexId);

        if (vIdx === -1) return; // Il vertice non esiste più

        const vertices = bldg.vertices;
        const vCurr = vertices[vIdx];
        const vPrev = vertices[(vIdx - 1 + vertices.length) % vertices.length];
        const vNext = vertices[(vIdx + 1) % vertices.length];



        const dirToPrev = this._normalize({ x: vPrev.x - vCurr.x, y: vPrev.y - vCurr.y });
        const dirToNext = this._normalize({ x: vNext.x - vCurr.x, y: vNext.y - vCurr.y });

        // Dati del muro
        const isStart = conn.wallEnd === 'start';
        const pTarget = isStart ? wall.points[0] : wall.points[wall.points.length - 1];
        const pAdj = isStart ? wall.points[1] : wall.points[wall.points.length - 2];

        const projDir = this._normalize({ x: pTarget.x - pAdj.x, y: pTarget.y - pAdj.y });
        const wallNormal = { x: -projDir.y, y: projDir.x };
        const hT = wall.thickness / 2;

        const leftLinePoint = { x: pTarget.x + wallNormal.x * hT, y: pTarget.y + wallNormal.y * hT };
        const rightLinePoint = { x: pTarget.x - wallNormal.x * hT, y: pTarget.y - wallNormal.y * hT };

        // 1. Troviamo quale lato del muro (L o R) interseca l'edge precedente
        // e quale interseca l'edge successivo.
        const L_on_Prev = this._lineLineIntersection(leftLinePoint, projDir, vCurr, dirToPrev);
        const L_on_Next = this._lineLineIntersection(leftLinePoint, projDir, vCurr, dirToNext);
        const R_on_Prev = this._lineLineIntersection(rightLinePoint, projDir, vCurr, dirToPrev);
        const R_on_Next = this._lineLineIntersection(rightLinePoint, projDir, vCurr, dirToNext);

        let intersectPrev, intersectNext;
        let finalLeft, finalRight;

        // Logica di auto-assegnazione: quale combinazione è geometricamente valida?
        // Verifichiamo semplicemente quale intersezione L o R cade sull'edge PRECEDENTE
        if (L_on_Prev && R_on_Next) {
            intersectPrev = L_on_Prev;
            intersectNext = R_on_Next;
            finalLeft = L_on_Prev;
            finalRight = R_on_Next;
        } else {
            intersectPrev = R_on_Prev;
            intersectNext = L_on_Next;
            finalLeft = L_on_Next;
            finalRight = R_on_Prev;
        }

        if (intersectPrev && intersectNext) {
            // --- APPLICAZIONE SULL'ARRAY LIVE ---
            // L'ordine [intersectPrev, intersectNext] garantisce il mantenimento del winding CCW

            const newV1 = { ...intersectPrev, id: `${vCurr.id}_bevel_L` };
            const newV2 = { ...intersectNext, id: `${vCurr.id}_bevel_R` };

            vertices.splice(vIdx, 1, newV1, newV2);


            // 2. Prepariamo l'override per il muro
            if (isStart) {
                // All'inizio del muro, i lati sono invertiti rispetto alla 
                // proiezione dell'edificio per via dell'orientamento del segmento P0->P1
                wall.startCapOverride = { left: finalRight, right: finalLeft };

                wall.points[0].x = (finalLeft.x + finalRight.x) / 2;
                wall.points[0].y = (finalLeft.y + finalRight.y) / 2;
            } else {
                // Alla fine del muro, l'orientamento coincide
                wall.endCapOverride = { left: finalLeft, right: finalRight };

                wall.points[wall.points.length - 1].x = (finalLeft.x + finalRight.x) / 2;
                wall.points[wall.points.length - 1].y = (finalLeft.y + finalRight.y) / 2;
            }
        }
    }



    _resolveWallToBuildingEdge(conn, bldg) {
        console.log(conn); 
        const wall = this.mapData.walls.get(conn.wallId);
        if (!wall || !bldg || !conn.targetEdgeId) return;

        // 1. TROVA IL VERTICE DI PARTENZA TRAMITE L'ID DELL'EDGE
        const vIdx1 = bldg.vertices.findIndex(v => v.edgeId === conn.targetEdgeId);
        if (vIdx1 === -1) return;

        // Il secondo vertice dell'edge è sempre il successivo nell'array "pulito"
        const vIdx2 = (vIdx1 + 1) % bldg.vertices.length;

        const v1 = bldg.vertices[vIdx1];
        const v2 = bldg.vertices[vIdx2];

        const edgeDir = this._normalize({ x: v2.x - v1.x, y: v2.y - v1.y });

        const isStart = conn.wallEnd === 'start';

        // DETERMINIAMO IL SEGMENTO CORRETTO
        // Se è l'inizio, il segmento va da p0 a p1.
        // Se è la fine, il segmento va da p(n-1) a pn.
        const p1 = isStart ? wall.points[0] : wall.points[wall.points.length - 2];
        const p2 = isStart ? wall.points[1] : wall.points[wall.points.length - 1];

        // Direzione reale del segmento (sempre concorde con l'ordine dei punti)
        const segmentDir = this._normalize({ x: p2.x - p1.x, y: p2.y - p1.y });
        const segmentNormal = { x: -segmentDir.y, y: segmentDir.x };
        const halfThickness = wall.thickness / 2;

        // Il punto che deve toccare l'edificio
        const pTarget = isStart ? p1 : p2;

        // Calcoliamo i punti laterali basandoci sulla normale del segmento
        const leftLinePoint = { x: pTarget.x + segmentNormal.x * halfThickness, y: pTarget.y + segmentNormal.y * halfThickness };
        const rightLinePoint = { x: pTarget.x - segmentNormal.x * halfThickness, y: pTarget.y - segmentNormal.y * halfThickness };

        // Proiettiamo lungo la direzione del segmento
        const leftIntersect = this._lineLineIntersection(leftLinePoint, segmentDir, v1, edgeDir);
        const rightIntersect = this._lineLineIntersection(rightLinePoint, segmentDir, v1, edgeDir);

        if (leftIntersect && rightIntersect) {
            // Assegniamo l'override
            const override = { left: leftIntersect, right: rightIntersect };

            if (isStart) {
                wall.startCapOverride = override;
                p1.x = (leftIntersect.x + rightIntersect.x) / 2;
                p1.y = (leftIntersect.y + rightIntersect.y) / 2;
            } else {
                wall.endCapOverride = override;
                p2.x = (leftIntersect.x + rightIntersect.x) / 2;
                p2.y = (leftIntersect.y + rightIntersect.y) / 2;
            }
        }
    }

    _resolveWallToWallEdge(conn) {
        const incomingWall = this.mapData.walls.get(conn.wallId);
        const targetWall = this.mapData.walls.get(conn.targetWallId);
        const unit = targetWall.units[conn.targetSegmentIndex];

        if (!unit) return;

        // 1. Identifichiamo l'edge laterale della unit bersaglio
        // Una unit ha vertici: 0:L1, 1:R1, 2:R2, 3:L2
        // Lato sinistro: 0 -> 3 | Lato destro: 1 -> 2
        const vIdx1 = conn.targetSide === 'left' ? 0 : 1;
        const vIdx2 = conn.targetSide === 'left' ? 3 : 2;

        const v1 = unit.vertices[vIdx1];
        const v2 = unit.vertices[vIdx2];
        const edgeDir = this._normalize({ x: v2.x - v1.x, y: v2.y - v1.y });

        // 2. Dati del muro entrante
        const isStart = conn.wallEnd === 'start';
        const pA = isStart ? incomingWall.points[0] : incomingWall.points[incomingWall.points.length - 1];
        const pB = isStart ? incomingWall.points[1] : incomingWall.points[incomingWall.points.length - 2];

        const projDir = this._normalize({ x: pA.x - pB.x, y: pA.y - pB.y });
        const wallNormal = { x: -projDir.y, y: projDir.x };
        const hT = incomingWall.thickness / 2;

        const pL = { x: pA.x + wallNormal.x * hT, y: pA.y + wallNormal.y * hT };
        const pR = { x: pA.x - wallNormal.x * hT, y: pA.y - wallNormal.y * hT };

        // 3. Intersezione
        const intersectL = this._lineLineIntersection(pL, projDir, v1, edgeDir);
        const intersectR = this._lineLineIntersection(pR, projDir, v1, edgeDir);

        if (intersectL && intersectR) {
            // --- TRASFORMAZIONE IN PENTAGONO ---
            // Inseriamo i due nuovi vertici nell'array della unit
            // L'indice di inserimento dipende dal lato e dal winding
            const insertIdx = conn.targetSide === 'left' ? 3 : 2;
            unit.vertices.splice(insertIdx, 0, intersectL, intersectR);

            // 4. Override per il muro entrante (stessa logica dell'edificio)
            const override = isStart ?
                { left: intersectR, right: intersectL } :
                { left: intersectL, right: intersectR };

            if (isStart) {
                incomingWall.startCapOverride = override;
                incomingWall.points[0] = { x: (intersectL.x + intersectR.x) / 2, y: (intersectL.y + intersectR.y) / 2 };
            } else {
                incomingWall.endCapOverride = override;
                incomingWall.points[incomingWall.points.length - 1] = { x: (intersectL.x + intersectR.x) / 2, y: (intersectL.y + intersectR.y) / 2 };
            }
        }
    }


    // --- Helpers Geometrici ---

    _lineLineIntersection(p1, dir1, p2, dir2) {
        const det = dir1.x * dir2.y - dir1.y * dir2.x;
        if (Math.abs(det) < 0.0001) return null; // Parallele

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const t = (dx * dir2.y - dy * dir2.x) / det;

        return { x: p1.x + t * dir1.x, y: p1.y + t * dir1.y };
    }

    _normalize(v) {
        const l = Math.sqrt(v.x * v.x + v.y * v.y);
        return l < 0.0001 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
    }
}