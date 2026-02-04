// ========================================
// Entry point — avvio del gioco 3D
// ========================================

import { Game } from './Game.js';

async function init() {
    const container = document.getElementById('game-container');
    const game = new Game(container);

    // Carica il livello: prima da localStorage, poi da file di esempio
    let levelData = null;

    // Prova sempre localStorage (l'editor salva qui)
    const data = localStorage.getItem('editorMesh3D');
    if (data) {
        try {
            levelData = JSON.parse(data);
            console.log('Livello caricato da localStorage');
        } catch (e) {
            console.error('Errore nel parsing della mesh dall\'editor:', e);
        }
    }

    if (!levelData) {
        // Prova a caricare un file di esempio
        try {
            const resp = await fetch('../sample-mesh3d.json');
            if (resp.ok) {
                levelData = await resp.json();
                console.log('Livello caricato da sample-mesh3d.json');
            }
        } catch (e) {
            // silenzioso
        }
    }

    if (levelData) {
        game.loadLevel(levelData);
    } else {
        console.warn('Nessun livello caricato. Apri l\'editor, crea un livello e clicca "Esporta Mesh 3D", poi ricarica questa pagina.');
    }

    // Game loop
    let lastTime = performance.now();

    function loop(time) {
        const dt = Math.min((time - lastTime) / 1000, 0.1);
        lastTime = time;

        game.update(dt);
        game.render();

        requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);

    // Esponi per debug
    window.game = game;

    console.log('Tower Attack 3D avviato!');
    console.log('Controlli:');
    console.log('  Click destro: muovi mago e creature');
    console.log('  Click sinistro su torre: ordina attacco creature');
    console.log('  [1] + click: Palla di Fuoco');
    console.log('  [G]: Evoca Gigante');
    console.log('  [L]: Evoca Larve');
    console.log('  [E]: Evoca Elementale');
    console.log('  WASD/Frecce: pan camera');
    console.log('  Rotella: zoom');
}

init().catch(err => console.error('Errore di inizializzazione:', err));
