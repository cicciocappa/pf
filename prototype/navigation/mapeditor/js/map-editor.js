import { Geometry } from './geometry.js';
import { MapData } from './models/map-data.js';
import { Renderer } from './renderer.js';
import { HistoryManager } from './history-manager.js';
import { SelectTool } from './tools/select-tool.js';
import { DrawAreaTool } from './tools/draw-area-tool.js';
import { BuildingTool } from './tools/building-tool.js';
import { WallTool } from './tools/wall-tool.js';
import { EditTool } from './tools/edit-tool.js';
import { ObstacleTool } from './tools/obstacle-tool.js';
 

/**
 * MapEditor - Main editor class
 */
export class MapEditor {
    constructor(canvas) {
        this.canvas = canvas;
        this.geometry = new Geometry();
        this.mapData = new MapData();
        this.renderer = new Renderer(canvas, this);
        // Nel constructor di MapEditor
        this.history = new HistoryManager(this);
        // Salva lo stato iniziale
        this.history.save();

        // Camera/viewport state
        this.camera = {
            offsetX: 0,
            offsetY: 0,
            zoom: 1.0
        };

        // Zoom limits
        this.minZoom = 0.1;
        this.maxZoom = 5.0;

        // Pan state
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        this.spacePressed = false;

        // Selection
        this.selection = new Set();

        // Snap to vertices
        this.snapEnabled = false;
        this.snapPoint = null;

        // Snap to edges
        this.snapToEdgeEnabled = false;
        this.edgeSnapInfo = null; // { point, edge, type, targetId }

        // Snap to grid
        this.gridSnapEnabled = false;
        this.gridSize = 32; // Default grid size

        // NavMesh
        this.navmesh = null;
        this.showTriangles = false;
        this.showLabels = false;
        this.mergeTriangles = true; // Enable Hertel-Mehlhorn merge by default

        // Debug visualization
        this.showHolesDebug = false;
        this.debugHoles = null;

        // Debug merge components (building + wall polygons before union)
        this.showMergeComponentsDebug = false;
        this.debugMergeComponents = null; // Array of {buildingPoly, wallPoly, mergedPoly}

        // Tools
        this.tools = {
            'select': new SelectTool(this),
            'draw-area': new DrawAreaTool(this),
            'building': new BuildingTool(this),
            'wall': new WallTool(this),
            'obstacle': new ObstacleTool(this),
            'edit': new EditTool(this)
        };
        this.currentTool = null;

        this.bindEvents();
        this.resize();
    }

    /**
     * Bind all event listeners
     */
    bindEvents() {
        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Keyboard events
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));

        // Resize
        window.addEventListener('resize', () => this.resize());
    }

    /**
     * Handle mouse down
     */
    handleMouseDown(e) {
        const worldPos = this.screenToWorld(e.clientX, e.clientY);

        // Middle mouse or space+left for panning
        if (e.button === 1 || (e.button === 0 && this.spacePressed)) {
            this.isPanning = true;
            this.panStart = { x: e.clientX, y: e.clientY };
            this.canvas.style.cursor = 'grabbing';
            e.preventDefault();
            return;
        }

        // Delegate to current tool
        if (this.currentTool) {
            this.currentTool.onMouseDown(worldPos.x, worldPos.y, e);
        }
    }

    /**
     * Handle mouse move
     */
    handleMouseMove(e) {
        const worldPos = this.screenToWorld(e.clientX, e.clientY);

        // Handle panning
        if (this.isPanning) {
            const dx = e.clientX - this.panStart.x;
            const dy = e.clientY - this.panStart.y;
            this.camera.offsetX += dx;
            this.camera.offsetY += dy;
            this.panStart = { x: e.clientX, y: e.clientY };
            this.render();
            return;
        }

        // Delegate to current tool
        if (this.currentTool) {
            this.currentTool.onMouseMove(worldPos.x, worldPos.y, e);
        }
    }

    /**
     * Handle mouse up
     */
    handleMouseUp(e) {
        const worldPos = this.screenToWorld(e.clientX, e.clientY);

        // End panning
        if (this.isPanning) {
            this.isPanning = false;
            this.updateCursor();
            return;
        }

        // Delegate to current tool
        if (this.currentTool) {
            this.currentTool.onMouseUp(worldPos.x, worldPos.y, e);
        }
    }

    /**
     * Handle double click
     */
    handleDoubleClick(e) {
        const worldPos = this.screenToWorld(e.clientX, e.clientY);

        if (this.currentTool) {
            this.currentTool.onDoubleClick(worldPos.x, worldPos.y, e);
        }
    }

    /**
     * Handle wheel event
     */
    handleWheel(e) {
        const worldPos = this.screenToWorld(e.clientX, e.clientY);

        // Alt+wheel for zoom
        if (e.altKey) {
            e.preventDefault();
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            this.zoomAt(e.clientX, e.clientY, zoomFactor);
            return;
        }

        // Delegate to current tool
        if (this.currentTool) {
            this.currentTool.onWheel(worldPos.x, worldPos.y, e.deltaY, e);
        }
    }

    /**
     * Handle key down
     */
    handleKeyDown(e) {
        // Ignore keyboard shortcuts when typing in input fields or when dialog is open
        const activeElement = document.activeElement;
        const isInputFocused = activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable
        );
        const isDialogOpen = !document.getElementById('dialog-overlay')?.classList.contains('hidden');

        if (isInputFocused || isDialogOpen) {
            // Allow Escape to close dialog
            if (e.key === 'Escape' && isDialogOpen) {
                document.getElementById('dialog-cancel')?.click();
                e.preventDefault();
            }
            return;
        }

        // Space for pan mode
        if (e.code === 'Space' && !this.spacePressed) {
            this.spacePressed = true;
            this.updateCursor();
            e.preventDefault();
            return;
        }

        // Nel metodo handleKeyDown(e)
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z' || e.key === 'Z') {
                this.history.undo();
                e.preventDefault();
                this.render();
                return;
            }
            if (e.key === 'y' || e.key === 'Y') {
                this.history.redo();
                e.preventDefault();
                this.render();
                return;
            }
        }

        // Tool shortcuts
        if (!e.ctrlKey && !e.altKey && !e.metaKey) {
            switch (e.key.toUpperCase()) {
                case 'V':
                    this.setTool('select');
                    e.preventDefault();
                    return;

                case 'A':
                    this.setTool('draw-area');
                    e.preventDefault();
                    return;
                case 'B':
                    this.setTool('building');
                    e.preventDefault();
                    return;
                case 'W':
                    this.setTool('wall');
                    e.preventDefault();
                    return;
                case 'O':
                    this.setTool('obstacle');
                    e.preventDefault();
                    return;
                case 'E':
                    this.setTool('edit');
                    e.preventDefault();
                    return;
            }

            // Snap shortcuts (1, 2, 3)
            switch (e.key) {
                case '1':
                    this.snapEnabled = !this.snapEnabled;
                    if (!this.snapEnabled) this.snapPoint = null;
                    document.getElementById('chk-snap').checked = this.snapEnabled;
                    this.render();
                    e.preventDefault();
                    return;
                case '2':
                    this.snapToEdgeEnabled = !this.snapToEdgeEnabled;
                    if (!this.snapToEdgeEnabled) this.edgeSnapInfo = null;
                    document.getElementById('chk-snap-edge').checked = this.snapToEdgeEnabled;
                    this.render();
                    e.preventDefault();
                    return;
                case '3':
                    this.gridSnapEnabled = !this.gridSnapEnabled;
                    document.getElementById('chk-snap-grid').checked = this.gridSnapEnabled;
                    this.render();
                    e.preventDefault();
                    return;
            }
        }

        // Delegate to current tool
        if (this.currentTool) {
            this.currentTool.onKeyDown(e);
        }
    }

    /**
     * Handle key up
     */
    handleKeyUp(e) {
        if (e.code === 'Space') {
            this.spacePressed = false;
            this.updateCursor();
            return;
        }

        if (this.currentTool) {
            this.currentTool.onKeyUp(e);
        }
    }

    /**
     * Zoom at a specific screen position
     */
    zoomAt(screenX, screenY, factor) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = screenX - rect.left;
        const mouseY = screenY - rect.top;

        // World position before zoom
        const worldBefore = {
            x: (mouseX - this.camera.offsetX) / this.camera.zoom,
            y: (mouseY - this.camera.offsetY) / this.camera.zoom
        };

        // Apply zoom
        const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.camera.zoom * factor));
        this.camera.zoom = newZoom;

        // World position after zoom
        const worldAfter = {
            x: (mouseX - this.camera.offsetX) / this.camera.zoom,
            y: (mouseY - this.camera.offsetY) / this.camera.zoom
        };

        // Adjust offset to keep world position under cursor
        this.camera.offsetX += (worldAfter.x - worldBefore.x) * this.camera.zoom;
        this.camera.offsetY += (worldAfter.y - worldBefore.y) * this.camera.zoom;

        this.updateZoomIndicator();
        this.render();
    }

    /**
     * Reset view to default
     */
    resetView() {
        this.camera.offsetX = 0;
        this.camera.offsetY = 0;
        this.camera.zoom = 1.0;
        this.updateZoomIndicator();
        this.render();
    }

    /**
     * Convert screen coordinates to world coordinates
     */
    screenToWorld(screenX, screenY) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (screenX - rect.left - this.camera.offsetX) / this.camera.zoom;
        const y = (screenY - rect.top - this.camera.offsetY) / this.camera.zoom;
        return { x, y };
    }

    /**
     * Convert world coordinates to screen coordinates
     */
    worldToScreen(worldX, worldY) {
        const rect = this.canvas.getBoundingClientRect();
        const x = worldX * this.camera.zoom + this.camera.offsetX + rect.left;
        const y = worldY * this.camera.zoom + this.camera.offsetY + rect.top;
        return { x, y };
    }

    /**
     * Get visible area in world coordinates
     */
    getViewBounds() {
        const topLeft = this.screenToWorld(0, 0);
        const bottomRight = this.screenToWorld(this.canvas.width, this.canvas.height);
        return {
            minX: topLeft.x,
            minY: topLeft.y,
            maxX: bottomRight.x,
            maxY: bottomRight.y
        };
    }

    /**
     * Set current tool
     */
    setTool(toolName) {
        if (this.currentTool) {
            this.currentTool.deactivate();
        }

        this.currentTool = this.tools[toolName] || null;

        if (this.currentTool) {
            this.currentTool.activate();
        }

        this.updateToolButtons();
        this.updateCursor();
        this.updateStatusBar();
        this.render();
    }

    /**
     * Update tool button states
     */
    updateToolButtons() {
        document.querySelectorAll('.tool-btn').forEach(btn => {
            const tool = btn.dataset.tool;
            btn.classList.toggle('active', this.currentTool && this.currentTool.name === tool);
        });
    }

    /**
     * Update cursor based on current state
     */
    updateCursor() {
        if (this.spacePressed || this.isPanning) {
            this.canvas.style.cursor = this.isPanning ? 'grabbing' : 'grab';
        } else if (this.currentTool) {
            this.canvas.style.cursor = this.currentTool.getCursor();
        } else {
            this.canvas.style.cursor = 'default';
        }
    }

    /**
     * Update status bar text
     */
    updateStatusBar() {
        const statusEl = document.getElementById('status-text');
        if (statusEl && this.currentTool) {
            statusEl.textContent = this.currentTool.getStatusText();
        }
    }

    /**
     * Update zoom indicator
     */
    updateZoomIndicator() {
        const zoomEl = document.getElementById('zoom-indicator');
        if (zoomEl) {
            zoomEl.textContent = `Zoom: ${Math.round(this.camera.zoom * 100)}%`;
        }
    }

    /**
      * Seleziona un oggetto. 
      * @param { Object } obj L'oggetto da selezionare
     * @param { boolean } append Se true, aggiunge alla selezione attuale.Se false, rimpiazza.
      */
    selectObject(obj, append = false) {
        if (!append) {
            this.selection.clear();
        }
        if (obj) {
            this.selection.add(obj);
        }
        this.render();
    }

    /**
     * Deseleziona tutto o un oggetto specifico
     */
    deselectObject(obj = null) {
        if (obj) {
            this.selection.delete(obj);
        } else {
            this.selection.clear();
        }
        this.render();
    }

    /**
     * Metodo di utility per ottenere "l'ultimo" o "l'unico" oggetto selezionato
     * (Utile per il pannello proprietà che mostra un oggetto alla volta)
     */
    getSelectedObject() {
        if (this.selection.size === 0) return null;
        // Ritorna l'ultimo elemento aggiunto al Set
        return Array.from(this.selection).pop();
    }

    /**
     * Delete selected object
     */
    deleteSelected() {
        if (!this.selectedObject) return;

        if (this.selectedObject === 'outer') {
            this.mapData.outerPoly = [];
        } else {
            this.mapData.removeObject(this.selectedObject);
        }

        this.selectedObject = null;
        this.navmesh = null;
        this.render();
    }

    /**
     * Bake NavMesh
     */
    bake() {
        if (!this.mapData.hasOuterPoly()) {
            alert('Please draw an outer area first.');
            return;
        }

        try {
            // Get outer polygon
            const outer = this.mapData.outerPoly.map(p => ({ x: p.x, y: p.y }));
            console.log('Bake - Outer polygon:', outer.length, 'vertices');

            // Find connected groups of elements
            const groups = this.geometry.findConnectedGroups(
                this.mapData.walls,
                this.mapData.buildings,
                this.mapData.obstacles,
                this.mapData.connections
            );
            console.log('Bake - Found', groups.length, 'connected groups');

            // Generate holes by merging connected elements
            const holes = [];

            for (const group of groups) {
                console.log('Processing group:', {
                    walls: group.walls.size,
                    buildings: group.buildings.size,
                    obstacles: group.obstacles.size
                });

                // Get merged polygons for this group
                const mergedPolygons = this.geometry.mergeGroupPolygons(
                    group,
                    this.mapData.walls,
                    this.mapData.buildings,
                    this.mapData.obstacles
                );

                console.log('Group produced', mergedPolygons.length, 'polygons');

                // Add merged polygons as holes
                for (const poly of mergedPolygons) {
                    if (poly.length >= 3) {
                        holes.push(poly);
                    }
                }
            }

            console.log('Bake - Total holes:', holes.length);

            // Store holes for debug visualization
            this.debugHoles = holes.map(h => h.map(v => ({ x: v.x, y: v.y })));

            // Generate NavMesh (triangulation + optional Hertel-Mehlhorn merge)
            const result = this.geometry.generateNavMesh(outer, holes, {
                mergeTriangles: this.mergeTriangles
            });

            this.navmesh = {
                triangles: result.triangles,
                merged: result.polygons
            };

            // Display stats
            const stats = this.geometry.calculateStats(result.polygons);
            this.displayStats(stats, result.triangles.length);

            this.render();
        } catch (err) {
            console.error('Bake error:', err);
            alert('Error generating NavMesh: ' + err.message);
        }
    }

    /**
     * Calculate signed area
     */
    signedArea(poly) {
        let area = 0;
        for (let i = 0; i < poly.length; i++) {
            const j = (i + 1) % poly.length;
            area += poly[i].x * poly[j].y;
            area -= poly[j].x * poly[i].y;
        }
        return area / 2;
    }

    /**
     * Display statistics
     */
    displayStats(stats, triangleCount) {
        const panel = document.getElementById('stats-panel');
        if (panel) {
            panel.classList.remove('hidden');
            document.getElementById('stat-count').textContent = stats.count;
            document.getElementById('stat-triangles').textContent = triangleCount;
            document.getElementById('stat-min-area').textContent = stats.minArea.toFixed(2) + ' px²';
            document.getElementById('stat-max-area').textContent = stats.maxArea.toFixed(2) + ' px²';
            document.getElementById('stat-avg-area').textContent = stats.avgArea.toFixed(2) + ' px²';
        }
    }

    /**
     * Hide statistics panel
     */
    hideStats() {
        const panel = document.getElementById('stats-panel');
        if (panel) {
            panel.classList.add('hidden');
        }
    }

    /**
     * Clear all data
     */
    clear() {
        this.mapData.clear();
        this.selectedObject = null;
        this.navmesh = null;
        this.obstacleGroups = null;
        this.resolvedBuildings = null;
        this.hideStats();
        this.render();
    }

    /**
     * Clear only the navmesh, keep the map intact
     */
    clearNavmesh() {
        this.navmesh = null;
        this.obstacleGroups = null;
        this.resolvedBuildings = null;
        this.hideStats();
        this.render();
    }

    /**
     * Export map to JSON
     */
    exportMap() {
        if (!this.mapData.hasOuterPoly()) {
            alert('Please draw a map first.');
            return;
        }

        const data = this.mapData.toJSON();
        this.downloadJson(data, 'map.json');
    }

    /**
     * Export NavMesh to JSON
     * Format: { navmesh, destructible, obstacle }
     */
    exportNavMesh() {
        if (!this.navmesh) {
            alert('Please bake the NavMesh first.');
            return;
        }

        // NavMesh: array of convex polygons
        const navmesh = this.navmesh.merged.map((poly, idx) => ({
            id: `nav_${idx}`,
            vertices: poly.map(v => ({ x: v.x, y: v.y }))
        }));

        // Destructible: buildings and wall units (label + polygon)
        const destructible = [];

        // Add buildings
        for (const building of this.mapData.buildings.values()) {
            destructible.push({
                type: 'building',
                id: building.id,
                label: building.label || '',
                vertices: building.getVertices().map(v => ({ x: v.x, y: v.y }))
            });
        }

        // Add wall units
        for (const wall of this.mapData.walls.values()) {
            if (wall.units) {
                for (let i = 0; i < wall.units.length; i++) {
                    const unit = wall.units[i];
                    destructible.push({
                        type: 'wall_unit',
                        id: unit.id,
                        wallId: wall.id,
                        label: wall.label || '',
                        vertices: unit.vertices.map(v => ({ x: v.x, y: v.y }))
                    });
                }
            }
        }

        // Obstacles: non-destructible elements (label + polygon)
        const obstacle = [];
        for (const obs of this.mapData.obstacles.values()) {
            obstacle.push({
                id: obs.id,
                label: obs.label || '',
                vertices: obs.getVertices().map(v => ({ x: v.x, y: v.y }))
            });
        }

        // Export data structure
        const data = {
            navmesh,
            destructible,
            obstacle
        };

        this.downloadJson(data, 'navmesh.json');
    }

    /**
     * Load map from JSON
     */
    loadMap(json) {
        try {
            this.mapData.fromJSON(json);
            this.selectedObject = null;
            this.navmesh = null;
            this.hideStats();
            this.render();
        } catch (err) {
            console.error('Load error:', err);
            alert('Error loading map: ' + err.message);
        }
    }

    /**
     * Download data as JSON file
     */
    downloadJson(data, filename) {
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
        const anchor = document.createElement('a');
        anchor.setAttribute('href', dataStr);
        anchor.setAttribute('download', filename);
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    }

    /**
     * Render the editor
     */
    render() {
        this.renderer.render();
        this.updateStatusBar();
    }

    /**
     * Resize canvas to fit container
     */
    resize() {
        this.renderer.resize();
    }

    /**
     * Toggle snap
     */
    setSnapEnabled(enabled) {
        this.snapEnabled = enabled;
        if (!enabled) {
            this.snapPoint = null;
        }
        this.render();
    }

    /**
     * Toggle snap to edge
     */
    setSnapToEdgeEnabled(enabled) {
        this.snapToEdgeEnabled = enabled;
        if (!enabled) {
            this.edgeSnapInfo = null;
        }
        this.render();
    }

    /**
     * Toggle snap to grid
     */
    setGridSnapEnabled(enabled) {
        this.gridSnapEnabled = enabled;
        this.render();
    }

    /**
     * Set grid size for snap
     */
    setGridSize(size) {
        this.gridSize = Math.max(8, Math.min(128, size)); // Clamp between 5 and 200
        this.render();
    }

    /**
     * Toggle labels display
     */
    setShowLabels(show) {
        this.showLabels = show;
        this.render();
    }

    /**
     * Toggle triangle display
     */
    setShowTriangles(show) {
        this.showTriangles = show;
        this.render();
    }

    /**
     * Toggle Hertel-Mehlhorn merge algorithm
     */
    setMergeTriangles(enabled) {
        this.mergeTriangles = enabled;
    }

    /**
     * Toggle debug holes visualization
     */
    setShowHolesDebug(show) {
        this.showHolesDebug = show;
        this.render();
    }

    /**
     * Toggle debug merge components visualization
     */
    setShowMergeComponentsDebug(show) {
        this.showMergeComponentsDebug = show;
        this.render();
    }

    /**
     * Show properties dialog for an object
     */
    showPropertiesDialog(obj) {
        if (!obj || !obj.type) return;

        const overlay = document.getElementById('dialog-overlay');
        const titleEl = document.getElementById('dialog-title');
        const contentEl = document.getElementById('dialog-content');
        const okBtn = document.getElementById('dialog-ok');
        const cancelBtn = document.getElementById('dialog-cancel');

        if (!overlay || !contentEl) return;

        let properties = {};

        if (obj.type === 'building') {
            titleEl.textContent = 'Building Properties';
            properties = {
                label: { label: 'Label', value: obj.label || '', type: 'text' },
                posX: { label: 'Position X', value: obj.position.x, step: 1, type: 'number' },
                posY: { label: 'Position Y', value: obj.position.y, step: 1, type: 'number' },
                rotation: { label: 'Rotation (deg)', value: (obj.rotation * 180 / Math.PI), step: 1, type: 'number' },
                scaleX: { label: 'Scale X', value: obj.scaleX, step: 1, min: 1, type: 'number' },
                scaleY: { label: 'Scale Y', value: obj.scaleY, step: 1, min: 1, type: 'number' }
            };
        } else if (obj.type === 'wall') {
            titleEl.textContent = 'Wall Properties';
            properties = {
                label: { label: 'Label', value: obj.label || '', type: 'text' },
                thickness: { label: 'Thickness', value: obj.thickness, step: 1, min: 2, type: 'number' },
                maxSegmentLength: { label: 'Max Segment Length', value: obj.maxSegmentLength, step: 1, min: 5, type: 'number' }
            };
        } else if (obj.type === 'obstacle') {
            titleEl.textContent = 'Obstacle Properties';
            properties = {
                label: { label: 'Label', value: obj.label || '', type: 'text' }
            };
        }

        // Build form
        contentEl.innerHTML = '';
        for (const [key, prop] of Object.entries(properties)) {
            const row = document.createElement('div');
            row.className = 'dialog-row';

            const label = document.createElement('label');
            label.textContent = prop.label;
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

        // OK handler
        const handleOk = () => {
            if (obj.type === 'building') {
                obj.label = document.getElementById('prop-label').value || '';
                obj.position.x = parseFloat(document.getElementById('prop-posX').value) || 0;
                obj.position.y = parseFloat(document.getElementById('prop-posY').value) || 0;
                obj.rotation = (parseFloat(document.getElementById('prop-rotation').value) || 0) * Math.PI / 180;
                obj.scaleX = parseFloat(document.getElementById('prop-scaleX').value) || 50;
                obj.scaleY = parseFloat(document.getElementById('prop-scaleY').value) || 50;
                obj.regenerateBase();
            } else if (obj.type === 'wall') {
                obj.label = document.getElementById('prop-label').value || '';
                obj.thickness = parseFloat(document.getElementById('prop-thickness').value) || 10;
                obj.maxSegmentLength = parseFloat(document.getElementById('prop-maxSegmentLength').value) || 30;
                obj.updateVertices();
            } else if (obj.type === 'obstacle') {
                obj.label = document.getElementById('prop-label').value || '';
            }

            this.navmesh = null;
            overlay.classList.add('hidden');
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
            this.render();
        };

        const handleCancel = () => {
            overlay.classList.add('hidden');
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
        };

        okBtn.addEventListener('click', handleOk);
        cancelBtn.addEventListener('click', handleCancel);

        // Show dialog
        overlay.classList.remove('hidden');
    }
}