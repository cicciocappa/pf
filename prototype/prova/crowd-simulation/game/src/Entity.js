// ========================================
// Classe base Entity
// ========================================

import { EntityState } from './config.js';

let nextEntityId = 1;

export class Entity {
    constructor(x, y) {
        this.id = nextEntityId++;
        this.x = x;
        this.y = y;
        this.hp = 100;
        this.maxHp = 100;
        this.state = EntityState.IDLE;
        this.radius = 0.25;

        // Crowd agent ID (navcat) — null se non è un agente mobile
        this.crowdAgentId = null;

        // Rendering
        this.graphics = null;   // PIXI.Graphics placeholder
        this.container = null;  // PIXI.Container che contiene graphics + HP bar

        // Direzione (angolo in radianti, 0 = destra)
        this.angle = 0;

        // Fazione: 'player' o 'enemy'
        this.faction = 'player';

        // Target corrente (Entity o null)
        this.attackTarget = null;
        this.attackCooldownTimer = 0;
    }

    get alive() {
        return this.hp > 0;
    }

    damage(amount) {
        if (!this.alive) return;
        this.hp = Math.max(0, this.hp - amount);
        if (this.hp <= 0) {
            this.state = EntityState.DEAD;
            this.onDeath();
        }
        this._updateHpBar();
    }

    onDeath() {
        // Override nelle sottoclassi
    }

    /** Crea il container PIXI con placeholder grafico */
    createVisual() {
        this.container = new PIXI.Container();
        this.graphics = new PIXI.Graphics();
        this.container.addChild(this.graphics);

        // HP bar (sopra l'entità)
        this.hpBarBg = new PIXI.Graphics();
        this.hpBarFill = new PIXI.Graphics();
        this.container.addChild(this.hpBarBg);
        this.container.addChild(this.hpBarFill);

        this._drawPlaceholder();
        this._updateHpBar();
        this._syncPosition();
        return this.container;
    }

    _drawPlaceholder() {
        // Override nelle sottoclassi
    }

    _updateHpBar() {
        if (!this.hpBarBg) return;
        const w = this.radius * 2;
        const h = 0.06;
        const yOff = -this.radius - 0.12;

        this.hpBarBg.clear();
        this.hpBarBg.beginFill(0x333333);
        this.hpBarBg.drawRect(-w / 2, yOff, w, h);
        this.hpBarBg.endFill();

        this.hpBarFill.clear();
        const ratio = Math.max(0, this.hp / this.maxHp);
        const color = ratio > 0.5 ? 0x00ff00 : ratio > 0.25 ? 0xffff00 : 0xff0000;
        this.hpBarFill.beginFill(color);
        this.hpBarFill.drawRect(-w / 2, yOff, w * ratio, h);
        this.hpBarFill.endFill();
    }

    _syncPosition() {
        if (this.container) {
            this.container.position.set(this.x, this.y);
            this.container.visible = this.alive;
        }
    }

    update(dt) {
        if (!this.alive) return;
        this.attackCooldownTimer = Math.max(0, this.attackCooldownTimer - dt);
        this._syncPosition();
    }
}
