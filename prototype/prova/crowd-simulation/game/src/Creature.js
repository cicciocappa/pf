// ========================================
// Creature evocate dal mago
// ========================================

import { Entity } from './Entity.js';
import { CreatureStats, EntityState } from './config.js';

export class Creature extends Entity {
    constructor(x, y, creatureType) {
        super(x, y);
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

    _drawPlaceholder() {
        const g = this.graphics;
        g.clear();

        // Corpo: cerchio colorato
        g.beginFill(this.color);
        g.drawCircle(0, 0, this.radius);
        g.endFill();

        // Bordo
        g.lineStyle(0.03, 0x000000, 0.5);
        g.drawCircle(0, 0, this.radius);

        // Indicatore direzione
        g.lineStyle(0);
        g.beginFill(0xFFFFFF, 0.7);
        const r = this.radius;
        g.moveTo(r + 0.05, 0);
        g.lineTo(r - 0.05, -0.06);
        g.lineTo(r - 0.05, 0.06);
        g.closePath();
        g.endFill();
    }

    update(dt) {
        super.update(dt);
        if (!this.alive) return;

        // Se ha un bersaglio e in range, attacca
        if (this.attackTarget && this.attackTarget.alive) {
            const dx = this.attackTarget.x - this.x;
            const dy = this.attackTarget.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= this.attackRange) {
                this.state = EntityState.ATTACKING;
                if (this.attackCooldownTimer <= 0) {
                    this.attackTarget.damage(this.attackDamage);
                    this.attackCooldownTimer = this.attackCooldown;
                }
            }
        } else {
            // Bersaglio morto o assente
            if (this.state === EntityState.ATTACKING) {
                this.attackTarget = null;
                this.state = EntityState.IDLE;
            }
        }
    }
}
