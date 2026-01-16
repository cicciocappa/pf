
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

    document.getElementById('btn-export').addEventListener('click', () => {
        editor.exportJson();
    });

    // Helper to update UI state
    function setMode(modeId, btnElement) {
        document.querySelectorAll('#controls button').forEach(b => {
            if (b.id !== 'btn-bake' && b.id !== 'btn-clear' && b.id !== 'btn-export') {
                b.classList.remove('active');
            }
        });
        if (btnElement) btnElement.classList.add('active');

        const statusText = modeId === 'draw_outer' ? 'Draw Outer Map' : 'Draw Obstacle';
        document.getElementById('status').innerText = `Mode: ${statusText}`;
    }
});
