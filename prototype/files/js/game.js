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
        this.towers = [];
        this.walls = [];  // Muri distruggibili
        
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
    
    // Carica un livello
    loadLevel(levelData) {
        // Reset
        this.creatures = [];
        this.towers = [];
        this.walls = [];
        this.state = 'playing';
        this.selectedSpell = null;
        this.selectedCreature = null;
        this.summonAimStart = null;
        this.summonAimEnd = null;
        GameLog.clear();

        // Carica mappa (potrebbe ridimensionare la griglia)
        this.map.loadLevel(levelData.map);

        // Crea entità Wall per ogni tile WALL
        for (let row = 0; row < this.map.height; row++) {
            for (let col = 0; col < this.map.width; col++) {
                if (this.map.getTile(col, row) === Tile.WALL) {
                    const wall = createWall(col, row);
                    this.walls.push(wall);
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
            this.towers.push(tower);
        }

        // Aggiorna danger map
        this.map.updateDangerMap(this.towers);

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
        
        // Ottieni tutti i nemici per le torri
        const allEnemies = this.mage ? [this.mage, ...this.creatures] : [...this.creatures];
        
        // Update torri
        for (let i = this.towers.length - 1; i >= 0; i--) {
            const tower = this.towers[i];

            if (tower.isAlive()) {
                tower.update(dt, allEnemies.filter(e => e.isAlive()));
            } else {
                // Torre distrutta
                this.towers.splice(i, 1);
                // Aggiorna danger map
                this.map.updateDangerMap(this.towers);
            }
        }

        // Update muri (gestisce distruzione)
        for (let i = this.walls.length - 1; i >= 0; i--) {
            const wall = this.walls[i];

            if (!wall.isAlive()) {
                // Muro distrutto - cambia il tile a DIRT
                this.map.setTile(wall.col, wall.row, Tile.DIRT);
                this.walls.splice(i, 1);
                // Aggiorna pathfinder perché la mappa è cambiata
                this.pathfinder = new Pathfinder(this.map);
            }
        }

        // Update sistema incantesimi
        this.spellSystem.update(dt);

        // Update camera
        this.camera.update(dt);

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
        // RENDER RAGGIO DI EVOCAZIONE
        // Mostra il cerchio entro cui si può evocare
        // ========================================
        if (inputHandler && inputHandler.pendingSummonType && this.mage) {
            this.renderSummonRange();
        }

        // ========================================
        // RENDER FRECCIA DIREZIONALE EVOCAZIONE
        // Mostra la direzione durante il drag
        // ========================================
        if (this.summonAimStart && this.summonAimEnd) {
            this.renderSummonDirection();
        }

        // Muri (rendere prima delle torri)
        for (const wall of this.walls) {
            if (wall.isAlive()) {
                wall.render(this.ctx);
            }
        }

        // Range torri (se abilitato)
        for (const tower of this.towers) {
            tower.render(this.ctx, this.showTowerRanges);
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

        // Preview incantesimo selezionato (usa coordinate mondo)
        if (this.selectedSpell && this.mage) {
            const isValid = this.spellSystem.isInCastRange(
                this.mage, this.worldMouseX, this.worldMouseY, this.selectedSpell
            );
            this.spellSystem.renderCastRange(this.ctx, this.mage, this.selectedSpell);
            renderSpellPreview(this.ctx, this.selectedSpell, this.worldMouseX, this.worldMouseY, isValid);
        }

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
        
        // Indicatore se il mouse è nel raggio
        const distFromMage = Utils.distance(this.mage.x, this.mage.y, this.worldMouseX, this.worldMouseY);
        const isInRange = distFromMage <= rangePixels;

        // Piccolo cerchio al cursore (usa coordinate mondo)
        this.ctx.beginPath();
        this.ctx.arc(this.worldMouseX, this.worldMouseY, 8, 0, Math.PI * 2);
        this.ctx.fillStyle = isInRange ? 'rgba(0, 255, 136, 0.5)' : 'rgba(255, 0, 0, 0.5)';
        this.ctx.fill();
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
        
        // Estendi la linea fino al bordo della mappa
        const mapWidth = this.map.width * CONFIG.TILE_SIZE;
        const mapHeight = this.map.height * CONFIG.TILE_SIZE;
        
        // Calcola punto finale (bordo mappa)
        let extendedEnd = { x: end.x, y: end.y };
        const maxExtend = Math.max(mapWidth, mapHeight);
        extendedEnd.x = start.x + nx * maxExtend;
        extendedEnd.y = start.y + ny * maxExtend;
        
        // Clamp ai bordi
        extendedEnd.x = Utils.clamp(extendedEnd.x, 10, mapWidth - 10);
        extendedEnd.y = Utils.clamp(extendedEnd.y, 10, mapHeight - 10);
        
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
}
