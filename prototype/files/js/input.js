// ============================================
// INPUT HANDLER
// Sistema di controllo con:
// - Click sinistro: movimento mago / selezione creature
// - Click destro: attacco / lancio incantesimi
// - Q/W: modalità evocazione creature
// ============================================

class InputHandler {
    constructor(game) {
        this.game = game;

        // ========================================
        // STATO TASTI MODIFICATORI
        // ========================================
        this.shiftPressed = false;

        // ========================================
        // STATO MODALITÀ EVOCAZIONE
        // ========================================
        // Tipo di creatura selezionata per l'evocazione (null se nessuna)
        this.pendingSummonType = null;
        
        // Fase dell'evocazione: 
        // - null: nessuna evocazione in corso
        // - 'aiming': l'utente sta scegliendo la direzione (mouse premuto)
        this.summonPhase = null;
        
        // Punto di partenza del drag per calcolare la direzione
        this.summonDragStart = null;
        
        // Punto in cui verrà evocata la creatura (dove l'utente ha cliccato)
        this.summonSpawnPoint = null;
        
        // ========================================
        // STATO SELEZIONE CREATURE
        // ========================================
        // Creatura attualmente selezionata dal giocatore
        this.selectedCreature = null;
        
        // Flag per sapere se stiamo dando un ordine direzionale a una creatura selezionata
        this.orderingCreature = false;
        this.orderDragStart = null;
        
        this.setupEventListeners();
    }
    
    // ========================================
    // FUNZIONE HELPER: COORDINATE CANVAS
    // Converte le coordinate del mouse nelle coordinate interne del canvas
    // tenendo conto dello scaling CSS
    // ========================================
    getCanvasCoords(e) {
        const canvas = this.game.canvas;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    // ========================================
    // FUNZIONE HELPER: COORDINATE MONDO
    // Converte le coordinate schermo in coordinate mondo usando la camera
    // ========================================
    getWorldCoords(screenX, screenY) {
        return this.game.camera.screenToWorld(screenX, screenY);
    }
    
    setupEventListeners() {
        const canvas = this.game.canvas;
        
        // ========================================
        // MOUSE MOVE
        // Aggiorna la posizione del mouse per:
        // - Preview incantesimi
        // - Preview area evocazione
        // - Preview direzione durante drag
        // ========================================
        canvas.addEventListener('mousemove', (e) => {
            const screenCoords = this.getCanvasCoords(e);
            const worldCoords = this.getWorldCoords(screenCoords.x, screenCoords.y);

            // Salva sia le coordinate schermo che mondo
            this.game.mouseX = screenCoords.x;
            this.game.mouseY = screenCoords.y;
            this.game.worldMouseX = worldCoords.x;
            this.game.worldMouseY = worldCoords.y;

            // Aggiorna la freccia direzionale se siamo in fase aiming (usa coordinate mondo)
            if (this.summonPhase === 'aiming') {
                this.game.summonAimEnd = { x: worldCoords.x, y: worldCoords.y };
            }
        });
        
        // ========================================
        // MOUSE DOWN - CLICK SINISTRO
        // Gestisce:
        // - Movimento del mago (se nessuna modalità attiva)
        // - Selezione creature (click su creatura)
        // - Inizio ordine direzionale a creatura selezionata
        // ========================================
        canvas.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // Solo click sinistro

            const screenCoords = this.getCanvasCoords(e);
            const worldCoords = this.getWorldCoords(screenCoords.x, screenCoords.y);
            this.handleLeftMouseDown(worldCoords.x, worldCoords.y);
        });
        
        // ========================================
        // MOUSE UP - CLICK SINISTRO
        // Gestisce:
        // - Fine ordine direzionale a creatura
        // ========================================
        canvas.addEventListener('mouseup', (e) => {
            if (e.button !== 0) return;

            const screenCoords = this.getCanvasCoords(e);
            const worldCoords = this.getWorldCoords(screenCoords.x, screenCoords.y);
            this.handleLeftMouseUp(worldCoords.x, worldCoords.y);
        });
        
        // ========================================
        // MOUSE DOWN - CLICK DESTRO
        // Gestisce:
        // - Inizio evocazione (se modalità evocazione attiva)
        // - Lancio incantesimi (se incantesimo selezionato)
        // - Ordine di attacco a creatura selezionata
        // ========================================
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const screenCoords = this.getCanvasCoords(e);
            const worldCoords = this.getWorldCoords(screenCoords.x, screenCoords.y);
            this.handleRightMouseDown(worldCoords.x, worldCoords.y);
        });

        // Per gestire il mouse up del destro (fine drag evocazione)
        canvas.addEventListener('mouseup', (e) => {
            if (e.button !== 2) return; // Solo click destro

            const screenCoords = this.getCanvasCoords(e);
            const worldCoords = this.getWorldCoords(screenCoords.x, screenCoords.y);
            this.handleRightMouseUp(worldCoords.x, worldCoords.y);
        });
        
        // Tastiera
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));

        // Bottoni UI
        this.setupUIButtons();
    }
    
    // ========================================
    // GESTIONE CLICK SINISTRO (MOUSE DOWN)
    // ========================================
    handleLeftMouseDown(x, y) {
        if (this.game.state !== 'playing') return;

        // ------------------------------
        // CASO 1: Prova a selezionare una creatura
        // Se il click è su una creatura, la selezioniamo
        // ------------------------------
        const clickedCreature = this.game.getCreatureAt(x, y);
        if (clickedCreature) {
            this.selectedCreature = clickedCreature;
            this.game.selectedCreature = clickedCreature;
            // Prepara per eventuale drag direzionale
            this.orderingCreature = true;
            this.orderDragStart = { x, y };
            GameLog.log(`Selezionata creatura: ${clickedCreature.name}`);
            return;
        }

        // ------------------------------
        // CASO 2: Se abbiamo una creatura selezionata e clicchiamo altrove,
        // ordine di movimento verso il punto
        // - SHIFT premuto: ignora le torri
        // - SHIFT non premuto: attacca le torri che incontra
        // ------------------------------
        if (this.selectedCreature && this.selectedCreature.isAlive()) {
            // Prepara per eventuale drag direzionale
            this.orderingCreature = true;
            this.orderDragStart = { x, y };
            return;
        }

        // ------------------------------
        // CASO 3: Movimento del mago
        // Se nessuna modalità speciale è attiva, muovi il mago
        // ------------------------------
        if (!this.pendingSummonType && !this.game.selectedSpell) {
            this.game.moveMage(x, y);
        }
    }
    
    // ========================================
    // GESTIONE CLICK SINISTRO (MOUSE UP)
    // ========================================
    handleLeftMouseUp(x, y) {
        if (this.game.state !== 'playing') return;

        // ------------------------------
        // Gestione ordini a creatura selezionata
        // ------------------------------
        if (this.orderingCreature && this.selectedCreature && this.selectedCreature.isAlive()) {
            const dragDist = Utils.distance(
                this.orderDragStart.x, this.orderDragStart.y, x, y
            );

            // Se è stato un drag significativo (non un semplice click)
            if (dragDist > 20) {
                // Calcola la direzione del drag
                const direction = Utils.normalize(
                    x - this.orderDragStart.x,
                    y - this.orderDragStart.y
                );

                // Ordina alla creatura di muoversi in quella direzione
                // cercando torri lungo il percorso
                this.game.orderCreatureDirection(this.selectedCreature, direction);
                GameLog.log(`Ordine direzionale a ${this.selectedCreature.name}`);
            }
            // Se è un semplice click (non drag)
            else {
                // Verifica se abbiamo cliccato su un'altra creatura
                const clickedCreature = this.game.getCreatureAt(x, y);
                if (clickedCreature) {
                    // Selezioniamo la nuova creatura (già gestito in mousedown)
                }
                // Verifica se abbiamo cliccato su una torre o muro
                else if (this.game.getTowerAt(x, y) || this.game.getWallAt(x, y)) {
                    // Se clicchiamo su una torre o muro, attaccalo
                    const target = this.game.getTowerAt(x, y) || this.game.getWallAt(x, y);
                    this.selectedCreature.setDirectTarget(target, this.game.map, this.game.pathfinder);
                }
                // Click su punto vuoto = ordine di movimento
                else {
                    // SHIFT premuto: ignora le torri
                    // SHIFT non premuto: attacca le torri che incontra
                    const ignoreTowers = this.shiftPressed;
                    this.selectedCreature.setMoveTarget(
                        x, y,
                        this.game.map,
                        this.game.pathfinder,
                        ignoreTowers
                    );
                }
            }
        }

        this.orderingCreature = false;
        this.orderDragStart = null;
    }
    
    // ========================================
    // GESTIONE CLICK DESTRO (MOUSE DOWN)
    // ========================================
    handleRightMouseDown(x, y) {
        if (this.game.state !== 'playing') return;
        
        // ------------------------------
        // CASO 1: Modalità evocazione attiva
        // ------------------------------
        if (this.pendingSummonType) {
            this.handleSummonMouseDown(x, y);
            return;
        }
        
        // ------------------------------
        // CASO 2: Incantesimo selezionato
        // ------------------------------
        if (this.game.selectedSpell) {
            this.game.castSpell(x, y);
            return;
        }
        
        // ------------------------------
        // CASO 3: Creatura selezionata - ordine di attacco
        // ------------------------------
        if (this.selectedCreature && this.selectedCreature.isAlive()) {
            const clickedTarget = this.game.getTowerAt(x, y) || this.game.getWallAt(x, y);
            if (clickedTarget) {
                // Ordina alla creatura di attaccare il bersaglio
                this.selectedCreature.setDirectTarget(clickedTarget, this.game.map, this.game.pathfinder);
                GameLog.log(`${this.selectedCreature.name} attacca ${clickedTarget.name}`);
            }
            return;
        }

        // ------------------------------
        // CASO 4: Click su torre/muro senza creature selezionate
        // Ordina a TUTTE le creature di attaccare
        // ------------------------------
        const clickedTarget = this.game.getTowerAt(x, y) || this.game.getWallAt(x, y);
        if (clickedTarget) {
            this.game.orderAllCreaturesToAttack(clickedTarget);
        }
    }
    
    // ========================================
    // GESTIONE CLICK DESTRO (MOUSE UP)
    // Fine del drag per evocazione direzionale
    // ========================================
    handleRightMouseUp(x, y) {
        if (this.game.state !== 'playing') return;
        
        // Se siamo in fase 'aiming' dell'evocazione
        if (this.summonPhase === 'aiming' && this.pendingSummonType) {
            this.completeSummonWithDirection(x, y);
        }
        
        // Reset stato evocazione
        this.summonPhase = null;
        this.summonDragStart = null;
    }
    
    // ========================================
    // GESTIONE EVOCAZIONE - MOUSE DOWN
    // Determina il tipo di evocazione in base a dove si clicca
    // ========================================
    handleSummonMouseDown(x, y) {
        const mage = this.game.mage;
        if (!mage || !mage.isAlive()) return;

        // Calcola distanza dal mago
        const distFromMage = Utils.distance(mage.x, mage.y, x, y);
        const summonRange = CONFIG.SUMMON_RANGE * CONFIG.TILE_SIZE;

        // ------------------------------
        // CASO A: Click su una torre o muro (qualsiasi distanza)
        // La creatura viene evocata accanto al mago e attacca il bersaglio
        // ------------------------------
        const clickedTower = this.game.getTowerAt(x, y);
        if (clickedTower) {
            this.game.summonCreatureWithTarget(this.pendingSummonType, clickedTower);
            this.cancelSummonMode();
            return;
        }

        const clickedWall = this.game.getWallAt(x, y);
        if (clickedWall) {
            this.game.summonCreatureWithTarget(this.pendingSummonType, clickedWall);
            this.cancelSummonMode();
            return;
        }
        
        // ------------------------------
        // CASO B: Click fuori dal raggio di evocazione (e non su torre)
        // Annulla l'evocazione
        // ------------------------------
        if (distFromMage > summonRange) {
            GameLog.log('Fuori dal raggio di evocazione - annullato');
            this.cancelSummonMode();
            return;
        }
        
        // ------------------------------
        // CASO C: Click dentro il raggio di evocazione
        // Salva il punto di spawn (dove è stato fatto il click)
        // e inizia la fase "indica direzione"
        // ------------------------------
        this.summonPhase = 'aiming';
        // Il punto di spawn è dove l'utente ha cliccato
        this.summonSpawnPoint = { x, y };
        // Per il rendering della freccia, partiamo dal punto di spawn
        this.game.summonAimStart = { x, y };
        this.game.summonAimEnd = { x, y };
    }
    
    // ========================================
    // COMPLETA EVOCAZIONE CON DIREZIONE
    // Chiamato al rilascio del mouse dopo il drag
    // ========================================
    completeSummonWithDirection(x, y) {
        const mage = this.game.mage;
        if (!mage || !mage.isAlive()) return;
        if (!this.summonSpawnPoint) return;
        
        // Calcola la distanza del drag dal punto di spawn
        const dx = x - this.summonSpawnPoint.x;
        const dy = y - this.summonSpawnPoint.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // ------------------------------
        // CASO A: Drag troppo corto (semplice click)
        // Evoca la creatura in stato IDLE nel punto di spawn
        // ------------------------------
        if (dist < 20) {
            this.game.summonCreatureIdle(
                this.pendingSummonType, 
                this.summonSpawnPoint.x, 
                this.summonSpawnPoint.y
            );
            this.cancelSummonMode();
            return;
        }
        
        // ------------------------------
        // CASO B: Drag significativo
        // Evoca la creatura nel punto di spawn con direzione
        // ------------------------------
        const direction = { x: dx / dist, y: dy / dist };
        
        this.game.summonCreatureWithDirection(
            this.pendingSummonType, 
            direction,
            this.summonSpawnPoint.x,
            this.summonSpawnPoint.y
        );
        this.cancelSummonMode();
    }
    
    // ========================================
    // ANNULLA MODALITÀ EVOCAZIONE
    // ========================================
    cancelSummonMode() {
        this.pendingSummonType = null;
        this.summonPhase = null;
        this.summonDragStart = null;
        this.summonSpawnPoint = null;  // Reset punto di spawn
        this.game.summonAimStart = null;
        this.game.summonAimEnd = null;
        this.game.updateSummonButtons();
    }
    
    // ========================================
    // ATTIVA MODALITÀ EVOCAZIONE
    // ========================================
    activateSummonMode(creatureType) {
        // Verifica se il mago ha abbastanza mana
        const stats = CreatureTypes[creatureType];
        const totalCost = stats.manaCost * stats.spawnCount;
        
        if (!this.game.mage || this.game.mage.mana < totalCost) {
            GameLog.log('Mana insufficiente per evocare');
            return;
        }
        
        // Se era già selezionato questo tipo, deseleziona
        if (this.pendingSummonType === creatureType) {
            this.cancelSummonMode();
            return;
        }
        
        // Attiva modalità evocazione
        this.pendingSummonType = creatureType;
        this.game.selectedSpell = null; // Deseleziona incantesimi
        this.game.updateSpellButtons();
        this.game.updateSummonButtons();
        
        GameLog.log(`Modalità evocazione: ${stats.name} - Click destro per evocare`);
    }
    
    // ========================================
    // GESTIONE TASTIERA
    // ========================================
    handleKeyDown(e) {
        // Traccia lo stato di Shift
        if (e.key === 'Shift') {
            this.shiftPressed = true;
        }

        switch (e.key.toLowerCase()) {
            // Incantesimi
            case '1':
                this.cancelSummonMode(); // Annulla evocazione se attiva
                this.game.selectSpell('FIREBALL');
                break;
            case '2':
                this.cancelSummonMode();
                this.game.selectSpell('SHIELD');
                break;
                
            // Evocazioni - ora attivano la modalità invece di evocare subito
            case 'q':
                this.game.selectedSpell = null;
                this.activateSummonMode('LARVA');
                break;
            case 'w':
                this.game.selectedSpell = null;
                this.activateSummonMode('GIANT');
                break;
            case 'e':
                this.game.selectedSpell = null;
                this.activateSummonMode('ELEMENTAL');
                break;
                
            // Utility
            case 'r':
                this.cancelSummonMode();
                this.selectedCreature = null;
                this.game.selectedCreature = null;
                this.game.restart();
                break;
            case 'd':
                this.game.toggleDangerView();
                break;
            case 't':
                this.game.toggleTowerRanges();
                break;
            case 'escape':
                // ESC annulla tutto
                this.cancelSummonMode();
                this.selectedCreature = null;
                this.game.selectedCreature = null;
                this.game.selectedSpell = null;
                this.game.updateSpellButtons();
                break;
        }
    }

    handleKeyUp(e) {
        // Traccia lo stato di Shift
        if (e.key === 'Shift') {
            this.shiftPressed = false;
        }
    }

    setupUIButtons() {
        // Bottoni incantesimi
        document.querySelectorAll('.spell-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.cancelSummonMode();
                const spellType = btn.dataset.spell.toUpperCase();
                this.game.selectSpell(spellType);
            });
        });
        
        // Bottoni evocazioni - ora attivano la modalità
        document.querySelectorAll('.summon-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.game.selectedSpell = null;
                const summonType = btn.dataset.summon.toUpperCase();
                this.activateSummonMode(summonType);
            });
        });
        
        // Bottone restart
        document.getElementById('btn-restart').addEventListener('click', () => {
            this.cancelSummonMode();
            this.selectedCreature = null;
            this.game.restart();
        });
    }
}
