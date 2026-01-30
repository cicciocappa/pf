// ========================================
// Torri difensive nemiche
// ========================================

import { Entity } from './Entity.js';
import { TowerStats, TowerTargeting, EntityState } from './config.js';

export class Tower extends Entity {
    constructor(x, y, towerType) {
        super(x, y);
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
        this.radius = 0.4;     // dimensione visuale
        this.faction = 'enemy';

        this.fireCooldownTimer = 0;
    }

    _drawPlaceholder() {
        const g = this.graphics;
        g.clear();

        // Base: quadrato
        const s = this.radius;
        g.beginFill(this.color);
        g.drawRect(-s, -s, s * 2, s * 2);
        g.endFill();

        // Bordo
        g.lineStyle(0.04, 0x000000, 0.6);
        g.drawRect(-s, -s, s * 2, s * 2);

        // Punta centrale (indica tipo)
        g.lineStyle(0);
        g.beginFill(0xFFFF00, 0.8);
        g.drawCircle(0, 0, s * 0.3);
        g.endFill();

        // Raggio d'azione (cerchio tratteggiato) — solo debug
        // g.lineStyle(0.02, 0xFF0000, 0.2);
        // g.drawCircle(0, 0, this.range);
    }

    update(dt) {
        super.update(dt);
        if (!this.alive) return;

        this.fireCooldownTimer = Math.max(0, this.fireCooldownTimer - dt);
    }

    /**
     * Seleziona il bersaglio migliore tra le entità nemiche in range.
     * Restituisce l'Entity bersaglio o null.
     */
    selectTarget(enemies) {
        // Filtra solo nemici vivi in range
        const inRange = enemies.filter(e => {
            if (!e.alive) return false;
            const dx = e.x - this.x;
            const dy = e.y - this.y;
            return Math.sqrt(dx * dx + dy * dy) <= this.range;
        });

        if (inRange.length === 0) return null;

        switch (this.targeting) {
            case TowerTargeting.PROXIMITY:
                // Il più vicino
                return inRange.reduce((best, e) => {
                    const d = (e.x - this.x) ** 2 + (e.y - this.y) ** 2;
                    const bd = (best.x - this.x) ** 2 + (best.y - this.y) ** 2;
                    return d < bd ? e : best;
                });

            case TowerTargeting.PRIORITY:
                // Meno HP
                return inRange.reduce((best, e) => e.hp < best.hp ? e : best);

            case TowerTargeting.HIGH_VALUE:
                // Costo mana più alto (il mago vale infinito)
                return inRange.reduce((best, e) => {
                    const ev = e.manaCost || 9999;
                    const bv = best.manaCost || 9999;
                    return ev > bv ? e : best;
                });

            default:
                return inRange[0];
        }
    }

    /** Può sparare? */
    canFire() {
        return this.alive && this.fireCooldownTimer <= 0;
    }

    /** Registra lo sparo */
    fire() {
        this.fireCooldownTimer = 1.0 / this.fireRate;
    }
}
