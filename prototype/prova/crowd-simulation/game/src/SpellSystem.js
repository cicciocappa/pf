// ========================================
// Sistema incantesimi
// ========================================

import { SpellStats, SpellType } from './config.js';
import { Projectile } from './Projectile.js';

export class SpellSystem {
    constructor(game) {
        this.game = game;
        this.cooldowns = {};

        // Inizializza cooldown a 0
        for (const key of Object.keys(SpellStats)) {
            this.cooldowns[key] = 0;
        }
    }

    update(dt) {
        for (const key of Object.keys(this.cooldowns)) {
            this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
        }
    }

    /**
     * Lancia un incantesimo. Restituisce true se riuscito.
     */
    cast(spellType, wizard, targetX, targetY) {
        const stats = SpellStats[spellType];
        if (!stats) return false;

        // Controlla cooldown
        if (this.cooldowns[spellType] > 0) {
            console.log(`Spell ${spellType} in cooldown: ${this.cooldowns[spellType].toFixed(1)}s`);
            return false;
        }

        // Controlla range
        const dx = targetX - wizard.x;
        const dy = targetY - wizard.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > stats.range) {
            console.log(`Spell ${spellType} fuori range: ${dist.toFixed(1)} > ${stats.range}`);
            return false;
        }

        // Controlla mana
        if (!wizard.canCast(stats.manaCost)) {
            console.log(`Mana insufficiente: ${wizard.mana.toFixed(0)} < ${stats.manaCost}`);
            return false;
        }

        // Spendi mana e imposta cooldown
        wizard.spendMana(stats.manaCost);
        this.cooldowns[spellType] = stats.cooldown;

        // Esegui l'incantesimo
        switch (spellType) {
            case SpellType.FIREBALL:
                this._castFireball(wizard, targetX, targetY, stats);
                break;
        }

        return true;
    }

    _castFireball(wizard, targetX, targetY, stats) {
        // Crea un bersaglio "fantasma" alla posizione di impatto
        const impactTarget = {
            x: targetX,
            y: targetY,
            alive: true,
            hp: 1,
        };

        const proj = new Projectile(
            wizard.x,
            wizard.y,
            impactTarget,
            stats.projectileSpeed,
            stats.damage,
            stats.color,
            stats.aoeRadius
        );

        // Quando colpisce, applica danno ad area
        proj._onHit = () => {
            this._applyAoeDamage(targetX, targetY, stats.aoeRadius, stats.damage, 'enemy');
        };

        this.game.addProjectile(proj);
    }

    /**
     * Applica danno ad area a tutte le entità di una fazione in un raggio.
     */
    _applyAoeDamage(cx, cy, radius, damage, targetFaction) {
        const entities = this.game.getAllEntities();
        for (const e of entities) {
            if (!e.alive || e.faction !== targetFaction) continue;
            const dx = e.x - cx;
            const dy = e.y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= radius) {
                e.damage(damage);
            }
        }

        // Effetto visuale esplosione
        this.game.showExplosion(cx, cy, radius);
    }

    /** Restituisce il tempo di cooldown rimanente per uno spell */
    getCooldown(spellType) {
        return this.cooldowns[spellType] || 0;
    }
}
