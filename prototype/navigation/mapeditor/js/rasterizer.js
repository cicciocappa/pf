import { Geometry } from "./geometry.js";

export class Rasterizer {
    constructor(editor, cellSize = 10) {
        this.editor = editor;
        this.cellSize = cellSize;
        this.grid = null;
        this.cols = 0;
        this.rows = 0;
    }

    /**
     * Trasforma la mappa in una griglia di occupazione
     */
    rasterize(agentRadius = 15) {

        const bounds = this.editor.mapData.getBounds(); // Deve restituire minX, minY, maxX, maxY
        this.cols = Math.ceil((bounds.maxX - bounds.minX) / this.cellSize);
        this.rows = Math.ceil((bounds.maxY - bounds.minY) / this.cellSize);
        this.grid = new Uint8Array(this.cols * this.rows).fill(1); // Default: walkable

        // 1. Uniamo tutti gli ostacoli e applichiamo l'offset (Agent Radius)
        // Usiamo Clipper per avere un unico "super-poligono" di collisione
        const collisionPolys = this.editor.geometry.unionPolygons(this._getAllObstacles());
        const inflatedObstacles = this.editor.geometry.offsetHoles(collisionPolys, agentRadius);

        // 2. Riempiamo la griglia
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const worldX = bounds.minX + x * this.cellSize + this.cellSize / 2;
                const worldY = bounds.minY + y * this.cellSize + this.cellSize / 2;

                // Se il centro della cella è dentro un ostacolo o FUORI dal perimetro esterno
                if (this._isPointBlocked(worldX, worldY, inflatedObstacles)) {
                    this.grid[y * this.cols + x] = 0;
                }
            }
        }

        return { grid: this.grid, cols: this.cols, rows: this.rows };
    }

    _isPointBlocked(x, y, obstacles) {
        // Fuori dal perimetro principale?
        if (!Geometry.isPointInPolygon(x, y, this.editor.mapData.outerPoly)) return true;

        // Dentro un ostacolo gonfiato?
        for (const poly of obstacles) {
            if (Geometry.isPointInPolygon(x, y, poly)) return true;
        }
        return false;
    }

    _getAllObstacles() {
        const obs = [];
        this.editor.mapData.buildings.forEach(b => obs.push(b.getVertices()));
        this.editor.mapData.obstacles.forEach(o => obs.push(o.getVertices()));
        this.editor.mapData.walls.forEach(w => w.units.forEach(u => obs.push(u.vertices)));
        return obs;
    }
    extractContours() {
        const contours = [];
        // Usiamo un set per tracciare i bordi già visitati (evita duplicati)
        const visitedEdges = new Set();

        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const idx = y * this.cols + x;

                // Cerchiamo una cella calpestabile (1) che abbia una cella vuota (0) a sinistra
                if (this.grid[idx] === 1) {
                    const edgeKey = `${x},${y},L`; // Edge sinistro della cella
                    if (!visitedEdges.has(edgeKey) && (x === 0 || this.grid[idx - 1] === 0)) {
                        const contour = this._traceContour(x, y, visitedEdges);
                        if (contour && contour.length > 2) {
                            contours.push(contour);
                        }
                    }
                }
            }
        }
        return contours;
    }

    _traceContour(startX, startY, visitedEdges) {
        const bounds = this.editor.mapData.getBounds(); // Deve restituire minX, minY, maxX, maxY<
        const contour = [];
        let currX = startX;
        let currY = startY;

        // Direzioni: [dx, dy] in senso orario partendo da Nord
        const dirs = [
            { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
            { dx: 0, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 }
        ];

        // Punto da cui siamo "entrati" nella cella corrente
        let backtrackDir = 6; // Partiamo assumendo di essere arrivati da Ovest (sinistra)

        let firstX = -1;
        let firstY = -1;

        // Loop di tracciamento
        while (!(currX === firstX && currY === firstY)) {
            if (firstX === -1) { firstX = currX; firstY = currY; }

            // Aggiungiamo il punto trasformato in coordinate mondo
            contour.push({
                x: bounds.minX + currX * this.cellSize,
                y: bounds.minY + currY * this.cellSize
            });

            let foundNext = false;
            // Ruotiamo attorno alla cella corrente per trovare la prossima cella calpestabile
            for (let i = 0; i < 8; i++) {
                const checkDir = (backtrackDir + i) % 8;
                const nextX = currX + dirs[checkDir].dx;
                const nextY = currY + dirs[checkDir].dy;

                if (this._isWalkable(nextX, nextY)) {
                    // Trovata la prossima cella del bordo!
                    currX = nextX;
                    currY = nextY;

                    // Tracciamo l'edge visitato per evitare di ricominciare da qui
                    visitedEdges.add(`${currX},${currY},L`);

                    // Aggiorniamo il backtrack: la prossima ricerca partirà dalla direzione opposta
                    // (es. se ci siamo mossi a Est, torneremo a guardare da Ovest)
                    backtrackDir = (checkDir + 5) % 8;
                    foundNext = true;
                    break;
                }
            }

            if (!foundNext) break; // Cella isolata
            if (contour.length > 5000) break; // Safety break per loop infiniti
        }

        return contour;
    }

    _isWalkable(x, y) {
        if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return false;
        return this.grid[y * this.cols + x] === 1;
    }
}