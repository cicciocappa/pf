/**
 * Wall class - represents a polyline with thickness
 * Supports snapping to edges for proper polygon generation
 */




export class Wall {
    constructor(options = {}) {
        this.id = options.id || Wall.generateId();
        this.points = options.points || []; // Array of {x, y}
        this.thickness = options.thickness || 10;
        this.maxSegmentLength = options.maxSegmentLength || 30;
        this.type = 'wall';

        // Snap information for start and end points
        // OLD Format: { type: 'polygon'|'wall'|'vertex'|'outer', targetId: string|null, edge: {p1, p2} } or null
        // NEW Format : {type: 'edge'|'vertex', target:'polygon'|'wall'|'outer', edge: {p1, p2}, vertex: {x,y}} or null
        this.startSnap = options.startSnap || null;
        this.endSnap = options.endSnap || null;

        // Cached thickness lines (recalculated when needed)
        this._thicknessLinesCache = null;
    }

    static generateId() {
        return 'wall_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Invalidate cached data (call when points/thickness change)
     */
    invalidateCache() {
        this._thicknessLinesCache = null;
    }

    /**
     * Get the thickness lines (left and right parallel lines)
     * These are used for snap-to-edge functionality
     * @returns {Array<{left: {x,y}, right: {x,y}, center: {x,y}}>}
     */
    getThicknessLines() {
        if (this._thicknessLinesCache) {
            return this._thicknessLinesCache;
        }

        if (this.points.length < 2) {
            this._thicknessLinesCache = [];
            return this._thicknessLinesCache;
        }

        const halfThickness = this.thickness / 2;
        const result = [];

        for (let i = 0; i < this.points.length; i++) {
            const curr = this.points[i];
            const prev = this.points[i - 1];
            const next = this.points[i + 1];

            let normal = this.calculateNormal(prev, curr, next);

            result.push({
                center: { ...curr },
                left: {
                    x: curr.x + normal.x * halfThickness,
                    y: curr.y + normal.y * halfThickness
                },
                right: {
                    x: curr.x - normal.x * halfThickness,
                    y: curr.y - normal.y * halfThickness
                },
                normal: { ...normal }
            });
        }

        this._thicknessLinesCache = result;
        return result;
    }

    /**
     * Calculate normal at a point considering prev and next points
     */
    calculateNormal(prev, curr, next) {
        let normal;

        if (!prev && next) {
            // First point
            const dir = this.normalize({
                x: next.x - curr.x,
                y: next.y - curr.y
            });
            normal = { x: -dir.y, y: dir.x };
        } else if (prev && !next) {
            // Last point
            const dir = this.normalize({
                x: curr.x - prev.x,
                y: curr.y - prev.y
            });
            normal = { x: -dir.y, y: dir.x };
        } else if (prev && next) {
            // Middle point - average normals for miter join
            const dir1 = this.normalize({
                x: curr.x - prev.x,
                y: curr.y - prev.y
            });
            const dir2 = this.normalize({
                x: next.x - curr.x,
                y: next.y - curr.y
            });

            const n1 = { x: -dir1.y, y: dir1.x };
            const n2 = { x: -dir2.y, y: dir2.x };

            normal = this.normalize({
                x: n1.x + n2.x,
                y: n1.y + n2.y
            });

            // Miter length adjustment
            const dot = n1.x * normal.x + n1.y * normal.y;
            if (Math.abs(dot) > 0.001) {
                const miterLength = 1 / dot;
                const maxMiter = 2;
                const adjustedMiter = Math.min(miterLength, maxMiter);
                normal.x *= adjustedMiter;
                normal.y *= adjustedMiter;
            }
        } else {
            normal = { x: 0, y: -1 };
        }

        return normal;
    }

    /**
     * Get all edges (thickness lines as segments) for snap detection
     * @returns {Array<{p1: {x,y}, p2: {x,y}, wallId: string, side: 'left'|'right'}>}
     */
    getThicknessEdges() {
        const lines = this.getThicknessLines();
        if (lines.length < 2) return [];

        const edges = [];

        for (let i = 0; i < lines.length - 1; i++) {
            // Left edge
            edges.push({
                p1: { ...lines[i].left },
                p2: { ...lines[i + 1].left },
                wallId: this.id,
                side: 'left'
            });
            // Right edge
            edges.push({
                p1: { ...lines[i].right },
                p2: { ...lines[i + 1].right },
                wallId: this.id,
                side: 'right'
            });
        }

        return edges;
    }

    /**
   * Wall.js - Metodo toQuadrilaterals aggiornato
   */
    toQuadrilaterals(mapData = null) {
        if (this.points.length < 2) return [];

        const quads = [];
        // 1. Otteniamo i punti della mesh esterna (già calcolati con miter e spessore corretto)
        const lines = this.getThicknessLines();
        const halfThickness = this.thickness / 2;

        for (let i = 0; i < this.points.length - 1; i++) {
            const p1 = this.points[i];
            const p2 = this.points[i + 1];

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            if (length < 0.001) continue;

            const dir = { x: dx / length, y: dy / length };
            const normal = { x: -dir.y, y: dir.x };

            // Suddivisioni
            const numSubdivisions = Math.ceil(length / this.maxSegmentLength);

            // Estremi "Mitered" del segmento corrente
            let startLeft = { ...lines[i].left };
            let startRight = { ...lines[i].right };
            let endLeft = { ...lines[i + 1].left };
            let endRight = { ...lines[i + 1].right };

            // Applica gli snap (se presenti) solo alle estremità assolute del muro
            if (i === 0 && this.startSnap) {
                const adapted = this.applySnapToCap(p1, dir, normal, halfThickness, this.startSnap, mapData, true);
                startLeft = adapted.left;
                startRight = adapted.right;
            }
            if (i === this.points.length - 2 && this.endSnap) {
                const adapted = this.applySnapToCap(p2, dir, normal, halfThickness, this.endSnap, mapData, false);
                endLeft = adapted.left;
                endRight = adapted.right;
            }

            // Generazione dei quadrilateri per le suddivisioni
            for (let j = 0; j < numSubdivisions; j++) {
                const t1 = j / numSubdivisions;
                const t2 = (j + 1) / numSubdivisions;

                // Per le suddivisioni INTERNE a un segmento, usiamo la normale perpendicolare
                // Per le giunzioni TRA segmenti, usiamo i punti miter calcolati sopra

                const getPointsAtT = (t, isMiterStart, isMiterEnd) => {
                    if (t <= 0 && isMiterStart) return { l: startLeft, r: startRight };
                    if (t >= 1 && isMiterEnd) return { l: endLeft, r: endRight };

                    // Punto sulla linea centrale
                    const currP = { x: p1.x + dx * t, y: p1.y + dy * t };
                    // Usiamo la normale del segmento (taglio perpendicolare)
                    return {
                        l: { x: currP.x + normal.x * halfThickness, y: currP.y + normal.y * halfThickness },
                        r: { x: currP.x - normal.x * halfThickness, y: currP.y - normal.y * halfThickness }
                    };
                };

                const pStart = getPointsAtT(t1, j === 0, false);
                const pEnd = getPointsAtT(t2, false, j === numSubdivisions - 1);

                quads.push([
                    { ...pStart.l }, // topLeft
                    { ...pEnd.l },   // topRight
                    { ...pEnd.r },   // bottomRight
                    { ...pStart.r }  // bottomLeft
                ]);
            }
        }

        return quads;
    }

    /**
     * Funzione helper per pulire il codice di snap
     */
    applySnapToCap(center, dir, normal, halfThickness, snap, mapData, isStart) {
        if (snap.snapType === 'vertex' && mapData) {
            const vertexInfo = mapData.getAdjacentEdges(snap.type, snap.targetId, snap.vertexIndex);
            if (vertexInfo) {
                const adapted = this.adaptCapToVertex(center, dir, normal, halfThickness, vertexInfo, isStart);
                if (adapted.valid) return adapted;
            }
        } else if (snap.edge) {
            return this.adaptCapToEdge(center, dir, normal, halfThickness, snap.edge, isStart);
        }
        return {
            left: { x: center.x + normal.x * halfThickness, y: center.y + normal.y * halfThickness },
            right: { x: center.x - normal.x * halfThickness, y: center.y - normal.y * halfThickness }
        };
    }

    /**
     * Adapt a cap (start or end) to fit against a target edge.
     *
     * Algorithm:
     * 1. From the wall segment connected to the edge, trace two lines parallel to the
     *    wall direction, at distance halfThickness (left and right sides of the wall)
     * 2. Calculate the intersection of these two parallel lines with the edge line
     * 3. If there are not 2 valid intersections, the wall cannot connect properly
     * 4. The two intersection points are the cap vertices
     *
     * @param {Object} capCenter - A point on the wall centerline (used to define parallel lines)
     * @param {Object} wallDir - Direction of the wall segment (normalized)
     * @param {Object} normal - Normal of the wall segment (perpendicular to wallDir, points left)
     * @param {number} halfThickness - Half the wall thickness
     * @param {Object} targetEdge - {p1, p2} of the target edge
     * @param {boolean} isStart - True if this is the start cap, false for end cap
     * @returns {{left: {x,y}, right: {x,y}, valid: boolean, error: string|null}} Adapted cap points
     */
    adaptCapToEdge(capCenter, wallDir, normal, halfThickness, targetEdge, isStart) {
        const { p1: e1, p2: e2 } = targetEdge;

        console.log('=== adaptCapToEdge DEBUG ===');
        console.log('capCenter:', capCenter);
        console.log('wallDir:', wallDir);
        console.log('normal:', normal);
        console.log('halfThickness:', halfThickness);
        console.log('targetEdge:', targetEdge);
        console.log('isStart:', isStart);

        // Edge direction and line definition
        const edgeVec = { x: e2.x - e1.x, y: e2.y - e1.y };
        const edgeLen = Math.sqrt(edgeVec.x * edgeVec.x + edgeVec.y * edgeVec.y);

        if (edgeLen < 0.001) {
            // Degenerate edge, return default points
            return {
                left: { x: capCenter.x + normal.x * halfThickness, y: capCenter.y + normal.y * halfThickness },
                right: { x: capCenter.x - normal.x * halfThickness, y: capCenter.y - normal.y * halfThickness },
                valid: false,
                error: 'Degenerate edge (zero length)'
            };
        }

        const edgeDir = { x: edgeVec.x / edgeLen, y: edgeVec.y / edgeLen };
        console.log('edgeDir:', edgeDir);

        // Define the two parallel lines (left and right sides of the wall)
        // These lines are parallel to wallDir, at distance halfThickness from the centerline
        // Any point on the centerline can be used to define them
        const leftLinePoint = {
            x: capCenter.x + normal.x * halfThickness,
            y: capCenter.y + normal.y * halfThickness
        };
        const rightLinePoint = {
            x: capCenter.x - normal.x * halfThickness,
            y: capCenter.y - normal.y * halfThickness
        };
        console.log('leftLinePoint:', leftLinePoint);
        console.log('rightLinePoint:', rightLinePoint);

        // Find intersections of the two parallel lines with the edge line
        // Left wall side: line through leftLinePoint with direction wallDir
        // Right wall side: line through rightLinePoint with direction wallDir
        // Edge: line through e1 with direction edgeDir
        const leftIntersect = this.lineLineIntersection(leftLinePoint, wallDir, e1, edgeDir);
        const rightIntersect = this.lineLineIntersection(rightLinePoint, wallDir, e1, edgeDir);

        console.log('leftIntersect:', leftIntersect);
        console.log('rightIntersect:', rightIntersect);

        // Check if both intersections exist (lines are not parallel)
        if (!leftIntersect || !rightIntersect) {
            // Wall is parallel to edge - cannot connect
            console.warn('adaptCapToEdge: wall parallel to edge, cannot compute cap');
            return {
                left: leftLinePoint,
                right: rightLinePoint,
                valid: false,
                error: 'Wall is parallel to edge'
            };
        }

        console.log('=== END adaptCapToEdge DEBUG ===');

        return {
            left: leftIntersect,
            right: rightIntersect,
            valid: true,
            error: null
        };
    }

    /**
     * ================================================================================
     * ADAPT CAP TO VERTEX - Connessione muro a vertice di un poligono
     * ================================================================================
     *
     * Questa funzione adatta l'estremità (cap) di un muro per connettersi a un vertice
     * di un poligono (edificio/ostacolo). Il risultato è che i due punti del cap
     * (left e right, che normalmente formano una linea perpendicolare al muro)
     * vengono proiettati sui due edge adiacenti al vertice.
     *
     * GEOMETRIA:
     *
     *                    prevEdge
     *                       |
     *                       |
     *            leftResult *-------- vertice dell'edificio
     *                      /          \
     *                     /            \
     *          MURO -->  /              \ nextEdge
     *                   /                \
     *                  *                  *
     *             rightResult
     *
     * Il muro "entra" nel vertice dell'edificio. I punti leftResult e rightResult
     * sono le intersezioni tra le linee di spessore del muro e gli edge adiacenti.
     *
     * PARAMETRI:
     * @param {Object} capCenter - Centro del cap (posizione del vertice dell'edificio)
     * @param {Object} wallDir - Direzione del segmento di muro (normalizzata, punta VERSO l'interno del muro)
     * @param {Object} normal - Normale del muro (perpendicolare a wallDir, punta verso LEFT)
     * @param {number} halfThickness - Metà dello spessore del muro
     * @param {Object} vertexInfo - Info sul vertice: {point, prevEdge, nextEdge}
     *                              - prevEdge: edge che ARRIVA al vertice (p1 -> p2, dove p2 = vertice)
     *                              - nextEdge: edge che PARTE dal vertice (p1 -> p2, dove p1 = vertice)
     * @param {boolean} isStart - true se questo è il cap di inizio, false se è il cap di fine
     *
     * @returns {{left: {x,y}, right: {x,y}, valid: boolean, error: string|null}}
     */
    adaptCapToVertex(capCenter, wallDir, normal, halfThickness, vertexInfo, isStart) {
        const { point: vertex, prevEdge, nextEdge } = vertexInfo;

        // Log per debug
        console.log('=== adaptCapToVertex ===');
        console.log('capCenter (vertex position):', capCenter);
        console.log('wallDir (direction into wall):', wallDir);
        console.log('normal (perpendicular, points LEFT):', normal);
        console.log('halfThickness:', halfThickness);
        console.log('isStart:', isStart);
        console.log('prevEdge:', prevEdge);
        console.log('nextEdge:', nextEdge);

        // Verifica che gli edge adiacenti esistano
        if (!prevEdge || !nextEdge) {
            console.error('Missing adjacent edges!');
            return {
                left: { x: capCenter.x + normal.x * halfThickness, y: capCenter.y + normal.y * halfThickness },
                right: { x: capCenter.x - normal.x * halfThickness, y: capCenter.y - normal.y * halfThickness },
                valid: false,
                error: 'Missing adjacent edges for vertex connection'
            };
        }

        // ============================================================================
        // STEP 1: Calcola i punti LEFT e RIGHT del cap (prima della proiezione)
        // ============================================================================
        // leftPoint è a SINISTRA del muro (nella direzione di normal)
        // rightPoint è a DESTRA del muro (nella direzione opposta di normal)
        const leftPoint = {
            x: capCenter.x + normal.x * halfThickness,
            y: capCenter.y + normal.y * halfThickness
        };
        const rightPoint = {
            x: capCenter.x - normal.x * halfThickness,
            y: capCenter.y - normal.y * halfThickness
        };
        console.log('leftPoint (before projection):', leftPoint);
        console.log('rightPoint (before projection):', rightPoint);

        // ============================================================================
        // STEP 2: Calcola le direzioni dei due edge adiacenti al vertice
        // ============================================================================
        // prevEdge va da p1 a p2 (dove p2 è il vertice)
        // nextEdge va da p1 a p2 (dove p1 è il vertice)
        const prevEdgeDir = this.normalize({
            x: prevEdge.p2.x - prevEdge.p1.x,
            y: prevEdge.p2.y - prevEdge.p1.y
        });
        const nextEdgeDir = this.normalize({
            x: nextEdge.p2.x - nextEdge.p1.x,
            y: nextEdge.p2.y - nextEdge.p1.y
        });
        console.log('prevEdgeDir:', prevEdgeDir);
        console.log('nextEdgeDir:', nextEdgeDir);

        // ============================================================================
        // STEP 3: Prova a proiettare leftPoint su entrambi gli edge
        // ============================================================================
        // La proiezione avviene lungo la direzione del muro (wallDir)
        // Cerchiamo dove la linea (leftPoint + t*wallDir) interseca ciascun edge
        const leftOnPrev = this.lineLineIntersection(leftPoint, wallDir, prevEdge.p1, prevEdgeDir);
        const leftOnNext = this.lineLineIntersection(leftPoint, wallDir, nextEdge.p1, nextEdgeDir);
        console.log('leftOnPrev (intersection):', leftOnPrev);
        console.log('leftOnNext (intersection):', leftOnNext);

        // ============================================================================
        // STEP 4: Prova a proiettare rightPoint su entrambi gli edge
        // ============================================================================
        const rightOnPrev = this.lineLineIntersection(rightPoint, wallDir, prevEdge.p1, prevEdgeDir);
        const rightOnNext = this.lineLineIntersection(rightPoint, wallDir, nextEdge.p1, nextEdgeDir);
        console.log('rightOnPrev (intersection):', rightOnPrev);
        console.log('rightOnNext (intersection):', rightOnNext);

        // ============================================================================
        // STEP 5: Verifica quali proiezioni cadono effettivamente sul segmento
        // ============================================================================
        // Una proiezione è valida solo se il punto risultante è SUL SEGMENTO dell'edge,
        // non sulla sua estensione infinita
        const leftOnPrevValid = leftOnPrev && this.isPointOnSegment(leftOnPrev, prevEdge.p1, prevEdge.p2);
        const leftOnNextValid = leftOnNext && this.isPointOnSegment(leftOnNext, nextEdge.p1, nextEdge.p2);
        const rightOnPrevValid = rightOnPrev && this.isPointOnSegment(rightOnPrev, prevEdge.p1, prevEdge.p2);
        const rightOnNextValid = rightOnNext && this.isPointOnSegment(rightOnNext, nextEdge.p1, nextEdge.p2);
        console.log('Validity check:');
        console.log('  leftOnPrevValid:', leftOnPrevValid);
        console.log('  leftOnNextValid:', leftOnNextValid);
        console.log('  rightOnPrevValid:', rightOnPrevValid);
        console.log('  rightOnNextValid:', rightOnNextValid);

        let leftResult = null;
        let rightResult = null;

        // ============================================================================
        // STEP 6: Determina l'assegnazione corretta (quale edge per quale punto)
        // ============================================================================
        // Il caso ideale è: leftPoint va su un edge, rightPoint va sull'altro edge
        // Ci sono 4 casi possibili:

        // CASO 1: left su prevEdge, right su nextEdge
        if (leftOnPrevValid && rightOnNextValid) {
            console.log('Case 1: left->prev, right->next');
            leftResult = leftOnPrev;
            rightResult = rightOnNext;
        }
        // CASO 2: left su nextEdge, right su prevEdge
        else if (leftOnNextValid && rightOnPrevValid) {
            console.log('Case 2: left->next, right->prev');
            leftResult = leftOnNext;
            rightResult = rightOnPrev;
        }
        // CASO 3: Entrambe le proiezioni di left sono valide - scegli la più vicina
        else if (leftOnPrevValid && leftOnNextValid) {
            console.log('Case 3: both left projections valid, choosing closer');
            const distPrev = Math.sqrt((leftOnPrev.x - leftPoint.x) ** 2 + (leftOnPrev.y - leftPoint.y) ** 2);
            const distNext = Math.sqrt((leftOnNext.x - leftPoint.x) ** 2 + (leftOnNext.y - leftPoint.y) ** 2);
            console.log('  distPrev:', distPrev, 'distNext:', distNext);
            if (distPrev < distNext) {
                leftResult = leftOnPrev;
                rightResult = rightOnNextValid ? rightOnNext : rightPoint;
            } else {
                leftResult = leftOnNext;
                rightResult = rightOnPrevValid ? rightOnPrev : rightPoint;
            }
        }
        // CASO 4: Entrambe le proiezioni di right sono valide - scegli la più vicina
        else if (rightOnPrevValid && rightOnNextValid) {
            console.log('Case 4: both right projections valid, choosing closer');
            const distPrev = Math.sqrt((rightOnPrev.x - rightPoint.x) ** 2 + (rightOnPrev.y - rightPoint.y) ** 2);
            const distNext = Math.sqrt((rightOnNext.x - rightPoint.x) ** 2 + (rightOnNext.y - rightPoint.y) ** 2);
            console.log('  distPrev:', distPrev, 'distNext:', distNext);
            if (distPrev < distNext) {
                rightResult = rightOnPrev;
                leftResult = leftOnNextValid ? leftOnNext : leftPoint;
            } else {
                rightResult = rightOnNext;
                leftResult = leftOnPrevValid ? leftOnPrev : leftPoint;
            }
        }

        console.log('Final results:');
        console.log('  leftResult:', leftResult);
        console.log('  rightResult:', rightResult);

        // Aggiungiamo un flag per dire al geometry.js l'orientamento
        let leftIsPrev = false;

        if (leftOnPrevValid && rightOnNextValid) {
            leftResult = leftOnPrev;
            rightResult = rightOnNext;
            leftIsPrev = true; // Il lato sinistro del muro è sull'edge che "entra" nel vertice
        } else if (leftOnNextValid && rightOnPrevValid) {
            leftResult = leftOnNext;
            rightResult = rightOnPrev;
            leftIsPrev = false; // Il lato destro del muro è sull'edge che "entra" nel vertice
        }

        // ============================================================================
        // STEP 7: Se non troviamo proiezioni valide, restituisci errore
        // ============================================================================
        if (!leftResult || !rightResult) {
            console.error('Could not find valid projections!');
            return {
                left: leftPoint,
                right: rightPoint,
                valid: false,
                error: 'Cap projection does not intersect adjacent edges correctly'
            };
        }

        return {
            left: leftResult,
            right: rightResult,
            leftIsPrev: leftIsPrev, // <--- Importante!
            valid: true,
            error: null
        };
    }

    /**
     * Check if a point lies on a line segment (within tolerance)
     */
    isPointOnSegment(point, p1, p2, tolerance = 1) {
        const d1 = Math.sqrt((point.x - p1.x) ** 2 + (point.y - p1.y) ** 2);
        const d2 = Math.sqrt((point.x - p2.x) ** 2 + (point.y - p2.y) ** 2);
        const segLen = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);

        return Math.abs(d1 + d2 - segLen) < tolerance;
    }

    /**
     * Find intersection point of two lines
     * Line 1: point p1 + t * dir1
     * Line 2: point p2 + s * dir2
     * @returns {Object|null} Intersection point or null if parallel
     */
    lineLineIntersection(p1, dir1, p2, dir2) {
        const cross = dir1.x * dir2.y - dir1.y * dir2.x;

        if (Math.abs(cross) < 0.0001) {
            // Lines are parallel
            return null;
        }

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;

        const t = (dx * dir2.y - dy * dir2.x) / cross;

        return {
            x: p1.x + t * dir1.x,
            y: p1.y + t * dir1.y
        };
    }

    /**
     * Convert polyline to single polygon with thickness (legacy method)
     * Use toQuadrilaterals() for better results
     * @returns {Array<{x: number, y: number}>}
     */
    toPolygon() {
        if (this.points.length < 2) return [];

        const halfThickness = this.thickness / 2;
        const leftSide = [];
        const rightSide = [];

        for (let i = 0; i < this.points.length; i++) {
            const curr = this.points[i];
            const prev = this.points[i - 1];
            const next = this.points[i + 1];

            let normal = this.calculateNormal(prev, curr, next);

            leftSide.push({
                x: curr.x + normal.x * halfThickness,
                y: curr.y + normal.y * halfThickness
            });

            rightSide.push({
                x: curr.x - normal.x * halfThickness,
                y: curr.y - normal.y * halfThickness
            });
        }

        return [...leftSide, ...rightSide.reverse()];
    }

    /**
     * Convert polyline to single polygon with thickness, adapting caps to snapped connections
     * @param {MapData} mapData - MapData for vertex/edge lookups
     * @returns {Array<{x: number, y: number}>}
     */
    toPolygonWithSnaps(mapData) {
        if (this.points.length < 2) return [];

        const halfThickness = this.thickness / 2;
        const leftSide = [];
        const rightSide = [];

        for (let i = 0; i < this.points.length; i++) {
            const curr = this.points[i];
            const prev = this.points[i - 1];
            const next = this.points[i + 1];

            let normal = this.calculateNormal(prev, curr, next);

            leftSide.push({
                x: curr.x + normal.x * halfThickness,
                y: curr.y + normal.y * halfThickness
            });

            rightSide.push({
                x: curr.x - normal.x * halfThickness,
                y: curr.y - normal.y * halfThickness
            });
        }

        // Adapt start cap if snapped
        if (this.startSnap && mapData) {
            const p1 = this.points[0];
            const p2 = this.points[1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const length = Math.sqrt(dx * dx + dy * dy);

            if (length > 0.001) {
                const dir = { x: dx / length, y: dy / length };
                const normal = { x: -dir.y, y: dir.x };

                console.log('toPolygonWithSnaps: startSnap =', this.startSnap);
                if (this.startSnap.snapType === 'vertex') {
                    console.log('toPolygonWithSnaps: using VERTEX snap for start');
                    const vertexInfo = mapData.getAdjacentEdges(
                        this.startSnap.type,
                        this.startSnap.targetId,
                        this.startSnap.vertexIndex
                    );
                    if (vertexInfo) {
                        const adapted = this.adaptCapToVertex(p1, dir, normal, halfThickness, vertexInfo, true);
                        if (adapted.valid) {
                            leftSide[0] = adapted.left;
                            rightSide[0] = adapted.right;
                        }
                    }
                } else if (this.startSnap.snapType === 'edge' && this.startSnap.edge) {
                    console.log('toPolygonWithSnaps: using EDGE snap for start');
                    console.log('  p1 (capCenter):', p1);
                    console.log('  dir (wallDir):', dir);
                    console.log('  normal:', normal);
                    console.log('  edge:', this.startSnap.edge);
                    const adapted = this.adaptCapToEdge(p1, dir, normal, halfThickness, this.startSnap.edge, true);
                    console.log('  adapted result:', adapted);
                    console.log('  leftSide[0] BEFORE:', leftSide[0]);
                    console.log('  rightSide[0] BEFORE:', rightSide[0]);
                    leftSide[0] = adapted.left;
                    rightSide[0] = adapted.right;
                    console.log('  leftSide[0] AFTER:', leftSide[0]);
                    console.log('  rightSide[0] AFTER:', rightSide[0]);
                } else {
                    console.log('toPolygonWithSnaps: NO snap adaptation for start (snapType:', this.startSnap.snapType, ', edge:', this.startSnap.edge, ')');
                }
            }
        }

        // Adapt end cap if snapped
        if (this.endSnap && mapData) {
            const lastIdx = this.points.length - 1;
            const p1 = this.points[lastIdx];
            const p2 = this.points[lastIdx - 1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const length = Math.sqrt(dx * dx + dy * dy);

            if (length > 0.001) {
                const dir = { x: dx / length, y: dy / length };
                const normal = { x: -dir.y, y: dir.x };

                if (this.endSnap.snapType === 'vertex') {
                    const vertexInfo = mapData.getAdjacentEdges(
                        this.endSnap.type,
                        this.endSnap.targetId,
                        this.endSnap.vertexIndex
                    );
                    if (vertexInfo) {
                        const adapted = this.adaptCapToVertex(p1, dir, normal, halfThickness, vertexInfo, false);
                        if (adapted.valid) {
                            leftSide[lastIdx] = adapted.left;
                            rightSide[lastIdx] = adapted.right;
                        }
                    }
                } else if (this.endSnap.snapType === 'edge' && this.endSnap.edge) {
                    const adapted = this.adaptCapToEdge(p1, dir, normal, halfThickness, this.endSnap.edge, false);
                    leftSide[lastIdx] = adapted.left;
                    rightSide[lastIdx] = adapted.right;
                }
            }
        }

        return [...leftSide, ...rightSide.reverse()];
    }

    /**
     * Get subdivision points for visualization
     * Now includes subdivisions at ALL intermediate vertices
     * @returns {Array<{start: {x,y}, end: {x,y}}>}
     */
    getSubdivisions() {
        if (this.points.length < 2) return [];

        const subdivisions = [];
        const halfThickness = this.thickness / 2;

        for (let i = 0; i < this.points.length - 1; i++) {
            const p1 = this.points[i];
            const p2 = this.points[i + 1];

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const length = Math.sqrt(dx * dx + dy * dy);

            if (length < 0.001) continue;

            const numSegments = Math.ceil(length / this.maxSegmentLength);
            const dir = { x: dx / length, y: dy / length };
            const normal = { x: -dir.y, y: dir.x };

            // Add subdivision at START of segment (for intermediate vertices)
            if (i > 0) {
                subdivisions.push({
                    start: {
                        x: p1.x + normal.x * halfThickness,
                        y: p1.y + normal.y * halfThickness
                    },
                    end: {
                        x: p1.x - normal.x * halfThickness,
                        y: p1.y - normal.y * halfThickness
                    },
                    isVertex: true
                });
            }

            // Add internal subdivisions
            for (let j = 1; j < numSegments; j++) {
                const t = j / numSegments;
                const point = {
                    x: p1.x + dx * t,
                    y: p1.y + dy * t
                };

                subdivisions.push({
                    start: {
                        x: point.x + normal.x * halfThickness,
                        y: point.y + normal.y * halfThickness
                    },
                    end: {
                        x: point.x - normal.x * halfThickness,
                        y: point.y - normal.y * halfThickness
                    },
                    isVertex: false
                });
            }
        }

        return subdivisions;
    }

    /**
     * Get parallel lines for visualization (outline)
     * @returns {{left: Array<{x,y}>, right: Array<{x,y}>}}
     */
    getParallelLines() {
        if (this.points.length < 2) return { left: [], right: [] };

        const lines = this.getThicknessLines();

        return {
            left: lines.map(l => ({ ...l.left })),
            right: lines.map(l => ({ ...l.right }))
        };
    }

    /**
     * Calculate total length of the wall
     */
    getTotalLength() {
        let length = 0;
        for (let i = 0; i < this.points.length - 1; i++) {
            const dx = this.points[i + 1].x - this.points[i].x;
            const dy = this.points[i + 1].y - this.points[i].y;
            length += Math.sqrt(dx * dx + dy * dy);
        }
        return length;
    }

    /**
     * Check if a point is inside this wall's polygon
     */
    containsPoint(x, y) {
        const polygon = this.toPolygon();
        return Wall.pointInPolygon(x, y, polygon);
    }

    /**
     * Get bounding box
     */
    getBounds() {
        const polygon = this.toPolygon();
        if (polygon.length === 0) return null;

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const v of polygon) {
            minX = Math.min(minX, v.x);
            minY = Math.min(minY, v.y);
            maxX = Math.max(maxX, v.x);
            maxY = Math.max(maxY, v.y);
        }

        return { minX, minY, maxX, maxY };
    }

    /**
     * Find closest point on the wall centerline
     */
    getClosestPoint(x, y) {
        if (this.points.length === 0) return null;
        if (this.points.length === 1) return { ...this.points[0] };

        let closestPoint = null;
        let minDist = Infinity;

        for (let i = 0; i < this.points.length - 1; i++) {
            const p1 = this.points[i];
            const p2 = this.points[i + 1];
            const point = this.closestPointOnSegment(x, y, p1, p2);
            const dist = Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2);

            if (dist < minDist) {
                minDist = dist;
                closestPoint = point;
            }
        }

        return closestPoint;
    }

    closestPointOnSegment(px, py, p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const lengthSq = dx * dx + dy * dy;

        if (lengthSq === 0) return { ...p1 };

        let t = ((px - p1.x) * dx + (py - p1.y) * dy) / lengthSq;
        t = Math.max(0, Math.min(1, t));

        return {
            x: p1.x + t * dx,
            y: p1.y + t * dy
        };
    }

    normalize(v) {
        const len = Math.sqrt(v.x * v.x + v.y * v.y);
        if (len < 0.001) return { x: 0, y: 0 };
        return { x: v.x / len, y: v.y / len };
    }

    static pointInPolygon(x, y, vertices) {
        let inside = false;
        const n = vertices.length;

        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = vertices[i].x, yi = vertices[i].y;
            const xj = vertices[j].x, yj = vertices[j].y;

            if (((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }

        return inside;
    }

    /**
     * Set start snap information
     * @param {Object|null} snapInfo - { type, targetId, edge: {p1, p2} } or null
     */
    setStartSnap(snapInfo) {
        this.startSnap = snapInfo;
        this.invalidateCache();
    }

    /**
     * Set end snap information
     * @param {Object|null} snapInfo - { type, targetId, edge: {p1, p2} } or null
     */
    setEndSnap(snapInfo) {
        this.endSnap = snapInfo;
        this.invalidateCache();
    }

    clone() {
        return new Wall({
            id: Wall.generateId(),
            points: this.points.map(p => ({ ...p })),
            thickness: this.thickness,
            maxSegmentLength: this.maxSegmentLength,
            startSnap: this.startSnap ? { ...this.startSnap } : null,
            endSnap: this.endSnap ? { ...this.endSnap } : null
        });
    }

    toJSON() {
        return {
            id: this.id,
            points: this.points.map(p => ({ ...p })),
            thickness: this.thickness,
            maxSegmentLength: this.maxSegmentLength,
            startSnap: this.startSnap,
            endSnap: this.endSnap
        };
    }

    static fromJSON(json) {
        return new Wall(json);
    }
}
