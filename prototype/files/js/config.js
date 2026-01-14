// ============================================
// CONFIGURAZIONE GIOCO - Tower Attack Prototype
// ============================================

const CONFIG = {
    // Dimensioni griglia
    GRID_WIDTH: 20,
    GRID_HEIGHT: 15,
    TILE_SIZE: 40,
    
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
    }
};

// Definizione Torri difensive
const TowerTypes = {
    GUARD_TOWER: {
        name: 'Torre di Guardia',
        hp: 100,
        damage: 10,
        attackSpeed: 1.0,   // colpi/secondo
        range: 4,           // celle
        targetingLogic: 'PROXIMITY',  // Attacca il più vicino
        projectileSpeed: 300,
        color: '#c0392b',
        attackColor: '#e74c3c'
    },
    BALLISTA: {
        name: 'Balista',
        hp: 150,
        damage: 50,
        attackSpeed: 0.2,   // Un colpo ogni 5 secondi
        range: 6,
        targetingLogic: 'HIGH_VALUE', // Attacca il più costoso
        projectileSpeed: 400,
        color: '#2c3e50',
        attackColor: '#34495e'
    }
};

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
    DEAD: 'DEAD'
};
