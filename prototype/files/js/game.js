// ============================================
// GAME - Logica principale
// ============================================

class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Dimensioni
        this.resize();
        
        // Sistemi
        this.map = new GameMap(CONFIG.GRID_WIDTH, CONFIG.GRID_HEIGHT);
        this.pathfinder = new Pathfinder(this.map);
        this.spellSystem = new SpellSystem();
        
        // Entità
        this.mage = null;
        this.creatures = [];
        this.towers = [];
        
        // Stato gioco
        this.state = 'playing';  // playing, won, lost
        this.selectedSpell = null;
        this.showTowerRanges = false;
        this.mouseX = 0;
        this.mouseY = 0;
        
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
        this.canvas.width = CONFIG.GRID_WIDTH * CONFIG.TILE_SIZE;
        this.canvas.height = CONFIG.GRID_HEIGHT * CONFIG.TILE_SIZE;
    }
    
    // Carica un livello
    loadLevel(levelData) {
        // Reset
        this.creatures = [];
        this.towers = [];
        this.state = 'playing';
        this.selectedSpell = null;
        this.selectedCreature = null;
        this.summonAimStart = null;
        this.summonAimEnd = null;
        GameLog.clear();
        
        // Carica mappa
        this.map.loadLevel(levelData.map);
        
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
                // Passa le torri alla creatura per la logica di ricerca bersagli
                creature.update(dt, this.map, this.towers);
                
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
        
        // Update sistema incantesimi
        this.spellSystem.update(dt);
        
        // Update UI
        this.updateUI();
    }
    
    // Render
    render() {
        // Clear
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Mappa
        this.map.render(this.ctx);
        
        // Evidenzia cella sotto il cursore
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
        
        // Preview incantesimo selezionato
        if (this.selectedSpell && this.mage) {
            const isValid = this.spellSystem.isInCastRange(
                this.mage, this.mouseX, this.mouseY, this.selectedSpell
            );
            this.spellSystem.renderCastRange(this.ctx, this.mage, this.selectedSpell);
            renderSpellPreview(this.ctx, this.selectedSpell, this.mouseX, this.mouseY, isValid);
        }
        
        // Messaggio stato gioco
        if (this.state === 'won') {
            this.renderMessage('VITTORIA!', '#2ecc71');
        } else if (this.state === 'lost') {
            this.renderMessage('SCONFITTA', '#e74c3c');
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
        // Calcola la cella sotto il mouse
        const cell = Utils.pixelToGrid(this.mouseX, this.mouseY);
        
        if (!Utils.isValidCell(cell.col, cell.row)) return;
        
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
        const distFromMage = Utils.distance(this.mage.x, this.mage.y, this.mouseX, this.mouseY);
        const isInRange = distFromMage <= rangePixels;
        
        // Piccolo cerchio al cursore
        this.ctx.beginPath();
        this.ctx.arc(this.mouseX, this.mouseY, 8, 0, Math.PI * 2);
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
        const end = { x: this.mouseX, y: this.mouseY };
        
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
        const mapWidth = CONFIG.GRID_WIDTH * CONFIG.TILE_SIZE;
        const mapHeight = CONFIG.GRID_HEIGHT * CONFIG.TILE_SIZE;
        
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
    // La creatura viene evocata accanto al mago e attacca subito la torre
    // ========================================
    summonCreatureWithTarget(type, targetTower) {
        if (!this.mage || !this.mage.isAlive()) return;
        
        const stats = CreatureTypes[type];
        const totalCost = stats.manaCost * stats.spawnCount;
        
        // Verifica mana
        if (this.mage.mana < totalCost) {
            GameLog.log('Mana insufficiente per evocare');
            return;
        }
        
        this.mage.spendMana(totalCost);
        
        // Calcola direzione verso la torre per posizionare le creature
        const dx = targetTower.x - this.mage.x;
        const dy = targetTower.y - this.mage.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const dirX = dist > 0 ? dx / dist : 1;
        const dirY = dist > 0 ? dy / dist : 0;
        
        // Spawn creature vicino al mago, nella direzione della torre
        for (let i = 0; i < stats.spawnCount; i++) {
            // Offset dalla posizione del mago
            const spawnDist = 30 + i * 10;
            const angleOffset = (i - stats.spawnCount / 2) * 0.3;
            
            const spawnX = this.mage.x + dirX * spawnDist + Math.cos(angleOffset) * 10;
            const spawnY = this.mage.y + dirY * spawnDist + Math.sin(angleOffset) * 10;
            
            const creature = new Creature(spawnX, spawnY, type);
            
            // Imposta subito il bersaglio
            creature.setDirectTarget(targetTower, this.map, this.pathfinder);
            
            this.creatures.push(creature);
        }
        
        GameLog.summon(`Evocato: ${stats.spawnCount}x ${stats.name} → ${targetTower.name}`);
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
        this.loadLevel(Levels.tutorial);
    }
    
    // Toggle debug
    toggleDangerView() {
        this.map.toggleDangerView();
    }
    
    toggleTowerRanges() {
        this.showTowerRanges = !this.showTowerRanges;
    }
}
