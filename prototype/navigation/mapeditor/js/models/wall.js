/**
 * Wall - Rappresenta una polilinea con spessore suddivisa in unità distruttibili
 */
export class Wall {
    constructor(options = {}) {
        this.id = options.id;
        this.points = options.points || []; // Vertici della linea centrale {x, y}
        this.thickness = options.thickness || 10;
        this.maxSegmentLength = options.maxSegmentLength || 30;
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
    
    // Calcoliamo i punti Miter per ogni vertice (giunzioni)
    const miterPoints = this.calculateThicknessPoints();

    for (let i = 0; i < this.points.length - 1; i++) {
        const p1 = this.points[i];
        const p2 = this.points[i + 1];

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        if (length < 0.1) continue;

        const dir = { x: dx / length, y: dy / length };
        const normal = { x: -dir.y, y: dir.x };
        const numSubdivisions = Math.ceil(length / this.maxSegmentLength);

        // Helper per ottenere la linea di taglio a una data distanza t [0, 1]
        const getCutLine = (t, isStartSegment, isEndSegment) => {
            // Se siamo all'inizio esatto del segmento (t=0)
            if (t <= 0) {
                return { L: miterPoints[i].left, R: miterPoints[i].right };
            }
            // Se siamo alla fine esatta del segmento (t=1)
            if (t >= 1) {
                return { L: miterPoints[i + 1].left, R: miterPoints[i + 1].right };
            }
            
            // Per i tagli interni: linea perpendicolare perfetta
            const centerPos = { x: p1.x + dx * t, y: p1.y + dy * t };
            return {
                L: { x: centerPos.x + normal.x * halfThickness, y: centerPos.y + normal.y * halfThickness },
                R: { x: centerPos.x - normal.x * halfThickness, y: centerPos.y - normal.y * halfThickness }
            };
        };

        for (let j = 0; j < numSubdivisions; j++) {
            const tStart = j / numSubdivisions;
            const tEnd = (j + 1) / numSubdivisions;

            const startLine = getCutLine(tStart, j === 0, false);
            const endLine = getCutLine(tEnd, false, j === numSubdivisions - 1);

            units.push({
                id: `${this.id}_u${units.length}`,
                // Ordine vertici: TopLeft, TopRight, BottomRight, BottomLeft
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

    lerpPoint(p1, p2, t) {
        return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
    }

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
}