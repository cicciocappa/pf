// ========================================
// editor.js - Orchestratore
// Tool switching, undo, save/load, export
// ========================================

import { EditorData, Boundary } from './editor-models.js';
import { GeometryFactory } from './editor-geometry.js';
import { exportMesh3D } from './editor-cdt.js';
import { EditorRenderer } from './editor-renderer.js';
import {
    SelectTool, BoundaryTool, BuildingTool, WallTool,
    ObstacleTool, OffMeshTool, SeedPointTool
} from './editor-tools.js';

class NavMeshEditor {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');

        // Data
        this.editorData = new EditorData();

        // Tools
        this.tools = {};
        this.currentTool = 'boundary';
        this.currentToolInstance = null;

        // Renderer
        this.renderer = new EditorRenderer(this);

        // Selection
        this.selectedObject = null;
        this.selectedLink = -1;
        this.selectedVertex = null;

        // Snap
        this.snapEnabled = true;
        this.snapToEdgeEnabled = true;
        this.gridSnapEnabled = false;
        this.gridSize = 1;
        this.snapPoint = null;
        this.edgeSnapInfo = null;

        // Camera
        this.camera = { x: 0, y: 0, zoom: 20 };

        // Input
        this.isPanning = false;
        this.dragStart = { x: 0, y: 0 };
        this.mouseWorld = { x: 0, y: 0 };

        // Undo
        this.undoStack = [];

        this.init();
    }

    init() {
        this._initTools();
        this.setupCanvas();
        this.setupEventListeners();
        this.setTool('boundary');
        this.startLoop();
    }

    _initTools() {
        this.tools = {
            select: new SelectTool(this),
            boundary: new BoundaryTool(this),
            building: new BuildingTool(this),
            wall: new WallTool(this),
            obstacle: new ObstacleTool(this),
            offmesh: new OffMeshTool(this),
            seed: new SeedPointTool(this)
        };
    }

    setupCanvas() {
        const resize = () => {
            const container = this.canvas.parentElement;
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight;
        };
        resize();
        window.addEventListener('resize', resize);
    }

    // ========================================
    // Camera
    // ========================================
    screenToWorld(sx, sy) {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        return {
            x: (sx - cx) / this.camera.zoom + this.camera.x,
            y: (sy - cy) / this.camera.zoom + this.camera.y
        };
    }

    worldToScreen(wx, wy) {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        return {
            x: (wx - this.camera.x) * this.camera.zoom + cx,
            y: (wy - this.camera.y) * this.camera.zoom + cy
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

        // Show/hide template panel
        const tmplPanel = document.getElementById('templatePanel');
        if (tmplPanel) {
            tmplPanel.style.display = toolName === 'building' ? 'block' : 'none';
        }

        this.updateStatus();
    }

    selectObject(obj) {
        this.selectedObject = obj;
        this.selectedLink = -1;
        this.selectedVertex = null;
        this.updatePropertiesPanel();
    }

    // ========================================
    // Undo
    // ========================================
    saveUndo() {
        this.undoStack.push(JSON.stringify(this.editorData.toJSON()));
        if (this.undoStack.length > 50) this.undoStack.shift();
    }

    undo() {
        if (this.undoStack.length === 0) return;
        const state = JSON.parse(this.undoStack.pop());
        this.editorData.fromJSON(state);
        this.selectedObject = null;
        this.selectedLink = -1;
        this.selectedVertex = null;
        this.updateInfoBar();
    }

    // ========================================
    // Event Listeners
    // ========================================
    setupEventListeners() {
        // Tool buttons
        document.querySelectorAll('.toolbar button[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => this.setTool(btn.dataset.tool));
        });

        // Snap toggles
        document.getElementById('toggleSnap')?.addEventListener('click', () => {
            this.snapEnabled = !this.snapEnabled;
            document.getElementById('toggleSnap').textContent = `Snap: ${this.snapEnabled ? 'ON' : 'OFF'}`;
        });

        document.getElementById('toggleEdgeSnap')?.addEventListener('click', () => {
            this.snapToEdgeEnabled = !this.snapToEdgeEnabled;
            document.getElementById('toggleEdgeSnap').textContent = `Edge Snap: ${this.snapToEdgeEnabled ? 'ON' : 'OFF'}`;
        });

        document.getElementById('toggleGridSnap')?.addEventListener('click', () => {
            this.gridSnapEnabled = !this.gridSnapEnabled;
            document.getElementById('toggleGridSnap').textContent = `Grid: ${this.gridSnapEnabled ? 'ON' : 'OFF'}`;
        });

        // Actions
        document.getElementById('exportJSON')?.addEventListener('click', () => this.exportJSON());
        document.getElementById('openPreview')?.addEventListener('click', () => this.openPreview());
        document.getElementById('openSimulator')?.addEventListener('click', () => this.openInSimulator());
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
                        this.setStatus('Errore nel caricamento del progetto');
                    }
                };
                reader.readAsText(file);
            }
            e.target.value = '';
        });

        document.getElementById('clearAll')?.addEventListener('click', () => {
            this.saveUndo();
            this.editorData.clear();
            this.selectedObject = null;
            this.selectedLink = -1;
            this.selectedVertex = null;
            if (this.currentToolInstance) this.currentToolInstance.activate();
            this.setStatus('Reset completato');
        });

        // Template selector
        this._setupTemplatePanel();

        // Canvas events
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('dblclick', (e) => this.onDblClick(e));
        this.canvas.addEventListener('wheel', (e) => this.onWheel(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        window.addEventListener('keydown', (e) => this.onKeyDown(e));
    }

    _setupTemplatePanel() {
        const container = document.getElementById('templateList');
        if (!container) return;

        // N-gon buttons
        for (let n = 3; n <= 12; n++) {
            const btn = document.createElement('button');
            btn.textContent = `${n}-gon`;
            btn.className = 'tmpl-btn';
            btn.addEventListener('click', () => {
                const bt = this.tools.building;
                bt.currentTemplateId = 'ngon';
                bt.sides = n;
                this._updateTemplateHighlight(`ngon_${n}`);
            });
            container.appendChild(btn);
        }

        // Named templates
        const templates = GeometryFactory.getAvailableTemplates();
        for (const tmpl of templates) {
            const btn = document.createElement('button');
            btn.textContent = tmpl.replace(/_/g, ' ');
            btn.className = 'tmpl-btn';
            btn.dataset.template = tmpl;
            btn.addEventListener('click', () => {
                const bt = this.tools.building;
                bt.setTemplate(tmpl);
                this._updateTemplateHighlight(tmpl);
            });
            container.appendChild(btn);
        }
    }

    _updateTemplateHighlight(activeId) {
        document.querySelectorAll('.tmpl-btn').forEach(btn => {
            btn.classList.remove('active');
        });
    }

    // ========================================
    // Input handlers
    // ========================================
    onKeyDown(e) {
        // Global shortcuts
        if (e.key === 'b' || e.key === 'B') { this.setTool('boundary'); return; }
        if (e.key === 'f' || e.key === 'F') { this.setTool('building'); return; }
        if (e.key === 'w' || e.key === 'W') { this.setTool('wall'); return; }
        if (e.key === 'o' || e.key === 'O') { this.setTool('obstacle'); return; }
        if (e.key === 'l' || e.key === 'L') { this.setTool('offmesh'); return; }
        if (e.key === 'p' || e.key === 'P') { this.setTool('seed'); return; }
        if (e.key === 's' && !e.ctrlKey) { this.setTool('select'); return; }
        if (e.key === 'g' || e.key === 'G') {
            this.snapEnabled = !this.snapEnabled;
            document.getElementById('toggleSnap').textContent = `Snap: ${this.snapEnabled ? 'ON' : 'OFF'}`;
            return;
        }
        if (e.key === 'z' && e.ctrlKey) {
            e.preventDefault();
            this.undo();
            return;
        }

        // Forward to tool
        if (this.currentToolInstance) {
            this.currentToolInstance.onKeyDown(e);
        }
    }

    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);

        this.dragStart = { x: sx, y: sy, worldX: world.x, worldY: world.y };

        if (e.button === 1) {
            this.isPanning = true;
            this.canvas.style.cursor = 'grabbing';
            return;
        }

        if (this.currentToolInstance) {
            this.currentToolInstance.onMouseDown(world.x, world.y, e);
        }
    }

    onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        this.mouseWorld = world;

        if (this.isPanning) {
            const dx = (sx - this.dragStart.x) / this.camera.zoom;
            const dy = (sy - this.dragStart.y) / this.camera.zoom;
            this.camera.x -= dx;
            this.camera.y -= dy;
            this.dragStart.x = sx;
            this.dragStart.y = sy;
            return;
        }

        if (this.currentToolInstance) {
            this.currentToolInstance.onMouseMove(world.x, world.y, e);
        }
    }

    onMouseUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.style.cursor = this.currentToolInstance ? this.currentToolInstance.getCursor() : 'default';
            return;
        }

        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);

        if (this.currentToolInstance) {
            this.currentToolInstance.onMouseUp(world.x, world.y, e);
        }
    }

    onDblClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);

        if (this.currentToolInstance) {
            this.currentToolInstance.onDblClick(world.x, world.y, e);
        }
    }

    onWheel(e) {
        e.preventDefault();

        // If a tool wants to handle wheel, forward to it
        if (this.currentToolInstance && (this.currentTool === 'building' || this.currentTool === 'wall')) {
            const rect = this.canvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const world = this.screenToWorld(sx, sy);
            this.currentToolInstance.onWheel(world.x, world.y, e.deltaY, e);
            return;
        }

        // Default: zoom
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        this.camera.zoom *= factor;
        this.camera.zoom = Math.max(2, Math.min(200, this.camera.zoom));
    }

    // ========================================
    // Export
    // ========================================
    buildExportJSON() {
        return exportMesh3D(this.editorData);
    }

    exportJSON() {
        const json = this.buildExportJSON();
        if (!json) {
            this.setStatus('Nessun dato da esportare. Disegna almeno un boundary.');
            return;
        }

        const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mesh3d.json';
        a.click();
        URL.revokeObjectURL(url);

        // Calcola totali sommando ground + structures + staticObstacles
        let totalVerts = json.ground.positions.length / 3;
        let totalTris = json.ground.indices.length / 3;
        for (const s of json.structures) {
            totalVerts += s.positions.length / 3;
            totalTris += s.indices.length / 3;
        }
        totalVerts += json.staticObstacles.positions.length / 3;
        totalTris += json.staticObstacles.indices.length / 3;
        this.setStatus(`Esportato mesh 3D: ${totalVerts} vertici, ${totalTris} triangoli, ${json.structures.length} strutture, ${json.offMeshConnections.length} links`);
    }

    openInSimulator() {
        const json = this.buildExportJSON();
        if (!json) {
            this.setStatus('Nessun dato da esportare. Disegna almeno un boundary.');
            return;
        }

        localStorage.setItem('editorMesh3D', JSON.stringify(json));
        window.open('index.html?fromEditor=1', '_blank');
        this.setStatus('Mesh 3D inviata al simulatore');
    }

    openPreview() {
        const json = this.buildExportJSON();
        if (!json) {
            this.setStatus('Nessun dato da esportare. Disegna almeno un boundary.');
            return;
        }
        localStorage.setItem('editorMesh3D', JSON.stringify(json));
        window.open('preview.html', '_blank');
        this.setStatus('Mesh 3D inviata al preview');
    }

    // ========================================
    // Save/Load
    // ========================================
    saveProject() {
        const project = {
            editorData: this.editorData.toJSON(),
            camera: { ...this.camera }
        };

        const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'navmesh-project.json';
        a.click();
        URL.revokeObjectURL(url);

        this.setStatus('Progetto salvato');
    }

    loadProject(data) {
        this.saveUndo();

        if (data.editorData) {
            this.editorData.fromJSON(data.editorData);
        } else {
            // Legacy format compatibility
            this.editorData.clear();
            if (data.boundaries) {
                for (const bd of (data.boundaries || [])) {
                    if (Array.isArray(bd) && bd.length > 0 && Array.isArray(bd[0])) {
                        // Old format: array of [[x,y], ...]
                        this.editorData.addBoundary(new Boundary({
                            id: this.editorData.generateId('bd'),
                            vertices: bd
                        }));
                    }
                }
            }
            if (data.boundary && !data.boundaries) {
                if (data.boundary.length > 0) {
                    this.editorData.addBoundary(new Boundary({
                        id: this.editorData.generateId('bd'),
                        vertices: data.boundary
                    }));
                }
            }
            if (data.obstacles) {
                // Old format obstacles are [[x,y], ...] arrays
                // The new format uses Obstacle objects
            }
            if (data.offMeshLinks) {
                this.editorData.offMeshLinks = data.offMeshLinks;
            }
        }

        if (data.camera) this.camera = { ...data.camera };

        this.selectedObject = null;
        this.selectedLink = -1;
        this.selectedVertex = null;

        const nBd = this.editorData.boundaries.length;
        const nBldg = this.editorData.buildings.size;
        const nWall = this.editorData.walls.size;
        const nObs = this.editorData.obstacles.size;
        this.setStatus(`Progetto caricato: ${nBd} boundaries, ${nBldg} buildings, ${nWall} walls, ${nObs} obstacles`);
    }

    // ========================================
    // UI Updates
    // ========================================
    updateInfoBar() {
        const nBd = this.editorData.boundaries.length;
        const nBldg = this.editorData.buildings.size;
        const nWall = this.editorData.walls.size;
        const nObs = this.editorData.obstacles.size;
        const nLinks = this.editorData.offMeshLinks.length;
        const nSeeds = this.editorData.seedPoints.length;

        const setText = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setText('boundaryCount', nBd);
        setText('buildingCount', nBldg);
        setText('wallCount', nWall);
        setText('obstacleCount', nObs);
        setText('linkCount', nLinks);
        setText('seedCount', nSeeds);
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
            html += `<div class="prop-row"><span class="prop-label">Template:</span><span class="prop-value">${obj.templateId}</span></div>`;
            html += `<div class="prop-row"><span class="prop-label">Position:</span><span class="prop-value">${Math.round(obj.position.x)}, ${Math.round(obj.position.y)}</span></div>`;
            html += `<div class="prop-row"><span class="prop-label">Rotation:</span><span class="prop-value">${Math.round(obj.rotation * 180 / Math.PI)}°</span></div>`;
            html += `<div class="prop-row"><span class="prop-label">Scale:</span><span class="prop-value">${Math.round(obj.scaleX)} x ${Math.round(obj.scaleY)}</span></div>`;
            html += `<div class="prop-row"><span class="prop-label">Vertices:</span><span class="prop-value">${obj.vertices.length}</span></div>`;
        } else if (obj.type === 'wall') {
            html += `<div class="prop-row"><span class="prop-label">Points:</span><span class="prop-value">${obj.points.length}</span></div>`;
            html += `<div class="prop-row"><span class="prop-label">Thickness:</span><span class="prop-value">${obj.thickness}</span></div>`;
            html += `<div class="prop-row"><span class="prop-label">Segment:</span><span class="prop-value">${obj.maxSegmentLength}</span></div>`;
            html += `<div class="prop-row"><span class="prop-label">Units:</span><span class="prop-value">${obj.units.length}</span></div>`;
        } else if (obj.type === 'obstacle') {
            html += `<div class="prop-row"><span class="prop-label">Vertices:</span><span class="prop-value">${obj.vertices.length}</span></div>`;
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
            this.updateStatus();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.editor = new NavMeshEditor();
});
