// ========================================
// HUD — aggiornamento overlay HTML
// ========================================

import { SpellStats, CreatureStats, CreatureType } from './config.js';

export class HUD {
    constructor(game) {
        this.game = game;

        // Riferimenti DOM
        this.hpBar = document.getElementById('hpBar');
        this.hpText = document.getElementById('hpText');
        this.manaBar = document.getElementById('manaBar');
        this.manaText = document.getElementById('manaText');
        this.hudSpells = document.getElementById('hudSpells');
        this.hudStatus = document.getElementById('hud-status');
        this.overlay = document.getElementById('overlay');
        this.overlayText = document.getElementById('overlay-text');

        this._buildSpellHUD();
    }

    _buildSpellHUD() {
        let html = '';
        for (const [key, stats] of Object.entries(SpellStats)) {
            html += `<span id="spell-${key}">[<kbd>${stats.key}</kbd>] ${stats.label} (${stats.manaCost}M) <span class="ready">PRONTO</span></span>  `;
        }
        html += '<br>';
        html += `[<kbd>G</kbd>] Gigante (${CreatureStats[CreatureType.GIANT].manaCost}M)  `;
        html += `[<kbd>L</kbd>] Larve (${CreatureStats[CreatureType.LARVA].manaCost}M)  `;
        html += `[<kbd>E</kbd>] Elementale (${CreatureStats[CreatureType.ELEMENTAL].manaCost}M)`;
        this.hudSpells.innerHTML = html;
    }

    update() {
        const game = this.game;
        const wizard = game.wizard;

        if (wizard) {
            // HP
            const hpRatio = Math.max(0, wizard.hp / wizard.maxHp);
            this.hpBar.style.width = (hpRatio * 100) + '%';
            this.hpText.textContent = `${Math.ceil(wizard.hp)}/${wizard.maxHp}`;

            // Mana
            const manaRatio = Math.max(0, wizard.mana / wizard.manaMax);
            this.manaBar.style.width = (manaRatio * 100) + '%';
            this.manaText.textContent = `${Math.ceil(wizard.mana)}/${wizard.manaMax}`;
        }

        // Spells cooldown
        const spells = game.spellSystem;
        if (spells) {
            for (const [key, stats] of Object.entries(SpellStats)) {
                const el = document.getElementById(`spell-${key}`);
                if (!el) continue;
                const cd = spells.getCooldown(key);
                if (cd > 0) {
                    el.innerHTML = `[<kbd>${stats.key}</kbd>] ${stats.label} (${stats.manaCost}M) <span class="cooldown">${cd.toFixed(1)}s</span>`;
                } else {
                    el.innerHTML = `[<kbd>${stats.key}</kbd>] ${stats.label} (${stats.manaCost}M) <span class="ready">PRONTO</span>`;
                }
            }
        }

        // Status
        const creatureCount = game.creatures.filter(c => c.alive).length;
        const towerCount = game.towers.filter(t => t.alive).length;
        this.hudStatus.textContent = `Creature: ${creatureCount} | Torri: ${towerCount}`;

        // Game over / Victory
        if (wizard && !wizard.alive) {
            this.overlay.classList.add('visible');
            this.overlayText.textContent = 'GAME OVER';
            this.overlayText.className = 'defeat';
        } else if (game.victory) {
            this.overlay.classList.add('visible');
            this.overlayText.textContent = 'VITTORIA!';
            this.overlayText.className = 'victory';
        } else {
            this.overlay.classList.remove('visible');
        }
    }
}
