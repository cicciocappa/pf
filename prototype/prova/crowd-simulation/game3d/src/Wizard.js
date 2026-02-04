// ========================================
// Mago — eroe controllato dal giocatore (3D)
// ========================================

import * as THREE from 'three';
import { Entity } from './Entity.js';
import { WizardStats, EntityState } from './config.js';

export class Wizard extends Entity {
    constructor(x, z) {
        super(x, z);
        this.hp = WizardStats.hp;
        this.maxHp = WizardStats.hp;
        this.radius = WizardStats.radius;
        this.speed = WizardStats.speed;
        this.faction = 'player';

        this.mana = WizardStats.manaStart;
        this.manaMax = WizardStats.manaMax;
        this.manaRegenRate = WizardStats.manaRegenRate;

        // Essenze raccolte
        this.essence = 0;
    }

    _createMesh() {
        // Corpo: sfera blu
        const bodyGeom = new THREE.SphereGeometry(this.radius, 16, 12);
        const bodyMat = new THREE.MeshPhongMaterial({
            color: WizardStats.color,
            emissive: 0x102040,
        });
        this.mesh = new THREE.Mesh(bodyGeom, bodyMat);
        this.mesh.position.y = this.radius;

        // Cappello (cono sopra la sfera)
        const hatGeom = new THREE.ConeGeometry(this.radius * 0.7, this.radius * 1.2, 8);
        const hatMat = new THREE.MeshPhongMaterial({ color: 0x1a237e });
        const hat = new THREE.Mesh(hatGeom, hatMat);
        hat.position.y = this.radius * 2 + this.radius * 0.4;
        this.mesh.add(hat);

        // Bordo luminoso
        const ringGeom = new THREE.RingGeometry(this.radius + 0.02, this.radius + 0.08, 24);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x88bbff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.6,
        });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.01;
        this.group.add(ring);
    }

    update(dt) {
        super.update(dt);
        if (!this.alive) return;

        // Rigenera mana
        this.mana = Math.min(this.manaMax, this.mana + this.manaRegenRate * dt);

        // Ruota mesh in base all'angolo di movimento
        if (this.mesh) {
            this.mesh.rotation.y = this.angle;
        }
    }

    /** Raccoglie essenza da un nemico sconfitto */
    collectEssence(amount) {
        this.essence += amount;
        this.mana = Math.min(this.manaMax, this.mana + amount * 0.5);
    }

    /** Può lanciare un incantesimo? */
    canCast(manaCost) {
        return this.mana >= manaCost;
    }

    /** Spende mana */
    spendMana(amount) {
        this.mana = Math.max(0, this.mana - amount);
    }

    onDeath() {
        console.log('GAME OVER — Il mago è morto!');
    }
}
