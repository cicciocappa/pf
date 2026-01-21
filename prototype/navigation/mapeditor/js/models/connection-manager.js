export class ConnectionManager {
    constructor(mapData) {
        this.mapData = mapData;
    }

    add(conn) {

        this.mapData.connections.push(conn);
        this.mapData.updateAllGeometry();
    }



    resolveAll() {
        // 1. Reset degli override sui muri (pulisce lo stato del frame precedente)
        this.mapData.walls.forEach(w => {
            w.startCapOverride = null;
            w.endCapOverride = null;
        });

        // 2. Processiamo ogni connessione linearmente
        for (const conn of this.mapData.connections) {
            console.log("checking", conn);
            switch (conn.type) {
                case 'WALL_TO_BUILDING_VERTEX':
                    const bldgV = this.mapData.buildings.get(conn.targetId);
                    if (bldgV) this._resolveWallToBuildingVertex(conn, bldgV);
                    break;

                case 'WALL_TO_EDGE':
                    this._resolveWallToEdge(conn);
                    break;

                case 'WALL_TO_WALL_EDGE':
                    const targetWall = this.mapData.walls.get(conn.targetId);
                    if (targetWall) this._resolveWallToWallEdge(conn, targetWall);
                    break;
                case 'WALL_TO_WALL_VERTEX':
                    this._resolveWallToWallVertex(conn);
                    break;
            }
        }
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



    _resolveWallToEdge(conn) {
        console.log(conn);
        const incomingWall = this.mapData.walls.get(conn.wallId);
        let targetPoints = [];

        // 1. Recupero dei punti dell'oggetto target
        if (conn.targetType === 'building') {
            const b = this.mapData.buildings.get(conn.targetId);
            if (b) targetPoints = b.vertices;
        } else if (conn.targetType === 'obstacle') {
            const o = this.mapData.obstacles.get(conn.targetId);
            if (o) targetPoints = o.vertices;
        } else if (conn.targetType === 'outer') {
            targetPoints = this.mapData.outerPoly;
        }
        console.log(targetPoints);
        if (targetPoints.length === 0) return;

        // 2. Troviamo l'indice attuale dell'edge tramite il suo ID persistente
        const p1Idx = targetPoints.findIndex(p => `e_${p.id}` === conn.targetEdgeId);
        if (p1Idx === -1) return;

        const p1 = targetPoints[p1Idx];
        const p2 = targetPoints[(p1Idx + 1) % targetPoints.length];

        // 3. Logica di proiezione (Identica per tutti)
        const edgeDir = this._normalize({ x: p2.x - p1.x, y: p2.y - p1.y });

        const isStart = (conn.wallEnd === 'start');
        const pA = isStart ? incomingWall.points[0] : incomingWall.points[incomingWall.points.length - 1];
        const pB = isStart ? incomingWall.points[1] : incomingWall.points[incomingWall.points.length - 2];

        const projDir = this._normalize({ x: pA.x - pB.x, y: pA.y - pB.y });
        const wallNormal = { x: -projDir.y, y: projDir.x };
        const hT = incomingWall.thickness / 2;

        const pL = { x: pA.x + wallNormal.x * hT, y: pA.y + wallNormal.y * hT };
        const pR = { x: pA.x - wallNormal.x * hT, y: pA.y - wallNormal.y * hT };

        const intersectL = this._lineLineIntersection(pL, projDir, p1, edgeDir);
        const intersectR = this._lineLineIntersection(pR, projDir, p1, edgeDir);

        if (intersectL && intersectR) {
            const override = isStart ?
                { left: intersectR, right: intersectL } :
                { left: intersectL, right: intersectR };

            if (isStart) incomingWall.startCapOverride = override;
            else incomingWall.endCapOverride = override;
        }
    }
    _resolveWallToWallEdge(conn, targetWall) {

        const incomingWall = this.mapData.walls.get(conn.wallId);


        // 1. Troviamo il segmento del muro bersaglio tramite l'ID persistente
        const p1Idx = targetWall.points.findIndex(p => `e_${p.id}` === conn.targetEdgeId);

        if (p1Idx === -1) return;

        const tP1 = targetWall.points[p1Idx];
        const tP2 = targetWall.points[p1Idx + 1];

        // 2. Calcoliamo la "linea di confine" del muro bersaglio
        // È una linea parallela alla polilinea centrale, spostata di halfThickness
        const tDir = this._normalize({ x: tP2.x - tP1.x, y: tP2.y - tP1.y });
        const tNormal = { x: -tDir.y, y: tDir.x };
        const tHalfThickness = targetWall.thickness / 2;

        // Scegliamo il lato (sinistro o destro)
        const sideSign = (conn.targetSide === 'left') ? 1 : -1;
        const boundaryPoint = {
            x: tP1.x + tNormal.x * tHalfThickness * sideSign,
            y: tP1.y + tNormal.y * tHalfThickness * sideSign
        };

        // 3. Proiettiamo il muro entrante su questa linea di confine
        const isStart = (conn.wallEnd === 'start');
        const pA = isStart ? incomingWall.points[0] : incomingWall.points[incomingWall.points.length - 1];
        const pB = isStart ? incomingWall.points[1] : incomingWall.points[incomingWall.points.length - 2];

        const projDir = this._normalize({ x: pA.x - pB.x, y: pA.y - pB.y });
        const wallNormal = { x: -projDir.y, y: projDir.x };
        const hT = incomingWall.thickness / 2;

        const pL = { x: pA.x + wallNormal.x * hT, y: pA.y + wallNormal.y * hT };
        const pR = { x: pA.x - wallNormal.x * hT, y: pA.y - wallNormal.y * hT };

        // Intersezione tra i lati del muro entrante e la linea di confine del bersaglio
        const intersectL = this._lineLineIntersection(pL, projDir, boundaryPoint, tDir);
        const intersectR = this._lineLineIntersection(pR, projDir, boundaryPoint, tDir);

        if (intersectL && intersectR) {
            // Applichiamo l'override (usando la tua correzione per l'effetto farfalla)
            if (isStart) {
                incomingWall.startCapOverride = { left: intersectR, right: intersectL };
                // Il punto centrale del cap ora è esattamente sul bordo del muro bersaglio
                incomingWall.points[0].x = (intersectL.x + intersectR.x) / 2;
                incomingWall.points[0].y = (intersectL.y + intersectR.y) / 2;
            } else {
                incomingWall.endCapOverride = { left: intersectL, right: intersectR };
                incomingWall.points[incomingWall.points.length - 1].x = (intersectL.x + intersectR.x) / 2;
                incomingWall.points[incomingWall.points.length - 1].y = (intersectL.y + intersectR.y) / 2;
            }
        }
    }

    _resolveWallToWallVertex(conn) {
        let wallA = this.mapData.walls.get(conn.wallId);
        let wallB = this.mapData.walls.get(conn.targetWallId);

        // 1. Identifichiamo Target (più spesso) e Incoming (più sottile)
        let target = wallA.thickness >= wallB.thickness ? wallA : wallB;
        let incoming = wallA.thickness >= wallB.thickness ? wallB : wallA;

        let targetEnd = (target === wallA) ? conn.wallEnd : conn.targetWallEnd;
        let incomingEnd = (target === wallA) ? conn.targetWallEnd : conn.wallEnd;

        // 2. Prendiamo i vertici della "faccia" del muro spesso (Target)
        const targetCap = this._getWallCapVertices(target, targetEnd);
        const v1 = targetCap.left;
        const v2 = targetCap.right;
        const edgeDir = this._normalize({ x: v2.x - v1.x, y: v2.y - v1.y });

        // 3. Proiettiamo i lati del muro sottile sulla faccia di quello spesso
        const isStartInc = (incomingEnd === 'start');
        const pA = isStartInc ? incoming.points[0] : incoming.points[incoming.points.length - 1];
        const pB = isStartInc ? incoming.points[1] : incoming.points[incoming.points.length - 2];

        const projDir = this._normalize({ x: pA.x - pB.x, y: pA.y - pB.y });
        const wallNormal = { x: -projDir.y, y: projDir.x };
        const hT = incoming.thickness / 2;

        const pL = { x: pA.x + wallNormal.x * hT, y: pA.y + wallNormal.y * hT };
        const pR = { x: pA.x - wallNormal.x * hT, y: pA.y - wallNormal.y * hT };

        const intersectL = this._lineLineIntersection(pL, projDir, v1, edgeDir);
        const intersectR = this._lineLineIntersection(pR, projDir, v1, edgeDir);

        if (intersectL && intersectR) {
            // --- APPLICHIAMO SOLO L'OVERRIDE ---
            // NON modifichiamo incoming.points[0]. 
            // Il punto del backbone rimane nel centro del muro spesso.
            const override = isStartInc ?
                { left: intersectR, right: intersectL } :
                { left: intersectL, right: intersectR };

            if (isStartInc) incoming.startCapOverride = override;
            else incoming.endCapOverride = override;
        }
    }

    /**
 * Helper per calcolare i vertici di un cap rettangolare standard
 */
    _getWallCapVertices(wall, end) {
        const isStart = (end === 'start');
        const pA = isStart ? wall.points[0] : wall.points[wall.points.length - 1];
        const pB = isStart ? wall.points[1] : wall.points[wall.points.length - 2];

        const dir = this._normalize({ x: pA.x - pB.x, y: pA.y - pB.y });
        const norm = { x: -dir.y, y: dir.x };
        const hT = wall.thickness / 2;

        return {
            left: { x: pA.x + norm.x * hT, y: pA.y + norm.y * hT },
            right: { x: pA.x - norm.x * hT, y: pA.y - norm.y * hT }
        };
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