// main.js - Inizializzazione e game loop

import { state, config } from './state.js';
import { generateGraph } from './navgraph.js';
import { updateAgents } from './agents.js';
import { bindEvents } from './input.js';
import { render, fitToView, initRenderer } from './renderer.js';

let canvas = null;

async function loadMap() {
    try {
        const response = await fetch('input.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        state.mapData = await response.json();
        console.log('Map loaded successfully');
        return true;
    } catch (error) {
        console.error('Error loading map:', error);
        return false;
    }
}

function resize() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    render(canvas);
}

function gameLoop(timestamp) {
    const dt = (timestamp - state.lastTime) / 1000;
    state.lastTime = timestamp;

    updateAgents();
    render(canvas);

    requestAnimationFrame(gameLoop);
}

async function init() {
    canvas = document.getElementById('canvas');
    initRenderer(canvas);

    resize();
    window.addEventListener('resize', resize);

    // Carica la mappa
    const loaded = await loadMap();
    if (!loaded) {
        console.error('Failed to load map. Make sure input.json exists in the test folder.');
        return;
    }

    // Genera automaticamente il navgraph
    generateGraph();

    // Adatta la vista
    fitToView(canvas);

    // Bind eventi
    bindEvents(canvas);

    // Bind checkbox RVO
    const rvoCheckbox = document.getElementById('use-rvo');
    rvoCheckbox.addEventListener('change', (e) => {
        config.useRVO = e.target.checked;
        console.log('RVO:', config.useRVO ? 'enabled' : 'disabled');
    });

    // Primo render
    render(canvas);

    // Avvia game loop
    requestAnimationFrame(gameLoop);

    console.log('Initialization complete');
    console.log('Controls:');
    console.log('  Shift + Click: Spawn agent');
    console.log('  Right Click: Move agents to formation');
    console.log('  Alt + Wheel: Zoom');
    console.log('  Space + Drag / Middle Mouse: Pan');
}

// Avvia quando il DOM è pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
