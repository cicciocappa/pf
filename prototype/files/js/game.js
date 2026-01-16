// ============================================
// GAME - Logica principale
// ============================================

class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Dimensioni viewport (fisse, indipendenti dalla mappa)
        this.viewportWidth = CONFIG.VIEWPORT_WIDTH || CONFIG.GRID_WIDTH * CONFIG.TILE_SIZE;
        this.viewportHeight = CONFIG.VIEWPORT_HEIGHT || CONFIG.GRID_HEIGHT * CONFIG.TILE_SIZE;
        this.resize();

        // Camera
        this.camera = new Camera(this.viewportWidth, this.viewportHeight);

        // Sistemi
        this.map = new GameMap(CONFIG.GRID_WIDTH, CONFIG.GRID_HEIGHT);
        this.pathfinder = new Pathfinder(this.map);
        this.spellSystem = new SpellSystem();
        
        // Entità
        this.mage = null;
        this.creatures = [];
        this.structures = [];  // Array unificato di strutture difensive (torri e mura)

        // Stato gioco
        this.state = 'playing';  // playing, won, lost
        this.selectedSpell = null;
        this.showTowerRanges = false;

        // Coordinate mouse (schermo e mondo)
        this.mouseX = 0;      // Coordinate schermo (canvas)
        this.mouseY = 0;
        this.worldMouseX = 0; // Coordinate mondo (con offset camera)
        this.worldMouseY = 0;
        
        // ========================================
        // STATO SELEZIONE CREATURE
        // Creatura attualmente selezionata dal giocatore
        // ========================================
        this.selectedCreature = null;
        
        // ========================================
        // STATO EVOCAZIONE
        // Per visualizzare la freccia direzionale durante il drag
        // ========================================
        this.summonAimStart = null;
        this.summonAimEnd = null;

        // ========================================
        // MINIMAPPA INTERATTIVA
        // ========================================
        this.minimapBounds = null;  // Sarà impostato in renderMinimap

        // Timing
        this.lastTime = 0;
        this.accumulator = 0;
        this.fixedDt = 1 / 60;
    }
    
    resize() {
        // Il canvas è sempre la dimensione del viewport
        this.canvas.width = this.viewportWidth;
        this.canvas.height = this.viewportHeight;
    }

    // ========================================
    // GETTER per retrocompatibilità
    // Filtrano l'array unificato structures
    // ========================================
    get towers() {
        return this.structures.filter(s => !s.isWall);
    }

    get walls() {
        return this.structures.filter(s => s.isWall);
    }

    // Carica un livello
    loadLevel(levelData) {
        // Reset
        this.creatures = [];
        this.structures = [];
        this.state = 'playing';
        this.selectedSpell = null;
        this.selectedCreature = null;
        this.summonAimStart = null;
        this.summonAimEnd = null;
        GameLog.clear();

        // Carica mappa (potrebbe ridimensionare la griglia)
        this.map.loadLevel(levelData.map);

        // Crea strutture Wall per ogni tile WALL
        for (let row = 0; row < this.map.height; row++) {
            for (let col = 0; col < this.map.width; col++) {
                if (this.map.getTile(col, row) === Tile.WALL) {
                    const wall = createWall(col, row);
                    this.structures.push(wall);
                }
            }
        }

        // Aggiorna pathfinder con la nuova mappa
        this.pathfinder = new Pathfinder(this.map);

        // Imposta i bounds del mondo per la camera
        const worldWidth = this.map.width * CONFIG.TILE_SIZE;
        const worldHeight = this.map.height * CONFIG.TILE_SIZE;
        this.camera.setWorldBounds(worldWidth, worldHeight);

        // Crea torri
        for (const towerDef of levelData.towers) {
            const tower = createTower(towerDef.type, towerDef.col, towerDef.row);
            this.structures.push(tower);
        }

        // Crea muri presidiati (sostituiscono i muri normali in quelle posizioni)
        if (levelData.garrisonedWalls) {
            for (const gwDef of levelData.garrisonedWalls) {
                // Trova e rimuovi il muro normale in questa posizione
                const idx = this.structures.findIndex(s =>
                    s.isWall && s.col === gwDef.col && s.row === gwDef.row
                );
                if (idx !== -1) {
                    this.structures.splice(idx, 1);
                }
                // Crea il muro presidiato
                const gw = createGarrisonedWall(gwDef.col, gwDef.row);
                this.structures.push(gw);
            }
        }

        // Aggiorna danger map (torri e muri presidiati che possono attaccare)
        this.map.updateDangerMap(this.structures.filter(s => s.canAttack()));

        // Crea mago
        const magePos = Utils.gridToPixel(levelData.mageStart.col, levelData.mageStart.row);
        this.mage = new Mage(magePos.x, magePos.y);

        // Imposta la camera per seguire il mago
        this.camera.setTarget(this.mage);

        // Log
        GameLog.log(`Livello "${levelData.name}" caricato`);
        GameLog.log(`Obiettivo: raggiungi il tesoro!`);

        this.updateUI();
    }
    
    // Game loop
    start() {
        this.lastTime = performance.now();
        requestAnimationFrame((time) => this.loop(time));
    }
    
    loop(currentTime) {
        const dt = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;
        
        // Fixed timestep per fisica/logica
        this.accumulator += dt;
        while (this.accumulator >= this.fixedDt) {
            this.update(this.fixedDt);
            this.accumulator -= this.fixedDt;
        }
        
        // Render
        this.render();
        
        // Continua loop
        requestAnimationFrame((time) => this.loop(time));
    }
    
    // Update logica
    update(dt) {
        if (this.state !== 'playing') return;
        
        // Update mago
        if (this.mage && this.mage.isAlive()) {
            this.mage.update(dt, this.map);
            
            // Verifica vittoria (mago sul tesoro)
            const mageCell = this.mage.getCell();
            if (this.map.getTile(mageCell.col, mageCell.row) === Tile.TREASURE) {
                this.win();
            }
        } else if (this.mage && !this.mage.isAlive()) {
            this.lose();
        }
        
        // Update creature
        for (let i = this.creatures.length - 1; i >= 0; i--) {
            const creature = this.creatures[i];
            
            if (creature.isAlive()) {
                // Passa le torri e le mura alla creatura per la logica di ricerca bersagli
                creature.update(dt, this.map, this.towers, this.pathfinder, this.walls);
                
                // Aggiorna stato selezione
                creature.isSelected = (creature === this.selectedCreature);
            } else {
                // Rimuovi creatura morta
                // Se era selezionata, deselezionala
                if (creature === this.selectedCreature) {
                    this.selectedCreature = null;
                }
                this.creatures.splice(i, 1);
            }
        }
        
        // Ottieni tutti i nemici per le strutture difensive
        const allEnemies = this.mage ? [this.mage, ...this.creatures] : [...this.creatures];
        const aliveEnemies = allEnemies.filter(e => e.isAlive());

        // Update strutture (torri e mura unificate)
        let needDangerMapUpdate = false;
        let needPathfinderUpdate = false;

        for (let i = this.structures.length - 1; i >= 0; i--) {
            const structure = this.structures[i];

            if (structure.isAlive()) {
                // Aggiorna la struttura (attacco ranged e melee se applicabile)
                structure.update(dt, aliveEnemies);
            } else {
                // Struttura distrutta
                if (structure.isWall) {
                    // Muro distrutto - cambia il tile a DIRT
                    this.map.setTile(structure.col, structure.row, Tile.DIRT);
                    needPathfinderUpdate = true;
                    // Se era un muro presidiato, aggiorna anche danger map
                    if (structure.canAttack()) {
                        needDangerMapUpdate = true;
                    }
                } else {
                    // Torre distrutta - aggiorna danger map
                    needDangerMapUpdate = true;
                }
                this.structures.splice(i, 1);
            }
        }

        // Aggiorna danger map se necessario (strutture che possono attaccare)
        if (needDangerMapUpdate) {
            this.map.updateDangerMap(this.structures.filter(s => s.canAttack()));
        }

        // Aggiorna pathfinder se necessario
        if (needPathfinderUpdate) {
            this.pathfinder = new Pathfinder(this.map);
        }

        // Update sistema incantesimi
        this.spellSystem.update(dt);

        // Edge scrolling (gestito dall'input handler)
        if (typeof inputHandler !== 'undefined' && inputHandler) {
            inputHandler.applyEdgeScrolling(dt);
        }

        // Update camera (solo se spazio premuto per snap)
        if (typeof inputHandler !== 'undefined' && inputHandler && inputHandler.spacePressed) {
            this.camera.update(dt);
        }

        // Update UI
        this.updateUI();
    }
    
    // Render
    render() {
        // Clear (usa dimensioni viewport, non mondo)
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // ========================================
        // INIZIO RENDERING CON CAMERA
        // Tutto ciò che appartiene al mondo viene disegnato con la trasformazione attiva
        // ========================================
        this.camera.apply(this.ctx);

        // Mappa
        this.map.render(this.ctx);

        // Evidenzia cella sotto il cursore (usa coordinate mondo)
        this.renderHoveredCell();

        // ========================================
        // RENDER GHOST PREVIEW (evocazione/spell)
        // ========================================
        if (inputHandler && this.mage) {
            // Evocazione in preparazione
            if (inputHandler.preparationType === 'SUMMON') {
                this.renderSummonRange();
                this.renderSummonGhost();
            }
            // Spell in preparazione
            else if (inputHandler.preparationType === 'SPELL') {
                this.renderSpellGhost();
            }
        }

        // ========================================
        // RENDER FRECCIA DIREZIONALE EVOCAZIONE
        // Mostra la direzione durante il drag
        // ========================================
        if (this.summonAimStart && this.summonAimEnd) {
            this.renderSummonDirection();
        }

        // Strutture difensive (muri prima, poi torri per layering corretto)
        for (const structure of this.structures) {
            if (structure.isAlive() && structure.isWall) {
                structure.render(this.ctx, this.showTowerRanges);
            }
        }
        for (const structure of this.structures) {
            if (structure.isAlive() && !structure.isWall) {
                structure.render(this.ctx, this.showTowerRanges);
            }
        }

        // Creature
        for (const creature of this.creatures) {
            if (creature.isAlive()) {
                creature.render(this.ctx);
                // Debug: mostra path
                // creature.renderPath(this.ctx);
            }
        }

        // Mago
        if (this.mage && this.mage.isAlive()) {
            this.mage.render(this.ctx);
            this.mage.renderPath(this.ctx);
        }

        // Effetti incantesimi
        this.spellSystem.render(this.ctx);

        // ========================================
        // FINE RENDERING CON CAMERA
        // ========================================
        this.camera.restore(this.ctx);

        // ========================================
        // UI FISSE (non influenzate dalla camera)
        // ========================================

        // Messaggio stato gioco
        if (this.state === 'won') {
            this.renderMessage('VITTORIA!', '#2ecc71');
        } else if (this.state === 'lost') {
            this.renderMessage('SCONFITTA', '#e74c3c');
        }

        // Mini-mappa (opzionale, per mappe grandi)
        if (this.map.width > CONFIG.GRID_WIDTH || this.map.height > CONFIG.GRID_HEIGHT) {
            this.renderMinimap();
        }

        // Pannello debug creatura selezionata
        if (this.selectedCreature && this.selectedCreature.isAlive()) {
            this.renderCreatureDebugPanel(this.selectedCreature);
        }
    }
    
    renderMessage(text, color) {
        this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.fillStyle = color;
        this.ctx.font = 'bold 48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, this.canvas.width / 2, this.canvas.height / 2);
        
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '20px Arial';
        this.ctx.fillText('Premi R per ricominciare', this.canvas.width / 2, this.canvas.height / 2 + 50);
    }
    
    renderHoveredCell() {
        // Calcola la cella sotto il mouse (usa coordinate mondo)
        const cell = Utils.pixelToGrid(this.worldMouseX, this.worldMouseY);

        if (!this.map.isValidCell(cell.col, cell.row)) return;
        
        const x = cell.col * CONFIG.TILE_SIZE;
        const y = cell.row * CONFIG.TILE_SIZE;
        
        // Colore diverso se walkable o no
        const isWalkable = this.map.isWalkable(cell.col, cell.row);
        
        if (isWalkable) {
            // Verde chiaro per celle percorribili
            this.ctx.strokeStyle = '#00ff00';
            this.ctx.fillStyle = 'rgba(0, 255, 0, 0.15)';
        } else {
            // Rosso per celle non percorribili
            this.ctx.strokeStyle = '#ff0000';
            this.ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
        }
        
        // Disegna il rettangolo evidenziato
        this.ctx.fillRect(x, y, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x + 1, y + 1, CONFIG.TILE_SIZE - 2, CONFIG.TILE_SIZE - 2);
    }
    
    // ========================================
    // RENDER RAGGIO DI EVOCAZIONE
    // Cerchio attorno al mago che mostra dove si può evocare
    // ========================================
    renderSummonRange() {
        const rangePixels = CONFIG.SUMMON_RANGE * CONFIG.TILE_SIZE;
        
        // Cerchio del raggio
        this.ctx.beginPath();
        this.ctx.arc(this.mage.x, this.mage.y, rangePixels, 0, Math.PI * 2);
        this.ctx.strokeStyle = '#00ff88';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([10, 5]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        // Riempimento semi-trasparente
        this.ctx.fillStyle = 'rgba(0, 255, 136, 0.1)';
        this.ctx.fill();
        
    }

    // ========================================
    // RENDER SUMMON GHOST
    // Mostra un'anteprima della creatura al cursore
    // ========================================
    renderSummonGhost() {
        const summonType = inputHandler.preparedAction;
        const stats = CreatureTypes[summonType];
        if (!stats) return;

        const rangePixels = CONFIG.SUMMON_RANGE * CONFIG.TILE_SIZE;
        const distFromMage = Utils.distance(this.mage.x, this.mage.y, this.worldMouseX, this.worldMouseY);
        const isInRange = distFromMage <= rangePixels;

        // Ghost della creatura
        this.ctx.beginPath();
        this.ctx.arc(this.worldMouseX, this.worldMouseY, stats.radius || 10, 0, Math.PI * 2);

        if (isInRange) {
            // Valido: cerchio verde semi-trasparente
            this.ctx.fillStyle = 'rgba(0, 255, 136, 0.4)';
            this.ctx.strokeStyle = '#00ff88';
        } else {
            // Non valido: X rossa
            this.ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
            this.ctx.strokeStyle = '#ff0000';
        }

        this.ctx.fill();
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Se non valido, mostra X
        if (!isInRange) {
            this.ctx.strokeStyle = '#ff0000';
            this.ctx.lineWidth = 3;
            const size = 12;
            this.ctx.beginPath();
            this.ctx.moveTo(this.worldMouseX - size, this.worldMouseY - size);
            this.ctx.lineTo(this.worldMouseX + size, this.worldMouseY + size);
            this.ctx.moveTo(this.worldMouseX + size, this.worldMouseY - size);
            this.ctx.lineTo(this.worldMouseX - size, this.worldMouseY + size);
            this.ctx.stroke();
        }

        // Nome creatura
        this.ctx.fillStyle = isInRange ? '#00ff88' : '#ff6666';
        this.ctx.font = 'bold 10px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'bottom';
        this.ctx.fillText(stats.name, this.worldMouseX, this.worldMouseY - (stats.radius || 10) - 5);
    }

    // ========================================
    // RENDER SPELL GHOST
    // Mostra anteprima dello spell al cursore
    // ========================================
    renderSpellGhost() {
        const spellType = inputHandler.preparedAction;
        const spell = SpellTypes[spellType];
        if (!spell) return;

        const rangePixels = spell.castRange * CONFIG.TILE_SIZE;
        const distFromMage = Utils.distance(this.mage.x, this.mage.y, this.worldMouseX, this.worldMouseY);
        const isInRange = rangePixels === 0 || distFromMage <= rangePixels;

        // Disegna range dello spell
        if (rangePixels > 0) {
            this.ctx.beginPath();
            this.ctx.arc(this.mage.x, this.mage.y, rangePixels, 0, Math.PI * 2);
            this.ctx.strokeStyle = isInRange ? 'rgba(255, 100, 0, 0.5)' : 'rgba(255, 0, 0, 0.3)';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([8, 4]);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        // Area effetto dello spell
        if (spell.radius) {
            const effectRadius = spell.radius * CONFIG.TILE_SIZE;
            this.ctx.beginPath();
            this.ctx.arc(this.worldMouseX, this.worldMouseY, effectRadius, 0, Math.PI * 2);

            if (isInRange) {
                this.ctx.fillStyle = `rgba(255, 100, 0, 0.3)`;
                this.ctx.strokeStyle = spell.color || '#ff6400';
            } else {
                this.ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
                this.ctx.strokeStyle = '#ff0000';
            }

            this.ctx.fill();
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }

        // Se non valido, mostra X
        if (!isInRange) {
            this.ctx.strokeStyle = '#ff0000';
            this.ctx.lineWidth = 3;
            const size = 15;
            this.ctx.beginPath();
            this.ctx.moveTo(this.worldMouseX - size, this.worldMouseY - size);
            this.ctx.lineTo(this.worldMouseX + size, this.worldMouseY + size);
            this.ctx.moveTo(this.worldMouseX + size, this.worldMouseY - size);
            this.ctx.lineTo(this.worldMouseX - size, this.worldMouseY + size);
            this.ctx.stroke();
        }

        // Nome spell
        this.ctx.fillStyle = isInRange ? '#ff6400' : '#ff6666';
        this.ctx.font = 'bold 10px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'bottom';
        this.ctx.fillText(spell.name, this.worldMouseX, this.worldMouseY - 20);
    }

    // ========================================
    // RENDER FRECCIA DIREZIONALE EVOCAZIONE
    // Mostra la direzione verso cui si muoverà la creatura
    // La freccia parte dal punto di spawn (dove si è cliccato)
    // ========================================
    renderSummonDirection() {
        const start = this.summonAimStart;
        const end = { x: this.worldMouseX, y: this.worldMouseY };

        // Calcola direzione
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Disegna sempre il punto di spawn (cerchio verde)
        this.ctx.beginPath();
        this.ctx.arc(start.x, start.y, 12, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(0, 255, 136, 0.7)';
        this.ctx.fill();
        this.ctx.strokeStyle = '#00ff88';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Se il drag è troppo corto, mostra solo il punto di spawn con indicatore "IDLE"
        if (dist < 20) {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 10px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('⏸', start.x, start.y);
            return;
        }

        // Normalizza
        const nx = dx / dist;
        const ny = dy / dist;

        // Calcola il punto di intersezione con il bordo della mappa
        // (stesso algoritmo di calculateEdgePoint in entities.js)
        const mapWidth = this.map.width * CONFIG.TILE_SIZE;
        const mapHeight = this.map.height * CONFIG.TILE_SIZE;
        const margin = 10;

        let minT = Infinity;
        let extendedEnd = { x: end.x, y: end.y };

        // Bordo destro
        if (nx > 0) {
            const t = (mapWidth - margin - start.x) / nx;
            if (t > 0 && t < minT) {
                minT = t;
                extendedEnd = { x: start.x + nx * t, y: start.y + ny * t };
            }
        }
        // Bordo sinistro
        if (nx < 0) {
            const t = (margin - start.x) / nx;
            if (t > 0 && t < minT) {
                minT = t;
                extendedEnd = { x: start.x + nx * t, y: start.y + ny * t };
            }
        }
        // Bordo inferiore
        if (ny > 0) {
            const t = (mapHeight - margin - start.y) / ny;
            if (t > 0 && t < minT) {
                minT = t;
                extendedEnd = { x: start.x + nx * t, y: start.y + ny * t };
            }
        }
        // Bordo superiore
        if (ny < 0) {
            const t = (margin - start.y) / ny;
            if (t > 0 && t < minT) {
                minT = t;
                extendedEnd = { x: start.x + nx * t, y: start.y + ny * t };
            }
        }

        // Disegna linea tratteggiata dal punto di spawn al bordo
        this.ctx.beginPath();
        this.ctx.moveTo(start.x, start.y);
        this.ctx.lineTo(extendedEnd.x, extendedEnd.y);
        this.ctx.strokeStyle = '#00ff88';
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([15, 10]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Freccia alla fine
        const arrowSize = 15;
        const angle = Math.atan2(ny, nx);

        this.ctx.beginPath();
        this.ctx.moveTo(extendedEnd.x, extendedEnd.y);
        this.ctx.lineTo(
            extendedEnd.x - arrowSize * Math.cos(angle - 0.4),
            extendedEnd.y - arrowSize * Math.sin(angle - 0.4)
        );
        this.ctx.moveTo(extendedEnd.x, extendedEnd.y);
        this.ctx.lineTo(
            extendedEnd.x - arrowSize * Math.cos(angle + 0.4),
            extendedEnd.y - arrowSize * Math.sin(angle + 0.4)
        );
        this.ctx.strokeStyle = '#00ff88';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();

        // Indicatore di direzione sul punto di spawn
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 10px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('→', start.x, start.y);
    }
    
    // ========================================
    // MOVIMENTO DEL MAGO
    // ========================================
    moveMage(targetX, targetY) {
        if (!this.mage || !this.mage.isAlive()) return;
        
        this.mage.moveTo(targetX, targetY, this.map, this.pathfinder);
    }
    
    // ========================================
    // EVOCAZIONE CON BERSAGLIO DIRETTO
    // La creatura viene evocata accanto al mago e attacca subito il bersaglio (torre o muro)
    // ========================================
    summonCreatureWithTarget(type, target) {
        if (!this.mage || !this.mage.isAlive()) return;

        const stats = CreatureTypes[type];
        const totalCost = stats.manaCost * stats.spawnCount;

        // Verifica mana
        if (this.mage.mana < totalCost) {
            GameLog.log('Mana insufficiente per evocare');
            return;
        }

        this.mage.spendMana(totalCost);

        // Calcola direzione verso il bersaglio per posizionare le creature
        const dx = target.x - this.mage.x;
        const dy = target.y - this.mage.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const dirX = dist > 0 ? dx / dist : 1;
        const dirY = dist > 0 ? dy / dist : 0;

        // Spawn creature vicino al mago, nella direzione del bersaglio
        for (let i = 0; i < stats.spawnCount; i++) {
            // Offset dalla posizione del mago
            const spawnDist = 30 + i * 10;
            const angleOffset = (i - stats.spawnCount / 2) * 0.3;

            const spawnX = this.mage.x + dirX * spawnDist + Math.cos(angleOffset) * 10;
            const spawnY = this.mage.y + dirY * spawnDist + Math.sin(angleOffset) * 10;

            const creature = new Creature(spawnX, spawnY, type);

            // Imposta subito il bersaglio
            creature.setDirectTarget(target, this.map, this.pathfinder);

            this.creatures.push(creature);
        }

        GameLog.summon(`Evocato: ${stats.spawnCount}x ${stats.name} → ${target.name}`);
    }
    
    // ========================================
    // EVOCAZIONE CON DIREZIONE
    // La creatura viene evocata nel punto specificato (spawnX, spawnY)
    // e si muove nella direzione indicata cercando torri lungo il percorso
    // ========================================
    summonCreatureWithDirection(type, direction, spawnX, spawnY) {
        if (!this.mage || !this.mage.isAlive()) return;
        
        const stats = CreatureTypes[type];
        const totalCost = stats.manaCost * stats.spawnCount;
        
        // Verifica mana
        if (this.mage.mana < totalCost) {
            GameLog.log('Mana insufficiente per evocare');
            return;
        }
        
        this.mage.spendMana(totalCost);
        
        // Spawn creature nel punto indicato
        for (let i = 0; i < stats.spawnCount; i++) {
            // Piccolo offset per non sovrapporre le creature
            const angleOffset = (i - stats.spawnCount / 2) * 0.5;
            const offsetDist = i * 8;
            
            const creatureX = spawnX + Math.cos(angleOffset) * offsetDist;
            const creatureY = spawnY + Math.sin(angleOffset) * offsetDist;
            
            const creature = new Creature(creatureX, creatureY, type);
            
            // Imposta la direzione di movimento
            creature.setDirectionTarget(direction, this.map, this.pathfinder);
            
            this.creatures.push(creature);
        }
        
        GameLog.summon(`Evocato: ${stats.spawnCount}x ${stats.name} (direzione)`);
    }
    
    // ========================================
    // EVOCAZIONE IN STATO IDLE
    // La creatura viene evocata nel punto specificato e resta ferma
    // in attesa di ordini
    // ========================================
    summonCreatureIdle(type, spawnX, spawnY) {
        if (!this.mage || !this.mage.isAlive()) return;
        
        const stats = CreatureTypes[type];
        const totalCost = stats.manaCost * stats.spawnCount;
        
        // Verifica mana
        if (this.mage.mana < totalCost) {
            GameLog.log('Mana insufficiente per evocare');
            return;
        }
        
        this.mage.spendMana(totalCost);
        
        // Spawn creature nel punto indicato in stato IDLE
        for (let i = 0; i < stats.spawnCount; i++) {
            // Piccolo offset per non sovrapporre le creature
            const angle = (i / stats.spawnCount) * Math.PI * 2;
            const offsetDist = stats.spawnCount > 1 ? 15 : 0;
            
            const creatureX = spawnX + Math.cos(angle) * offsetDist;
            const creatureY = spawnY + Math.sin(angle) * offsetDist;
            
            const creature = new Creature(creatureX, creatureY, type);
            
            // La creatura rimane in IDLE (stato di default)
            creature.state = EntityState.IDLE;
            
            this.creatures.push(creature);
        }
        
        GameLog.summon(`Evocato: ${stats.spawnCount}x ${stats.name} (in attesa)`);
    }
    
    // ========================================
    // ORDINA A UNA CREATURA DI MUOVERSI IN UNA DIREZIONE
    // Usato quando il giocatore dà un ordine direzionale a una creatura selezionata
    // ========================================
    orderCreatureDirection(creature, direction) {
        if (!creature || !creature.isAlive()) return;
        
        creature.setDirectionTarget(direction, this.map, this.pathfinder);
    }
    
    // ========================================
    // ORDINA A TUTTE LE CREATURE DI ATTACCARE UNA TORRE
    // ========================================
    orderAllCreaturesToAttack(target) {
        const activeCreatures = this.creatures.filter(c => c.isAlive());
        
        if (activeCreatures.length === 0) {
            GameLog.log('Nessuna creatura da comandare');
            return;
        }
        
        for (const creature of activeCreatures) {
            creature.setDirectTarget(target, this.map, this.pathfinder);
        }
        
        GameLog.log(`${activeCreatures.length} creature attaccano ${target.name}`);
    }
    
    // ========================================
    // LANCIA INCANTESIMO
    // ========================================
    castSpell(targetX, targetY) {
        if (!this.selectedSpell || !this.mage) return;
        
        const success = this.spellSystem.castSpell(
            this.selectedSpell,
            this.mage,
            targetX,
            targetY,
            this
        );
        
        if (success) {
            this.selectedSpell = null;
            this.updateSpellButtons();
        }
    }
    
    selectSpell(spellType) {
        if (this.selectedSpell === spellType) {
            this.selectedSpell = null;
        } else {
            this.selectedSpell = spellType;
        }
        this.updateSpellButtons();
    }
    
    // ========================================
    // TROVA CREATURA ALLA POSIZIONE
    // Per la selezione con click
    // ========================================
    getCreatureAt(x, y) {
        for (const creature of this.creatures) {
            if (!creature.isAlive()) continue;
            
            const dist = Utils.distance(x, y, creature.x, creature.y);
            if (dist <= creature.radius + 5) {
                return creature;
            }
        }
        return null;
    }
    
    // ========================================
    // TROVA TORRE ALLA POSIZIONE
    // ========================================
    getTowerAt(x, y) {
        for (const tower of this.towers) {
            if (!tower.isAlive()) continue;

            const dist = Utils.distance(x, y, tower.x, tower.y);
            if (dist <= tower.radius + 10) {
                return tower;
            }
        }
        return null;
    }

    // ========================================
    // TROVA MURO ALLA POSIZIONE
    // ========================================
    getWallAt(x, y) {
        for (const wall of this.walls) {
            if (!wall.isAlive()) continue;

            const dist = Utils.distance(x, y, wall.x, wall.y);
            if (dist <= wall.radius + 5) {
                return wall;
            }
        }
        return null;
    }

    // ========================================
    // TROVA MURO ALLA CELLA SPECIFICA
    // Utile per trovare muri che bloccano il movimento
    // ========================================
    getWallAtCell(col, row) {
        for (const wall of this.walls) {
            if (!wall.isAlive()) continue;
            if (wall.col === col && wall.row === row) {
                return wall;
            }
        }
        return null;
    }

    // ========================================
    // TROVA STRUTTURA (torre o muro) ALLA POSIZIONE
    // ========================================
    getStructureAt(x, y) {
        for (const structure of this.structures) {
            if (!structure.isAlive()) continue;
            const dist = Utils.distance(x, y, structure.x, structure.y);
            if (dist <= structure.radius + 10) {
                return structure;
            }
        }
        return null;
    }

    // ========================================
    // TROVA STRUTTURA ALLA CELLA
    // ========================================
    getStructureAtCell(col, row) {
        for (const structure of this.structures) {
            if (!structure.isAlive()) continue;
            if (structure.col === col && structure.row === row) {
                return structure;
            }
        }
        return null;
    }

    // UI
    updateUI() {
        if (!this.mage) return;
        
        document.getElementById('mana-display').textContent = 
            `Mana: ${Math.floor(this.mage.mana)}`;
        document.getElementById('hp-display').textContent = 
            `HP: ${Math.floor(this.mage.hp)}${this.mage.shield > 0 ? ` (+${Math.floor(this.mage.shield)})` : ''}`;
        
        // Abilita/disabilita bottoni
        this.updateSpellButtons();
        this.updateSummonButtons();
    }
    
    updateSpellButtons() {
        document.querySelectorAll('.spell-btn').forEach(btn => {
            const spellType = btn.dataset.spell.toUpperCase();
            const spell = SpellTypes[spellType];
            
            btn.disabled = !this.mage || this.mage.mana < spell.manaCost;
            btn.classList.toggle('active', this.selectedSpell === spellType);
        });
    }
    
    updateSummonButtons() {
        document.querySelectorAll('.summon-btn').forEach(btn => {
            const summonType = btn.dataset.summon.toUpperCase();
            const stats = CreatureTypes[summonType];
            const totalCost = stats.manaCost * stats.spawnCount;
            
            btn.disabled = !this.mage || this.mage.mana < totalCost;
            
            // Evidenzia se questa evocazione è attiva
            const isActive = inputHandler && inputHandler.pendingSummonType === summonType;
            btn.classList.toggle('active', isActive);
        });
    }
    
    // Stati fine gioco
    win() {
        this.state = 'won';
        GameLog.log('HAI VINTO! Il tesoro è tuo!');
    }
    
    lose() {
        this.state = 'lost';
        GameLog.death('Il Mago è caduto... Game Over');
    }
    
    restart() {
        this.loadLevel(Levels.bigMap);
    }
    
    // Toggle debug
    toggleDangerView() {
        this.map.toggleDangerView();
    }
    
    toggleTowerRanges() {
        this.showTowerRanges = !this.showTowerRanges;
    }

    // ========================================
    // MINI-MAPPA
    // Mostra una vista dall'alto della mappa intera
    // ========================================
    renderMinimap() {
        const minimapWidth = 150;
        const minimapHeight = 100;
        const padding = 10;
        const x = this.canvas.width - minimapWidth - padding;
        const y = padding;

        // Calcola scala
        const worldWidth = this.map.width * CONFIG.TILE_SIZE;
        const worldHeight = this.map.height * CONFIG.TILE_SIZE;
        const scaleX = minimapWidth / worldWidth;
        const scaleY = minimapHeight / worldHeight;

        // Salva bounds per interattività
        this.minimapBounds = {
            x, y,
            width: minimapWidth,
            height: minimapHeight,
            scaleX, scaleY,
            worldWidth, worldHeight
        };

        // Sfondo semi-trasparente
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(x - 2, y - 2, minimapWidth + 4, minimapHeight + 4);

        // Bordo
        this.ctx.strokeStyle = '#555';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x - 2, y - 2, minimapWidth + 4, minimapHeight + 4);

        // Disegna la mappa semplificata
        const tileWidth = CONFIG.TILE_SIZE * scaleX;
        const tileHeight = CONFIG.TILE_SIZE * scaleY;

        for (let row = 0; row < this.map.height; row++) {
            for (let col = 0; col < this.map.width; col++) {
                const props = this.map.getTileProps(col, row);
                this.ctx.fillStyle = props.color;
                this.ctx.fillRect(
                    x + col * tileWidth,
                    y + row * tileHeight,
                    Math.ceil(tileWidth),
                    Math.ceil(tileHeight)
                );
            }
        }

        // Disegna le torri
        for (const tower of this.towers) {
            this.ctx.fillStyle = '#ff0000';
            this.ctx.beginPath();
            this.ctx.arc(
                x + tower.x * scaleX,
                y + tower.y * scaleY,
                3, 0, Math.PI * 2
            );
            this.ctx.fill();
        }

        // Disegna le creature
        for (const creature of this.creatures) {
            if (creature.isAlive()) {
                this.ctx.fillStyle = creature.color;
                this.ctx.beginPath();
                this.ctx.arc(
                    x + creature.x * scaleX,
                    y + creature.y * scaleY,
                    2, 0, Math.PI * 2
                );
                this.ctx.fill();
            }
        }

        // Disegna il mago
        if (this.mage && this.mage.isAlive()) {
            this.ctx.fillStyle = '#9b59b6';
            this.ctx.beginPath();
            this.ctx.arc(
                x + this.mage.x * scaleX,
                y + this.mage.y * scaleY,
                4, 0, Math.PI * 2
            );
            this.ctx.fill();
        }

        // Disegna il rettangolo del viewport
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(
            x + this.camera.x * scaleX,
            y + this.camera.y * scaleY,
            this.viewportWidth * scaleX,
            this.viewportHeight * scaleY
        );
    }

    // ========================================
    // PANNELLO DEBUG CREATURA SELEZIONATA
    // Mostra informazioni dettagliate per il debug
    // ========================================
    renderCreatureDebugPanel(creature) {
        const padding = 10;
        const panelWidth = 220;
        const lineHeight = 16;
        const x = padding;
        const y = padding;

        // Calcola altezza dinamica in base alle info da mostrare
        let lines = [];

        // Intestazione
        lines.push({ text: `${creature.name} (${creature.type})`, color: creature.color, bold: true });
        lines.push({ text: `────────────────────`, color: '#555' });

        // Stato
        const stateColors = {
            'IDLE': '#888888',
            'MOVING': '#00aaff',
            'ATTACKING': '#ff4444',
            'LOOKING_FOR_TARGET': '#ffaa00',
            'CLEAR_LINE_PATH': '#ff00ff',
            'DEAD': '#333333'
        };
        const stateColor = stateColors[creature.state] || '#ffffff';
        lines.push({ text: `Stato: ${creature.state}`, color: stateColor });

        // HP
        const hpPercent = (creature.hp / creature.maxHp * 100).toFixed(0);
        const hpColor = creature.hp > creature.maxHp * 0.5 ? '#2ecc71' :
                        creature.hp > creature.maxHp * 0.25 ? '#f39c12' : '#e74c3c';
        lines.push({ text: `HP: ${Math.floor(creature.hp)}/${creature.maxHp} (${hpPercent}%)`, color: hpColor });

        // Scudo
        if (creature.shield > 0) {
            lines.push({ text: `Scudo: ${Math.floor(creature.shield)}`, color: '#00bfff' });
        }

        // Separatore
        lines.push({ text: `────────────────────`, color: '#555' });

        // Target
        if (creature.target && creature.target.isAlive && creature.target.isAlive()) {
            const targetDist = Math.floor(Utils.entityDistance(creature, creature.target));
            lines.push({ text: `Target: ${creature.target.name}`, color: '#ff6666' });
            lines.push({ text: `  Distanza: ${targetDist}px`, color: '#aaaaaa' });
            lines.push({ text: `  HP: ${Math.floor(creature.target.hp)}/${creature.target.maxHp}`, color: '#aaaaaa' });
        } else {
            lines.push({ text: `Target: nessuno`, color: '#666666' });
        }

        // Original target (per CLEAR_LINE_PATH)
        if (creature.originalTarget && creature.originalTarget.isAlive && creature.originalTarget.isAlive()) {
            lines.push({ text: `Target orig.: ${creature.originalTarget.name}`, color: '#ff9999' });
        }

        // Tipo di ordine
        if (creature.orderType) {
            const orderColors = {
                'MOVE': '#00aaff',
                'ATTACK_MOVE': '#ffaa00',
                'FORCED_MOVE': '#ff00ff'
            };
            lines.push({ text: `Ordine: ${creature.orderType}`, color: orderColors[creature.orderType] || '#ffffff' });
        }

        // Destinazione
        if (creature.moveTargetPoint) {
            lines.push({ text: `Destinazione: (${Math.floor(creature.moveTargetPoint.x)}, ${Math.floor(creature.moveTargetPoint.y)})`, color: '#00aaff' });
        }

        // Direzione di movimento
        if (creature.moveDirection) {
            const angle = Math.atan2(creature.moveDirection.y, creature.moveDirection.x) * 180 / Math.PI;
            lines.push({ text: `Direzione: ${angle.toFixed(0)}°`, color: '#00ff88' });
        }

        // Separatore
        lines.push({ text: `────────────────────`, color: '#555' });

        // Flag
        let flags = [];
        if (creature.ignoreTowers) flags.push('ignoreTowers');
        if (creature.isFleeing) flags.push('isFleeing');
        if (creature.useDirectMovement) flags.push('directMove');
        if (flags.length > 0) {
            lines.push({ text: `Flag: ${flags.join(', ')}`, color: '#ffaa00' });
        }

        // Attaccanti
        const attackers = creature.attackedBy.filter(t => t.isAlive());
        if (attackers.length > 0) {
            lines.push({ text: `Attaccato da: ${attackers.length}`, color: '#ff4444' });
            for (const attacker of attackers.slice(0, 3)) {
                lines.push({ text: `  - ${attacker.name}`, color: '#ff6666' });
            }
            if (attackers.length > 3) {
                lines.push({ text: `  ... e altri ${attackers.length - 3}`, color: '#ff6666' });
            }
        }

        // Path info
        if (creature.path && creature.path.length > 0) {
            const remaining = creature.path.length - creature.pathIndex;
            lines.push({ text: `Path: ${remaining} celle rimaste`, color: '#aaaaaa' });
        }

        // Statistiche
        lines.push({ text: `────────────────────`, color: '#555' });
        lines.push({ text: `Danni: ${creature.damage} | AS: ${creature.attackSpeed}/s`, color: '#aaaaaa' });
        lines.push({ text: `Velocità: ${creature.speed} | Int: ${creature.intelligence}`, color: '#aaaaaa' });
        lines.push({ text: `Sight: ${creature.sightRange}px`, color: '#aaaaaa' });

        // Calcola altezza pannello
        const panelHeight = lines.length * lineHeight + padding * 2;

        // Sfondo semi-trasparente
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        this.ctx.fillRect(x, y, panelWidth, panelHeight);

        // Bordo
        this.ctx.strokeStyle = creature.color;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, panelWidth, panelHeight);

        // Testo
        this.ctx.font = '12px monospace';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.bold) {
                this.ctx.font = 'bold 13px monospace';
            } else {
                this.ctx.font = '12px monospace';
            }
            this.ctx.fillStyle = line.color;
            this.ctx.fillText(line.text, x + padding, y + padding + i * lineHeight);
        }
    }

    // ========================================
    // CLICK SULLA MINIMAPPA
    // Restituisce true se il click è stato gestito
    // ========================================
    handleMinimapClick(screenX, screenY) {
        if (!this.minimapBounds) return false;

        const bounds = this.minimapBounds;

        // Verifica se il click è dentro la minimappa
        if (screenX < bounds.x || screenX > bounds.x + bounds.width ||
            screenY < bounds.y || screenY > bounds.y + bounds.height) {
            return false;
        }

        // Calcola la posizione nel mondo
        const relX = screenX - bounds.x;
        const relY = screenY - bounds.y;

        const worldX = relX / bounds.scaleX;
        const worldY = relY / bounds.scaleY;

        // Centra la camera su quel punto
        this.camera.centerOn(worldX, worldY);

        return true;
    }
}
