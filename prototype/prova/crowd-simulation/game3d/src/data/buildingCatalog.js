// ========================================
// Building Catalog - Definizioni tipi edifici
// ========================================

/**
 * Stati di danneggiamento degli edifici
 */
export const BuildingState = {
    INTACT: 'INTACT',       // 100% - 76% HP
    DAMAGED: 'DAMAGED',     // 75% - 36% HP
    CRITICAL: 'CRITICAL',   // 35% - 1% HP
    DESTROYED: 'DESTROYED', // 0% HP
};

/**
 * Tipi di effetti particellari
 */
export const EffectType = {
    NONE: 'NONE',
    SMOKE_LIGHT: 'SMOKE_LIGHT',
    SMOKE_HEAVY: 'SMOKE_HEAVY',
    FIRE_SMALL: 'FIRE_SMALL',
    FIRE_LARGE: 'FIRE_LARGE',
};

/**
 * Tipi di elementi animati
 */
export const AnimatedElementType = {
    NONE: 'NONE',
    BALLISTA: 'BALLISTA',
    CANNON: 'CANNON',
    ARCHER: 'ARCHER',
};

/**
 * Calcola lo stato di un edificio in base agli HP
 * @param {number} hp - HP correnti
 * @param {number} maxHp - HP massimi
 * @returns {string} - BuildingState
 */
export function calculateBuildingState(hp, maxHp) {
    if (hp <= 0) return BuildingState.DESTROYED;
    const ratio = hp / maxHp;
    if (ratio > 0.75) return BuildingState.INTACT;
    if (ratio > 0.35) return BuildingState.DAMAGED;
    return BuildingState.CRITICAL;
}

/**
 * Catalogo centrale degli edifici
 * Ogni entry definisce:
 * - maxHp: punti vita massimi
 * - stateThresholds: soglie HP per cambio stato (in percentuale)
 * - effects: effetti particellari per ogni stato
 * - animatedElement: tipo di elemento animato (opzionale)
 * - fallbackGeometry: parametri per mesh procedurale di fallback
 * - color: colore per fallback e minimap
 * - navmeshFootprint: forma per calcolo navmesh
 */
export const BuildingCatalog = {

    // ========================================
    // TORRI DIFENSIVE
    // ========================================

    GUARD_TOWER: {
        maxHp: 100,
        stateThresholds: {
            [BuildingState.DAMAGED]: 0.75,
            [BuildingState.CRITICAL]: 0.35,
            [BuildingState.DESTROYED]: 0,
        },
        effects: {
            [BuildingState.INTACT]: { type: EffectType.NONE },
            [BuildingState.DAMAGED]: {
                type: EffectType.SMOKE_LIGHT,
                attachPoint: [0, 3, 0],
            },
            [BuildingState.CRITICAL]: {
                type: EffectType.SMOKE_HEAVY,
                attachPoint: [0, 2.5, 0],
            },
            [BuildingState.DESTROYED]: {
                type: EffectType.FIRE_SMALL,
                attachPoint: [0, 0.5, 0],
            },
        },
        animatedElement: AnimatedElementType.ARCHER,
        fallbackGeometry: {
            shape: 'octagon',
            baseSize: 2,
            baseHeight: 4,
        },
        color: 0x8B7355,
        navmeshFootprint: { type: 'box', width: 2, depth: 2 },
        label: 'Guard Tower',
        description: 'Basic defensive tower with archers',
    },

    BALLISTA_TOWER: {
        maxHp: 150,
        stateThresholds: {
            [BuildingState.DAMAGED]: 0.75,
            [BuildingState.CRITICAL]: 0.35,
            [BuildingState.DESTROYED]: 0,
        },
        effects: {
            [BuildingState.INTACT]: { type: EffectType.NONE },
            [BuildingState.DAMAGED]: {
                type: EffectType.SMOKE_LIGHT,
                attachPoint: [0, 4, 0],
            },
            [BuildingState.CRITICAL]: {
                type: EffectType.SMOKE_HEAVY,
                attachPoint: [0, 3, 0],
            },
            [BuildingState.DESTROYED]: {
                type: EffectType.FIRE_SMALL,
                attachPoint: [0, 0.5, 0],
            },
        },
        animatedElement: AnimatedElementType.BALLISTA,
        fallbackGeometry: {
            shape: 'octagon',
            baseSize: 2.5,
            baseHeight: 5,
        },
        color: 0x6B4423,
        navmeshFootprint: { type: 'box', width: 2.5, depth: 2.5 },
        label: 'Ballista Tower',
        description: 'Heavy siege defense tower with rotating ballista',
    },

    // ========================================
    // EDIFICI MILITARI
    // ========================================

    BARRACKS: {
        maxHp: 120,
        stateThresholds: {
            [BuildingState.DAMAGED]: 0.75,
            [BuildingState.CRITICAL]: 0.35,
            [BuildingState.DESTROYED]: 0,
        },
        effects: {
            [BuildingState.INTACT]: { type: EffectType.NONE },
            [BuildingState.DAMAGED]: {
                type: EffectType.SMOKE_LIGHT,
                attachPoint: [0, 2.5, 0],
            },
            [BuildingState.CRITICAL]: {
                type: EffectType.SMOKE_HEAVY,
                attachPoint: [0, 2, 0],
            },
            [BuildingState.DESTROYED]: {
                type: EffectType.FIRE_LARGE,
                attachPoint: [0, 0.3, 0],
            },
        },
        animatedElement: AnimatedElementType.NONE,
        fallbackGeometry: {
            shape: 'box',
            baseSize: 3,
            baseHeight: 3,
        },
        color: 0x8B4513,
        navmeshFootprint: { type: 'box', width: 3, depth: 1.6 },
        label: 'Barracks',
        description: 'Spawns defender units over time',
    },

    // ========================================
    // EDIFICI SPECIALI
    // ========================================

    TEMPLE: {
        maxHp: 80,
        stateThresholds: {
            [BuildingState.DAMAGED]: 0.75,
            [BuildingState.CRITICAL]: 0.35,
            [BuildingState.DESTROYED]: 0,
        },
        effects: {
            [BuildingState.INTACT]: { type: EffectType.NONE },
            [BuildingState.DAMAGED]: {
                type: EffectType.SMOKE_LIGHT,
                attachPoint: [0, 3.5, 0],
            },
            [BuildingState.CRITICAL]: {
                type: EffectType.SMOKE_HEAVY,
                attachPoint: [0, 3, 0],
            },
            [BuildingState.DESTROYED]: {
                type: EffectType.FIRE_SMALL,
                attachPoint: [0, 0.5, 0],
            },
        },
        animatedElement: AnimatedElementType.NONE,
        fallbackGeometry: {
            shape: 'box',
            baseSize: 2.5,
            baseHeight: 4.5,
        },
        color: 0xD4AF37,
        navmeshFootprint: { type: 'polygon', vertices: 5 },
        label: 'Temple',
        description: 'Sacred building with magical properties',
    },

    TREASURY: {
        maxHp: 200,
        stateThresholds: {
            [BuildingState.DAMAGED]: 0.75,
            [BuildingState.CRITICAL]: 0.35,
            [BuildingState.DESTROYED]: 0,
        },
        effects: {
            [BuildingState.INTACT]: { type: EffectType.NONE },
            [BuildingState.DAMAGED]: {
                type: EffectType.SMOKE_LIGHT,
                attachPoint: [0, 2.5, 0],
            },
            [BuildingState.CRITICAL]: {
                type: EffectType.SMOKE_HEAVY,
                attachPoint: [0, 2, 0],
            },
            [BuildingState.DESTROYED]: {
                type: EffectType.FIRE_LARGE,
                attachPoint: [0, 0.3, 0],
            },
        },
        animatedElement: AnimatedElementType.NONE,
        fallbackGeometry: {
            shape: 'cylinder',
            baseSize: 2,
            baseHeight: 3,
        },
        color: 0xFFD700,
        navmeshFootprint: { type: 'box', width: 2, depth: 2 },
        label: 'Treasury',
        description: 'Objective building - player must reach this to win',
        isObjective: true,
    },

    // ========================================
    // FORTIFICAZIONI
    // ========================================

    GATEHOUSE: {
        maxHp: 180,
        stateThresholds: {
            [BuildingState.DAMAGED]: 0.75,
            [BuildingState.CRITICAL]: 0.35,
            [BuildingState.DESTROYED]: 0,
        },
        effects: {
            [BuildingState.INTACT]: { type: EffectType.NONE },
            [BuildingState.DAMAGED]: {
                type: EffectType.SMOKE_LIGHT,
                attachPoint: [0, 3.5, 0],
            },
            [BuildingState.CRITICAL]: {
                type: EffectType.SMOKE_HEAVY,
                attachPoint: [0, 3, 0],
            },
            [BuildingState.DESTROYED]: {
                type: EffectType.FIRE_SMALL,
                attachPoint: [0, 0.5, 0],
            },
        },
        animatedElement: AnimatedElementType.NONE,
        fallbackGeometry: {
            shape: 'box',
            baseSize: 3,
            baseHeight: 5,
        },
        color: 0x696969,
        navmeshFootprint: { type: 'box', width: 3, depth: 2 },
        label: 'Gatehouse',
        description: 'Gate in walls - blocks passage when intact',
        blocksPassage: true,
    },
};

/**
 * Ottiene la lista di tutti i tipi di edificio
 */
export function getBuildingTypes() {
    return Object.keys(BuildingCatalog);
}

/**
 * Ottiene info di un tipo di edificio
 */
export function getBuildingInfo(buildingType) {
    return BuildingCatalog[buildingType] || null;
}

/**
 * Ottiene l'effetto per uno stato specifico
 */
export function getEffectForState(buildingType, state) {
    const catalog = BuildingCatalog[buildingType];
    if (!catalog || !catalog.effects) return { type: EffectType.NONE };
    return catalog.effects[state] || { type: EffectType.NONE };
}
