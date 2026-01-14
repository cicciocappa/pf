// ============================================
// SISTEMA MAPPA E TERRENI
// ============================================

class GameMap {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.tiles = [];
        this.dangerMap = [];  // Heatmap dei pericoli
        this.towers = [];     // Riferimento alle torri per calcolo danger
        
        this.initializeGrid();
    }
    
    initializeGrid() {
        // Inizializza con erba
        for (let row = 0; row < this.height; row++) {
            this.tiles[row] = [];
            this.dangerMap[row] = [];
            for (let col = 0; col < this.width; col++) {
                this.tiles[row][col] = Tile.GRASS;
                this.dangerMap[row][col] = 0;
            }
        }
    }
    
    // Carica una mappa predefinita
    // La mappa può essere di qualsiasi dimensione
    loadLevel(levelData) {
        // Determina le dimensioni dalla mappa
        const newHeight = levelData.length;
        const newWidth = levelData[0] ? levelData[0].length : 0;

        // Ridimensiona la griglia se necessario
        if (newWidth !== this.width || newHeight !== this.height) {
            this.width = newWidth;
            this.height = newHeight;
            this.initializeGrid();
        }

        // Copia i dati della mappa
        for (let row = 0; row < this.height; row++) {
            for (let col = 0; col < this.width; col++) {
                if (levelData[row] && levelData[row][col] !== undefined) {
                    this.tiles[row][col] = levelData[row][col];
                }
            }
        }
    }

    // Verifica se una cella è valida per questa mappa
    isValidCell(col, row) {
        return col >= 0 && col < this.width && row >= 0 && row < this.height;
    }
    
    getTile(col, row) {
        if (!this.isValidCell(col, row)) return Tile.WALL;
        return this.tiles[row][col];
    }

    setTile(col, row, tileType) {
        if (this.isValidCell(col, row)) {
            this.tiles[row][col] = tileType;
        }
    }
    
    getTileProps(col, row) {
        return TileProps[this.getTile(col, row)];
    }
    
    isWalkable(col, row) {
        const props = this.getTileProps(col, row);
        return props && props.walkable;
    }
    
    getMovementCost(col, row) {
        const props = this.getTileProps(col, row);
        return props ? props.cost : Infinity;
    }
    
    getSpeedMultiplier(col, row) {
        const props = this.getTileProps(col, row);
        return props ? props.speedMult : 0;
    }
    
    getDangerLevel(col, row) {
        if (!this.isValidCell(col, row)) return Infinity;
        return this.dangerMap[row][col];
    }
    
    // Aggiorna la mappa dei pericoli basata sulle torri
    updateDangerMap(towers) {
        // Reset danger map
        for (let row = 0; row < this.height; row++) {
            for (let col = 0; col < this.width; col++) {
                this.dangerMap[row][col] = 0;
            }
        }
        
        // Per ogni torre, aggiungi pericolo nelle celle nel suo raggio
        for (const tower of towers) {
            const towerCell = Utils.pixelToGrid(tower.x, tower.y);
            const range = tower.range;
            
            // Calcola il costo pericolo basato su DPS della torre
            const dps = tower.damage * tower.attackSpeed;
            const dangerCost = dps * 5;  // Scala per pathfinding
            
            for (let row = 0; row < this.height; row++) {
                for (let col = 0; col < this.width; col++) {
                    const dist = Utils.gridDistance(
                        { col, row }, 
                        { col: towerCell.col, row: towerCell.row }
                    );
                    
                    if (dist <= range) {
                        // Pericolo diminuisce con la distanza dal centro
                        const falloff = 1 - (dist / (range + 1));
                        this.dangerMap[row][col] += dangerCost * falloff;
                    }
                }
            }
        }
    }
    
    // Costo totale per pathfinding considerando intelligenza
    getTotalCost(col, row, intelligence) {
        const baseCost = this.getMovementCost(col, row);
        if (baseCost === Infinity) return Infinity;
        
        const dangerCost = this.getDangerLevel(col, row);
        // L'intelligenza determina quanto peso dare al pericolo
        return baseCost + (dangerCost * intelligence);
    }
    
    // Rendering della mappa
    render(ctx) {
        for (let row = 0; row < this.height; row++) {
            for (let col = 0; col < this.width; col++) {
                const props = this.getTileProps(col, row);
                const x = col * CONFIG.TILE_SIZE;
                const y = row * CONFIG.TILE_SIZE;
                
                // Colore base del terreno
                ctx.fillStyle = props.color;
                ctx.fillRect(x, y, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                
                // Bordo sottile
                ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                ctx.strokeRect(x, y, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                
                // Visualizza zona pericolo (opzionale, per debug)
                if (this.showDanger && this.dangerMap[row][col] > 0) {
                    const alpha = Math.min(this.dangerMap[row][col] / 200, 0.5);
                    ctx.fillStyle = `rgba(255, 0, 0, ${alpha})`;
                    ctx.fillRect(x, y, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                }
            }
        }
    }
    
    // Toggle visualizzazione pericolo
    toggleDangerView() {
        this.showDanger = !this.showDanger;
    }
}

// ============================================
// LIVELLI PREDEFINITI
// ============================================

const Levels = {
    // Livello tutorial semplice
    tutorial: {
        name: "Tutorial",
        map: [
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,2,2,2,2,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,2,5,5,2,0,0,0,0,2,2,2,2,2,0,0],
            [0,0,0,0,0,2,5,5,2,0,0,0,0,2,5,5,5,2,0,0],
            [0,0,0,0,0,2,5,5,0,0,0,0,0,2,5,7,5,2,0,0],
            [0,0,0,0,0,2,2,2,2,0,0,0,0,2,5,5,5,2,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,0,2,2,0,0],
            [0,0,0,3,3,3,3,3,3,3,0,0,0,0,0,0,0,0,0,0],
            [0,0,0,3,3,3,3,3,3,3,0,0,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,6,6,6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,6,6,6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
        ],
        towers: [
            { type: 'GUARD_TOWER', col: 10, row: 5 },
            { type: 'BALLISTA', col: 12, row: 7 }
        ],
        mageStart: { col: 1, row: 7 },
        treasurePos: { col: 15, row: 5 }
    },
    
    // Livello 1 - Il Corridoio
    corridor: {
        name: "Il Corridoio",
        map: [
            [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
            [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
            [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
            [2,0,0,2,2,2,2,0,0,0,0,0,2,2,2,2,0,0,0,2],
            [2,0,0,2,5,5,2,0,0,0,0,0,2,5,5,2,0,0,0,2],
            [2,0,0,2,5,5,2,0,0,0,0,0,2,5,5,2,0,0,0,2],
            [2,0,0,2,5,5,2,0,0,0,0,0,2,5,5,2,0,0,0,2],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,7,2],
            [2,0,0,2,5,5,2,0,0,0,0,0,2,5,5,2,0,0,0,2],
            [2,0,0,2,5,5,2,0,0,0,0,0,2,5,5,2,0,0,0,2],
            [2,0,0,2,5,5,2,0,0,0,0,0,2,5,5,2,0,0,0,2],
            [2,0,0,2,2,2,2,0,0,0,0,0,2,2,2,2,0,0,0,2],
            [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
            [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
            [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2]
        ],
        towers: [
            { type: 'GUARD_TOWER', col: 5, row: 5 },
            { type: 'GUARD_TOWER', col: 14, row: 5 },
            { type: 'BALLISTA', col: 9, row: 7 },
            { type: 'GUARD_TOWER', col: 5, row: 9 },
            { type: 'GUARD_TOWER', col: 14, row: 9 }
        ],
        mageStart: { col: 0, row: 7 },
        treasurePos: { col: 18, row: 7 }
    },

    // ========================================
    // LIVELLO GRANDE - Test Camera
    // Mappa 40x25 (1600x1000 pixel)
    // Il viewport è 20x15 (800x600 pixel)
    // ========================================
    bigMap: {
        name: "La Grande Fortezza",
        map: [
            // Riga 0-4: Area nord
            [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
            [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
            [2,0,0,0,0,0,0,0,0,0,0,0,0,6,6,6,0,0,0,0,0,0,0,0,6,6,6,0,0,0,0,0,0,0,0,0,0,0,0,2],
            [2,0,0,0,0,0,0,0,0,0,0,0,0,6,6,6,0,0,0,0,0,0,0,0,6,6,6,0,0,0,0,0,0,0,0,0,0,0,0,2],
            [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
            // Riga 5-9: Prima zona torri
            [2,0,0,0,0,2,2,2,2,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,2,2,2,0,0,0,0,0,0,2],
            [2,0,0,0,0,2,5,5,5,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,5,5,5,2,0,0,0,0,0,0,2],
            [2,0,0,0,0,2,5,5,5,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,5,5,5,2,0,0,0,0,0,0,2],
            [2,0,0,0,0,2,2,0,2,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,0,2,2,0,0,0,0,0,0,2],
            [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,3,3,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
            // Riga 10-14: Zona centrale con acqua
            [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,3,3,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
            [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,3,3,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
            [2,0,0,0,0,0,0,0,0,0,0,0,0,2,2,2,2,2,2,2,2,2,2,2,2,2,2,0,0,0,0,0,0,0,0,0,0,0,0,2],
            [2,0,0,0,0,0,0,0,0,0,0,0,0,2,5,5,5,5,5,5,5,5,5,5,5,5,2,0,0,0,0,0,0,0,0,0,0,0,0,2],
            [2,0,0,0,0,0,0,0,0,0,0,0,0,2,5,5,5,5,5,5,5,5,5,5,5,5,2,0,0,0,0,0,0,0,0,0,0,0,0,2],
            // Riga 15-19: Zona centrale fortezza
            [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
            [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
            [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
            [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,2,2,2,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
            [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,5,7,5,5,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
            // Riga 20-24: Area sud
            [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,2,2,2,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
            [2,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,2],
            [2,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,2],
            [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
            [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2]
        ],
        towers: [
            // Torri nell'area nord
            { type: 'GUARD_TOWER', col: 7, row: 7 },
            { type: 'GUARD_TOWER', col: 31, row: 7 },
            // Torri centrali
            { type: 'BALLISTA', col: 20, row: 13 },
            { type: 'BALLISTA', col: 20, row: 15 },
            // Torri che proteggono il tesoro
            { type: 'GUARD_TOWER', col: 17, row: 19 },
            { type: 'GUARD_TOWER', col: 23, row: 19 }
        ],
        mageStart: { col: 2, row: 2 },
        treasurePos: { col: 19, row: 19 }
    }
};
