// ========================================
// editor3d.js - Main orchestrator
// Tool switching, save/load, export
// ========================================

import { EditorData3D } from './editor3d-models.js';
import { Editor3DRenderer } from './editor3d-renderer.js';
import {
    Building3DTool,
    Wall3DTool,
    Obstacle3DTool,
    SelectTool
} from './editor3d-tools.js';
import { NavcatExporter, GLTFExporter } from './editor3d-export.js';

class NavMeshEditor3D {
    constructor() {
        this.canvas = document.getElementById('canvas');

        // Data
        this.editorData = new EditorData3D();

        // Renderer
        this.renderer = new Editor3DRenderer(this);

        // Tools
        this.tools = {};
        this.currentTool = 'building';
        this.currentToolInstance = null;

        // Selection
        this.selectedObject = null;

        // Input state
        this.isPanning = false;
        this.isOrbiting = false;
        this.mouseDown = false;
        this.mouseDownPos = { x: 0, y: 0 };

        this.init();
    }

    init() {
        this._initTools();
        this.setupEventListeners();
        this.setTool('building');
        this.startLoop();
    }

    _initTools() {
        this.tools = {
            building: new Building3DTool(this),
            wall: new Wall3DTool(this),
            obstacle: new Obstacle3DTool(this),
            select: new SelectTool(this)
        };
    }

    // ========================================
    // Tool management
    // ========================================
    setTool(toolName) {
        if (this.currentToolInstance) {
            this.currentToolInstance.deactivate();
        }

        this.currentTool = toolName;
        this.currentToolInstance = this.tools[toolName];

        if (this.currentToolInstance) {
            this.currentToolInstance.activate();
        }

        // Update UI
        document.querySelectorAll('.toolbar button[data-tool]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === toolName);
        });

        this.updateStatus();
    }

    selectObject(obj) {
        this.selectedObject = obj;
        this.updatePropertiesPanel();
    }

    // ========================================
    // Event Listeners
    // ========================================
    setupEventListeners() {
        // Tool buttons
        document.querySelectorAll('.toolbar button[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => this.setTool(btn.dataset.tool));
        });

        // Actions
        document.getElementById('exportNavcat')?.addEventListener('click', () => this.exportNavcat());
        document.getElementById('exportGLTF')?.addEventListener('click', () => this.exportGLTF());
        document.getElementById('testLevel')?.addEventListener('click', () => this.testLevel());
        document.getElementById('saveProject')?.addEventListener('click', () => this.saveProject());
        document.getElementById('loadProject')?.addEventListener('click', () => {
            document.getElementById('projectFileInput').click();
        });

        document.getElementById('projectFileInput')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        this.loadProject(JSON.parse(ev.target.result));
                    } catch (err) {
                        this.setStatus('Error loading project: ' + err.message);
                    }
                };
                reader.readAsText(file);
            }
            e.target.value = '';
        });

        document.getElementById('clearAll')?.addEventListener('click', () => {
            if (confirm('Clear all objects?')) {
                this.editorData.clear();
                this.selectedObject = null;
                this.setStatus('Reset completed');
            }
        });

        // Canvas events
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        window.addEventListener('keydown', (e) => this.onKeyDown(e));
    }

    // ========================================
    // Input handlers
    // ========================================
    onKeyDown(e) {
        // Global shortcuts
        if (e.key === 'b' || e.key === 'B') { this.setTool('building'); return; }
        if (e.key === 'w' || e.key === 'W') { this.setTool('wall'); return; }
        if (e.key === 'o' || e.key === 'O') { this.setTool('obstacle'); return; }
        if (e.key === 's' && !e.ctrlKey) { this.setTool('select'); return; }

        // Forward to tool
        if (this.currentToolInstance) {
            this.currentToolInstance.onKeyDown(e);
        }
    }

    onMouseDown(e) {
        this.mouseDown = true;
        this.mouseDownPos = { x: e.clientX, y: e.clientY };

        if (e.button === 1) {
            // Middle mouse - pan
            this.isPanning = true;
            this.renderer.controls.enabled = false;
            return;
        }

        if (e.button === 0 && e.shiftKey) {
            // Shift + left mouse - orbit
            this.isOrbiting = true;
            this.renderer.controls.enabled = true;
            return;
        }

        if (e.button === 0 && this.currentToolInstance) {
            // Tool action
            const worldPos = this.renderer.getIntersectionPoint(e.clientX, e.clientY);
            if (worldPos) {
                this.currentToolInstance.onMouseDown(worldPos.x, worldPos.y, e);
            }
        }
    }

    onMouseMove(e) {
        if (this.isPanning) {
            // Handle panning manually
            const dx = e.clientX - this.mouseDownPos.x;
            const dy = e.clientY - this.mouseDownPos.y;

            const panSpeed = 0.05;
            this.renderer.camera.position.x -= dx * panSpeed;
            this.renderer.camera.position.z -= dy * panSpeed;
            this.renderer.controls.target.x -= dx * panSpeed;
            this.renderer.controls.target.z -= dy * panSpeed;

            this.mouseDownPos = { x: e.clientX, y: e.clientY };
            return;
        }

        if (this.currentToolInstance) {
            const worldPos = this.renderer.getIntersectionPoint(e.clientX, e.clientY);
            if (worldPos) {
                this.currentToolInstance.onMouseMove(worldPos.x, worldPos.y, e);
            }
        }
    }

    onMouseUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.renderer.controls.enabled = true;
        }

        if (this.isOrbiting) {
            this.isOrbiting = false;
        }

        if (e.button === 0 && this.currentToolInstance && !e.shiftKey) {
            const worldPos = this.renderer.getIntersectionPoint(e.clientX, e.clientY);
            if (worldPos) {
                this.currentToolInstance.onMouseUp(worldPos.x, worldPos.y, e);
            }
        }

        this.mouseDown = false;
    }

    onWheel(e) {
        e.preventDefault();

        // If tool wants to handle wheel, forward to it
        if (this.currentToolInstance && (this.currentTool === 'building' || this.currentTool === 'wall' || this.currentTool === 'obstacle')) {
            this.currentToolInstance.onWheel(e.deltaY, e);
            return;
        }

        // Default: zoom (handled by OrbitControls)
    }

    // ========================================
    // Export
    // ========================================
    exportNavcat() {
        const exporter = new NavcatExporter(this.editorData);
        const data = exporter.export();

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'navmesh3d.json';
        a.click();
        URL.revokeObjectURL(url);

        this.setStatus(`Exported: ${data.geometry.positions.length / 3} vertices, ${data.geometry.indices.length / 3} triangles`);
    }

    exportGLTF() {
        this.setStatus('GLTF export not yet implemented');
    }

    testLevel() {
        // Export current level to localStorage and open player
        const exporter = new NavcatExporter(this.editorData);
        const data = exporter.export();

        localStorage.setItem('editor3DNavMesh', JSON.stringify(data));
        window.open('player3d.html?fromEditor=1', '_blank');
        this.setStatus('Level sent to player');
    }

    // ========================================
    // Save/Load
    // ========================================
    saveProject() {
        const project = {
            editorData: this.editorData.toJSON(),
            camera: {
                position: this.renderer.camera.position.toArray(),
                target: this.renderer.controls.target.toArray()
            }
        };

        const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'navmesh3d-project.json';
        a.click();
        URL.revokeObjectURL(url);

        this.setStatus('Project saved');
    }

    loadProject(data) {
        if (data.editorData) {
            this.editorData.fromJSON(data.editorData);
        }

        if (data.camera) {
            if (data.camera.position) {
                this.renderer.camera.position.fromArray(data.camera.position);
            }
            if (data.camera.target) {
                this.renderer.controls.target.fromArray(data.camera.target);
            }
            this.renderer.controls.update();
        }

        this.selectedObject = null;

        const nBldg = this.editorData.buildings.size;
        const nWall = this.editorData.walls.size;
        const nObs = this.editorData.obstacles.size;
        this.setStatus(`Project loaded: ${nBldg} buildings, ${nWall} walls, ${nObs} obstacles`);
    }

    // ========================================
    // UI Updates
    // ========================================
    updateInfoBar() {
        const nBldg = this.editorData.buildings.size;
        const nWall = this.editorData.walls.size;
        const nObs = this.editorData.obstacles.size;

        const setText = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setText('buildingCount', nBldg);
        setText('wallCount', nWall);
        setText('obstacleCount', nObs);
    }

    updateStatus() {
        if (this.currentToolInstance) {
            this.setStatus(this.currentToolInstance.getStatusText());
        }
    }

    setStatus(text) {
        const el = document.getElementById('status');
        if (el) el.textContent = text;
    }

    updatePropertiesPanel() {
        const panel = document.getElementById('propertiesContent');
        if (!panel) return;

        if (!this.selectedObject) {
            panel.innerHTML = '<p class="prop-hint">No selection</p>';
            return;
        }

        const obj = this.selectedObject;
        let html = `<div class="prop-row"><span class="prop-label">Type:</span><span class="prop-value">${obj.type}</span></div>`;
        html += `<div class="prop-row"><span class="prop-label">ID:</span><span class="prop-value">${obj.id}</span></div>`;

        if (obj.type === 'building') {
            html += `<div class="prop-row"><span class="prop-label">Position:</span><span class="prop-value">${obj.position.x.toFixed(1)}, ${obj.position.y.toFixed(1)}</span></div>`;
            html += `<div class="prop-row"><span class="prop-label">Scale:</span><span class="prop-value">${obj.scaleX.toFixed(1)} x ${obj.scaleY.toFixed(1)}</span></div>`;
            html += `<div class="prop-row"><span class="prop-label">Height:</span><span class="prop-value">${obj.height.toFixed(1)} m</span></div>`;
            html += `<div class="prop-row"><span class="prop-label">Sides:</span><span class="prop-value">${obj.sides}</span></div>`;
        } else if (obj.type === 'wall') {
            html += `<div class="prop-row"><span class="prop-label">Points:</span><span class="prop-value">${obj.points.length}</span></div>`;
            html += `<div class="prop-row"><span class="prop-label">Thickness:</span><span class="prop-value">${obj.thickness.toFixed(2)} m</span></div>`;
            html += `<div class="prop-row"><span class="prop-label">Height:</span><span class="prop-value">${obj.height.toFixed(1)} m</span></div>`;
        } else if (obj.type === 'obstacle') {
            html += `<div class="prop-row"><span class="prop-label">Type:</span><span class="prop-value">${obj.obstacleType}</span></div>`;
            html += `<div class="prop-row"><span class="prop-label">Vertices:</span><span class="prop-value">${obj.vertices.length}</span></div>`;
            if (obj.obstacleType === 'hole') {
                html += `<div class="prop-row"><span class="prop-label">Depth:</span><span class="prop-value">${obj.depth.toFixed(1)} m</span></div>`;
            } else {
                html += `<div class="prop-row"><span class="prop-label">Height:</span><span class="prop-value">${obj.height.toFixed(1)} m</span></div>`;
            }
        }

        panel.innerHTML = html;
    }

    // ========================================
    // Render + Loop
    // ========================================
    render() {
        this.renderer.render();
    }

    startLoop() {
        const loop = () => {
            this.render();
            this.updateInfoBar();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.editor3d = new NavMeshEditor3D();
});
