// ============================================
// INPUT HANDLER - Sistema di controllo
// ============================================
// SCHEMA CONTROLLI:
// - Click Sinistro: Selezione (unità, strutture, UI)
// - Click Destro: Azione/Ordine (muovi, attacca, conferma spell)
// - Click Centrale (drag): Scrolla la mappa
// - Hotkey Q/W/E: Preparazione evocazioni
// - Hotkey 1/2: Preparazione incantesimi
// - A + Click Destro: Attack-Move
// - Shift + Click Destro: Forced Move (ignora minacce)
// - ESC: Annulla/Deseleziona
// - Spazio: Snap camera sul mago
// ============================================

// Tipi di ordine per le creature
const OrderType = {
    MOVE: 'MOVE',           // Muovi verso punto, reagisce se attaccato
    ATTACK_MOVE: 'ATTACK_MOVE',  // Muovi e attacca nemici sul percorso
    FORCED_MOVE: 'FORCED_MOVE'   // Ignora tutto fino a destinazione
};

class InputHandler {
    constructor(game) {
        this.game = game;

        // ========================================
        // STATO TASTI MODIFICATORI
        // ========================================
        this.shiftPressed = false;
        this.aKeyPressed = false;  // Per Attack-Move
        this.spacePressed = false; // Per camera snap

        // ========================================
        // STATO PREPARAZIONE (Ghost & Click)
        // ========================================
        // Tipo di azione in preparazione: null, 'SPELL', 'SUMMON'
        this.preparationType = null;
        // Tipo specifico (es. 'FIREBALL', 'LARVA')
        this.preparedAction = null;

        // ========================================
        // STATO EVOCAZIONE (drag per direzione)
        // ========================================
        this.summonDragStart = null;
        this.summonSpawnPoint = null;
        this.isDraggingSummon = false;

        // ========================================
        // SELEZIONE
        // ========================================
        this.selectedCreature = null;
        this.selectedStructure = null;  // Per mostrare info struttura

        // ========================================
        // CAMERA EDGE SCROLLING
        // ========================================
        this.edgeScrollSpeed = 400;  // pixel/secondo
        this.edgeScrollMargin = 30;  // pixel dal bordo
        this.isEdgeScrolling = false;
        this.edgeScrollDir = { x: 0, y: 0 };

        // ========================================
        // CAMERA MIDDLE MOUSE DRAG
        // ========================================
        this.isMiddleMouseDragging = false;
        this.middleMouseDragStart = null;  // Posizione mouse all'inizio del drag
        this.cameraStartPos = null;        // Posizione camera all'inizio del drag

        this.setupEventListeners();
    }

    // ========================================
    // HELPER: Coordinate canvas (schermo)
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
    // HELPER: Coordinate mondo
    // ========================================
    getWorldCoords(screenX, screenY) {
        return this.game.camera.screenToWorld(screenX, screenY);
    }

    // ========================================
    // SETUP EVENT LISTENERS
    // ========================================
    setupEventListeners() {
        const canvas = this.game.canvas;

        // Mouse Move - aggiorna posizione e edge scrolling
        canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));

        // Mouse Leave - ferma edge scrolling e middle drag
        canvas.addEventListener('mouseleave', () => {
            this.isEdgeScrolling = false;
            this.edgeScrollDir = { x: 0, y: 0 };
            this.isMiddleMouseDragging = false;
            this.middleMouseDragStart = null;
            this.cameraStartPos = null;
        });

        // Click Sinistro - Selezione
        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.handleLeftMouseDown(e);
        });

        canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.handleLeftMouseUp(e);
        });

        // Click Destro - Azione
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.handleRightMouseDown(e);
        });

        canvas.addEventListener('mouseup', (e) => {
            if (e.button === 2) this.handleRightMouseUp(e);
        });

        // Click Centrale - Camera Drag
        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 1) {
                e.preventDefault();
                this.handleMiddleMouseDown(e);
            }
        });

        canvas.addEventListener('mouseup', (e) => {
            if (e.button === 1) this.handleMiddleMouseUp(e);
        });

        // Tastiera
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));

        // UI Buttons
        this.setupUIButtons();
    }

    // ========================================
    // MOUSE MOVE
    // ========================================
    handleMouseMove(e) {
        const screenCoords = this.getCanvasCoords(e);

        // Middle mouse drag per scrollare la mappa
        if (this.isMiddleMouseDragging && this.middleMouseDragStart) {
            const dx = screenCoords.x - this.middleMouseDragStart.x;
            const dy = screenCoords.y - this.middleMouseDragStart.y;
            this.game.camera.x = this.cameraStartPos.x - dx;
            this.game.camera.y = this.cameraStartPos.y - dy;
            this.game.camera.clampToBounds();
        }

        const worldCoords = this.getWorldCoords(screenCoords.x, screenCoords.y);

        // Salva coordinate
        this.game.mouseX = screenCoords.x;
        this.game.mouseY = screenCoords.y;
        this.game.worldMouseX = worldCoords.x;
        this.game.worldMouseY = worldCoords.y;

        // Edge scrolling (solo se camera non segue mago e non in middle drag)
        if (!this.spacePressed && !this.isMiddleMouseDragging) {
            this.updateEdgeScrolling(screenCoords.x, screenCoords.y);
        }

        // Aggiorna freccia direzione durante drag evocazione
        if (this.isDraggingSummon && this.summonSpawnPoint) {
            this.game.summonAimEnd = { x: worldCoords.x, y: worldCoords.y };
        }
    }

    // ========================================
    // EDGE SCROLLING
    // ========================================
    updateEdgeScrolling(screenX, screenY) {
        const margin = this.edgeScrollMargin;
        const vw = this.game.viewportWidth;
        const vh = this.game.viewportHeight;

        let dx = 0, dy = 0;

        if (screenX < margin) dx = -1;
        else if (screenX > vw - margin) dx = 1;

        if (screenY < margin) dy = -1;
        else if (screenY > vh - margin) dy = 1;

        this.edgeScrollDir = { x: dx, y: dy };
        this.isEdgeScrolling = (dx !== 0 || dy !== 0);
    }

    // Chiamato dal game loop per applicare edge scrolling
    applyEdgeScrolling(dt) {
        if (!this.isEdgeScrolling || this.spacePressed) return;

        const speed = this.edgeScrollSpeed * dt;
        this.game.camera.x += this.edgeScrollDir.x * speed;
        this.game.camera.y += this.edgeScrollDir.y * speed;
        this.game.camera.clampToBounds();
    }

    // ========================================
    // CLICK SINISTRO - SELEZIONE
    // ========================================
    handleLeftMouseDown(e) {
        if (this.game.state !== 'playing') return;

        const screenCoords = this.getCanvasCoords(e);
        const worldCoords = this.getWorldCoords(screenCoords.x, screenCoords.y);

        // Click sulla minimappa: sposta la camera
        if (this.game.handleMinimapClick(screenCoords.x, screenCoords.y)) {
            return;
        }

        // Se c'è una preparazione attiva, click sinistro la annulla
        if (this.preparationType) {
            this.cancelPreparation();
            return;
        }

        // Prova a selezionare una creatura
        const clickedCreature = this.game.getCreatureAt(worldCoords.x, worldCoords.y);
        if (clickedCreature) {
            this.selectCreature(clickedCreature);
            return;
        }

        // Prova a selezionare una struttura (per info)
        const clickedStructure = this.game.getStructureAt(worldCoords.x, worldCoords.y);
        if (clickedStructure) {
            this.selectStructure(clickedStructure);
            return;
        }

        // Click su terreno vuoto - deseleziona tutto
        this.deselectAll();
    }

    handleLeftMouseUp(e) {
        // Nessuna azione speciale su mouse up sinistro
    }

    // ========================================
    // CLICK DESTRO - AZIONE/ORDINE
    // ========================================
    handleRightMouseDown(e) {
        if (this.game.state !== 'playing') return;

        const screenCoords = this.getCanvasCoords(e);
        const worldCoords = this.getWorldCoords(screenCoords.x, screenCoords.y);

        // ----------------------------------------
        // CASO 1: Spell in preparazione
        // ----------------------------------------
        if (this.preparationType === 'SPELL') {
            this.executeSpell(worldCoords.x, worldCoords.y);
            return;
        }

        // ----------------------------------------
        // CASO 2: Evocazione in preparazione
        // ----------------------------------------
        if (this.preparationType === 'SUMMON') {
            this.startSummon(worldCoords.x, worldCoords.y);
            return;
        }

        // ----------------------------------------
        // CASO 3: Creatura selezionata - impartisci ordine
        // ----------------------------------------
        if (this.selectedCreature && this.selectedCreature.isAlive()) {
            this.issueCreatureOrder(worldCoords.x, worldCoords.y);
            return;
        }

        // ----------------------------------------
        // CASO 4: Nessuna selezione - muovi il mago
        // ----------------------------------------
        if (this.game.mage && this.game.mage.isAlive()) {
            this.game.moveMage(worldCoords.x, worldCoords.y);
        }
    }

    handleRightMouseUp(e) {
        if (this.game.state !== 'playing') return;

        const screenCoords = this.getCanvasCoords(e);
        const worldCoords = this.getWorldCoords(screenCoords.x, screenCoords.y);

        // Completa evocazione con direzione
        if (this.isDraggingSummon && this.preparationType === 'SUMMON') {
            this.completeSummon(worldCoords.x, worldCoords.y);
        }
    }

    // ========================================
    // CLICK CENTRALE - CAMERA DRAG
    // ========================================
    handleMiddleMouseDown(e) {
        const screenCoords = this.getCanvasCoords(e);
        this.isMiddleMouseDragging = true;
        this.middleMouseDragStart = { x: screenCoords.x, y: screenCoords.y };
        this.cameraStartPos = { x: this.game.camera.x, y: this.game.camera.y };
    }

    handleMiddleMouseUp(e) {
        this.isMiddleMouseDragging = false;
        this.middleMouseDragStart = null;
        this.cameraStartPos = null;
    }

    // ========================================
    // SELEZIONE
    // ========================================
    selectCreature(creature) {
        this.selectedCreature = creature;
        this.selectedStructure = null;
        this.game.selectedCreature = creature;
        GameLog.log(`Selezionata: ${creature.name}`);
    }

    selectStructure(structure) {
        this.selectedStructure = structure;
        this.selectedCreature = null;
        this.game.selectedCreature = null;
        GameLog.log(`Struttura: ${structure.name} (HP: ${structure.hp}/${structure.maxHp})`);
    }

    deselectAll() {
        this.selectedCreature = null;
        this.selectedStructure = null;
        this.game.selectedCreature = null;
    }

    // ========================================
    // ORDINI CREATURE
    // ========================================
    issueCreatureOrder(x, y) {
        const creature = this.selectedCreature;
        if (!creature || !creature.isAlive()) return;

        // Determina tipo di ordine
        let orderType = OrderType.MOVE;
        if (this.aKeyPressed) {
            orderType = OrderType.ATTACK_MOVE;
        } else if (this.shiftPressed) {
            orderType = OrderType.FORCED_MOVE;
        }

        // Verifica se c'è un target sotto il click
        const clickedStructure = this.game.getStructureAt(x, y);

        if (clickedStructure) {
            // Ordine di attacco diretto
            creature.setAttackTarget(clickedStructure, this.game.map, this.game.pathfinder);
            GameLog.log(`${creature.name} attacca ${clickedStructure.name}`);
        } else {
            // Ordine di movimento
            creature.setMoveOrder(x, y, orderType, this.game.map, this.game.pathfinder);
            const orderName = {
                [OrderType.MOVE]: 'Movimento',
                [OrderType.ATTACK_MOVE]: 'Attack-Move',
                [OrderType.FORCED_MOVE]: 'Forced Move'
            };
            GameLog.log(`${creature.name}: ${orderName[orderType]}`);
        }
    }

    // ========================================
    // PREPARAZIONE (Ghost & Click)
    // ========================================
    prepareSpell(spellType) {
        const spell = SpellTypes[spellType];
        if (!spell) return;

        // Verifica mana
        if (!this.game.mage || this.game.mage.mana < spell.manaCost) {
            GameLog.log('Mana insufficiente');
            return;
        }

        this.preparationType = 'SPELL';
        this.preparedAction = spellType;
        this.game.selectedSpell = spellType;
        this.game.updateSpellButtons();
        GameLog.log(`Preparando: ${spell.name} - Click destro per lanciare`);
    }

    prepareSummon(creatureType) {
        const stats = CreatureTypes[creatureType];
        if (!stats) return;

        const totalCost = stats.manaCost * stats.spawnCount;
        if (!this.game.mage || this.game.mage.mana < totalCost) {
            GameLog.log('Mana insufficiente');
            return;
        }

        this.preparationType = 'SUMMON';
        this.preparedAction = creatureType;
        this.game.updateSummonButtons();
        GameLog.log(`Preparando: ${stats.name} - Click destro per evocare`);
    }

    cancelPreparation() {
        this.preparationType = null;
        this.preparedAction = null;
        this.isDraggingSummon = false;
        this.summonDragStart = null;
        this.summonSpawnPoint = null;
        this.game.summonAimStart = null;
        this.game.summonAimEnd = null;
        this.game.selectedSpell = null;
        this.game.updateSpellButtons();
        this.game.updateSummonButtons();
    }

    // ========================================
    // ESECUZIONE SPELL
    // ========================================
    executeSpell(x, y) {
        const mage = this.game.mage;
        if (!mage || !mage.isAlive()) return;

        const spell = SpellTypes[this.preparedAction];
        const range = spell.castRange * CONFIG.TILE_SIZE;
        const dist = Utils.distance(mage.x, mage.y, x, y);

        // Verifica range
        if (range > 0 && dist > range) {
            GameLog.log('Fuori portata!');
            return;
        }

        // Lancia spell
        this.game.castSpell(x, y);
        this.cancelPreparation();
    }

    // ========================================
    // EVOCAZIONE
    // ========================================
    startSummon(x, y) {
        const mage = this.game.mage;
        if (!mage || !mage.isAlive()) return;

        const summonRange = CONFIG.SUMMON_RANGE * CONFIG.TILE_SIZE;
        const dist = Utils.distance(mage.x, mage.y, x, y);

        // Click su struttura = evoca e attacca
        const clickedStructure = this.game.getStructureAt(x, y);
        if (clickedStructure) {
            this.game.summonCreatureWithTarget(this.preparedAction, clickedStructure);
            this.cancelPreparation();
            return;
        }

        // Fuori range
        if (dist > summonRange) {
            GameLog.log('Fuori dal raggio di evocazione');
            return;
        }

        // Inizia drag per direzione
        this.isDraggingSummon = true;
        this.summonSpawnPoint = { x, y };
        this.game.summonAimStart = { x, y };
        this.game.summonAimEnd = { x, y };
    }

    completeSummon(x, y) {
        if (!this.summonSpawnPoint) {
            this.cancelPreparation();
            return;
        }

        const dx = x - this.summonSpawnPoint.x;
        const dy = y - this.summonSpawnPoint.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Drag corto = evoca in IDLE
        if (dist < 20) {
            this.game.summonCreatureIdle(
                this.preparedAction,
                this.summonSpawnPoint.x,
                this.summonSpawnPoint.y
            );
        } else {
            // Drag lungo = evoca con direzione
            const direction = { x: dx / dist, y: dy / dist };
            this.game.summonCreatureWithDirection(
                this.preparedAction,
                direction,
                this.summonSpawnPoint.x,
                this.summonSpawnPoint.y
            );
        }

        this.cancelPreparation();
    }

    // ========================================
    // TASTIERA
    // ========================================
    handleKeyDown(e) {
        const key = e.key.toLowerCase();

        // Modificatori
        if (e.key === 'Shift') this.shiftPressed = true;
        if (key === 'a') this.aKeyPressed = true;
        if (e.code === 'Space') {
            this.spacePressed = true;
            // Snap camera sul mago
            if (this.game.mage) {
                this.game.camera.centerOn(this.game.mage.x, this.game.mage.y);
            }
            e.preventDefault();
        }

        switch (key) {
            // Incantesimi
            case '1':
                this.cancelPreparation();
                this.prepareSpell('FIREBALL');
                break;
            case '2':
                this.cancelPreparation();
                this.prepareSpell('SHIELD');
                break;

            // Evocazioni
            case 'q':
                this.cancelPreparation();
                this.prepareSummon('LARVA');
                break;
            case 'w':
                this.cancelPreparation();
                this.prepareSummon('GIANT');
                break;
            case 'e':
                this.cancelPreparation();
                this.prepareSummon('ELEMENTAL');
                break;

            // ESC - Annulla tutto
            case 'escape':
                this.cancelPreparation();
                this.deselectAll();
                break;

            // Utility
            case 'r':
                this.cancelPreparation();
                this.deselectAll();
                this.game.restart();
                break;
            case 'd':
                this.game.toggleDangerView();
                break;
            case 't':
                this.game.toggleTowerRanges();
                break;
        }
    }

    handleKeyUp(e) {
        if (e.key === 'Shift') this.shiftPressed = false;
        if (e.key.toLowerCase() === 'a') this.aKeyPressed = false;
        if (e.code === 'Space') this.spacePressed = false;
    }

    // ========================================
    // UI BUTTONS
    // ========================================
    setupUIButtons() {
        // Bottoni incantesimi
        document.querySelectorAll('.spell-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.cancelPreparation();
                const spellType = btn.dataset.spell.toUpperCase();
                this.prepareSpell(spellType);
            });
        });

        // Bottoni evocazioni
        document.querySelectorAll('.summon-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.cancelPreparation();
                const summonType = btn.dataset.summon.toUpperCase();
                this.prepareSummon(summonType);
            });
        });

        // Bottone restart
        document.getElementById('btn-restart').addEventListener('click', () => {
            this.cancelPreparation();
            this.deselectAll();
            this.game.restart();
        });
    }

    // ========================================
    // GETTER per lo stato di preparazione
    // (usato per rendering ghost preview)
    // ========================================
    get pendingSummonType() {
        return this.preparationType === 'SUMMON' ? this.preparedAction : null;
    }

    // ========================================
    // VERIFICA SE PUNTO E' VALIDO PER AZIONE
    // (usato per rendering preview)
    // ========================================
    isValidActionPoint(x, y) {
        const mage = this.game.mage;
        if (!mage) return false;

        if (this.preparationType === 'SPELL') {
            const spell = SpellTypes[this.preparedAction];
            if (!spell) return false;
            const range = spell.castRange * CONFIG.TILE_SIZE;
            if (range === 0) return true;  // Self-cast
            return Utils.distance(mage.x, mage.y, x, y) <= range;
        }

        if (this.preparationType === 'SUMMON') {
            const summonRange = CONFIG.SUMMON_RANGE * CONFIG.TILE_SIZE;
            return Utils.distance(mage.x, mage.y, x, y) <= summonRange;
        }

        return true;
    }
}
