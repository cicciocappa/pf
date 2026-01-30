// ========================================
// Configurazione e costanti di gioco
// ========================================

// --- Tile ---
export const TILE_SIZE = 1.0; // 1 unità mondo = 1 tile

export const Tile = {
    GRASS: 0,
    MUD: 1,
    WALL: 2,
    WATER: 3,
    FROZEN_WATER: 4,
    DIRT: 5,
    FOREST: 6,
};

export const TileProps = {
    [Tile.GRASS]:        { walkable: true,  speedMult: 1.0, cost: 10,       color: 0x7cfc00 },
    [Tile.MUD]:          { walkable: true,  speedMult: 0.5, cost: 20,       color: 0x8b4513 },
    [Tile.WALL]:         { walkable: false, speedMult: 0,   cost: Infinity, color: 0x808080 },
    [Tile.WATER]:        { walkable: false, speedMult: 0,   cost: Infinity, color: 0x00bfff },
    [Tile.FROZEN_WATER]: { walkable: true,  speedMult: 1.2, cost: 8,        color: 0xafeeee },
    [Tile.DIRT]:         { walkable: true,  speedMult: 1.0, cost: 10,       color: 0xdeb887 },
    [Tile.FOREST]:       { walkable: false, speedMult: 0,   cost: Infinity, color: 0x228b22 },
};

// --- Entity States ---
export const EntityState = {
    IDLE: 'IDLE',
    MOVING: 'MOVING',
    ATTACKING: 'ATTACKING',
    DEAD: 'DEAD',
    CASTING: 'CASTING',
};

// --- Creature Types ---
export const CreatureType = {
    GIANT: 'GIANT',
    LARVA: 'LARVA',
    ELEMENTAL: 'ELEMENTAL',
};

export const CreatureStats = {
    [CreatureType.GIANT]: {
        hp: 300,
        speed: 1.5,       // tiles/sec
        radius: 0.4,
        damage: 25,
        attackRange: 1.2,
        attackCooldown: 2.0,
        manaCost: 15,
        intelligence: 0.2,
        color: 0x8B6914,
        label: 'Gigante',
    },
    [CreatureType.LARVA]: {
        hp: 10,
        speed: 4.0,
        radius: 0.15,
        damage: 2,
        attackRange: 0.8,
        attackCooldown: 1.0,
        manaCost: 1,
        intelligence: 0.0,
        spawnCount: 5,      // ne appaiono 5 alla volta
        color: 0x9ACD32,
        label: 'Larva',
    },
    [CreatureType.ELEMENTAL]: {
        hp: 80,
        speed: 2.5,
        radius: 0.3,
        damage: 10,
        attackRange: 1.5,
        attackCooldown: 1.5,
        manaCost: 8,
        intelligence: 0.7,
        color: 0x00CED1,
        label: 'Elementale',
    },
};

// --- Wizard ---
export const WizardStats = {
    hp: 100,
    speed: 3.0,
    radius: 0.25,
    manaMax: 100,
    manaStart: 50,
    manaRegenRate: 1,    // mana/sec
    color: 0x4169E1,
};

// --- Tower Types ---
export const TowerType = {
    GUARD: 'GUARD',
    BALLISTA: 'BALLISTA',
    ALCHEMICAL: 'ALCHEMICAL',
};

export const TowerTargeting = {
    PROXIMITY: 'PROXIMITY',
    PRIORITY: 'PRIORITY',
    HIGH_VALUE: 'HIGH_VALUE',
};

export const TowerStats = {
    [TowerType.GUARD]: {
        hp: 100,
        damage: 10,
        range: 5.0,
        fireRate: 1.0,     // colpi/sec
        targeting: TowerTargeting.PROXIMITY,
        projectileSpeed: 8.0,
        color: 0xA0A0A0,
        label: 'Torre di Guardia',
    },
    [TowerType.BALLISTA]: {
        hp: 150,
        damage: 50,
        range: 7.0,
        fireRate: 0.2,
        targeting: TowerTargeting.HIGH_VALUE,
        projectileSpeed: 12.0,
        color: 0x8B0000,
        label: 'Balista',
    },
    [TowerType.ALCHEMICAL]: {
        hp: 80,
        damage: 15,
        range: 3.5,
        fireRate: 0.5,
        targeting: TowerTargeting.PRIORITY,
        projectileSpeed: 5.0,
        aoeRadius: 1.5,
        color: 0x800080,
        label: 'Torre Alchemica',
    },
};

// --- Spells ---
export const SpellType = {
    FIREBALL: 'FIREBALL',
};

export const SpellStats = {
    [SpellType.FIREBALL]: {
        manaCost: 10,
        damage: 100,
        range: 5.0,
        cooldown: 3.0,
        aoeRadius: 1.0,
        projectileSpeed: 6.0,
        color: 0xFF4500,
        label: 'Palla di Fuoco',
        key: '1',
    },
};

// --- Defender (enemy troops from barracks) ---
export const DefenderStats = {
    hp: 40,
    speed: 2.0,
    radius: 0.2,
    damage: 8,
    attackRange: 0.8,
    attackCooldown: 1.2,
    chaseRange: 6.0,
    color: 0xCC0000,
};
