// ========================================
// Torri difensive nemiche (3D)
// ========================================

import * as THREE from 'three';
import { Entity } from './Entity.js';
import { TowerStats, TowerTargeting, EntityState } from './config.js';

export class Tower extends Entity {
    constructor(x, z, towerType) {
        super(x, z);
        const stats = TowerStats[towerType];
        if (!stats) throw new Error(`TowerType sconosciuto: ${towerType}`);

        this.towerType = towerType;
        this.hp = stats.hp;
        this.maxHp = stats.hp;
        this.attackDamage = stats.damage;
        this.range = stats.range;
        this.fireRate = stats.fireRate;
        this.targeting = stats.targeting;
        this.projectileSpeed = stats.projectileSpeed;
        this.aoeRadius = stats.aoeRadius || 0;
        this.color = stats.color;
        this.radius = 0.4;
        this.faction = 'enemy';

        this.fireCooldownTimer = 0;
    }

    _createMesh() {
        // Base: prisma (box)
        const baseGeom = new THREE.BoxGeometry(this.radius * 2, this.radius * 3, this.radius * 2);
        const baseMat = new THREE.MeshPhongMaterial({ color: this.color });
        this.mesh = new THREE.Mesh(baseGeom, baseMat);
        this.mesh.position.y = this.radius * 1.5;

        // Merli in cima (piccoli cubi)
        const merlonSize = this.radius * 0.3;
        const merlonGeom = new THREE.BoxGeometry(merlonSize, merlonSize, merlonSize);
        const merlonMat = new THREE.MeshPhongMaterial({ color: this.color });

        const positions = [
            [-this.radius + merlonSize / 2, 0, -this.radius + merlonSize / 2],
            [this.radius - merlonSize / 2, 0, -this.radius + merlonSize / 2],
            [-this.radius + merlonSize / 2, 0, this.radius - merlonSize / 2],
            [this.radius - merlonSize / 2, 0, this.radius - merlonSize / 2],
        ];

        for (const pos of positions) {
            const merlon = new THREE.Mesh(merlonGeom, merlonMat);
            merlon.position.set(pos[0], this.radius * 3 + merlonSize / 2, pos[2]);
            this.group.add(merlon);
        }

        // Cerchio di range (semitrasparente, sul piano)
        const rangeGeom = new THREE.RingGeometry(this.range - 0.05, this.range, 48);
        const rangeMat = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide,
        });
        const rangeRing = new THREE.Mesh(rangeGeom, rangeMat);
        rangeRing.rotation.x = -Math.PI / 2;
        rangeRing.position.y = 0.02;
        this.group.add(rangeRing);
    }

    update(dt) {
        super.update(dt);
        if (!this.alive) return;
        this.fireCooldownTimer = Math.max(0, this.fireCooldownTimer - dt);
    }

    /**
     * Seleziona il bersaglio migliore tra le entità nemiche in range.
     */
    selectTarget(enemies) {
        const inRange = enemies.filter(e => {
            if (!e.alive) return false;
            const dx = e.x - this.x;
            const dz = e.z - this.z;
            return Math.sqrt(dx * dx + dz * dz) <= this.range;
        });

        if (inRange.length === 0) return null;

        switch (this.targeting) {
            case TowerTargeting.PROXIMITY:
                return inRange.reduce((best, e) => {
                    const d = (e.x - this.x) ** 2 + (e.z - this.z) ** 2;
                    const bd = (best.x - this.x) ** 2 + (best.z - this.z) ** 2;
                    return d < bd ? e : best;
                });

            case TowerTargeting.PRIORITY:
                return inRange.reduce((best, e) => e.hp < best.hp ? e : best);

            case TowerTargeting.HIGH_VALUE:
                return inRange.reduce((best, e) => {
                    const ev = e.manaCost || 9999;
                    const bv = best.manaCost || 9999;
                    return ev > bv ? e : best;
                });

            default:
                return inRange[0];
        }
    }

    canFire() {
        return this.alive && this.fireCooldownTimer <= 0;
    }

    fire() {
        this.fireCooldownTimer = 1.0 / this.fireRate;
    }
}
