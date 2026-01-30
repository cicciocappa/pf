// ========================================
// Mago — eroe controllato dal giocatore
// ========================================

import { Entity } from './Entity.js';
import { WizardStats, EntityState } from './config.js';

export class Wizard extends Entity {
    constructor(x, y) {
        super(x, y);
        this.hp = WizardStats.hp;
        this.maxHp = WizardStats.hp;
        this.radius = WizardStats.radius;
        this.speed = WizardStats.speed;
        this.faction = 'player';

        this.mana = WizardStats.manaStart;
        this.manaMax = WizardStats.manaMax;
        this.manaRegenRate = WizardStats.manaRegenRate;

        // Inventario pozioni (futuro)
        this.inventory = [];

        // Essenze raccolte
        this.essence = 0;
    }

    _drawPlaceholder() {
        const g = this.graphics;
        g.clear();

        // Corpo: cerchio blu
        g.beginFill(WizardStats.color);
        g.drawCircle(0, 0, this.radius);
        g.endFill();

        // Bordo luminoso
        g.lineStyle(0.04, 0xFFFFFF, 0.8);
        g.drawCircle(0, 0, this.radius);

        // Indicatore direzione (triangolo)
        g.lineStyle(0);
        g.beginFill(0xFFFFFF);
        g.moveTo(this.radius + 0.08, 0);
        g.lineTo(this.radius - 0.06, -0.08);
        g.lineTo(this.radius - 0.06, 0.08);
        g.closePath();
        g.endFill();
    }

    update(dt) {
        super.update(dt);
        if (!this.alive) return;

        // Rigenera mana
        this.mana = Math.min(this.manaMax, this.mana + this.manaRegenRate * dt);

        // Aggiorna rotazione in base alla velocità dell'agente crowd
        // (gestito in Game.js tramite syncFromCrowd)
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
