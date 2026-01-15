// ============================================
// CONFIGURAZIONE GIOCO - Tower Attack Prototype
// ============================================

const CONFIG = {
    // Dimensioni griglia (default, può essere sovrascritto dal livello)
    GRID_WIDTH: 20,
    GRID_HEIGHT: 15,
    TILE_SIZE: 40,

    // Dimensioni viewport (canvas visibile)
    // Il viewport è la "finestra" attraverso cui vediamo il mondo
    VIEWPORT_WIDTH: 800,   // 20 tiles * 40px
    VIEWPORT_HEIGHT: 600,  // 15 tiles * 40px
    
    // Risorse iniziali
    STARTING_MANA: 100,
    MANA_REGEN: 0.5,  // Mana rigenerato per secondo (basso, per forzare raccolta anime)
    
    // ========================================
    // RAGGIO DI EVOCAZIONE
    // Distanza massima dal mago entro cui si possono evocare creature (in celle)
    // ========================================
    SUMMON_RANGE: 3,
    
    // ========================================
    // RAGGIO DI VISTA CREATURE
    // Distanza entro cui le creature rilevano automaticamente le torri (in celle)
    // ========================================
    CREATURE_SIGHT_RANGE: 5,
    
    // Mago
    MAGE: {
        hp: 100,
        speed: 80,          // pixel/secondo
        intelligence: 1.0,  // Evita i pericoli al massimo
        attackRange: 2,     // celle
        color: '#9b59b6'
    },
    
    // Velocità di gioco
    TARGET_FPS: 60
};

// Tipi di terreno
const Tile = {
    GRASS: 0,
    MUD: 1,
    WALL: 2,
    WATER: 3,
    FROZEN_WATER: 4,
    DIRT: 5,
    FOREST: 6,
    TREASURE: 7  // Obiettivo finale
};

// Proprietà dei terreni
const TileProps = {
    [Tile.GRASS]:        { walkable: true,  speedMult: 1.0, cost: 10,       color: '#7cfc00', name: 'Erba' },
    [Tile.MUD]:          { walkable: true,  speedMult: 0.5, cost: 20,       color: '#8b4513', name: 'Fango' },
    [Tile.WALL]:         { walkable: false, speedMult: 0,   cost: Infinity, color: '#555555', name: 'Muro' },
    [Tile.WATER]:        { walkable: false, speedMult: 0,   cost: Infinity, color: '#00bfff', name: 'Acqua' },
    [Tile.FROZEN_WATER]: { walkable: true,  speedMult: 1.2, cost: 8,        color: '#afeeee', name: 'Ghiaccio' },
    [Tile.DIRT]:         { walkable: true,  speedMult: 1.0, cost: 10,       color: '#deb887', name: 'Terra' },
    [Tile.FOREST]:       { walkable: false, speedMult: 0,   cost: Infinity, color: '#228b22', name: 'Foresta', burnable: true },
    [Tile.TREASURE]:     { walkable: true,  speedMult: 1.0, cost: 1,        color: '#ffd700', name: 'Tesoro' }
};

// Definizione Creature evocabili
const CreatureTypes = {
    LARVA: {
        name: 'Larva',
        hp: 10,
        damage: 2,
        attackSpeed: 1.0,   // attacchi/secondo
        speed: 120,         // pixel/secondo
        manaCost: 1,        // Costo per singola larva (ne appaiono 5)
        spawnCount: 5,      // Quante ne appaiono
        intelligence: 0.0,  // Ignora i pericoli
        color: '#adff2f',
        radius: 6,
        armorPiercing: false
    },
    GIANT: {
        name: 'Gigante',
        hp: 300,
        damage: 40,
        attackSpeed: 0.5,
        speed: 40,
        manaCost: 15,
        spawnCount: 1,
        intelligence: 0.2,  // Quasi ignora i pericoli
        color: '#8b4513',
        radius: 16,
        armorPiercing: true,
        armorReduction: 0.5  // Riduce danno frecce del 50%
    },
    ELEMENTAL: {
        name: 'Elementale',
        hp: 80,
        damage: 25,
        attackSpeed: 1.5,   // Attacca velocemente
        speed: 100,         // Veloce
        manaCost: 10,
        spawnCount: 2,      // Ne appaiono 2
        intelligence: 0.8,  // Evita bene i pericoli
        color: '#00ffff',   // Ciano/azzurro
        radius: 10,
        armorPiercing: false,
        magicDamage: true   // Danno magico (per future espansioni)
    }
};

// Definizione Strutture difensive (torri e mura)
const StructureTypes = {
    // ========================================
    // TORRI - Strutture con attacco ranged
    // ========================================
    GUARD_TOWER: {
        name: 'Torre di Guardia',
        hp: 100,
        rangedDamage: 10,       // Danno proiettili
        meleeDamage: 0,         // Nessun danno melee
        attackSpeed: 1.0,       // colpi/secondo (ranged)
        meleeAttackSpeed: 0,    // Nessun attacco melee
        range: 4,               // celle
        targetingLogic: 'PROXIMITY',
        projectileSpeed: 300,
        color: '#c0392b',
        attackColor: '#e74c3c',
        isWall: false
    },
    BALLISTA: {
        name: 'Balista',
        hp: 150,
        rangedDamage: 50,
        meleeDamage: 0,
        attackSpeed: 0.2,       // Un colpo ogni 5 secondi
        meleeAttackSpeed: 0,
        range: 6,
        targetingLogic: 'HIGH_VALUE',
        projectileSpeed: 400,
        color: '#2c3e50',
        attackColor: '#34495e',
        isWall: false
    },
    // ========================================
    // MURA - Strutture difensive passive
    // ========================================
    WALL: {
        name: 'Muro',
        hp: 50,
        rangedDamage: 0,
        meleeDamage: 0,
        attackSpeed: 0,
        meleeAttackSpeed: 0,
        range: 0,
        targetingLogic: null,
        projectileSpeed: 0,
        color: '#555555',
        attackColor: null,
        isWall: true
    },
    // ========================================
    // MURA PRESIDIATE - Strutture difensive attive
    // HP molto più alti, attacco più basso delle torri
    // Attacco ranged (arcieri) + melee (olio bollente)
    // ========================================
    GARRISONED_WALL: {
        name: 'Muro Presidiato',
        hp: 200,                // HP molto più alti
        rangedDamage: 5,        // Arcieri - danno basso
        meleeDamage: 15,        // Olio bollente - danno più alto a creature vicine
        attackSpeed: 0.8,       // Arcieri sparano leggermente più lenti
        meleeAttackSpeed: 0.5,  // Olio ogni 2 secondi
        range: 3,               // Range più corto delle torri
        meleeRange: 1,          // Range melee: 1 cella
        targetingLogic: 'PROXIMITY',
        projectileSpeed: 250,
        color: '#666666',
        attackColor: '#888888',
        meleeColor: '#ff8c00',  // Arancione per olio bollente
        isWall: true
    }
};

// Alias per retrocompatibilità
const TowerTypes = StructureTypes;

// Definizione Incantesimi
const SpellTypes = {
    FIREBALL: {
        name: 'Palla di Fuoco',
        manaCost: 10,
        damage: 100,
        radius: 1.5,        // celle di raggio
        castRange: 4,       // celle
        castTime: 0.3,      // secondi
        color: '#ff4500',
        effectColor: '#ff6347'
    },
    SHIELD: {
        name: 'Scudo',
        manaCost: 5,
        shieldAmount: 50,
        duration: 5,        // secondi
        castRange: 0,       // su se stesso
        castTime: 0.1,
        color: '#00bfff',
        effectColor: '#87ceeb'
    }
};

// Logiche di targeting delle torri
const TargetingLogic = {
    PROXIMITY: 'PROXIMITY',       // Più vicino
    HIGH_VALUE: 'HIGH_VALUE',     // Più costoso in mana
    LOW_HP: 'LOW_HP',            // Meno HP
    RANDOM: 'RANDOM'             // Casuale
};

// Stati delle entità
const EntityState = {
    IDLE: 'IDLE',
    MOVING: 'MOVING',
    ATTACKING: 'ATTACKING',
    CASTING: 'CASTING',
    DEAD: 'DEAD',
    CLEAR_LINE_PATH: 'CLEAR_LINE_PATH'  // Creatura sta abbattendo ostacolo per raggiungere il target originale
};
