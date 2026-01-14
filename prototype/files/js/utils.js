// ============================================
// UTILITY FUNCTIONS
// ============================================

const Utils = {
    // Distanza euclidea tra due punti
    distance(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    },
    
    // Distanza tra due entità (pixel)
    entityDistance(a, b) {
        return this.distance(a.x, a.y, b.x, b.y);
    },
    
    // Distanza in celle della griglia
    gridDistance(cell1, cell2) {
        return this.distance(cell1.col, cell1.row, cell2.col, cell2.row);
    },
    
    // Distanza Manhattan (per A*)
    manhattanDistance(x1, y1, x2, y2) {
        return Math.abs(x2 - x1) + Math.abs(y2 - y1);
    },
    
    // Converte coordinate pixel in coordinate griglia
    pixelToGrid(x, y) {
        return {
            col: Math.floor(x / CONFIG.TILE_SIZE),
            row: Math.floor(y / CONFIG.TILE_SIZE)
        };
    },
    
    // Converte coordinate griglia in pixel (centro della cella)
    gridToPixel(col, row) {
        return {
            x: col * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
            y: row * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2
        };
    },
    
    // Verifica se una cella è valida
    isValidCell(col, row) {
        return col >= 0 && col < CONFIG.GRID_WIDTH && 
               row >= 0 && row < CONFIG.GRID_HEIGHT;
    },
    
    // Clamp di un valore
    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    },
    
    // Interpolazione lineare
    lerp(a, b, t) {
        return a + (b - a) * t;
    },
    
    // Angolo tra due punti (in radianti)
    angleBetween(x1, y1, x2, y2) {
        return Math.atan2(y2 - y1, x2 - x1);
    },
    
    // Normalizza un vettore
    normalize(x, y) {
        const len = Math.sqrt(x * x + y * y);
        if (len === 0) return { x: 0, y: 0 };
        return { x: x / len, y: y / len };
    },
    
    // Genera un ID univoco
    generateId() {
        return Math.random().toString(36).substr(2, 9);
    },
    
    // Random tra min e max (inclusi)
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    
    // Random float tra min e max
    randomFloat(min, max) {
        return Math.random() * (max - min) + min;
    },
    
    // Shuffle di un array (Fisher-Yates)
    shuffle(array) {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
};

// Logger per il pannello di gioco
const GameLog = {
    maxEntries: 50,
    
    log(message, className = '') {
        const logContent = document.getElementById('log-content');
        if (!logContent) return;
        
        const entry = document.createElement('p');
        entry.textContent = `[${this.getTime()}] ${message}`;
        if (className) entry.className = className;
        
        logContent.insertBefore(entry, logContent.firstChild);
        
        // Limita le entry
        while (logContent.children.length > this.maxEntries) {
            logContent.removeChild(logContent.lastChild);
        }
    },
    
    damage(message) {
        this.log(message, 'log-damage');
    },
    
    summon(message) {
        this.log(message, 'log-summon');
    },
    
    spell(message) {
        this.log(message, 'log-spell');
    },
    
    death(message) {
        this.log(message, 'log-death');
    },
    
    getTime() {
        const now = new Date();
        return now.toLocaleTimeString('it-IT', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
    },
    
    clear() {
        const logContent = document.getElementById('log-content');
        if (logContent) logContent.innerHTML = '';
    }
};
