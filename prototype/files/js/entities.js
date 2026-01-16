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
        this.target = null;         // Bersaglio corrente (torre o muro)
        this.originalTarget = null; // Bersaglio originale (usato in CLEAR_LINE_PATH)
        
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

        // ========================================
        // TIPO DI ORDINE CORRENTE
        // MOVE: muove e reagisce se attaccata
        // ATTACK_MOVE: muove e attacca nemici sul percorso
        // FORCED_MOVE: ignora tutto fino a destinazione
        // ========================================
        this.orderType = null;  // OrderType.MOVE, ATTACK_MOVE, FORCED_MOVE

        // ========================================
        // FLAG FUGA INTELLIGENTE
        // Se true, la creatura sta cercando di fuggire da una minaccia
        // ========================================
        this.isFleeing = false;
        this.fleeFromStructure = null;
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
    update(dt, gameMap, towers, pathfinder, walls = []) {
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
                // Se ignoreTowers è false e viene attaccata, reagisce.
                // Creature intelligenti: se non possono raggiungere, fuggono.
                // ------------------------------
                if (!this.ignoreTowers && this.attackedBy.length > 0) {
                    const primaryAttacker = this.attackedBy.find(t => t.isAlive());
                    if (primaryAttacker) {
                        // Creature intelligenti: verifica raggiungibilità
                        if (this.intelligence >= 0.5) {
                            const canReach = this.canReachStructure(primaryAttacker, gameMap, pathfinder);
                            if (!canReach) {
                                // Non può raggiungere: fugge!
                                this.fleeFrom(primaryAttacker, gameMap, pathfinder);
                                break;
                            }
                        }
                        // Può raggiungere o è poco intelligente: contrattacca
                        this.reactToAttack(towers, gameMap, pathfinder);
                    }
                }
                break;

            case EntityState.MOVING:
                // Segue il percorso calcolato
                this.followPath(dt, gameMap);

                // Comportamento basato sul tipo di ordine
                if (this.orderType === OrderType.FORCED_MOVE) {
                    // FORCED_MOVE: ignora tutto, prosegui
                    this.checkMoveTargetReached();
                }
                else if (this.orderType === OrderType.ATTACK_MOVE) {
                    // ATTACK_MOVE: cerca nemici nel raggio di vista
                    const visibleTarget = this.findTargetInSight(towers, walls);
                    if (visibleTarget) {
                        this.target = visibleTarget;
                        this.state = EntityState.ATTACKING;
                        this.orderType = null;
                        GameLog.log(`${this.name} ingaggia ${visibleTarget.name}`);
                        break;
                    }
                    // Altrimenti continua verso destinazione
                    this.checkMoveTargetReached();
                }
                else {
                    // MOVE o ordine normale: gestisce target e reazione agli attacchi
                    if (!this.ignoreTowers) {
                        // Se ha già un target valido assegnato, prosegue verso di esso
                        if (this.target && this.target.isAlive()) {
                            this.checkTargetReached();
                        } else {
                            // Non ha un target: reagisce solo se viene attaccata
                            if (this.attackedBy.length > 0) {
                                this.handleAttackWhileMoving(towers, walls, gameMap, pathfinder);
                                break;
                            }
                        }
                    }

                    // Verifica se siamo arrivati alla destinazione
                    if (!this.target) {
                        this.checkMoveTargetReached();
                    }
                }
                break;

            case EntityState.ATTACKING:
                // Attacca il bersaglio (torre o muro)
                this.performAttack(dt, gameMap, towers, walls);
                break;

            case 'LOOKING_FOR_TARGET':
                // Si muove nella direzione indicata cercando bersagli
                this.moveAndSearch(dt, gameMap, towers, walls);
                break;

            case EntityState.CLEAR_LINE_PATH:
                // Sta abbattendo un ostacolo per raggiungere il target originale
                this.performClearLinePath(dt, gameMap, towers, walls);
                break;
        }
    }

    // ========================================
    // CLEAR_LINE_PATH: Abbatte ostacolo e torna al target originale
    // Usato da creature poco intelligenti bloccate da muri
    // ========================================
    performClearLinePath(dt, gameMap, towers, walls) {
        // Verifica che abbiamo un ostacolo da abbattere
        if (!this.target || !this.target.isAlive()) {
            // Ostacolo distrutto! Verifica se ci sono altri ostacoli verso il target originale
            if (this.originalTarget && this.originalTarget.isAlive()) {
                // Cerca il prossimo ostacolo sulla linea verso il target originale
                const nextObstacle = this.findNextObstacleTowardTarget(this.originalTarget, gameMap, walls);

                if (nextObstacle) {
                    // C'è un altro ostacolo! Continua ad abbattere
                    this.target = nextObstacle;
                    GameLog.log(`${this.name} abbatte prossimo ostacolo: ${nextObstacle.name}`);
                } else {
                    // Nessun ostacolo, torna all'attacco del target originale
                    this.target = this.originalTarget;
                    this.originalTarget = null;
                    this.state = EntityState.ATTACKING;
                    GameLog.log(`${this.name} torna ad attaccare ${this.target.name}`);
                }
            } else {
                // Anche il target originale è morto, cerca nuovo bersaglio
                this.originalTarget = null;
                this.findNextTarget(towers, gameMap, walls);
            }
            return;
        }

        // Calcola distanza dall'ostacolo
        const dist = Utils.entityDistance(this, this.target);
        const attackRange = this.radius + this.target.radius + 10;

        if (dist <= attackRange) {
            // In range: attacca l'ostacolo
            if (this.attackCooldown <= 0) {
                this.target.takeDamage(this.damage);
                GameLog.damage(`${this.name} abbatte ostacolo: ${this.damage} danni a ${this.target.name}`);
                this.attackCooldown = 1 / this.attackSpeed;
            }
        } else {
            // Avvicinati all'ostacolo (movimento diretto, senza pathfinding)
            this.moveDirectlyToward(this.target, dt, gameMap);
        }
    }

    // ========================================
    // TROVA IL PROSSIMO OSTACOLO VERSO UN TARGET
    // Usato in CLEAR_LINE_PATH per verificare se ci sono altri muri
    // sulla linea verso il target originale
    // ========================================
    findNextObstacleTowardTarget(target, gameMap, walls) {
        // Calcola direzione verso il target
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 1) return null;

        // Normalizza direzione
        const nx = dx / dist;
        const ny = dy / dist;

        // Controlla le celle lungo la linea verso il target
        // Facciamo passi di mezza cella per non saltare ostacoli
        const stepSize = CONFIG.TILE_SIZE / 2;
        const maxSteps = Math.ceil(dist / stepSize);

        let lastCheckedCell = null;

        for (let i = 1; i <= maxSteps; i++) {
            const checkX = this.x + nx * stepSize * i;
            const checkY = this.y + ny * stepSize * i;
            const cell = Utils.pixelToGrid(checkX, checkY);

            // Evita di controllare la stessa cella più volte
            if (lastCheckedCell && lastCheckedCell.col === cell.col && lastCheckedCell.row === cell.row) {
                continue;
            }
            lastCheckedCell = cell;

            // Se la cella non è camminabile, cerca un muro
            if (!gameMap.isWalkable(cell.col, cell.row)) {
                const blockingWall = this.findBlockingWall(cell, walls);
                if (blockingWall) {
                    return blockingWall;
                }
                // Se non c'è un muro ma non è camminabile (es. roccia),
                // non possiamo procedere - restituisci null e la creatura
                // tornerà in ATTACKING (potrebbe bloccarsi, ma è un caso limite)
                return null;
            }
        }

        // Nessun ostacolo trovato
        return null;
    }

    // ========================================
    // TROVA IL MURO CHE BLOCCA LA CREATURA
    // Cerca un muro nella cella specificata
    // ========================================
    findBlockingWall(cell, walls) {
        for (const wall of walls) {
            if (!wall.isAlive()) continue;
            if (wall.col === cell.col && wall.row === cell.row) {
                return wall;
            }
        }
        return null;
    }

    // ========================================
    // MOVIMENTO DIRETTO VERSO UN TARGET
    // Usato in CLEAR_LINE_PATH per avvicinarsi all'ostacolo
    // ========================================
    moveDirectlyToward(target, dt, gameMap) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
            const currentCell = this.getCell();
            const speedMult = gameMap.getSpeedMultiplier(currentCell.col, currentCell.row);
            const actualSpeed = this.speed * speedMult;

            const moveX = (dx / dist) * actualSpeed * dt;
            const moveY = (dy / dist) * actualSpeed * dt;

            this.x += moveX;
            this.y += moveY;
        }
    }

    // ========================================
    // IMPOSTA UN BERSAGLIO DIRETTO (torre o muro)
    // La creatura si muove verso il bersaglio e lo attacca
    // ========================================
    setDirectTarget(target, gameMap, pathfinder) {
        this.target = target;
        this.moveDirection = null;
        this.destinationPoint = null;

        // Calcola il percorso verso il bersaglio
        let success = this.moveTo(target.x, target.y, gameMap, pathfinder);

        // Se il percorso diretto fallisce (es. target su cella non camminabile),
        // prova a trovare una cella adiacente camminabile
        if (!success) {
            const adjacentPoint = this.findAdjacentWalkablePoint(target, gameMap);
            if (adjacentPoint) {
                success = this.moveTo(adjacentPoint.x, adjacentPoint.y, gameMap, pathfinder);
            }
        }

        if (success) {
            this.state = EntityState.MOVING;
            GameLog.log(`${this.name} si dirige verso ${target.name}`);
        } else {
            // Se non c'è percorso, resta in IDLE con il target impostato
            GameLog.log(`${this.name}: impossibile raggiungere ${target.name}`);
            this.state = EntityState.IDLE;
        }
    }

    // ========================================
    // TROVA UN PUNTO ADIACENTE CAMMINABILE AL TARGET
    // Usato quando il target è su una cella non camminabile (es. muro)
    // Preferisce celle ortogonali (più vicine) rispetto alle diagonali
    // ========================================
    findAdjacentWalkablePoint(target, gameMap) {
        const targetCell = target.getCell ? target.getCell() : Utils.pixelToGrid(target.x, target.y);

        // Prima prova le celle ortogonali (più vicine al target)
        const orthogonal = [
            { dc: -1, dr: 0 },  // sinistra
            { dc: 1, dr: 0 },   // destra
            { dc: 0, dr: -1 },  // sopra
            { dc: 0, dr: 1 }    // sotto
        ];

        // Poi le diagonali (più lontane)
        const diagonal = [
            { dc: -1, dr: -1 },
            { dc: 1, dr: -1 },
            { dc: -1, dr: 1 },
            { dc: 1, dr: 1 }
        ];

        // Cerca prima tra le ortogonali
        let bestPoint = null;
        let bestDist = Infinity;

        for (const dir of orthogonal) {
            const adjCol = targetCell.col + dir.dc;
            const adjRow = targetCell.row + dir.dr;

            if (gameMap.isWalkable(adjCol, adjRow)) {
                const adjX = adjCol * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
                const adjY = adjRow * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
                const dist = Utils.distance(this.x, this.y, adjX, adjY);

                if (dist < bestDist) {
                    bestDist = dist;
                    bestPoint = { x: adjX, y: adjY };
                }
            }
        }

        // Se trovata una cella ortogonale, usala
        if (bestPoint) {
            return bestPoint;
        }

        // Altrimenti cerca tra le diagonali
        for (const dir of diagonal) {
            const adjCol = targetCell.col + dir.dc;
            const adjRow = targetCell.row + dir.dr;

            if (gameMap.isWalkable(adjCol, adjRow)) {
                const adjX = adjCol * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
                const adjY = adjRow * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
                const dist = Utils.distance(this.x, this.y, adjX, adjY);

                if (dist < bestDist) {
                    bestDist = dist;
                    bestPoint = { x: adjX, y: adjY };
                }
            }
        }

        return bestPoint;
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
    // IMPOSTA ORDINE DI MOVIMENTO (nuovo sistema)
    // orderType: MOVE, ATTACK_MOVE, FORCED_MOVE
    // ========================================
    setMoveOrder(targetX, targetY, orderType, gameMap, pathfinder) {
        this.target = null;
        this.moveDirection = null;
        this.moveTargetPoint = { x: targetX, y: targetY };
        this.orderType = orderType;
        this.isFleeing = false;
        this.fleeFromStructure = null;

        // Configura in base al tipo di ordine
        switch (orderType) {
            case OrderType.MOVE:
                // Movimento normale: reagisce se attaccata
                this.ignoreTowers = false;
                break;

            case OrderType.ATTACK_MOVE:
                // Attack-move: cerca attivamente nemici sul percorso
                this.ignoreTowers = false;
                break;

            case OrderType.FORCED_MOVE:
                // Forced move: ignora tutto
                this.ignoreTowers = true;
                break;
        }

        // Calcola il percorso
        const success = this.moveTo(targetX, targetY, gameMap, pathfinder);

        if (success) {
            this.state = EntityState.MOVING;
        } else {
            this.state = EntityState.IDLE;
            this.moveTargetPoint = null;
            this.orderType = null;
        }
    }

    // ========================================
    // IMPOSTA BERSAGLIO DA ATTACCARE
    // Alias per setDirectTarget con log migliorato
    // ========================================
    setAttackTarget(target, gameMap, pathfinder) {
        this.orderType = null;  // L'ordine diventa attacco
        this.isFleeing = false;
        this.fleeFromStructure = null;
        this.setDirectTarget(target, gameMap, pathfinder);
    }

    // ========================================
    // FUGA INTELLIGENTE
    // Usata quando una creatura intelligente viene attaccata
    // da una struttura non raggiungibile
    // ========================================
    fleeFrom(structure, gameMap, pathfinder) {
        this.isFleeing = true;
        this.fleeFromStructure = structure;

        // Calcola direzione opposta alla struttura
        const dx = this.x - structure.x;
        const dy = this.y - structure.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist === 0) return;

        // Normalizza
        const nx = dx / dist;
        const ny = dy / dist;

        // Calcola punto di fuga (fuori dal range della struttura)
        const fleeDistance = (structure.range || 4) * CONFIG.TILE_SIZE + 100;
        const fleeX = this.x + nx * fleeDistance;
        const fleeY = this.y + ny * fleeDistance;

        // Clamp ai bordi della mappa
        const mapWidth = gameMap.width * CONFIG.TILE_SIZE;
        const mapHeight = gameMap.height * CONFIG.TILE_SIZE;
        const targetX = Utils.clamp(fleeX, 20, mapWidth - 20);
        const targetY = Utils.clamp(fleeY, 20, mapHeight - 20);

        // Calcola percorso di fuga
        const success = this.moveTo(targetX, targetY, gameMap, pathfinder);

        if (success) {
            this.state = EntityState.MOVING;
            this.ignoreTowers = true;  // Durante la fuga ignora le torri
            GameLog.log(`${this.name} fugge!`);
        }
    }

    // ========================================
    // VERIFICA SE PUO' RAGGIUNGERE UNA STRUTTURA
    // Restituisce true se esiste un percorso
    // ========================================
    canReachStructure(structure, gameMap, pathfinder) {
        const startCell = this.getCell();
        const endCell = structure.getCell();

        // Cerca una cella adiacente raggiungibile
        const adjacent = this.findAdjacentWalkablePoint(structure, gameMap);
        if (!adjacent) return false;

        const adjacentCell = Utils.pixelToGrid(adjacent.x, adjacent.y);
        const path = pathfinder.findPath(startCell, adjacentCell, this.intelligence);

        return path !== null && path.length > 0;
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
    moveAndSearch(dt, gameMap, towers, walls = []) {
        // Segue il percorso
        this.followPath(dt, gameMap);

        // ----------------------------------------
        // Cerca bersagli (torri o mura) nel raggio di vista
        // ----------------------------------------
        const visibleTarget = this.findTargetInSight(towers, walls);

        if (visibleTarget) {
            // Trovato un bersaglio! Passa in modalità attacco
            this.target = visibleTarget;
            this.state = EntityState.ATTACKING;
            this.moveDirection = null;
            GameLog.log(`${this.name} ha avvistato ${visibleTarget.name}!`);
            return;
        }

        // ----------------------------------------
        // Se abbiamo raggiunto la destinazione senza trovare bersagli
        // ----------------------------------------
        if (this.state === 'LOOKING_FOR_TARGET' &&
            (!this.path || this.pathIndex >= this.path.length)) {
            // Arrivato al bordo senza trovare nulla
            this.state = EntityState.IDLE;
            this.moveDirection = null;
            this.destinationPoint = null;
            GameLog.log(`${this.name} è in attesa (nessun bersaglio trovato)`);
        }
    }
    
    // ========================================
    // TROVA TORRE NEL RAGGIO DI VISTA
    // Restituisce il bersaglio più vicino visibile (torre o muro), o null
    // Priorità: torri prima delle mura (le torri sono più pericolose)
    // ========================================
    findTargetInSight(towers, walls = []) {
        let closestTower = null;
        let closestTowerDist = this.sightRange;

        // Prima cerca tra le torri (priorità alta)
        for (const tower of towers) {
            if (!tower.isAlive()) continue;

            const dist = Utils.entityDistance(this, tower);
            if (dist < closestTowerDist) {
                closestTowerDist = dist;
                closestTower = tower;
            }
        }

        // Se c'è una torre visibile, attacca quella
        if (closestTower) {
            return closestTower;
        }

        // Altrimenti cerca tra le mura
        let closestWall = null;
        let closestWallDist = this.sightRange;

        for (const wall of walls) {
            if (!wall.isAlive()) continue;

            const dist = Utils.entityDistance(this, wall);
            if (dist < closestWallDist) {
                closestWallDist = dist;
                closestWall = wall;
            }
        }

        return closestWall;
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
        } else if (!this.path || this.pathIndex >= this.path.length) {
            // Path finito ma non siamo in range: passa in ATTACKING per avvicinarsi
            this.state = EntityState.ATTACKING;
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
    // ESEGUE L'ATTACCO AL BERSAGLIO (torre o muro)
    // ========================================
    performAttack(dt, gameMap, towers, walls = []) {
        // Verifica che il target sia ancora valido
        if (!this.target || !this.target.isAlive()) {
            // Target distrutto! Cerca il prossimo
            this.findNextTarget(towers, gameMap, walls);
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

                // Se il bersaglio è stato distrutto, cerca il prossimo target
                if (!this.target.isAlive()) {
                    this.findNextTarget(towers, gameMap, walls);
                }
            }
        } else {
            // ----------------------------------------
            // FUORI RANGE: Avvicinati
            // ----------------------------------------
            if (this.useDirectMovement) {
                // ========================================
                // MOVIMENTO DIRETTO (creature poco intelligenti)
                // ========================================
                const dx = this.target.x - this.x;
                const dy = this.target.y - this.y;
                const norm = Math.sqrt(dx * dx + dy * dy);

                if (norm > 0) {
                    const currentCell = this.getCell();
                    const speedMult = gameMap.getSpeedMultiplier(currentCell.col, currentCell.row);
                    const actualSpeed = this.speed * speedMult;

                    const moveX = (dx / norm) * actualSpeed * dt;
                    const moveY = (dy / norm) * actualSpeed * dt;
                    const newX = this.x + moveX;
                    const newY = this.y + moveY;

                    const newCell = Utils.pixelToGrid(newX, newY);

                    if (gameMap.isWalkable(newCell.col, newCell.row)) {
                        this.x = newX;
                        this.y = newY;
                    } else {
                        // Bloccato! Cerca muro da abbattere
                        const blockingWall = this.findBlockingWall(newCell, walls);
                        if (blockingWall) {
                            this.originalTarget = this.target;
                            this.target = blockingWall;
                            this.state = EntityState.CLEAR_LINE_PATH;
                            GameLog.log(`${this.name} bloccato! Abbatte ${blockingWall.name}`);
                        } else {
                            // Prova a scivolare
                            const cellX = Utils.pixelToGrid(newX, this.y);
                            const cellY = Utils.pixelToGrid(this.x, newY);

                            if (gameMap.isWalkable(cellX.col, cellX.row)) {
                                this.x = newX;
                            } else if (gameMap.isWalkable(cellY.col, cellY.row)) {
                                this.y = newY;
                            }
                        }
                    }
                }
            } else {
                // ========================================
                // MOVIMENTO VERSO TARGET (creature intelligenti, senza path)
                // Muoviti direttamente verso il target
                // ========================================
                const dx = this.target.x - this.x;
                const dy = this.target.y - this.y;
                const norm = Math.sqrt(dx * dx + dy * dy);

                if (norm > 0) {
                    const currentCell = this.getCell();
                    const speedMult = gameMap.getSpeedMultiplier(currentCell.col, currentCell.row);
                    const actualSpeed = this.speed * speedMult;

                    const moveX = (dx / norm) * actualSpeed * dt;
                    const moveY = (dy / norm) * actualSpeed * dt;
                    const newX = this.x + moveX;
                    const newY = this.y + moveY;

                    const newCell = Utils.pixelToGrid(newX, newY);

                    if (gameMap.isWalkable(newCell.col, newCell.row)) {
                        this.x = newX;
                        this.y = newY;
                    }
                    // Se bloccato, resta fermo (creature intelligenti non abbattono muri)
                }
            }
        }
    }
    
    // ========================================
    // TROVA IL PROSSIMO BERSAGLIO
    // Logica di priorità:
    // 1. Torri che ci stanno attaccando (priorità a HP*DAMAGE più basso, poi distanza)
    // 2. Torri nel raggio di vista (priorità a HP*DAMAGE più basso, poi distanza)
    // 3. Mura nel raggio di vista (priorità a HP più basso, poi distanza)
    // 4. Nessun bersaglio trovato -> IDLE
    // A parità di score, sceglie il bersaglio più vicino
    // ========================================
    findNextTarget(towers, gameMap, walls = []) {
        this.target = null;
        const self = this;

        // ----------------------------------------
        // PRIORITÀ 1: Torri che ci stanno attaccando
        // ----------------------------------------
        const attackers = this.attackedBy.filter(t => t.isAlive());

        if (attackers.length > 0) {
            // Ordina per HP * DAMAGE, poi per distanza a parità di score
            attackers.sort((a, b) => {
                const scoreA = a.hp * a.damage;
                const scoreB = b.hp * b.damage;
                if (scoreA !== scoreB) return scoreA - scoreB;
                // A parità di score, sceglie il più vicino
                const distA = Utils.entityDistance(self, a);
                const distB = Utils.entityDistance(self, b);
                return distA - distB;
            });

            this.target = attackers[0];
            this.state = EntityState.ATTACKING;
            // Creature poco intelligenti usano movimento diretto (possono bloccarsi)
            this.useDirectMovement = this.intelligence < 0.5;
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
            // Ordina per HP * DAMAGE, poi per distanza a parità di score
            visibleTowers.sort((a, b) => {
                const scoreA = a.hp * a.damage;
                const scoreB = b.hp * b.damage;
                if (scoreA !== scoreB) return scoreA - scoreB;
                // A parità di score, sceglie il più vicino
                const distA = Utils.entityDistance(self, a);
                const distB = Utils.entityDistance(self, b);
                return distA - distB;
            });

            this.target = visibleTowers[0];
            this.state = EntityState.ATTACKING;
            this.useDirectMovement = false; // Usa pathfinding
            GameLog.log(`${this.name} attacca ${this.target.name}`);
            return;
        }

        // ----------------------------------------
        // PRIORITÀ 3: Mura nel raggio di vista
        // ----------------------------------------
        const visibleWalls = walls.filter(w => {
            if (!w.isAlive()) return false;
            const dist = Utils.entityDistance(this, w);
            return dist <= this.sightRange;
        });

        if (visibleWalls.length > 0) {
            // Ordina per HP, poi per distanza a parità di HP
            visibleWalls.sort((a, b) => {
                if (a.hp !== b.hp) return a.hp - b.hp;
                // A parità di HP, sceglie il più vicino
                const distA = Utils.entityDistance(self, a);
                const distB = Utils.entityDistance(self, b);
                return distA - distB;
            });

            this.target = visibleWalls[0];
            this.state = EntityState.ATTACKING;
            this.useDirectMovement = false; // Usa pathfinding
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
    // GESTISCE ATTACCO MENTRE IN MOVIMENTO
    // Per creature intelligenti: se non può raggiungere l'attaccante, fugge
    // Per creature poco intelligenti: contrattacca direttamente
    // ========================================
    handleAttackWhileMoving(towers, walls, gameMap, pathfinder) {
        const attackers = this.attackedBy.filter(t => t.isAlive());
        if (attackers.length === 0) return;

        // Ordina per HP * DAMAGE
        attackers.sort((a, b) => {
            const scoreA = a.hp * a.damage;
            const scoreB = b.hp * b.damage;
            return scoreA - scoreB;
        });

        const primaryAttacker = attackers[0];

        // Creature poco intelligenti: contrattacco diretto
        if (this.intelligence < 0.5) {
            this.target = primaryAttacker;
            this.moveTargetPoint = null;
            this.orderType = null;
            this.state = EntityState.ATTACKING;
            this.useDirectMovement = true;
            GameLog.log(`${this.name} contrattacca ${primaryAttacker.name}!`);
            return;
        }

        // Creature intelligenti: verifica se può raggiungere l'attaccante
        const canReach = this.canReachStructure(primaryAttacker, gameMap, pathfinder);

        if (canReach) {
            // Può raggiungere: contrattacca
            this.target = primaryAttacker;
            this.moveTargetPoint = null;
            this.orderType = null;
            const success = this.moveTo(primaryAttacker.x, primaryAttacker.y, gameMap, pathfinder);
            if (success) {
                this.state = EntityState.MOVING;
                this.useDirectMovement = false;
                GameLog.log(`${this.name} contrattacca ${primaryAttacker.name}`);
            } else {
                this.state = EntityState.ATTACKING;
                this.useDirectMovement = true;
            }
        } else {
            // Non può raggiungere: fugge!
            // Ricalcola percorso evitando la zona pericolosa
            this.fleeFrom(primaryAttacker, gameMap, pathfinder);
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
