// ========================================
// Classe base Entity (3D con Three.js)
// ========================================

import * as THREE from 'three';
import { EntityState } from './config.js';

let nextEntityId = 1;

export class Entity {
    constructor(x, z) {
        this.id = nextEntityId++;
        // Coordinate sul piano XZ (Three.js: Y è verticale)
        this.x = x;
        this.z = z;
        this.hp = 100;
        this.maxHp = 100;
        this.state = EntityState.IDLE;
        this.radius = 0.25;

        // Crowd agent ID (navcat)
        this.crowdAgentId = null;

        // Three.js objects
        this.mesh = null;       // Mesh principale
        this.group = null;      // Group che contiene mesh + hp bar + extras
        this.hpBarGroup = null;

        // Direzione (angolo in radianti, 0 = +X)
        this.angle = 0;

        // Fazione: 'player' o 'enemy'
        this.faction = 'player';

        // Combat
        this.attackTarget = null;
        this.attackCooldownTimer = 0;
        this.forceAttack = false;      // true = non si disimpegna sotto danno
        this.isAttackMoving = false;   // true = si sta muovendo verso un bersaglio d'attacco

        // Selection
        this.selected = false;
        this.selectionRing = null;
    }

    get alive() {
        return this.hp > 0;
    }

    takeDamage(amount) {
        if (!this.alive) return;
        this.hp = Math.max(0, this.hp - amount);
        if (this.hp <= 0) {
            this.state = EntityState.DEAD;
            this.onDeath();
        } else if (this.isAttackMoving && !this.forceAttack) {
            // Disengage: la creatura si ferma se prende danno durante il movimento
            this.attackTarget = null;
            this.isAttackMoving = false;
            this.state = EntityState.IDLE;
        }
        this._updateHpBar();
    }

    onDeath() {
        // Override nelle sottoclassi
    }

    /**
     * Crea il group Three.js con mesh + HP bar.
     * Restituisce il group da aggiungere alla scena.
     */
    createVisual(scene) {
        this.group = new THREE.Group();

        // Mesh principale (override in sottoclassi)
        this._createMesh();
        if (this.mesh) {
            this.group.add(this.mesh);
        }

        // HP bar (billboard sprite sopra l'entità)
        this._createHpBar();

        // Selection ring (hidden by default)
        this._createSelectionRing();

        this._syncPosition();
        return this.group;
    }

    _createMesh() {
        // Override nelle sottoclassi
    }

    _createSelectionRing() {
        const innerRadius = this.radius + 0.05;
        const outerRadius = this.radius + 0.15;
        const geom = new THREE.RingGeometry(innerRadius, outerRadius, 32);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.7,
            depthTest: false,
        });
        this.selectionRing = new THREE.Mesh(geom, mat);
        this.selectionRing.rotation.x = -Math.PI / 2;
        this.selectionRing.position.y = 0.02;
        this.selectionRing.visible = false;
        this.group.add(this.selectionRing);
    }

    setSelected(val) {
        this.selected = val;
        if (this.selectionRing) {
            this.selectionRing.visible = val;
        }
    }

    _createHpBar() {
        this.hpBarGroup = new THREE.Group();

        // Background (grigio)
        const bgGeom = new THREE.PlaneGeometry(this.radius * 2.5, 0.12);
        const bgMat = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide, depthTest: false });
        this.hpBarBg = new THREE.Mesh(bgGeom, bgMat);
        this.hpBarGroup.add(this.hpBarBg);

        // Fill (verde)
        const fillGeom = new THREE.PlaneGeometry(this.radius * 2.5, 0.1);
        const fillMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide, depthTest: false });
        this.hpBarFill = new THREE.Mesh(fillGeom, fillMat);
        this.hpBarGroup.add(this.hpBarFill);

        // Posiziona sopra l'entità
        this.hpBarGroup.position.y = this.radius * 2 + 0.3;
        this.group.add(this.hpBarGroup);
    }

    _updateHpBar() {
        if (!this.hpBarFill) return;
        const ratio = Math.max(0, this.hp / this.maxHp);

        // Scala la barra fill
        this.hpBarFill.scale.x = ratio;
        this.hpBarFill.position.x = -(1 - ratio) * this.radius * 1.25;

        // Colore in base alla vita
        const color = ratio > 0.5 ? 0x00ff00 : ratio > 0.25 ? 0xffff00 : 0xff0000;
        this.hpBarFill.material.color.setHex(color);
    }

    _syncPosition() {
        if (this.group) {
            this.group.position.set(this.x, 0, this.z);
            this.group.visible = this.alive;
        }
    }

    update(dt) {
        if (!this.alive) return;
        this.attackCooldownTimer = Math.max(0, this.attackCooldownTimer - dt);
        this._syncPosition();

        // Billboard HP bar verso la camera (gestito da SceneManager)
    }

    dispose() {
        if (this.group) {
            this.group.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) obj.material.dispose();
            });
        }
    }
}
