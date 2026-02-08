// ========================================
// Creature evocate dal mago (3D)
// ========================================

import * as THREE from 'three';
import { Entity } from './Entity.js';
import { CreatureType, CreatureStats, EntityState } from './config.js';
import { distanceToStructureSurface } from './StructureAttackSystem.js';

export class Creature extends Entity {
    constructor(x, z, creatureType) {
        super(x, z);
        const stats = CreatureStats[creatureType];
        if (!stats) throw new Error(`CreatureType sconosciuto: ${creatureType}`);

        this.creatureType = creatureType;
        this.hp = stats.hp;
        this.maxHp = stats.hp;
        this.speed = stats.speed;
        this.radius = stats.radius;
        this.attackDamage = stats.damage;
        this.attackRange = stats.attackRange;
        this.attackCooldown = stats.attackCooldown;
        this.manaCost = stats.manaCost;
        this.intelligence = stats.intelligence;
        this.color = stats.color;
        this.faction = 'player';
    }

    _createMesh() {
        let geom;
        switch (this.creatureType) {
            case CreatureType.GIANT:
                // Cilindro grande marrone
                geom = new THREE.CylinderGeometry(this.radius, this.radius * 1.1, this.radius * 3, 8);
                break;
            case CreatureType.LARVA:
                // Piccola sfera
                geom = new THREE.SphereGeometry(this.radius, 8, 6);
                break;
            case CreatureType.ELEMENTAL:
                // Icosaedro luminoso
                geom = new THREE.IcosahedronGeometry(this.radius, 1);
                break;
            default:
                geom = new THREE.SphereGeometry(this.radius, 12, 8);
        }

        const mat = new THREE.MeshPhongMaterial({
            color: this.color,
            emissive: this.creatureType === CreatureType.ELEMENTAL ? 0x004444 : 0x000000,
        });

        this.mesh = new THREE.Mesh(geom, mat);

        // Posiziona a seconda del tipo
        if (this.creatureType === CreatureType.GIANT) {
            this.mesh.position.y = this.radius * 1.5;
        } else {
            this.mesh.position.y = this.radius;
        }
    }

    update(dt) {
        super.update(dt);
        if (!this.alive) return;

        // Ruota mesh
        if (this.mesh) {
            this.mesh.rotation.y = this.angle;
        }

        // Se ha un bersaglio e in range, attacca
        if (this.attackTarget && this.attackTarget.alive) {
            const dist = distanceToStructureSurface(this.x, this.z, this.attackTarget);

            if (dist <= this.attackRange) {
                this.state = EntityState.ATTACKING;
                this.isAttackMoving = false;
                if (this.attackCooldownTimer <= 0) {
                    this.attackTarget.takeDamage(this.attackDamage);
                    this.attackCooldownTimer = this.attackCooldown;
                }
            }
        } else {
            // Bersaglio morto o assente
            if (this.state === EntityState.ATTACKING) {
                this.attackTarget = null;
                this.isAttackMoving = false;
                this.state = EntityState.IDLE;
            }
        }

        // Elementale: rotazione extra
        if (this.creatureType === CreatureType.ELEMENTAL && this.mesh) {
            this.mesh.rotation.x += dt * 0.5;
        }
    }
}
