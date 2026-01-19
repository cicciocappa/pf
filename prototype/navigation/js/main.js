
// Main entry point
import { Editor } from './editor.js';

document.addEventListener('DOMContentLoaded', () => {
    if (!window.poly2tri) {
        console.error("Poly2Tri library not loaded! Please check your internet connection or the CDN URL.");
        alert("Critical Error: Poly2Tri library not loaded. Check console for details.");
    } else {
        console.log("Poly2Tri loaded successfully.");
    }

    const canvas = document.getElementById('editor-canvas');
    const container = document.getElementById('canvas-container');

    // Initialize canvas size
    function resizeCanvas() {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        if (editor) editor.draw();
    }

    window.addEventListener('resize', resizeCanvas);

    // Initialize Editor
    const editor = new Editor(canvas);
    resizeCanvas(); // Set initial size

    // Bind Controls
    document.getElementById('btn-draw-poly').addEventListener('click', (e) => {
        setMode('draw_outer', e.target);
        editor.setMode('outer');
    });

    document.getElementById('btn-draw-hole').addEventListener('click', (e) => {
        setMode('draw_hole', e.target);
        editor.setMode('hole');
    });

    document.getElementById('btn-bake').addEventListener('click', () => {
        editor.bake();
    });

    document.getElementById('btn-clear').addEventListener('click', () => {
        if (confirm('Clear all?')) {
            editor.clear();
        }
    });

    document.getElementById('btn-export-map').addEventListener('click', () => {
        editor.exportMap();
    });

    document.getElementById('btn-export-navmesh').addEventListener('click', () => {
        const skipMerge = document.getElementById('chk-skip-merge').checked;
        editor.exportNavMesh(skipMerge);
    });

    document.getElementById('btn-load-map').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    if (data.outer) {
                        editor.loadMap(data);
                        document.getElementById('status').innerText = 'Map loaded';
                    } else {
                        alert("Invalid map file: missing 'outer' property");
                    }
                } catch (err) {
                    alert("Error parsing map file: " + err.message);
                }
            };
            reader.readAsText(file);
        }
        // Reset input per permettere di ricaricare lo stesso file
        e.target.value = '';
    });

    // Helper to update UI state
    function setMode(modeId, btnElement) {
        document.querySelectorAll('#controls button').forEach(b => {
            if (b.id !== 'btn-bake' && b.id !== 'btn-clear' &&
                b.id !== 'btn-export-map' && b.id !== 'btn-export-navmesh') {
                b.classList.remove('active');
            }
        });
        if (btnElement) btnElement.classList.add('active');

        const statusText = modeId === 'draw_outer' ? 'Draw Outer Map' : 'Draw Obstacle';
        document.getElementById('status').innerText = `Mode: ${statusText}`;
    }
});
