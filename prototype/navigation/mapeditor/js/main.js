import { MapEditor } from './map-editor.js';

/**
 * Editor Entry Point
 * Initializes the map editor and binds UI elements
 */

let editor = null;

/**
 * Initialize the editor
 */
function init() {
    const canvas = document.getElementById('editor-canvas');
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }

    // Create editor instance
    editor = new MapEditor(canvas);
    //window.myeditor = editor;

    // Set default tool
    editor.setTool('select');

    // Bind UI elements
    bindToolButtons();
    bindActionButtons();
    bindFileButtons();
    bindOptions();
    bindDialog();

    console.log('Map Editor initialized');
}

/**
 * Bind tool buttons
 */
function bindToolButtons() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tool = btn.dataset.tool;
            if (tool) {
                editor.setTool(tool);
            }
        });
    });
}

/**
 * Bind action buttons
 */
function bindActionButtons() {
    // Bake button
    const bakeBtn = document.getElementById('btn-bake');
    if (bakeBtn) {
        bakeBtn.addEventListener('click', () => editor.bake());
    }

    // Clear NavMesh button
    const clearNavmeshBtn = document.getElementById('btn-clear-navmesh');
    if (clearNavmeshBtn) {
        clearNavmeshBtn.addEventListener('click', () => editor.clearNavmesh());
    }

    // Clear button
    const clearBtn = document.getElementById('btn-clear');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('Clear all map data?')) {
                editor.clear();
            }
        });
    }

    // Reset view button
    const resetViewBtn = document.getElementById('btn-reset-view');
    if (resetViewBtn) {
        resetViewBtn.addEventListener('click', () => editor.resetView());
    }

    // Close stats button
    const closeStatsBtn = document.getElementById('btn-close-stats');
    if (closeStatsBtn) {
        closeStatsBtn.addEventListener('click', () => editor.hideStats());
    }
}

/**
 * Bind file buttons
 */
function bindFileButtons() {
    // Load map
    const loadInput = document.getElementById('btn-load-map');
    if (loadInput) {
        loadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const json = JSON.parse(event.target.result);
                        editor.loadMap(json);
                    } catch (err) {
                        alert('Error parsing JSON file: ' + err.message);
                    }
                };
                reader.readAsText(file);
            }
            // Reset input so same file can be loaded again
            e.target.value = '';
        });
    }

    // Export map
    const exportMapBtn = document.getElementById('btn-export-map');
    if (exportMapBtn) {
        exportMapBtn.addEventListener('click', () => editor.exportMap());
    }

    // Export navmesh
    const exportNavmeshBtn = document.getElementById('btn-export-navmesh');
    if (exportNavmeshBtn) {
        exportNavmeshBtn.addEventListener('click', () => editor.exportNavMesh());
    }
}

/**
 * Bind option checkboxes
 */
function bindOptions() {
    // Snap to vertices checkbox
    const snapChk = document.getElementById('chk-snap');
    if (snapChk) {
        snapChk.addEventListener('change', (e) => {
            editor.setSnapEnabled(e.target.checked);
        });
    }

    // Snap to edges checkbox
    const snapEdgeChk = document.getElementById('chk-snap-edge');
    if (snapEdgeChk) {
        snapEdgeChk.addEventListener('change', (e) => {
            editor.setSnapToEdgeEnabled(e.target.checked);
        });
    }

    // Snap to grid checkbox
    const snapGridChk = document.getElementById('chk-snap-grid');
    if (snapGridChk) {
        snapGridChk.addEventListener('change', (e) => {
            editor.setGridSnapEnabled(e.target.checked);
        });
    }

    // Grid size selector
    const gridSizeSel = document.getElementById('rng-grid-size');
    const gridSizeValue = document.getElementById('val-grid-size');
    if (gridSizeSel) {
        gridSizeSel.addEventListener('input', (e) => {
            gridSizeValue.textContent = `(${e.target.value}px)`;
            editor.setGridSize(parseInt(e.target.value, 10));
        });
    }

    // Show triangles checkbox
    const trianglesChk = document.getElementById('chk-show-triangles');
    if (trianglesChk) {
        trianglesChk.addEventListener('change', (e) => {
            editor.setShowTriangles(e.target.checked);
        });
    }

    // Debug holes checkbox
    const holesDebugChk = document.getElementById('chk-show-holes-debug');
    if (holesDebugChk) {
        holesDebugChk.addEventListener('change', (e) => {
            editor.setShowHolesDebug(e.target.checked);
        });
    }

    // Debug merge components checkbox
    const mergeComponentsChk = document.getElementById('chk-show-merge-components');
    if (mergeComponentsChk) {
        mergeComponentsChk.addEventListener('change', (e) => {
            editor.setShowMergeComponentsDebug(e.target.checked);
        });
    }
}

/**
 * Bind dialog events
 */
function bindDialog() {
    const overlay = document.getElementById('dialog-overlay');
    const cancelBtn = document.getElementById('dialog-cancel');
    const okBtn = document.getElementById('dialog-ok');

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            hideDialog();
        });
    }

    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                hideDialog();
            }
        });
    }

    // OK button handler is set dynamically when showing dialog
}

/**
 * Show properties dialog
 * @param {string} title - Dialog title
 * @param {Object} properties - Object with property definitions
 * @param {Function} onOk - Callback with updated values
 */
export function showDialog(title, properties, onOk) {
    const overlay = document.getElementById('dialog-overlay');
    const titleEl = document.getElementById('dialog-title');
    const contentEl = document.getElementById('dialog-content');
    const okBtn = document.getElementById('dialog-ok');

    if (!overlay || !contentEl) return;

    // Set title
    if (titleEl) {
        titleEl.textContent = title;
    }

    // Build form
    contentEl.innerHTML = '';
    for (const [key, prop] of Object.entries(properties)) {
        const row = document.createElement('div');
        row.className = 'dialog-row';

        const label = document.createElement('label');
        label.textContent = prop.label || key;
        label.setAttribute('for', `prop-${key}`);

        const input = document.createElement('input');
        input.type = prop.type || 'number';
        input.id = `prop-${key}`;
        input.name = key;
        input.value = prop.value;
        if (prop.step) input.step = prop.step;
        if (prop.min !== undefined) input.min = prop.min;
        if (prop.max !== undefined) input.max = prop.max;

        row.appendChild(label);
        row.appendChild(input);
        contentEl.appendChild(row);
    }

    // Set OK handler
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    newOkBtn.addEventListener('click', () => {
        const values = {};
        for (const key of Object.keys(properties)) {
            const input = document.getElementById(`prop-${key}`);
            if (input) {
                values[key] = parseFloat(input.value) || 0;
            }
        }
        onOk(values);
        hideDialog();
    });

    // Show dialog
    overlay.classList.remove('hidden');
}

/**
 * Hide properties dialog
 */
export function hideDialog() {
    const overlay = document.getElementById('dialog-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

// Make editor accessible globally for debugging
window.mapEditor = null;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    init();
    window.mapEditor = editor;
});
