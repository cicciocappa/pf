// ========================================
// Entry point — avvio del gioco
// ========================================

import { Game } from './Game.js';
import { level1 } from './levels/level1.js';

async function init() {
    // Crea applicazione Pixi.js
    const app = new PIXI.Application({
        resizeTo: window,
        backgroundColor: 0x1a1a2e,
        antialias: true,
    });

    document.getElementById('game-container').appendChild(app.view);

    // Crea il gioco
    const game = new Game(app);

    // Carica il livello
    game.loadLevel(level1);

    // Game loop
    app.ticker.add(() => {
        const dt = app.ticker.deltaMS / 1000;
        game.update(Math.min(dt, 0.1)); // cap a 100ms per evitare salti
    });

    // Esponi per debug
    window.game = game;

    console.log('Gioco avviato!');
    console.log('Controlli:');
    console.log('  Click destro: muovi mago e creature');
    console.log('  Click sinistro su torre: ordina attacco creature');
    console.log('  [1] + click: Palla di Fuoco');
    console.log('  [G]: Evoca Gigante');
    console.log('  [L]: Evoca Larve');
    console.log('  [E]: Evoca Elementale');
    console.log('  WASD/Frecce: pan camera');
    console.log('  Rotella: zoom');
    console.log('  Alt+click drag: pan camera');
}

init().catch(err => console.error('Errore di inizializzazione:', err));
