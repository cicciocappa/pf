// ========================================
// StructureAttackSystem — helper per attacco creature a strutture
// ========================================

// ========================================
// WallUnitProxy — adattatore per unità di muro
// ========================================

export class WallUnitProxy {
    constructor(wall, unitIndex) {
        this.wall = wall;
        this.unitIndex = unitIndex;
        this._unit = wall.units[unitIndex];
        const center = this._unit.getCenter();
        this.x = center.x;
        this.z = center.z;
        this.faction = 'enemy';
        this.isWallProxy = true;
        this.radius = wall.thickness * 0.5;
    }
    get alive() { return this._unit.hp > 0; }
    get hp() { return this._unit.hp; }
    get maxHp() { return this._unit.maxHp; }
    takeDamage(amount) { this.wall.damageUnit(this.unitIndex, amount); }
}

// ========================================
// findEnemyStructureAt — trova struttura nemica sotto il mouse
// ========================================

/**
 * @param {Game} game
 * @param {number} wx
 * @param {number} wz
 * @returns {{type: string, target: object}|null}
 */
export function findEnemyStructureAt(game, wx, wz) {
    let bestDist = Infinity;
    let bestResult = null;

    // Buildings
    game.buildings.forEach(b => {
        if (b.faction !== 'enemy' || !b.alive) return;
        const dx = b.x - wx;
        const dz = b.z - wz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const threshold = b.radius + 1.0;
        if (dist < threshold && dist < bestDist) {
            bestDist = dist;
            bestResult = { type: 'building', target: b };
        }
    });

    // Towers
    for (const t of game.towers) {
        if (t.faction !== 'enemy' || !t.alive) continue;
        const dx = t.x - wx;
        const dz = t.z - wz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const threshold = t.radius + 1.0;
        if (dist < threshold && dist < bestDist) {
            bestDist = dist;
            bestResult = { type: 'tower', target: t };
        }
    }

    // Wall units
    game.walls.forEach(wall => {
        for (let i = 0; i < wall.units.length; i++) {
            const unit = wall.units[i];
            if (unit.hp <= 0) continue;
            const center = unit.getCenter();
            const dx = center.x - wx;
            const dz = center.z - wz;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < 2.0 && dist < bestDist) {
                bestDist = dist;
                bestResult = { type: 'wall', target: new WallUnitProxy(wall, i) };
            }
        }
    });

    return bestResult;
}

// ========================================
// distanceToStructureSurface — distanza dalla creatura alla superficie
// ========================================

/**
 * Distanza punto-segmento 2D
 */
function pointToSegmentDist(px, pz, ax, az, bx, bz) {
    const abx = bx - ax;
    const abz = bz - az;
    const apx = px - ax;
    const apz = pz - az;
    const ab2 = abx * abx + abz * abz;
    if (ab2 === 0) return Math.sqrt(apx * apx + apz * apz);
    let t = (apx * abx + apz * abz) / ab2;
    t = Math.max(0, Math.min(1, t));
    const projX = ax + t * abx;
    const projZ = az + t * abz;
    const dx = px - projX;
    const dz = pz - projZ;
    return Math.sqrt(dx * dx + dz * dz);
}

/**
 * @param {number} cx - creature X
 * @param {number} cz - creature Z
 * @param {object} target - attackTarget (Building, Tower, WallUnitProxy, or Entity)
 * @returns {number} distanza alla superficie
 */
export function distanceToStructureSurface(cx, cz, target) {
    if (target.isWallProxy) {
        // WallUnitProxy: distanza punto-segmento dal segmento mediano dell'unità
        const unit = target._unit;
        const v = unit.vertices;
        // Segmento mediano: media left (v[0],v[1]) e media right (v[3],v[2])
        const startX = (v[0].x + v[3].x) * 0.5;
        const startZ = (v[0].z + v[3].z) * 0.5;
        const endX = (v[1].x + v[2].x) * 0.5;
        const endZ = (v[1].z + v[2].z) * 0.5;
        const dist = pointToSegmentDist(cx, cz, startX, startZ, endX, endZ);
        return Math.max(0, dist - target.wall.thickness * 0.5);
    }

    // Building, Tower, or other entity: distanza centro - radius
    const dx = target.x - cx;
    const dz = target.z - cz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    return Math.max(0, dist - (target.radius || 0));
}

// ========================================
// computeAttackPositions — calcola posizioni d'attacco per le creature
// ========================================

/**
 * @param {object} target - bersaglio (Building, Tower, WallUnitProxy)
 * @param {Array} creatures - array di creature da posizionare
 * @param {boolean} forceAttack - true = nessun intelligence gating
 * @returns {Array<{x:number, z:number}|null>} posizioni per ogni creatura (null = non attacca)
 */
export function computeAttackPositions(target, creatures, forceAttack) {
    if (creatures.length === 0) return [];

    if (target.isWallProxy) {
        return _wallAttackPositions(target, creatures, forceAttack);
    } else {
        return _circularAttackPositions(target, creatures, forceAttack);
    }
}

/**
 * Distribuzione circolare attorno a Building/Tower
 */
function _circularAttackPositions(target, creatures, forceAttack) {
    const n = creatures.length;
    const positions = [];

    // Usa il primo creature per stimare attackRange (tutti dello stesso tipo di solito)
    const attackRange = creatures[0].attackRange || 1.5;
    const creatureRadius = creatures[0].radius || 0.25;
    const attackRadius = (target.radius || 0.5) + attackRange * 0.7;
    const perimeter = 2 * Math.PI * attackRadius;
    const maxSlots = Math.floor(perimeter / (creatureRadius * 2.5));

    for (let i = 0; i < n; i++) {
        const c = creatures[i];
        const cAttackRange = c.attackRange || 1.5;
        const cRadius = c.radius || 0.25;
        const cAttackRadius = (target.radius || 0.5) + cAttackRange * 0.7;

        // Intelligence gating
        if (!forceAttack && i >= maxSlots && (c.intelligence || 0) > 0.5) {
            // Creatura intelligente senza slot: posizione d'attesa
            const angle = (2 * Math.PI * i) / n;
            positions.push({
                x: target.x + Math.cos(angle) * cAttackRadius * 2,
                z: target.z + Math.sin(angle) * cAttackRadius * 2,
            });
            continue;
        }

        const angle = (2 * Math.PI * i) / n;
        positions.push({
            x: target.x + Math.cos(angle) * cAttackRadius,
            z: target.z + Math.sin(angle) * cAttackRadius,
        });
    }

    return positions;
}

/**
 * Distribuzione lineare lungo unità di muro
 */
function _wallAttackPositions(target, creatures, forceAttack) {
    const wall = target.wall;
    const unit = target._unit;
    const v = unit.vertices;
    const n = creatures.length;
    const positions = [];

    // Calcola centerline dell'unità
    const startX = (v[0].x + v[3].x) * 0.5;
    const startZ = (v[0].z + v[3].z) * 0.5;
    const endX = (v[1].x + v[2].x) * 0.5;
    const endZ = (v[1].z + v[2].z) * 0.5;

    const segDx = endX - startX;
    const segDz = endZ - startZ;
    const segLen = Math.sqrt(segDx * segDx + segDz * segDz);
    if (segLen === 0) {
        // Degenerate: tutti al centro
        for (let i = 0; i < n; i++) {
            positions.push({ x: target.x, z: target.z });
        }
        return positions;
    }

    // Direzione along the wall e normal
    const dirX = segDx / segLen;
    const dirZ = segDz / segLen;
    // Normale (perpendicolare al muro): ruota 90 gradi
    const normX = -dirZ;
    const normZ = dirX;

    const creatureRadius = creatures[0].radius || 0.25;
    const attackRange = creatures[0].attackRange || 1.5;
    const standoff = wall.thickness * 0.5 + attackRange * 0.7;
    const maxSlots = Math.max(1, Math.floor(segLen / (creatureRadius * 2.5)));

    for (let i = 0; i < n; i++) {
        const c = creatures[i];
        const cAttackRange = c.attackRange || 1.5;
        const cStandoff = wall.thickness * 0.5 + cAttackRange * 0.7;

        // Intelligence gating
        if (!forceAttack && i >= maxSlots && (c.intelligence || 0) > 0.5) {
            // Posizione d'attesa: più lontano dal muro
            const t = (i % maxSlots + 0.5) / maxSlots;
            const px = startX + segDx * t;
            const pz = startZ + segDz * t;
            // Determina lato: usa la prima creatura come riferimento
            const side = _chooseSide(creatures[0].x, creatures[0].z, startX, startZ, normX, normZ);
            positions.push({
                x: px + normX * cStandoff * 2 * side,
                z: pz + normZ * cStandoff * 2 * side,
            });
            continue;
        }

        // Distribuisci lungo la centerline
        const slotIndex = i % maxSlots;
        const t = (slotIndex + 0.5) / maxSlots;
        const px = startX + segDx * t;
        const pz = startZ + segDz * t;

        // Determina su quale lato del muro stare (lato più vicino alla creatura)
        const side = _chooseSide(c.x, c.z, startX, startZ, normX, normZ);

        positions.push({
            x: px + normX * cStandoff * side,
            z: pz + normZ * cStandoff * side,
        });
    }

    return positions;
}

/**
 * Determina su quale lato del muro posizionare la creatura
 * @returns {number} +1 o -1
 */
function _chooseSide(cx, cz, segStartX, segStartZ, normX, normZ) {
    const toCx = cx - segStartX;
    const toCz = cz - segStartZ;
    const dot = toCx * normX + toCz * normZ;
    return dot >= 0 ? 1 : -1;
}
