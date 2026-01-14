// ============================================
// PATHFINDING A* CON SUPPORTO INTELLIGENZA
// ============================================

class Pathfinder {
    constructor(gameMap) {
        this.map = gameMap;
    }
    
    // Trova il percorso usando A*
    findPath(startCol, startRow, endCol, endRow, intelligence = 0) {
        // Verifica validità
        if (!this.map.isWalkable(startCol, startRow) || 
            !this.map.isWalkable(endCol, endRow)) {
            return null;
        }
        
        const openSet = new PriorityQueue();
        const closedSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();
        
        const startKey = `${startCol},${startRow}`;
        const endKey = `${endCol},${endRow}`;
        
        gScore.set(startKey, 0);
        fScore.set(startKey, this.heuristic(startCol, startRow, endCol, endRow));
        openSet.enqueue({ col: startCol, row: startRow }, fScore.get(startKey));
        
        while (!openSet.isEmpty()) {
            const current = openSet.dequeue();
            const currentKey = `${current.col},${current.row}`;
            
            // Obiettivo raggiunto
            if (current.col === endCol && current.row === endRow) {
                return this.reconstructPath(cameFrom, current);
            }
            
            closedSet.add(currentKey);
            
            // Esplora i vicini (8 direzioni)
            const neighbors = this.getNeighbors(current.col, current.row);
            
            for (const neighbor of neighbors) {
                const neighborKey = `${neighbor.col},${neighbor.row}`;
                
                if (closedSet.has(neighborKey)) continue;
                if (!this.map.isWalkable(neighbor.col, neighbor.row)) continue;
                
                // Costo movimento considerando terreno e pericolo (basato su intelligenza)
                const moveCost = this.map.getTotalCost(
                    neighbor.col, 
                    neighbor.row, 
                    intelligence
                );
                
                // Costo diagonale leggermente maggiore
                const diagonalMult = (neighbor.col !== current.col && neighbor.row !== current.row) ? 1.414 : 1;
                
                const tentativeG = gScore.get(currentKey) + moveCost * diagonalMult;
                
                if (!gScore.has(neighborKey) || tentativeG < gScore.get(neighborKey)) {
                    cameFrom.set(neighborKey, current);
                    gScore.set(neighborKey, tentativeG);
                    fScore.set(neighborKey, tentativeG + this.heuristic(
                        neighbor.col, neighbor.row, endCol, endRow
                    ));
                    
                    if (!openSet.contains(neighborKey)) {
                        openSet.enqueue(neighbor, fScore.get(neighborKey));
                    }
                }
            }
        }
        
        // Nessun percorso trovato
        return null;
    }
    
    // Euristica (distanza euclidea * costo minimo)
    heuristic(x1, y1, x2, y2) {
        return Utils.distance(x1, y1, x2, y2) * 10; // 10 è il costo minimo (erba)
    }
    
    // Ottieni celle vicine
    getNeighbors(col, row) {
        const neighbors = [];
        const directions = [
            { dc: -1, dr: -1 }, { dc: 0, dr: -1 }, { dc: 1, dr: -1 },
            { dc: -1, dr: 0  },                    { dc: 1, dr: 0  },
            { dc: -1, dr: 1  }, { dc: 0, dr: 1  }, { dc: 1, dr: 1  }
        ];
        
        for (const dir of directions) {
            const newCol = col + dir.dc;
            const newRow = row + dir.dr;
            
            if (Utils.isValidCell(newCol, newRow)) {
                // Per movimenti diagonali, verifica che le celle adiacenti siano percorribili
                if (dir.dc !== 0 && dir.dr !== 0) {
                    if (!this.map.isWalkable(col + dir.dc, row) || 
                        !this.map.isWalkable(col, row + dir.dr)) {
                        continue; // Non permettere movimento diagonale attraverso angoli
                    }
                }
                neighbors.push({ col: newCol, row: newRow });
            }
        }
        
        return neighbors;
    }
    
    // Ricostruisci il percorso
    reconstructPath(cameFrom, current) {
        const path = [current];
        let currentKey = `${current.col},${current.row}`;
        
        while (cameFrom.has(currentKey)) {
            const prev = cameFrom.get(currentKey);
            path.unshift(prev);
            currentKey = `${prev.col},${prev.row}`;
        }
        
        return path;
    }
    
    // Converti percorso in coordinate pixel (centri celle)
    pathToPixels(path) {
        if (!path) return null;
        return path.map(cell => Utils.gridToPixel(cell.col, cell.row));
    }
}

// ============================================
// PRIORITY QUEUE per A*
// ============================================

class PriorityQueue {
    constructor() {
        this.items = [];
        this.keys = new Set();
    }
    
    enqueue(element, priority) {
        const key = `${element.col},${element.row}`;
        this.keys.add(key);
        
        const item = { element, priority };
        let added = false;
        
        for (let i = 0; i < this.items.length; i++) {
            if (item.priority < this.items[i].priority) {
                this.items.splice(i, 0, item);
                added = true;
                break;
            }
        }
        
        if (!added) {
            this.items.push(item);
        }
    }
    
    dequeue() {
        if (this.isEmpty()) return null;
        const item = this.items.shift();
        const key = `${item.element.col},${item.element.row}`;
        this.keys.delete(key);
        return item.element;
    }
    
    contains(key) {
        return this.keys.has(key);
    }
    
    isEmpty() {
        return this.items.length === 0;
    }
}
