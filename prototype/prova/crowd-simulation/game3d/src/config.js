// ========================================
// Configurazione e costanti di gioco
// ========================================

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
        speed: 1.5,
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
        spawnCount: 5,
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
    radius: 0.3,
    manaMax: 100,
    manaStart: 50,
    manaRegenRate: 1,
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
        fireRate: 1.0,
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

// --- NavMesh pipeline ---
export const SMALL_RADIUS = 0.4;
export const LARGE_RADIUS = 1.2;
export const AREA_WALKABLE = 1;
export const AREA_WALKABLE_NARROW = 2;
