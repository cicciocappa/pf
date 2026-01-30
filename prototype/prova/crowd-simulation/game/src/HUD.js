// ========================================
// HUD — interfaccia di gioco
// ========================================

import { SpellStats, CreatureStats, CreatureType } from './config.js';

export class HUD {
    constructor(game) {
        this.game = game;
        this.container = new PIXI.Container();

        this._createElements();
    }

    _createElements() {
        // Sfondo barra inferiore
        this.bottomBar = new PIXI.Graphics();
        this.container.addChild(this.bottomBar);

        // Testo stato
        this.statusText = new PIXI.Text('', {
            fontFamily: 'monospace',
            fontSize: 14,
            fill: 0xFFFFFF,
        });
        this.statusText.position.set(10, 10);
        this.container.addChild(this.statusText);

        // Testo mana
        this.manaText = new PIXI.Text('', {
            fontFamily: 'monospace',
            fontSize: 14,
            fill: 0x6699FF,
        });
        this.container.addChild(this.manaText);

        // Testo HP
        this.hpText = new PIXI.Text('', {
            fontFamily: 'monospace',
            fontSize: 14,
            fill: 0x66FF66,
        });
        this.container.addChild(this.hpText);

        // Barra spell
        this.spellText = new PIXI.Text('', {
            fontFamily: 'monospace',
            fontSize: 13,
            fill: 0xFFCC00,
        });
        this.container.addChild(this.spellText);

        // Testo evocazioni
        this.summonText = new PIXI.Text('', {
            fontFamily: 'monospace',
            fontSize: 13,
            fill: 0xCCCCCC,
        });
        this.container.addChild(this.summonText);

        // Game over text
        this.gameOverText = new PIXI.Text('GAME OVER', {
            fontFamily: 'monospace',
            fontSize: 48,
            fill: 0xFF0000,
            fontWeight: 'bold',
        });
        this.gameOverText.anchor.set(0.5);
        this.gameOverText.visible = false;
        this.container.addChild(this.gameOverText);

        // Vittoria text
        this.victoryText = new PIXI.Text('VITTORIA!', {
            fontFamily: 'monospace',
            fontSize: 48,
            fill: 0xFFD700,
            fontWeight: 'bold',
        });
        this.victoryText.anchor.set(0.5);
        this.victoryText.visible = false;
        this.container.addChild(this.victoryText);
    }

    update(screenWidth, screenHeight) {
        const game = this.game;
        const wizard = game.wizard;

        // Sfondo barra in alto
        this.bottomBar.clear();
        this.bottomBar.beginFill(0x000000, 0.6);
        this.bottomBar.drawRect(0, 0, screenWidth, 80);
        this.bottomBar.endFill();

        // HP
        if (wizard) {
            this.hpText.text = `HP: ${Math.ceil(wizard.hp)}/${wizard.maxHp}`;
            this.hpText.position.set(10, 30);

            this.manaText.text = `Mana: ${Math.ceil(wizard.mana)}/${wizard.manaMax}`;
            this.manaText.position.set(10, 48);
        }

        // Spell info
        const spells = game.spellSystem;
        let spellStr = 'Incantesimi:  ';
        for (const [key, stats] of Object.entries(SpellStats)) {
            const cd = spells ? spells.getCooldown(key) : 0;
            const cdStr = cd > 0 ? ` (${cd.toFixed(1)}s)` : ' [PRONTO]';
            spellStr += `[${stats.key}] ${stats.label} (${stats.manaCost}M)${cdStr}   `;
        }
        this.spellText.text = spellStr;
        this.spellText.position.set(200, 10);

        // Summon info
        let summonStr = 'Evocazioni:   ';
        summonStr += `[G] Gigante (${CreatureStats[CreatureType.GIANT].manaCost}M)   `;
        summonStr += `[L] Larve (${CreatureStats[CreatureType.LARVA].manaCost}M)   `;
        summonStr += `[E] Elementale (${CreatureStats[CreatureType.ELEMENTAL].manaCost}M)`;
        this.summonText.text = summonStr;
        this.summonText.position.set(200, 30);

        // Status
        const creatureCount = game.creatures.filter(c => c.alive).length;
        const towerCount = game.towers.filter(t => t.alive).length;
        this.statusText.text = `Creature: ${creatureCount} | Torri nemiche: ${towerCount}`;
        this.statusText.position.set(200, 50);

        // Game over
        this.gameOverText.position.set(screenWidth / 2, screenHeight / 2);
        this.gameOverText.visible = wizard && !wizard.alive;

        // Vittoria
        this.victoryText.position.set(screenWidth / 2, screenHeight / 2);
        this.victoryText.visible = game.victory;
    }
}
