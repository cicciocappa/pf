import { MapEditor } from './map-editor.js';
import { GeometryFactory } from './factories/geometry-factory.js';

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
    populateBuildingsList();
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

let currentSelectedBuilding = 'SMALL_HOUSE';

function populateBuildingsList() {
    const list = document.getElementById('buildings-list');
    const selector = document.getElementById('buildings-selector');
    const preview = document.getElementById('active-building-preview');
    const previewSvg = document.getElementById('building-preview');
    const buildingName = document.getElementById('building-name');
    const hoverName = document.getElementById('buildings-hover-name');
    const templates = GeometryFactory.getAvailableTemplates();

    function formatName(id) {
        return id.replace(/_/g, ' ');
    }

    // Popola la griglia con le preview degli edifici
    templates.forEach(id => {
        const points = GeometryFactory.getTemplate(id);
        const svg = createShapePreview(id, points);
        svg.dataset.templateId = id;

        if (id === currentSelectedBuilding) {
            svg.classList.add('selected');
        }

        svg.addEventListener('click', (e) => {
            e.stopPropagation();
            selectBuilding(id);
            hideSelector();
        });

        svg.addEventListener('mouseenter', () => {
            hoverName.textContent = formatName(id);
        });

        svg.addEventListener('mouseleave', () => {
            hoverName.textContent = 'Select a building';
        });

        list.appendChild(svg);
    });

    // Imposta la preview iniziale
    updateBuildingPreview(currentSelectedBuilding);

    // Click sulla preview per aprire/chiudere il selettore
    preview.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSelector();
    });

    // Chiudi il selettore cliccando fuori
    document.addEventListener('click', (e) => {
        if (!selector.contains(e.target) && !preview.contains(e.target)) {
            hideSelector();
        }
    });

    function toggleSelector() {
        if (selector.classList.contains('hidden')) {
            showSelector();
        } else {
            hideSelector();
        }
    }

    function showSelector() {
        // Posiziona il pannello accanto alla preview
        const rect = preview.getBoundingClientRect();
        selector.style.left = (rect.right + 8) + 'px';
        selector.style.top = rect.top + 'px';
        selector.classList.remove('hidden');
    }

    function hideSelector() {
        selector.classList.add('hidden');
    }

    function selectBuilding(id) {
        currentSelectedBuilding = id;

        // Aggiorna la selezione visuale nella griglia
        list.querySelectorAll('.shape-preview').forEach(svg => {
            svg.classList.toggle('selected', svg.dataset.templateId === id);
        });

        // Aggiorna la preview principale
        updateBuildingPreview(id);

        // Aggiorna il tool building
        const tool = editor.tools['building'];
        if (tool) {
            tool.currentTemplateId = id;
            // Imposta il numero di lati basato sul template
            const points = GeometryFactory.getTemplate(id);
            tool.sides = points.length;
        }
    }

    function updateBuildingPreview(id) {
        // Aggiorna il nome
        buildingName.textContent = formatName(id);

        // Aggiorna l'SVG della preview
        const points = GeometryFactory.getTemplate(id);
        const xs = points.map(p => p.x);
        const ys = points.map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const width = maxX - minX;
        const height = maxY - minY;

        previewSvg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
        previewSvg.innerHTML = '';

        const pointStr = points.map(p => `${p.x},${p.y}`).join(' ');
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', pointStr);
        polygon.setAttribute('fill', 'none');
        polygon.setAttribute('stroke', 'currentColor');
        polygon.setAttribute('stroke-width', '0.05');
        previewSvg.appendChild(polygon);
    }
}

function createShapePreview(name, points) {
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `${minX} ${minY} ${width} ${height}`);
  svg.classList.add("shape-preview");
  svg.dataset.name = name;

  const pointStr = points.map(p => `${p.x},${p.y}`).join(" ");
  const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  polygon.setAttribute("points", pointStr);
  polygon.setAttribute("fill", "none");
  polygon.setAttribute("stroke", "currentColor");
  polygon.setAttribute("stroke-width", "0.05"); // relativo alla viewBox!

  svg.appendChild(polygon);
  return svg;
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

    // Grid size selector (range and text input synchronized)
    const gridSizeRange = document.getElementById('rng-grid-size');
    const gridSizeInput = document.getElementById('val-grid-size');
    if (gridSizeRange && gridSizeInput) {
        gridSizeRange.addEventListener('input', (e) => {
            gridSizeInput.value = e.target.value;
            editor.setGridSize(parseInt(e.target.value, 10));
        });
        gridSizeInput.addEventListener('input', (e) => {
            let value = parseInt(e.target.value, 10);
            if (!isNaN(value)) {
                value = Math.max(8, Math.min(128, value));
                gridSizeRange.value = value;
                editor.setGridSize(value);
            }
        });
        gridSizeInput.addEventListener('blur', (e) => {
            let value = parseInt(e.target.value, 10);
            if (isNaN(value) || value < 8) value = 8;
            if (value > 128) value = 128;
            e.target.value = value;
            gridSizeRange.value = value;
            editor.setGridSize(value);
        });
    }

    // Show labels checkbox
    const labelsChk = document.getElementById('chk-show-labels');
    if (labelsChk) {
        labelsChk.addEventListener('change', (e) => {
            editor.setShowLabels(e.target.checked);
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
