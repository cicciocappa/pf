/**
 * Wall - Rappresenta una polilinea con spessore suddivisa in unità distruttibili
 */
export class Wall {
    constructor(options = {}) {
        this.id = options.id;
        this.points = options.points || []; // Vertici della linea centrale {x, y}
        this.thickness = options.thickness || 30;
        this.maxSegmentLength = options.maxSegmentLength || 50;
        this.type = 'wall';

        // Cache della geometria finale (array di quadrilateri)
        this.units = [];
    }

    /**
     * Ricalcola la geometria del muro.
     * Viene chiamato dopo che il ConnectionManager ha spostato i punti.
     */
    updateVertices() {
        if (this.points.length < 2) {
            this.units = [];
            return;
        }
        this.units = this.generateDestructibleUnits();
    }

    /**
     * Genera la mesh suddivisa in base a maxSegmentLength.
     * Ogni unità è un array di 4 vertici (quadrilatero).
     */
    generateDestructibleUnits() {
        const units = [];
        const halfThickness = this.thickness / 2;
        const miterPoints = this.calculateThicknessPoints();

        for (let i = 0; i < this.points.length - 1; i++) {
            const p1 = this.points[i];
            const p2 = this.points[i + 1];

            // ... (calcolo direzione e lunghezza come prima) ...
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            if (length < 0.1) continue;

            const dir = { x: dx / length, y: dy / length };
            const normal = { x: -dir.y, y: dir.x };
            const numSubdivisions = Math.ceil(length / this.maxSegmentLength);

            /**
             * getCutLine ora riceve informazioni sulla posizione ASSOLUTA nel muro
             */
            const getCutLine = (t, isWallStart, isWallEnd) => {
                // Applica l'override SOLO se siamo all'inizio ASSOLUTO del muro
                if (t <= 0 && isWallStart && this.startCapOverride) {
                    return { L: this.startCapOverride.left, R: this.startCapOverride.right };
                }
                // Applica l'override SOLO se siamo alla fine ASSOLUTA del muro
                if (t >= 1 && isWallEnd && this.endCapOverride) {
                    return { L: this.endCapOverride.left, R: this.endCapOverride.right };
                }

                // Altrimenti: logica standard per vertici intermedi e tagli perpendicolari
                if (t <= 0) return { L: miterPoints[i].left, R: miterPoints[i].right };
                if (t >= 1) return { L: miterPoints[i + 1].left, R: miterPoints[i + 1].right };

                const centerPos = { x: p1.x + dx * t, y: p1.y + dy * t };
                return {
                    L: { x: centerPos.x + normal.x * halfThickness, y: centerPos.y + normal.y * halfThickness },
                    R: { x: centerPos.x - normal.x * halfThickness, y: centerPos.y - normal.y * halfThickness }
                };
            };

            for (let j = 0; j < numSubdivisions; j++) {
                const tStart = j / numSubdivisions;
                const tEnd = (j + 1) / numSubdivisions;

                // Controlliamo se siamo al primo blocco del primo segmento 
                // o all'ultimo blocco dell'ultimo segmento
                const isAtAbsoluteStart = (i === 0 && j === 0);
                const isAtAbsoluteEnd = (i === this.points.length - 2 && j === numSubdivisions - 1);

                // Per l'inizio della suddivisione (tStart)
                // Passiamo true solo se è l'inizio del primo blocco del primo segmento
                const startLine = getCutLine(tStart, isAtAbsoluteStart, false);

                // Per la fine della suddivisione (tEnd)
                // Passiamo true solo se è la fine dell'ultimo blocco dell'ultimo segmento
                const endLine = getCutLine(tEnd, false, isAtAbsoluteEnd);

                units.push({
                    id: `${this.id}_u${units.length}`,
                    vertices: [
                        { ...startLine.L },
                        { ...endLine.L },
                        { ...endLine.R },
                        { ...startLine.R }
                    ]
                });
            }
        }
        return units;
    }

    /**
     * Calcola i punti paralleli (Sinistra/Destra) usando i miter joints
     */
    calculateThicknessPoints() {
        const result = [];
        const halfThickness = this.thickness / 2;

        for (let i = 0; i < this.points.length; i++) {
            const curr = this.points[i];
            const prev = this.points[i - 1];
            const next = this.points[i + 1];

            // Calcolo della normale (direzione dello spessore)
            let normal = this.getMiterNormal(prev, curr, next);

            result.push({
                center: curr,
                left: { x: curr.x + normal.x * halfThickness, y: curr.y + normal.y * halfThickness },
                right: { x: curr.x - normal.x * halfThickness, y: curr.y - normal.y * halfThickness }
            });
        }
        return result;
    }

    getMiterNormal(prev, curr, next) {

        if (!prev) { // Inizio muro
            const dir = this.normalize({ x: next.x - curr.x, y: next.y - curr.y });
            return { x: -dir.y, y: dir.x };
        }
        if (!next) { // Fine muro
            const dir = this.normalize({ x: curr.x - prev.x, y: curr.y - prev.y });
            return { x: -dir.y, y: dir.x };
        }

        // Punto intermedio: calcolo bisettrice per miter joint
        const dir1 = this.normalize({ x: curr.x - prev.x, y: curr.y - prev.y });
        const dir2 = this.normalize({ x: next.x - curr.x, y: next.y - curr.y });
        const tangent = this.normalize({ x: dir1.x + dir2.x, y: dir1.y + dir2.y });
        const miterNormal = { x: -tangent.y, y: tangent.x };

        // Correzione lunghezza miter (per mantenere lo spessore costante negli angoli)
        const dot = miterNormal.x * (-dir1.y) + miterNormal.y * dir1.x;
        const length = Math.min(1 / dot, 2.0); // Cap a 2.0 per evitare angoli infiniti

        return { x: miterNormal.x * length, y: miterNormal.y * length };
    }

    /**
     * Genera le unità (quadrilateri) base senza connessioni
     */
    generateBaseUnits() {
        this.units = [];
        for (let i = 0; i < this.points.length - 1; i++) {
            // Genera il classico rettangolo [L1, R1, R2, L2] per il segmento
            const unit = this._createStandardUnit(i);
            this.units.push(unit);
        }
    }
    /*
    lerpPoint(p1, p2, t) {
        return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
    }
    */
    normalize(v) {
        const l = Math.sqrt(v.x * v.x + v.y * v.y);
        return l < 0.0001 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
    }

    toJSON() {
        return {
            id: this.id,
            points: this.points.map(p => ({ ...p })),
            thickness: this.thickness,
            maxSegmentLength: this.maxSegmentLength
        };
    }
    /**
     * Ripristina un'istanza di Wall da un oggetto JSON
     */
    static fromJSON(json) {
        return new Wall({
            id: json.id,
            // Cloniamo i punti per evitare riferimenti condivisi indesiderati
            points: json.points ? json.points.map(p => ({ ...p })) : [],
            thickness: json.thickness,
            maxSegmentLength: json.maxSegmentLength
        });
    }
}