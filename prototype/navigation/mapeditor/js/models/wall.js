import { Geometry } from "../geometry.js";
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
        this.label = options.label || '';

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

    containsPoint(x, y) {
    // Il muro contiene il punto se lo contiene almeno una delle sue unità
    for (const unit of this.units) {
        if (Geometry.isPointInPolygon(x, y, unit.vertices)) {
            return true;
        }
    }
    return false;
}

    generateDestructibleUnits() {
    const units = [];
    const halfThickness = this.thickness / 2;
    const miterPoints = this.calculateThicknessPoints();

    for (let i = 0; i < this.points.length - 1; i++) {
        const p1 = this.points[i];
        const p2 = this.points[i + 1];

        // 1. DETERMINIAMO I PUNTI "EFFETTIVI" DI INIZIO E FINE DEL SEGMENTO
        // Se c'è un override, il punto effettivo è il centro dell'override, altrimenti è il punto della polilinea
        const p1Eff = (i === 0 && this.startCapOverride) ? 
            { 
                x: (this.startCapOverride.left.x + this.startCapOverride.right.x) / 2, 
                y: (this.startCapOverride.left.y + this.startCapOverride.right.y) / 2 
            } : p1;

        const p2Eff = (i === this.points.length - 2 && this.endCapOverride) ? 
            { 
                x: (this.endCapOverride.left.x + this.endCapOverride.right.x) / 2, 
                y: (this.endCapOverride.left.y + this.endCapOverride.right.y) / 2 
            } : p2;

        // 2. CALCOLIAMO LUNGHEZZA E DIREZIONE SULLA PARTE VISIBILE
        const dxEff = p2Eff.x - p1Eff.x;
        const dyEff = p2Eff.y - p1Eff.y;
        const lengthEff = Math.sqrt(dxEff * dxEff + dyEff * dyEff);
        
        if (lengthEff < 0.1) continue;

        // La normale rimane quella del segmento originale per coerenza geometrica
        const segmentDx = p2.x - p1.x;
        const segmentDy = p2.y - p1.y;
        const segmentLen = Math.sqrt(segmentDx * segmentDx + segmentDy * segmentDy);
        const normal = { x: -segmentDy / segmentLen, y: segmentDx / segmentLen };

        // 3. SUDDIVISIONE BASATA SULLA LUNGHEZZA EFFETTIVA
        const numSubdivisions = Math.ceil(lengthEff / this.maxSegmentLength);

        const getCutLine = (t, isWallStart, isWallEnd) => {
            if (t <= 0 && isWallStart && this.startCapOverride) {
                return { L: this.startCapOverride.left, R: this.startCapOverride.right };
            }
            if (t >= 1 && isWallEnd && this.endCapOverride) {
                return { L: this.endCapOverride.left, R: this.endCapOverride.right };
            }

            // Se siamo all'inizio/fine del segmento backbone (ma non del muro intero)
            // usiamo i miterPoints precalcolati per mantenere i giunti puliti
            if (t <= 0) return { L: miterPoints[i].left, R: miterPoints[i].right };
            if (t >= 1) return { L: miterPoints[i + 1].left, R: miterPoints[i + 1].right };

            // INTERPOLAZIONE SUI PUNTI EFFETTIVI
            // Questo garantisce che le unità siano distribuite uniformemente tra l'override e la fine del segmento
            const centerPos = { 
                x: p1Eff.x + dxEff * t, 
                y: p1Eff.y + dyEff * t 
            };

            return {
                L: { x: centerPos.x + normal.x * halfThickness, y: centerPos.y + normal.y * halfThickness },
                R: { x: centerPos.x - normal.x * halfThickness, y: centerPos.y - normal.y * halfThickness }
            };
        };

        for (let j = 0; j < numSubdivisions; j++) {
            const tStart = j / numSubdivisions;
            const tEnd = (j + 1) / numSubdivisions;

            const isAtAbsoluteStart = (i === 0 && j === 0);
            const isAtAbsoluteEnd = (i === this.points.length - 2 && j === numSubdivisions - 1);

            const startLine = getCutLine(tStart, isAtAbsoluteStart, false);
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

    /**
     * Restituisce il contorno esterno della mura come singolo poligono.
     * Ignora le suddivisioni interne (units) e restituisce solo la forma generale.
     */
    getOutline() {
        if (this.points.length < 2) return [];

        const thicknessPoints = this.calculateThicknessPoints();

        // Costruiamo il contorno: lato sinistro in avanti, lato destro all'indietro
        const outline = [];

        // Aggiungi tutti i punti "left" (con eventuale override per start/end)
        for (let i = 0; i < thicknessPoints.length; i++) {
            if (i === 0 && this.startCapOverride) {
                outline.push({ x: this.startCapOverride.left.x, y: this.startCapOverride.left.y });
            } else if (i === thicknessPoints.length - 1 && this.endCapOverride) {
                outline.push({ x: this.endCapOverride.left.x, y: this.endCapOverride.left.y });
            } else {
                outline.push({ x: thicknessPoints[i].left.x, y: thicknessPoints[i].left.y });
            }
        }

        // Aggiungi tutti i punti "right" in ordine inverso
        for (let i = thicknessPoints.length - 1; i >= 0; i--) {
            if (i === thicknessPoints.length - 1 && this.endCapOverride) {
                outline.push({ x: this.endCapOverride.right.x, y: this.endCapOverride.right.y });
            } else if (i === 0 && this.startCapOverride) {
                outline.push({ x: this.startCapOverride.right.x, y: this.startCapOverride.right.y });
            } else {
                outline.push({ x: thicknessPoints[i].right.x, y: thicknessPoints[i].right.y });
            }
        }
        console.log(outline);
        return outline;
    }

    /**
     * Restituisce il contorno esterno con i vertici di ogni suddivisione (unit).
     * Utile per la triangolazione navmesh quando si vogliono punti Steiner.
     */
    getOutlineDetailed() {
        if (this.units.length === 0) return this.getOutline();

        const outline = [];

        // Lato sinistro: vertice 0 di ogni unit, poi vertice 1 dell'ultima
        for (let i = 0; i < this.units.length; i++) {
            outline.push({ x: this.units[i].vertices[0].x, y: this.units[i].vertices[0].y });
        }
        const lastUnit = this.units[this.units.length - 1];
        outline.push({ x: lastUnit.vertices[1].x, y: lastUnit.vertices[1].y });

        // Lato destro in ordine inverso: vertice 2 dell'ultima, poi vertice 3 di ogni unit
        outline.push({ x: lastUnit.vertices[2].x, y: lastUnit.vertices[2].y });
        for (let i = this.units.length - 1; i >= 0; i--) {
            outline.push({ x: this.units[i].vertices[3].x, y: this.units[i].vertices[3].y });
        }

        return outline;
    }

    toJSON() {
        return {
            id: this.id,
            label: this.label,
            points: this.points.map(p => ({ ...p })),
            thickness: this.thickness,
            maxSegmentLength: this.maxSegmentLength
        };
    }
    /**
     * Ripristina un'istanza di Wall da un oggetto JSON
     */
    static fromJSON(json) {
        const points = (json.points || []).map(p => ({
            id: p.id,
            edgeId: p.edgeId,
            x: p.x,
            y: p.y
        }));
        return new Wall({
            id: json.id,
            label: json.label,
            points: points,
            thickness: json.thickness,
            maxSegmentLength: json.maxSegmentLength
        });
    }
}