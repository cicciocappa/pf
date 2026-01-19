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
                // ... altri casi
            }
        }
    }

    _resolveWallToBuildingVertex(conn) {
        const wall = this.mapData.walls.get(conn.wallId);
        const bldg = this.mapData.buildings.get(conn.targetId);
        if (!wall || !bldg) return;

        // 1. Identifichiamo il vertice bersaglio e i suoi vicini
        const vIdx = conn.targetVertexIndex;
        const vCurr = bldg.vertices[vIdx];
        const vPrev = bldg.vertices[(vIdx - 1 + bldg.vertices.length) % bldg.vertices.length];
        const vNext = bldg.vertices[(vIdx + 1) % bldg.vertices.length];

        const dirPrev = this._normalize({ x: vPrev.x - vCurr.x, y: vPrev.y - vCurr.y });
        const dirNext = this._normalize({ x: vNext.x - vCurr.x, y: vNext.y - vCurr.y });

        // 2. Troviamo la direzione del muro
        const isStart = conn.wallEnd === 'start';
        const p1 = isStart ? wall.points[0] : wall.points[wall.points.length - 2];
        const p2 = isStart ? wall.points[1] : wall.points[wall.points.length - 1];

        const segmentDir = this._normalize({ x: p2.x - p1.x, y: p2.y - p1.y });
        const segmentNormal = { x: -segmentDir.y, y: segmentDir.x };
        const halfThickness = wall.thickness / 2;

        const pTarget = isStart ? p1 : p2;

        // 3. Calcoliamo le linee di spessore del muro
        const leftLinePoint = { x: pTarget.x + segmentNormal.x * halfThickness, y: pTarget.y + segmentNormal.y * halfThickness };
        const rightLinePoint = { x: pTarget.x - segmentNormal.x * halfThickness, y: pTarget.y - segmentNormal.y * halfThickness };

        // 4. Calcoliamo le intersezioni per creare lo smusso
        // IMPORTANTE: Dobbiamo capire quale lato del muro colpisce quale edge dell'edificio
        // Proiettiamo la linea sinistra del muro sull'edge PRECEDENTE e la destra sul SUCCESSIVO (o viceversa)
        const intersectL = this._lineLineIntersection(leftLinePoint, segmentDir, vCurr, dirPrev);
        const intersectR = this._lineLineIntersection(rightLinePoint, segmentDir, vCurr, dirNext);

        // Test di sicurezza: se l'ordine è invertito, scambiamo le intersezioni
        // (Dipende dal winding order dell'edificio)
        // Qui implementiamo la logica semplificata assumendo winding standard

        if (intersectL && intersectR) {
            // --- MODIFICA DELL'EDIFICIO ---
            // Sostituiamo il vertice singolo con i due nuovi vertici dello smusso
            // Questo crea la faccia piatta "smussata"
            bldg.vertices.splice(vIdx, 1, intersectL, intersectR);

            // --- MODIFICA DEL MURO ---
            // Il muro ora finisce esattamente sulla nuova faccia piatta dell'edificio
            const override = { left: intersectL, right: intersectR };
            if (isStart) {
                wall.startCapOverride = override;
                p1.x = (intersectL.x + intersectR.x) / 2;
                p1.y = (intersectL.y + intersectR.y) / 2;
            } else {
                wall.endCapOverride = override;
                p2.x = (intersectL.x + intersectR.x) / 2;
                p2.y = (intersectL.y + intersectR.y) / 2;
            }
        }
    }

    _resolveWallToBuildingEdge(conn) {
        const wall = this.mapData.walls.get(conn.wallId);
        const bldg = this.mapData.buildings.get(conn.targetId);
        if (!wall || !bldg || conn.targetEdgeIndex === undefined) return;

        const v1 = bldg.vertices[conn.targetEdgeIndex];
        const v2 = bldg.vertices[(conn.targetEdgeIndex + 1) % bldg.sides];
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