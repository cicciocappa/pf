// ========================================
// Wall - Muro procedurale con unità distruttibili
// ========================================

import * as THREE from 'three';
import {
    WallCatalog,
    WallDamageState,
    calculateWallDamageState,
    heightMultiplierForState,
} from './data/wallCatalog.js';

// ========================================
// WallUnit — singola unità distruttibile
// ========================================

class WallUnit {
    /**
     * @param {Object} def
     * @param {string} def.id
     * @param {Array<{x:number, z:number}>} def.vertices - 4 vertici: startL, endL, endR, startR
     * @param {number} maxHp
     */
    constructor(def, maxHp) {
        this.id = def.id;
        this.vertices = def.vertices; // [{x,z}×4]
        this.maxHp = maxHp;
        this.hp = maxHp;
        this.damageState = WallDamageState.INTACT;
        this.baseY = 0;

        // Cap alle estremità (solo prima/ultima unità se il muro non è connesso)
        this.hasStartCap = false;
        this.hasEndCap = false;

        // Visual
        this._mesh = null;
        this._geometry = null;
        this._visualDirty = false;
    }

    /**
     * Infligge danno all'unità
     * @param {number} amount
     * @returns {boolean} true se l'unità è stata distrutta (hp → 0)
     */
    takeDamage(amount) {
        if (this.hp <= 0) return false;

        const oldState = this.damageState;
        this.hp = Math.max(0, this.hp - amount);
        this.damageState = calculateWallDamageState(this.hp, this.maxHp);

        if (oldState !== this.damageState) {
            this._visualDirty = true;
        }

        return this.hp <= 0;
    }

    /**
     * Campiona baseY dai 4 angoli del quad, prende il minimo
     * @param {function(number, number): number} sampleFn - (x, z) → y
     */
    sampleBaseY(sampleFn) {
        let minY = Infinity;
        for (const v of this.vertices) {
            const y = sampleFn(v.x, v.z);
            if (y < minY) minY = y;
        }
        this.baseY = isFinite(minY) ? minY : 0;
    }

    /**
     * Costruisce/aggiorna la mesh visiva
     * @param {number} wallHeight - altezza piena del muro
     * @param {number} color - colore hex
     * @returns {THREE.Mesh|null}
     */
    buildVisualGeometry(wallHeight, color) {
        const mult = heightMultiplierForState(this.damageState);

        if (mult === 0) {
            // Distrutto: nascondi
            if (this._mesh) this._mesh.visible = false;
            return this._mesh;
        }

        const h = wallHeight * mult;
        const y0 = this.baseY;
        const y1 = y0 + h;
        const v = this.vertices;

        // 8 vertici: bottom[0-3] + top[4-7]
        const positions = new Float32Array([
            v[0].x, y0, v[0].z, // 0 startL bottom
            v[1].x, y0, v[1].z, // 1 endL bottom
            v[2].x, y0, v[2].z, // 2 endR bottom
            v[3].x, y0, v[3].z, // 3 startR bottom
            v[0].x, y1, v[0].z, // 4 startL top
            v[1].x, y1, v[1].z, // 5 endL top
            v[2].x, y1, v[2].z, // 6 endR top
            v[3].x, y1, v[3].z, // 7 startR top
        ]);

        // 3 facce base (left, right, top) + cap opzionali alle estremità
        const indices = [
            // Left face (startL-endL) — normali verso l'esterno
            0, 1, 4,  1, 5, 4,
            // Right face (endR-startR) — normali verso l'esterno
            2, 3, 6,  3, 7, 6,
            // Top face — normali verso l'alto
            4, 5, 6,  4, 6, 7,
        ];
        // Start cap (startR-startL) — normali verso l'esterno (opposto alla direzione del muro)
        if (this.hasStartCap) {
            indices.push(3, 0, 7,  0, 4, 7);
        }
        // End cap (endL-endR) — normali verso l'esterno (nella direzione del muro)
        if (this.hasEndCap) {
            indices.push(1, 2, 5,  2, 6, 5);
        }

        if (!this._mesh) {
            // Primo build
            this._geometry = new THREE.BufferGeometry();
            this._geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            this._geometry.setIndex(indices);
            this._geometry.computeVertexNormals();

            const material = new THREE.MeshLambertMaterial({
                color: color,
                flatShading: true,
            });

            this._mesh = new THREE.Mesh(this._geometry, material);
            this._mesh.castShadow = true;
            this._mesh.receiveShadow = true;
        } else {
            // Aggiorna positions in-place
            const posAttr = this._geometry.getAttribute('position');
            posAttr.array.set(positions);
            posAttr.needsUpdate = true;
            this._geometry.computeVertexNormals();
            this._mesh.visible = true;
        }

        this._visualDirty = false;
        return this._mesh;
    }

    /**
     * Genera dati proxy mesh per navmesh (altezza piena, solo se viva)
     * @param {number} wallHeight - altezza piena del muro
     * @returns {{positions: number[], indices: number[]}|null} null se distrutta
     */
    buildProxyMeshData(wallHeight) {
        if (this.damageState === WallDamageState.DESTROYED) return null;

        const y0 = this.baseY;
        const y1 = y0 + wallHeight;
        const v = this.vertices;

        const positions = [
            v[0].x, y0, v[0].z,
            v[1].x, y0, v[1].z,
            v[2].x, y0, v[2].z,
            v[3].x, y0, v[3].z,
            v[0].x, y1, v[0].z,
            v[1].x, y1, v[1].z,
            v[2].x, y1, v[2].z,
            v[3].x, y1, v[3].z,
        ];

        const indices = [
            // Left face — normali verso l'esterno
            0, 1, 4,  1, 5, 4,
            // Right face — normali verso l'esterno
            2, 3, 6,  3, 7, 6,
            // Top face
            4, 5, 6,  4, 6, 7,
        ];
        if (this.hasStartCap) {
            indices.push(3, 0, 7,  0, 4, 7);
        }
        if (this.hasEndCap) {
            indices.push(1, 2, 5,  2, 6, 5);
        }

        return { positions, indices };
    }

    /**
     * Calcola il centro XZ dell'unità
     * @returns {{x: number, z: number}}
     */
    getCenter() {
        let cx = 0, cz = 0;
        for (const v of this.vertices) {
            cx += v.x;
            cz += v.z;
        }
        return { x: cx / 4, z: cz / 4 };
    }

    dispose() {
        if (this._geometry) {
            this._geometry.dispose();
            this._geometry = null;
        }
        if (this._mesh) {
            if (this._mesh.material) this._mesh.material.dispose();
            this._mesh = null;
        }
    }
}

// ========================================
// Wall — muro completo
// ========================================

export class Wall {
    /**
     * @param {Object} def - Definizione dal JSON esportato
     * @param {string} def.id
     * @param {string} def.wallType - es. 'STONE'
     * @param {number} def.thickness
     * @param {number} def.height
     * @param {string} def.label
     * @param {Array} def.units - [{id, vertices: [{x,z}×4]}]
     * @param {Array} def.thicknessPoints
     */
    constructor(def) {
        this.id = def.id;
        this.wallType = def.wallType || 'STONE';
        this.thickness = def.thickness;
        this.height = def.height || 3.0;
        this.label = def.label || '';
        this.thicknessPoints = def.thicknessPoints || [];

        const catalog = WallCatalog[this.wallType] || WallCatalog.STONE;
        this.color = catalog.color;

        // Calcola HP per unità
        const hpPerUnit = catalog.hpPerUnit * this.thickness * catalog.hpThicknessMultiplier;

        // Crea unità distruttibili
        this.units = (def.units || []).map(uDef => new WallUnit(uDef, hpPerUnit));

        // Cap alle estremità libere (non connesse)
        if (this.units.length > 0) {
            if (!def.startConnected) this.units[0].hasStartCap = true;
            if (!def.endConnected)   this.units[this.units.length - 1].hasEndCap = true;
        }

        // Group Three.js per tutte le mesh visive
        this.group = new THREE.Group();

        // Callback per notificare Game.js quando un'unità viene distrutta
        this.onUnitDestroyed = null;
    }

    /**
     * Campiona altezze terreno per ogni unità
     * @param {function(number, number): number} sampleFn - (x, z) → y
     */
    sampleTerrainHeights(sampleFn) {
        for (const unit of this.units) {
            unit.sampleBaseY(sampleFn);
        }
    }

    /**
     * Costruisce le mesh visive per tutte le unità
     */
    buildVisuals() {
        for (const unit of this.units) {
            const mesh = unit.buildVisualGeometry(this.height, this.color);
            if (mesh && !mesh.parent) {
                this.group.add(mesh);
            }
        }
    }

    /**
     * Rigenera solo le mesh visive dirty
     */
    updateDirtyVisuals() {
        for (const unit of this.units) {
            if (unit._visualDirty) {
                unit.buildVisualGeometry(this.height, this.color);
            }
        }
    }

    /**
     * Infligge danno a un'unità per indice
     * @param {number} index - indice dell'unità
     * @param {number} amount - danno
     * @returns {boolean} true se distrutta
     */
    damageUnit(index, amount) {
        if (index < 0 || index >= this.units.length) return false;
        const unit = this.units[index];
        const destroyed = unit.takeDamage(amount);
        if (destroyed && this.onUnitDestroyed) {
            this.onUnitDestroyed(this, index);
        }
        return destroyed;
    }

    /**
     * Infligge danno all'unità più vicina a (x, z)
     * @param {number} x
     * @param {number} z
     * @param {number} amount
     * @returns {{unitIndex: number, destroyed: boolean}|null}
     */
    damageNearestUnit(x, z, amount) {
        let nearest = -1;
        let nearestDist = Infinity;

        for (let i = 0; i < this.units.length; i++) {
            const unit = this.units[i];
            if (unit.hp <= 0) continue;
            const center = unit.getCenter();
            const dx = center.x - x;
            const dz = center.z - z;
            const dist = dx * dx + dz * dz;
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = i;
            }
        }

        if (nearest === -1) return null;

        const destroyed = this.damageUnit(nearest, amount);
        return { unitIndex: nearest, destroyed };
    }

    /**
     * Combina le proxy mesh di tutte le unità vive
     * @returns {{positions: number[], indices: number[]}}
     */
    buildProxyMeshDataCombined() {
        const positions = [];
        const indices = [];

        for (const unit of this.units) {
            const proxy = unit.buildProxyMeshData(this.height);
            if (!proxy) continue;

            const offset = positions.length / 3;
            for (const p of proxy.positions) positions.push(p);
            for (const i of proxy.indices) indices.push(i + offset);
        }

        return { positions, indices };
    }

    /**
     * Trova l'indice dell'unità più vicina a (x, z)
     * @param {number} x
     * @param {number} z
     * @returns {number} indice o -1
     */
    findNearestUnitIndex(x, z) {
        let nearest = -1;
        let nearestDist = Infinity;

        for (let i = 0; i < this.units.length; i++) {
            const unit = this.units[i];
            if (unit.hp <= 0) continue;
            const center = unit.getCenter();
            const dx = center.x - x;
            const dz = center.z - z;
            const dist = dx * dx + dz * dz;
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = i;
            }
        }

        return nearest;
    }

    /**
     * Aggiorna il muro (rigenera visuals dirty)
     * @param {number} dt
     */
    update(dt) {
        this.updateDirtyVisuals();
    }

    /**
     * Cleanup
     */
    dispose() {
        for (const unit of this.units) {
            unit.dispose();
        }
        if (this.group.parent) {
            this.group.parent.remove(this.group);
        }
    }
}
