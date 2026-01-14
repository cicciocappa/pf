// ============================================
// ENTITÀ DI GIOCO - Mago e Creature
// ============================================

// Classe base per tutte le entità mobili
class Entity {
    constructor(x, y) {
        this.id = Utils.generateId();
        this.x = x;
        this.y = y;
        this.hp = 100;
        this.maxHp = 100;
        this.speed = 100;
        this.state = EntityState.IDLE;
        this.path = null;
        this.pathIndex = 0;
        this.target = null;
        this.shield = 0;
        this.color = '#ffffff';
        this.radius = 10;
    }
    
    getCell() {
        return Utils.pixelToGrid(this.x, this.y);
    }
    
    takeDamage(amount, source = null) {
        // Prima consuma lo scudo
        if (this.shield > 0) {
            if (this.shield >= amount) {
                this.shield -= amount;
                return 0;
            } else {
                amount -= this.shield;
                this.shield = 0;
            }
        }
        
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            this.state = EntityState.DEAD;
        }
        return amount;
    }
    
    heal(amount) {
        this.hp = Math.min(this.hp + amount, this.maxHp);
    }
    
    addShield(amount) {
        this.shield += amount;
    }
    
    isAlive() {
        return this.state !== EntityState.DEAD && this.hp > 0;
    }
    
    moveTo(targetX, targetY, gameMap, pathfinder) {
        const startCell = this.getCell();
        const endCell = Utils.pixelToGrid(targetX, targetY);
        
        this.path = pathfinder.findPath(
            startCell.col, startCell.row,
            endCell.col, endCell.row,
            this.intelligence || 0
        );
        
        if (this.path) {
            this.pathIndex = 0;
            this.state = EntityState.MOVING;
            return true;
        }
        return false;
    }
    
    update(dt, gameMap) {
        if (this.state === EntityState.MOVING && this.path) {
            this.followPath(dt, gameMap);
        }
    }
    
    followPath(dt, gameMap) {
        if (!this.path || this.pathIndex >= this.path.length) {
            this.state = EntityState.IDLE;
            this.path = null;
            return;
        }
        
        const targetCell = this.path[this.pathIndex];
        const targetPos = Utils.gridToPixel(targetCell.col, targetCell.row);
        
        const dx = targetPos.x - this.x;
        const dy = targetPos.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 5) {
            // Raggiungi il prossimo waypoint
            this.pathIndex++;
            if (this.pathIndex >= this.path.length) {
                this.state = EntityState.IDLE;
                this.path = null;
            }
            return;
        }
        
        // Applica modificatore velocità terreno
        const cell = this.getCell();
        const speedMult = gameMap.getSpeedMultiplier(cell.col, cell.row);
        const actualSpeed = this.speed * speedMult;
        
        // Muovi verso il target
        const moveX = (dx / dist) * actualSpeed * dt;
        const moveY = (dy / dist) * actualSpeed * dt;
        
        this.x += moveX;
        this.y += moveY;
    }
    
    render(ctx) {
        // Cerchio base
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Scudo (se presente)
        if (this.shield > 0) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 4, 0, Math.PI * 2);
            ctx.strokeStyle = '#00bfff';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        
        // Barra HP
        this.renderHpBar(ctx);
    }
    
    renderHpBar(ctx) {
        const barWidth = this.radius * 2;
        const barHeight = 4;
        const x = this.x - barWidth / 2;
        const y = this.y - this.radius - 10;
        
        // Sfondo
        ctx.fillStyle = '#333';
        ctx.fillRect(x, y, barWidth, barHeight);
        
        // HP
        const hpPercent = this.hp / this.maxHp;
        ctx.fillStyle = hpPercent > 0.5 ? '#2ecc71' : hpPercent > 0.25 ? '#f39c12' : '#e74c3c';
        ctx.fillRect(x, y, barWidth * hpPercent, barHeight);
        
        // Scudo
        if (this.shield > 0) {
            const shieldPercent = Math.min(this.shield / this.maxHp, 1);
            ctx.fillStyle = '#00bfff';
            ctx.fillRect(x, y - 2, barWidth * shieldPercent, 2);
        }
    }
    
    renderPath(ctx) {
        if (!this.path || this.pathIndex >= this.path.length) return;
        
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        
        for (let i = this.pathIndex; i < this.path.length; i++) {
            const pos = Utils.gridToPixel(this.path[i].col, this.path[i].row);
            ctx.lineTo(pos.x, pos.y);
        }
        
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

// ============================================
// IL MAGO (Giocatore)
// ============================================

class Mage extends Entity {
    constructor(x, y) {
        super(x, y);
        this.hp = CONFIG.MAGE.hp;
        this.maxHp = CONFIG.MAGE.hp;
        this.speed = CONFIG.MAGE.speed;
        this.intelligence = CONFIG.MAGE.intelligence;
        this.color = CONFIG.MAGE.color;
        this.radius = 12;
        
        this.mana = CONFIG.STARTING_MANA;
        this.maxMana = 200;
        this.attackRange = CONFIG.MAGE.attackRange;
        
        this.inventory = []; // Pozioni raccolte
        this.selectedSpell = null;
        this.castTimer = 0;
    }
    
    update(dt, gameMap) {
        super.update(dt, gameMap);
        
        // Rigenera mana (lentamente)
        this.mana = Math.min(this.mana + CONFIG.MANA_REGEN * dt, this.maxMana);
        
        // Timer cast
        if (this.castTimer > 0) {
            this.castTimer -= dt;
        }
    }
    
    canCast(spell) {
        return this.mana >= spell.manaCost && this.castTimer <= 0;
    }
    
    spendMana(amount) {
        if (this.mana >= amount) {
            this.mana -= amount;
            return true;
        }
        return false;
    }
    
    gainMana(amount) {
        this.mana = Math.min(this.mana + amount, this.maxMana);
    }
    
    render(ctx) {
        // Disegna il mago con un design distintivo
        
        // Cerchio principale
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        
        // Bordo luminoso
        ctx.strokeStyle = '#d4a5ff';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Cappello da mago (triangolo)
        ctx.beginPath();
        ctx.moveTo(this.x, this.y - this.radius - 12);
        ctx.lineTo(this.x - 8, this.y - this.radius + 2);
        ctx.lineTo(this.x + 8, this.y - this.radius + 2);
        ctx.closePath();
        ctx.fillStyle = '#6a0dad';
        ctx.fill();
        
        // Scudo
        if (this.shield > 0) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 6, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0, 191, 255, 0.7)';
            ctx.lineWidth = 4;
            ctx.stroke();
        }
        
        // Indicatore di cast
        if (this.castTimer > 0) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 10, 0, Math.PI * 2 * (1 - this.castTimer / 0.5));
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        
        // Barre HP e Mana
        this.renderHpBar(ctx);
        this.renderManaBar(ctx);
    }
    
    renderManaBar(ctx) {
        const barWidth = this.radius * 2;
        const barHeight = 3;
        const x = this.x - barWidth / 2;
        const y = this.y - this.radius - 5;
        
        ctx.fillStyle = '#222';
        ctx.fillRect(x, y, barWidth, barHeight);
        
        const manaPercent = this.mana / this.maxMana;
        ctx.fillStyle = '#00d4ff';
        ctx.fillRect(x, y, barWidth * manaPercent, barHeight);
    }
}

// ============================================
// CREATURE EVOCATE
// Sistema di comportamento:
// - IDLE: fermo, in attesa di ordini
// - MOVING: si muove verso una destinazione
// - ATTACKING: attacca una torre bersaglio
// - LOOKING_FOR_TARGET: si muove in una direzione cercando torri
// ============================================

class Creature extends Entity {
    constructor(x, y, type) {
        super(x, y);
        
        const stats = CreatureTypes[type];
        this.type = type;
        this.name = stats.name;
        this.hp = stats.hp;
        this.maxHp = stats.hp;
        this.damage = stats.damage;
        this.attackSpeed = stats.attackSpeed;
        this.speed = stats.speed;
        this.manaCost = stats.manaCost;
        this.intelligence = stats.intelligence;
        this.color = stats.color;
        this.radius = stats.radius;
        this.armorPiercing = stats.armorPiercing || false;
        this.armorReduction = stats.armorReduction || 0;
        
        // ========================================
        // STATO COMBATTIMENTO
        // ========================================
        this.attackCooldown = 0;
        this.target = null;  // Torre bersaglio corrente
        
        // ========================================
        // RAGGIO DI VISTA
        // Distanza in pixel entro cui la creatura rileva le torri
        // ========================================
        this.sightRange = CONFIG.CREATURE_SIGHT_RANGE * CONFIG.TILE_SIZE;
        
        // ========================================
        // DIREZIONE DI MOVIMENTO (per modalità LOOKING_FOR_TARGET)
        // ========================================
        this.moveDirection = null;
        this.destinationPoint = null;
        
        // ========================================
        // LISTA TORRI CHE CI STANNO ATTACCANDO
        // Viene aggiornata dal sistema di gioco
        // ========================================
        this.attackedBy = [];
        
        // ========================================
        // FLAG SELEZIONE
        // ========================================
        this.isSelected = false;

        // ========================================
        // FLAG IGNORA TORRI
        // Se true, la creatura ignora le torri durante il movimento
        // (non le attacca anche se attaccata o le vede)
        // ========================================
        this.ignoreTowers = false;

        // ========================================
        // PUNTO DI DESTINAZIONE PER MOVIMENTO
        // Usato quando si muove verso un punto specifico
        // ========================================
        this.moveTargetPoint = null;

        // ========================================
        // FLAG MOVIMENTO DIRETTO
        // Se true, la creatura si muove in linea retta verso il target
        // ignorando gli ostacoli (può bloccarsi contro i muri)
        // ========================================
        this.useDirectMovement = false;
    }
    
    // ========================================
    // OVERRIDE DI FOLLOWPATH
    // Non cambia automaticamente lo stato a IDLE come la classe base
    // Lascia che sia update() a gestire i cambi di stato
    // ========================================
    followPath(dt, gameMap) {
        if (!this.path || this.pathIndex >= this.path.length) {
            // Path completato, ma NON cambiamo stato qui
            // Sarà la logica specifica (moveAndSearch, checkTargetReached) a farlo
            this.path = null;
            return;
        }
        
        const targetCell = this.path[this.pathIndex];
        const targetPos = Utils.gridToPixel(targetCell.col, targetCell.row);
        
        const dx = targetPos.x - this.x;
        const dy = targetPos.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 5) {
            // Raggiungi il prossimo waypoint
            this.pathIndex++;
            return;
        }
        
        // Applica modificatore velocità terreno
        const cell = this.getCell();
        const speedMult = gameMap.getSpeedMultiplier(cell.col, cell.row);
        const actualSpeed = this.speed * speedMult;
        
        // Muovi verso il target
        const moveX = (dx / dist) * actualSpeed * dt;
        const moveY = (dy / dist) * actualSpeed * dt;
        
        this.x += moveX;
        this.y += moveY;
    }
    
    // ========================================
    // UPDATE PRINCIPALE
    // Gestisce il comportamento in base allo stato
    // ========================================
    update(dt, gameMap, towers, pathfinder) {
        // Aggiorna cooldown attacco
        if (this.attackCooldown > 0) {
            this.attackCooldown -= dt;
        }
        
        // Pulisce la lista delle torri che ci attaccano (rimuove quelle distrutte)
        this.attackedBy = this.attackedBy.filter(t => t.isAlive());
        
        // ----------------------------------------
        // COMPORTAMENTO IN BASE ALLO STATO
        // ----------------------------------------
        switch (this.state) {
            case EntityState.IDLE:
                // ------------------------------
                // COMPORTAMENTO IDLE:
                // Se ignoreTowers è false e viene attaccata, reagisce
                // cercando un bersaglio tra le torri che la stanno attaccando.
                // Se ignoreTowers è true o non viene attaccata, resta ferma.
                // ------------------------------
                if (!this.ignoreTowers && this.attackedBy.length > 0) {
                    // Siamo sotto attacco! Reagisci!
                    this.reactToAttack(towers, gameMap, pathfinder);
                }
                // Altrimenti resta in IDLE
                break;

            case EntityState.MOVING:
                // Segue il percorso calcolato
                this.followPath(dt, gameMap);

                // Se ignoreTowers è false, cerca torri e reagisce agli attacchi
                if (!this.ignoreTowers) {
                    // Cerca torri nel raggio di vista
                    const visibleTower = this.findTowerInSight(towers);
                    if (visibleTower) {
                        // Trovata una torre! Passa in modalità attacco
                        this.target = visibleTower;
                        this.state = EntityState.ATTACKING;
                        this.moveTargetPoint = null;
                        this.path = null;
                        GameLog.log(`${this.name} ha avvistato ${visibleTower.name}!`);
                        break;
                    }

                    // Reagisce se viene attaccata
                    if (this.attackedBy.length > 0) {
                        this.reactToAttack(towers, gameMap, pathfinder);
                        this.moveTargetPoint = null;
                        break;
                    }
                }

                // Verifica se siamo arrivati alla destinazione
                this.checkMoveTargetReached();
                break;
                
            case EntityState.ATTACKING:
                // Attacca la torre bersaglio
                this.performAttack(dt, gameMap, towers);
                break;
                
            case 'LOOKING_FOR_TARGET':
                // Si muove nella direzione indicata cercando torri
                this.moveAndSearch(dt, gameMap, towers);
                break;
        }
    }
    
    // ========================================
    // IMPOSTA UN BERSAGLIO DIRETTO (TORRE)
    // La creatura si muove verso la torre e la attacca
    // ========================================
    setDirectTarget(tower, gameMap, pathfinder) {
        this.target = tower;
        this.moveDirection = null;
        this.destinationPoint = null;
        
        // Calcola il percorso verso la torre
        const success = this.moveTo(tower.x, tower.y, gameMap, pathfinder);
        
        if (success) {
            this.state = EntityState.MOVING;
            GameLog.log(`${this.name} si dirige verso ${tower.name}`);
        } else {
            // Se non c'è percorso, prova ad avvicinarsi comunque
            GameLog.log(`${this.name}: percorso non trovato`);
            this.state = EntityState.IDLE;
        }
    }
    
    // ========================================
    // IMPOSTA MOVIMENTO DIREZIONALE
    // La creatura si muove in una direzione cercando torri
    // ========================================
    setDirectionTarget(direction, gameMap, pathfinder) {
        this.target = null;
        this.moveDirection = direction;
        this.ignoreTowers = false; // Reset del flag

        // Calcola il punto di destinazione: il limite della mappa in quella direzione
        this.destinationPoint = this.calculateEdgePoint(direction, gameMap);
        
        // Calcola il percorso verso quel punto
        const success = this.moveTo(
            this.destinationPoint.x, 
            this.destinationPoint.y, 
            gameMap, 
            pathfinder
        );
        
        if (success) {
            this.state = 'LOOKING_FOR_TARGET';
        } else {
            // Se non c'è percorso diretto, prova comunque
            this.state = 'LOOKING_FOR_TARGET';
        }
    }
    
    // ========================================
    // IMPOSTA MOVIMENTO VERSO UN PUNTO
    // La creatura si muove verso un punto specifico
    // Se ignoreTowers è true, ignora completamente le torri
    // Se ignoreTowers è false, attacca le torri che incontra o che la attaccano
    // ========================================
    setMoveTarget(targetX, targetY, gameMap, pathfinder, ignoreTowers = false) {
        this.target = null;
        this.moveDirection = null;
        this.ignoreTowers = ignoreTowers;
        this.moveTargetPoint = { x: targetX, y: targetY };

        // Calcola il percorso verso il punto
        const success = this.moveTo(targetX, targetY, gameMap, pathfinder);

        if (success) {
            this.state = EntityState.MOVING;
            if (ignoreTowers) {
                GameLog.log(`${this.name} si muove (ignora torri)`);
            } else {
                GameLog.log(`${this.name} si muove verso destinazione`);
            }
        } else {
            GameLog.log(`${this.name}: percorso non trovato`);
            this.state = EntityState.IDLE;
            this.moveTargetPoint = null;
        }
    }

    // ========================================
    // CALCOLA IL PUNTO SUL BORDO DELLA MAPPA
    // Data una direzione, trova dove interseca il bordo
    // ========================================
    calculateEdgePoint(direction, gameMap) {
        const mapWidth = gameMap.width * CONFIG.TILE_SIZE;
        const mapHeight = gameMap.height * CONFIG.TILE_SIZE;
        
        // Calcola le intersezioni con i 4 bordi
        let minT = Infinity;
        let edgePoint = { x: this.x, y: this.y };
        
        // Bordo destro (x = mapWidth)
        if (direction.x > 0) {
            const t = (mapWidth - 20 - this.x) / direction.x;
            if (t > 0 && t < minT) {
                minT = t;
                edgePoint = { 
                    x: this.x + direction.x * t, 
                    y: this.y + direction.y * t 
                };
            }
        }
        
        // Bordo sinistro (x = 0)
        if (direction.x < 0) {
            const t = (20 - this.x) / direction.x;
            if (t > 0 && t < minT) {
                minT = t;
                edgePoint = { 
                    x: this.x + direction.x * t, 
                    y: this.y + direction.y * t 
                };
            }
        }
        
        // Bordo inferiore (y = mapHeight)
        if (direction.y > 0) {
            const t = (mapHeight - 20 - this.y) / direction.y;
            if (t > 0 && t < minT) {
                minT = t;
                edgePoint = { 
                    x: this.x + direction.x * t, 
                    y: this.y + direction.y * t 
                };
            }
        }
        
        // Bordo superiore (y = 0)
        if (direction.y < 0) {
            const t = (20 - this.y) / direction.y;
            if (t > 0 && t < minT) {
                minT = t;
                edgePoint = { 
                    x: this.x + direction.x * t, 
                    y: this.y + direction.y * t 
                };
            }
        }
        
        // Clamp ai limiti della mappa
        edgePoint.x = Utils.clamp(edgePoint.x, 20, mapWidth - 20);
        edgePoint.y = Utils.clamp(edgePoint.y, 20, mapHeight - 20);
        
        return edgePoint;
    }
    
    // ========================================
    // MOVIMENTO CON RICERCA TORRI
    // Usato nello stato LOOKING_FOR_TARGET
    // ========================================
    moveAndSearch(dt, gameMap, towers) {
        // Segue il percorso
        this.followPath(dt, gameMap);
        
        // ----------------------------------------
        // Cerca torri nel raggio di vista
        // ----------------------------------------
        const visibleTower = this.findTowerInSight(towers);
        
        if (visibleTower) {
            // Trovata una torre! Passa in modalità attacco
            this.target = visibleTower;
            this.state = EntityState.ATTACKING;
            this.moveDirection = null;
            GameLog.log(`${this.name} ha avvistato ${visibleTower.name}!`);
            return;
        }
        
        // ----------------------------------------
        // Se abbiamo raggiunto la destinazione senza trovare torri
        // ----------------------------------------
        if (this.state === 'LOOKING_FOR_TARGET' && 
            (!this.path || this.pathIndex >= this.path.length)) {
            // Arrivato al bordo senza trovare nulla
            this.state = EntityState.IDLE;
            this.moveDirection = null;
            this.destinationPoint = null;
            GameLog.log(`${this.name} è in attesa (nessuna torre trovata)`);
        }
    }
    
    // ========================================
    // TROVA TORRE NEL RAGGIO DI VISTA
    // Restituisce la torre più vicina visibile, o null
    // ========================================
    findTowerInSight(towers) {
        let closestTower = null;
        let closestDist = this.sightRange;
        
        for (const tower of towers) {
            if (!tower.isAlive()) continue;
            
            const dist = Utils.entityDistance(this, tower);
            if (dist < closestDist) {
                closestDist = dist;
                closestTower = tower;
            }
        }
        
        return closestTower;
    }
    
    // ========================================
    // VERIFICA SE ABBIAMO RAGGIUNTO IL TARGET (torre)
    // Chiamato durante MOVING verso una torre
    // ========================================
    checkTargetReached() {
        if (!this.target || !this.target.isAlive()) {
            // Target non valido o distrutto durante il movimento
            // Non andiamo semplicemente in IDLE, cerchiamo il prossimo target
            if (!this.path || this.pathIndex >= this.path.length) {
                // Il path è finito, cerchiamo un nuovo bersaglio
                // (towers verrà passato dal game loop, qui usiamo un approccio diverso)
                this.state = EntityState.IDLE;
                this.target = null;
            }
            return;
        }

        // Verifica distanza dal target
        const dist = Utils.entityDistance(this, this.target);
        const attackRange = this.radius + (this.target.radius || 20) + 10;

        if (dist <= attackRange) {
            // Siamo in range di attacco!
            this.state = EntityState.ATTACKING;
            this.path = null;
        }
    }

    // ========================================
    // VERIFICA SE ABBIAMO RAGGIUNTO LA DESTINAZIONE
    // Chiamato durante MOVING verso un punto
    // ========================================
    checkMoveTargetReached() {
        // Se abbiamo un target (torre), usa la logica originale
        if (this.target && this.target.isAlive && this.target.isAlive()) {
            this.checkTargetReached();
            return;
        }

        // Se stiamo andando verso un punto specifico
        if (this.moveTargetPoint) {
            // Verifica se il path è completato
            if (!this.path || this.pathIndex >= this.path.length) {
                // Arrivato alla destinazione
                this.state = EntityState.IDLE;
                this.moveTargetPoint = null;
                this.ignoreTowers = false; // Reset del flag
                GameLog.log(`${this.name} è arrivato a destinazione`);
            }
            return;
        }

        // Fallback: se non c'è né target né punto di destinazione
        if (!this.path || this.pathIndex >= this.path.length) {
            this.state = EntityState.IDLE;
        }
    }
    
    // ========================================
    // ESEGUE L'ATTACCO ALLA TORRE
    // ========================================
    performAttack(dt, gameMap, towers) {
        // Verifica che il target sia ancora valido
        if (!this.target || !this.target.isAlive()) {
            // Target distrutto! Cerca il prossimo
            this.findNextTarget(towers, gameMap);
            return;
        }
        
        // Calcola distanza
        const dist = Utils.entityDistance(this, this.target);
        const attackRange = this.radius + this.target.radius + 10;
        
        if (dist <= attackRange) {
            // ----------------------------------------
            // IN RANGE: Attacca!
            // ----------------------------------------
            if (this.attackCooldown <= 0) {
                const damage = this.target.takeDamage(this.damage);
                GameLog.damage(`${this.name} infligge ${this.damage} danni a ${this.target.name}`);
                this.attackCooldown = 1 / this.attackSpeed;
                
                // Se la torre è stata distrutta, cerca il prossimo target
                if (!this.target.isAlive()) {
                    this.findNextTarget(towers, gameMap);
                }
            }
        } else {
            // ----------------------------------------
            // FUORI RANGE: Avvicinati
            // ----------------------------------------
            // Movimento semplice verso il target
            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            const norm = Math.sqrt(dx * dx + dy * dy);

            if (norm > 0) {
                const currentCell = this.getCell();
                const speedMult = gameMap.getSpeedMultiplier(currentCell.col, currentCell.row);
                const actualSpeed = this.speed * speedMult;

                // Calcola la nuova posizione
                const moveX = (dx / norm) * actualSpeed * dt;
                const moveY = (dy / norm) * actualSpeed * dt;
                const newX = this.x + moveX;
                const newY = this.y + moveY;

                // Verifica se la nuova posizione è camminabile
                const newCell = Utils.pixelToGrid(newX, newY);

                if (gameMap.isWalkable(newCell.col, newCell.row)) {
                    // Cella camminabile, muoviti
                    this.x = newX;
                    this.y = newY;
                } else if (this.useDirectMovement) {
                    // ----------------------------------------
                    // MOVIMENTO DIRETTO: Bloccato da un muro!
                    // Prova a muoversi solo su un asse
                    // ----------------------------------------
                    const cellX = Utils.pixelToGrid(newX, this.y);
                    const cellY = Utils.pixelToGrid(this.x, newY);

                    // Prova movimento solo orizzontale
                    if (gameMap.isWalkable(cellX.col, cellX.row)) {
                        this.x = newX;
                    }
                    // Prova movimento solo verticale
                    else if (gameMap.isWalkable(cellY.col, cellY.row)) {
                        this.y = newY;
                    }
                    // Completamente bloccato - resta fermo
                    // (la creatura continuerà a provare nel prossimo frame)
                } else {
                    // Movimento con pathfinding fallito, non dovrebbe succedere
                    this.x = newX;
                    this.y = newY;
                }
            }
        }
    }
    
    // ========================================
    // TROVA IL PROSSIMO BERSAGLIO
    // Logica di priorità:
    // 1. Torri che ci stanno attaccando (priorità a HP*DAMAGE più basso)
    // 2. Torri nel raggio di vista (priorità a HP*DAMAGE più basso)
    // 3. Nessuna torre trovata -> IDLE
    // ========================================
    findNextTarget(towers, gameMap) {
        this.target = null;
        
        // ----------------------------------------
        // PRIORITÀ 1: Torri che ci stanno attaccando
        // ----------------------------------------
        const attackers = this.attackedBy.filter(t => t.isAlive());
        
        if (attackers.length > 0) {
            // Ordina per HP * DAMAGE (priorità al più basso = più facile da eliminare)
            attackers.sort((a, b) => {
                const scoreA = a.hp * a.damage;
                const scoreB = b.hp * b.damage;
                return scoreA - scoreB;
            });
            
            this.target = attackers[0];
            this.state = EntityState.ATTACKING;
            GameLog.log(`${this.name} contrattacca ${this.target.name}!`);
            return;
        }
        
        // ----------------------------------------
        // PRIORITÀ 2: Torri nel raggio di vista
        // ----------------------------------------
        const visibleTowers = towers.filter(t => {
            if (!t.isAlive()) return false;
            const dist = Utils.entityDistance(this, t);
            return dist <= this.sightRange;
        });
        
        if (visibleTowers.length > 0) {
            // Ordina per HP * DAMAGE
            visibleTowers.sort((a, b) => {
                const scoreA = a.hp * a.damage;
                const scoreB = b.hp * b.damage;
                return scoreA - scoreB;
            });
            
            this.target = visibleTowers[0];
            this.state = EntityState.ATTACKING;
            GameLog.log(`${this.name} attacca ${this.target.name}`);
            return;
        }
        
        // ----------------------------------------
        // NESSUN BERSAGLIO: vai in IDLE
        // ----------------------------------------
        this.state = EntityState.IDLE;
        GameLog.log(`${this.name} in attesa (nessun bersaglio)`);
    }
    
    // ========================================
    // REAGISCE A UN ATTACCO
    // Cerca tra le torri che ci stanno attaccando e sceglie
    // quella con HP * DAMAGE più basso come bersaglio.
    //
    // COMPORTAMENTO BASATO SU INTELLIGENZA:
    // - Intelligenza < 0.5: movimento diretto (può bloccarsi contro i muri)
    // - Intelligenza >= 0.5: usa pathfinding per evitare ostacoli
    // ========================================
    reactToAttack(towers, gameMap, pathfinder) {
        // Filtra solo le torri ancora vive
        const attackers = this.attackedBy.filter(t => t.isAlive());

        if (attackers.length === 0) {
            // Nessun attaccante valido, resta nello stato corrente
            return;
        }

        // Ordina per HP * DAMAGE (priorità al più basso = più facile da eliminare)
        attackers.sort((a, b) => {
            const scoreA = a.hp * a.damage;
            const scoreB = b.hp * b.damage;
            return scoreA - scoreB;
        });

        // Scegli il bersaglio
        this.target = attackers[0];
        this.moveTargetPoint = null;
        this.path = null;

        // Comportamento basato su intelligenza
        if (this.intelligence < 0.5) {
            // ------------------------------
            // BASSA INTELLIGENZA: Movimento diretto
            // La creatura va dritta verso la torre (può bloccarsi contro i muri)
            // ------------------------------
            this.state = EntityState.ATTACKING;
            this.useDirectMovement = true; // Flag per movimento diretto
            GameLog.log(`${this.name} carica direttamente ${this.target.name}!`);
        } else {
            // ------------------------------
            // ALTA INTELLIGENZA: Usa pathfinding
            // La creatura calcola un percorso evitando gli ostacoli
            // ------------------------------
            if (pathfinder) {
                const success = this.moveTo(this.target.x, this.target.y, gameMap, pathfinder);
                if (success) {
                    this.state = EntityState.MOVING;
                    this.useDirectMovement = false;
                    GameLog.log(`${this.name} aggira gli ostacoli verso ${this.target.name}`);
                } else {
                    // Se non trova un percorso, prova movimento diretto come fallback
                    this.state = EntityState.ATTACKING;
                    this.useDirectMovement = true;
                    GameLog.log(`${this.name} non trova percorso, carica ${this.target.name}!`);
                }
            } else {
                // Fallback se pathfinder non disponibile
                this.state = EntityState.ATTACKING;
                this.useDirectMovement = true;
            }
        }
    }
    
    // ========================================
    // REGISTRA UNA TORRE CHE CI STA ATTACCANDO
    // Chiamato dal sistema torri quando ci colpisce
    // ========================================
    registerAttacker(tower) {
        if (!this.attackedBy.includes(tower)) {
            this.attackedBy.push(tower);
        }
    }
    
    // ========================================
    // RENDER DELLA CREATURA
    // ========================================
    render(ctx) {
        // ----------------------------------------
        // Cerchio di selezione (se selezionata)
        // ----------------------------------------
        if (this.isSelected) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 8, 0, Math.PI * 2);
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        
        // ----------------------------------------
        // Colore base (diverso se in stati speciali)
        // ----------------------------------------
        let fillColor = this.color;
        
        // Colore più scuro se in IDLE
        if (this.state === EntityState.IDLE) {
            fillColor = this.darkenColor(this.color, 0.7);
        }
        
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // ----------------------------------------
        // Indicatore tipo (per distinguere le creature)
        // ----------------------------------------
        if (this.type === 'GIANT') {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('G', this.x, this.y);
        } else if (this.type === 'ELEMENTAL') {
            // Effetto magico: cerchi concentrici pulsanti
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * 0.5, 0, Math.PI * 2);
            ctx.stroke();
            // Simbolo "E"
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('E', this.x, this.y);
        }
        
        // ----------------------------------------
        // Indicatore stato
        // ----------------------------------------
        if (this.state === 'LOOKING_FOR_TARGET') {
            // Indicatore "cerca" - piccolo occhio
            ctx.fillStyle = '#ffff00';
            ctx.beginPath();
            ctx.arc(this.x, this.y - this.radius - 5, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Indicatore "ignora torri" - linea blu sotto la creatura
        if (this.ignoreTowers && this.state === EntityState.MOVING) {
            ctx.strokeStyle = '#00aaff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(this.x - this.radius, this.y + this.radius + 4);
            ctx.lineTo(this.x + this.radius, this.y + this.radius + 4);
            ctx.stroke();
        }
        
        // ----------------------------------------
        // Scudo (se presente)
        // ----------------------------------------
        if (this.shield > 0) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 3, 0, Math.PI * 2);
            ctx.strokeStyle = '#00bfff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        
        // ----------------------------------------
        // Barra HP (solo se danneggiato)
        // ----------------------------------------
        if (this.hp < this.maxHp) {
            this.renderHpBar(ctx);
        }
        
        // ----------------------------------------
        // Linea verso il target (se sta attaccando)
        // ----------------------------------------
        if (this.target && this.target.isAlive() && this.state === EntityState.ATTACKING) {
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.target.x, this.target.y);
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
    
    // ----------------------------------------
    // Helper: scurisce un colore
    // ----------------------------------------
    darkenColor(color, factor) {
        // Converte hex in rgb, moltiplica, riconverte
        const hex = color.replace('#', '');
        const r = Math.floor(parseInt(hex.substr(0, 2), 16) * factor);
        const g = Math.floor(parseInt(hex.substr(2, 2), 16) * factor);
        const b = Math.floor(parseInt(hex.substr(4, 2), 16) * factor);
        return `rgb(${r},${g},${b})`;
    }
}
