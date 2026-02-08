// ========================================
// Wall Catalog - Definizioni tipi muro e stati di danno
// ========================================

export const WallDamageState = {
    INTACT: 'INTACT',       // > 75% HP
    DAMAGED: 'DAMAGED',     // 50-75% HP
    CRITICAL: 'CRITICAL',   // 25-50% HP
    CRUMBLING: 'CRUMBLING', // 1-25% HP
    DESTROYED: 'DESTROYED', // 0% HP
};

/**
 * Calcola lo stato di danno in base agli HP
 * @param {number} hp - HP correnti
 * @param {number} maxHp - HP massimi
 * @returns {string} WallDamageState
 */
export function calculateWallDamageState(hp, maxHp) {
    if (hp <= 0) return WallDamageState.DESTROYED;
    const ratio = hp / maxHp;
    if (ratio > 0.75) return WallDamageState.INTACT;
    if (ratio > 0.50) return WallDamageState.DAMAGED;
    if (ratio > 0.25) return WallDamageState.CRITICAL;
    return WallDamageState.CRUMBLING;
}

/**
 * Moltiplicatore altezza per stato di danno
 * @param {string} state - WallDamageState
 * @returns {number} 0.0 - 1.0
 */
export function heightMultiplierForState(state) {
    switch (state) {
        case WallDamageState.INTACT:    return 1.0;
        case WallDamageState.DAMAGED:   return 0.75;
        case WallDamageState.CRITICAL:  return 0.5;
        case WallDamageState.CRUMBLING: return 0.25;
        case WallDamageState.DESTROYED: return 0;
        default: return 1.0;
    }
}

export const WallCatalog = {
    STONE: {
        label: 'Stone Wall',
        color: 0x8B8682,
        hpPerUnit: 60,
        hpThicknessMultiplier: 1.0,
        defaultHeight: 3.0,
        defaultThickness: 2.0,
    },
};
