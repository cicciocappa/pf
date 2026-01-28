/**
 * 3D Map Editor - Main Entry Point
 * Combines heightmap editing with 3D visualization
 */
import * as THREE from 'three';
import { MapSettings } from './core/map-settings.js';
import { TabManager } from './core/tab-manager.js';
import { HeightmapEditor, ToolType } from './heightmap/heightmap-editor.js';
import { HeightmapTools } from './heightmap/heightmap-tools.js';
import { SceneManager } from './three/scene-manager.js';
import { TerrainMesh } from './three/terrain-mesh.js';
import { Building3D } from './three/building-3d.js';
import { Wall3D } from './three/wall-3d.js';
import { Building } from './models/building.js';
import { Wall } from './models/wall.js';

class Editor3D {
    constructor() {
        // Map settings
        this.mapSettings = new MapSettings({
            width: 256,
            height: 256,
            maxHeight: 50,
            heightmapResolution: 128
        });

        // Data storage
        this.buildings = new Map();
        this.walls = new Map();
        this.nextBuildingId = 1;
        this.nextWallId = 1;

        // Current tool state
        this.currentTool = 'raise';
        this.selectedBuildingType = 'HOUSE';

        // 3D placement state
        this.previewMesh = null;
        this.wallPoints = [];
        this.wallPreviewLine = null;
        this.isPlacing = false;

        // Editing state
        this.isDragging = false;
        this.dragStartPos = null;
        this.dragObject = null;
        this.selectedVertexIndex = -1;
        this.vertexHelpers = [];
        this.editingWall = null;

        // Tab manager
        this.tabManager = new TabManager();

        // Editors (initialized later)
        this.heightmapEditor = null;
        this.sceneManager = null;

        this._init();
    }

    _init() {
        this._setupTabs();
        this._setupHeightmapEditor();
        this._setupToolbar();
        this._setupSettings();
        this._setupFileOperations();
        this._setupViewOptions();
        this._setupTerrainActions();
        this._setupNavmesh();
        this._setupKeyboardShortcuts();
        this._setup3DInteraction();

        // Initial resize
        this._resize();
        window.addEventListener('resize', () => this._resize());

        // Sync terrain when heightmap changes
        this.heightmapEditor.heightmap.addListener(() => {
            this._syncTerrainTo3D();
        });

        console.log('3D Map Editor initialized');
    }

    _setupTabs() {
        const heightmapContainer = document.getElementById('heightmap-container');
        const threeContainer = document.getElementById('three-container');
        const heightmapTools = document.getElementById('heightmap-tools');
        const heightmapToolsBrush = document.getElementById('heightmap-tools-brush');
        const viewTools = document.getElementById('view-tools');
        const buildingSelector = document.getElementById('building-selector');

        // Register tabs
        this.tabManager.registerTab('heightmap', {
            label: 'Heightmap',
            content: heightmapContainer,
            onActivate: () => {
                heightmapTools.classList.remove('hidden');
                heightmapToolsBrush.classList.remove('hidden');
                viewTools.classList.add('hidden');
                buildingSelector.classList.add('hidden');
                document.getElementById('status-text').textContent =
                    'Heightmap Editor - Click and drag to paint';
                if (this.heightmapEditor) {
                    this.heightmapEditor.render();
                }
            },
            onDeactivate: () => {}
        });

        this.tabManager.registerTab('3d', {
            label: '3D View',
            content: threeContainer,
            onActivate: () => {
                heightmapTools.classList.add('hidden');
                heightmapToolsBrush.classList.add('hidden');
                viewTools.classList.remove('hidden');
                buildingSelector.classList.remove('hidden');
                document.getElementById('status-text').textContent =
                    '3D View - Use mouse to orbit, scroll to zoom';
                this._ensure3DScene();
                this._syncTerrainTo3D();
            },
            onDeactivate: () => {}
        });

        // Tab buttons
        document.querySelectorAll('#mode-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#mode-tabs .tab-btn').forEach(b =>
                    b.classList.remove('active'));
                btn.classList.add('active');
                this.tabManager.activateTab(btn.dataset.tab);
            });
        });

        // Start with heightmap tab
        this.tabManager.activateTab('heightmap');
    }

    _setupHeightmapEditor() {
        const canvas = document.getElementById('heightmap-canvas');
        this.heightmapEditor = new HeightmapEditor(canvas, this.mapSettings);
        this.heightmapEditor.fitToView();
    }

    _ensure3DScene() {
        if (!this.sceneManager) {
            const container = document.getElementById('three-container');
            this.sceneManager = new SceneManager(container, this.mapSettings);
        }
    }

    _syncTerrainTo3D() {
        if (!this.sceneManager) return;

        const terrainMesh = TerrainMesh.create(
            this.heightmapEditor.heightmap,
            this.mapSettings,
            this.sceneManager.materials.terrain
        );
        this.sceneManager.setTerrainMesh(terrainMesh);
    }

    _setupToolbar() {
        // Heightmap brush tools
        document.querySelectorAll('#heightmap-tools .tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#heightmap-tools .tool-btn').forEach(b =>
                    b.classList.remove('active'));
                btn.classList.add('active');
                const tool = btn.dataset.tool;
                this.currentTool = tool;
                this.heightmapEditor.setTool(tool);
            });
        });

        // Brush settings
        const radiusSlider = document.getElementById('brush-radius');
        const strengthSlider = document.getElementById('brush-strength');
        const falloffSlider = document.getElementById('brush-falloff');

        radiusSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('brush-radius-val').textContent = value;
            this.heightmapEditor.brush.radius = value;
        });

        strengthSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value) / 100;
            document.getElementById('brush-strength-val').textContent = value.toFixed(2);
            this.heightmapEditor.brush.strength = value;
        });

        falloffSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value) / 100;
            document.getElementById('brush-falloff-val').textContent = value.toFixed(2);
            this.heightmapEditor.brush.falloff = value;
        });

        // 3D view tools
        document.querySelectorAll('#view-tools .tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#view-tools .tool-btn').forEach(b =>
                    b.classList.remove('active'));
                btn.classList.add('active');

                const prevTool = this.currentTool;
                this.currentTool = btn.dataset.tool;

                // Cleanup previous tool state
                this._cancelPlacement();

                // Setup new tool
                if (this.currentTool === 'building' && this.sceneManager) {
                    this._createBuildingPreview();
                    document.getElementById('status-text').textContent =
                        'Click on terrain to place building. Press R to rotate.';
                } else if (this.currentTool === 'wall') {
                    document.getElementById('status-text').textContent =
                        'Click to add wall points. Double-click or Enter to finish.';
                } else if (this.currentTool === 'select') {
                    document.getElementById('status-text').textContent =
                        'Click objects to select. Delete/Backspace to remove.';
                }

            });
        });

        // Building type selector
        document.getElementById('building-type').addEventListener('change', (e) => {
            this.selectedBuildingType = e.target.value;
            if (this.currentTool === 'building' && this.sceneManager) {
                this._createBuildingPreview();
            }
        });
    }

    _setupSettings() {
        const widthInput = document.getElementById('map-width');
        const heightInput = document.getElementById('map-height');
        const maxHeightInput = document.getElementById('max-height');
        const resolutionSelect = document.getElementById('heightmap-res');

        widthInput.value = this.mapSettings.width;
        heightInput.value = this.mapSettings.height;
        maxHeightInput.value = this.mapSettings.maxHeight;
        resolutionSelect.value = this.mapSettings.heightmapResolution;

        widthInput.addEventListener('change', (e) => {
            this.mapSettings.width = parseInt(e.target.value);
            e.target.value = this.mapSettings.width;
            this.heightmapEditor.render();
            this._syncTerrainTo3D();
        });

        heightInput.addEventListener('change', (e) => {
            this.mapSettings.height = parseInt(e.target.value);
            e.target.value = this.mapSettings.height;
            this.heightmapEditor.render();
            this._syncTerrainTo3D();
        });

        maxHeightInput.addEventListener('change', (e) => {
            this.mapSettings.maxHeight = parseInt(e.target.value);
            this._syncTerrainTo3D();
        });

        resolutionSelect.addEventListener('change', (e) => {
            this.mapSettings.heightmapResolution = parseInt(e.target.value);
            this.heightmapEditor.heightmap.resize(
                this.mapSettings.heightmapResolution,
                this.mapSettings.heightmapResolution
            );
            this.heightmapEditor.render();
        });
    }

    _setupTerrainActions() {
        document.getElementById('btn-generate').addEventListener('click', () => {
            this.heightmapEditor.generateTerrain({
                octaves: 4,
                persistence: 0.5,
                lacunarity: 2,
                scale: 50
            });
        });

        document.getElementById('btn-smooth-global').addEventListener('click', () => {
            HeightmapTools.globalSmooth(this.heightmapEditor.heightmap, 2);
            this.heightmapEditor.render();
        });

        document.getElementById('btn-clear-terrain').addEventListener('click', () => {
            if (confirm('Clear all terrain data?')) {
                this.heightmapEditor.clear();
            }
        });
    }

    _setupViewOptions() {
        document.getElementById('chk-wireframe').addEventListener('change', (e) => {
            if (this.sceneManager) {
                this.sceneManager.setWireframe(e.target.checked);
            }
        });

        document.getElementById('chk-grid').addEventListener('change', (e) => {
            this.heightmapEditor.showGrid = e.target.checked;
            this.heightmapEditor.render();
            if (this.sceneManager && this.sceneManager.gridHelper) {
                this.sceneManager.gridHelper.visible = e.target.checked;
            }
        });

        document.getElementById('chk-navmesh').addEventListener('change', (e) => {
            if (this.sceneManager) {
                this.sceneManager.setNavmeshVisible(e.target.checked);
            }
        });
    }

    _setupNavmesh() {
        document.getElementById('btn-bake-navmesh').addEventListener('click', () => {
            this._bakeNavmesh();
        });

        document.getElementById('btn-clear-navmesh').addEventListener('click', () => {
            if (this.sceneManager) {
                this.sceneManager.setNavmeshMesh(null);
            }
        });

        document.getElementById('btn-export-navmesh').addEventListener('click', () => {
            this._exportNavmesh();
        });
    }

    _bakeNavmesh() {
        // This would integrate with navcat.js
        // For now, create a simple visualization based on terrain
        console.log('Baking navmesh...');
        document.getElementById('status-text').textContent = 'Baking navmesh...';

        // TODO: Integrate with navcat library for actual navmesh generation
        setTimeout(() => {
            document.getElementById('status-text').textContent = 'NavMesh baked (placeholder)';
        }, 500);
    }

    _exportNavmesh() {
        const data = {
            settings: this.mapSettings.toJSON(),
            heightmap: this.heightmapEditor.heightmap.toJSON(),
            buildings: Array.from(this.buildings.values()).map(b => b.toJSON()),
            walls: Array.from(this.walls.values()).map(w => w.toJSON())
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'navmesh-input.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    _setupFileOperations() {
        // Save
        document.getElementById('btn-save').addEventListener('click', () => {
            this._saveMap();
        });

        // Load
        document.getElementById('btn-load').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this._loadMap(file);
            }
            e.target.value = '';
        });

        // Export heightmap
        document.getElementById('btn-export-heightmap').addEventListener('click', () => {
            const dataUrl = this.heightmapEditor.exportPNG();
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = 'heightmap.png';
            a.click();
        });

        // Import heightmap
        document.getElementById('btn-import-heightmap').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.heightmapEditor.importImage(file).then(() => {
                    this._syncTerrainTo3D();
                });
            }
            e.target.value = '';
        });
    }

    _saveMap() {
        const data = {
            version: 1,
            settings: this.mapSettings.toJSON(),
            heightmap: this.heightmapEditor.heightmap.toJSON(),
            buildings: Array.from(this.buildings.values()).map(b => b.toJSON()),
            walls: Array.from(this.walls.values()).map(w => w.toJSON())
        };

        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'map.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    _loadMap(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);

                // Load settings
                if (data.settings) {
                    this.mapSettings.width = data.settings.width;
                    this.mapSettings.height = data.settings.height;
                    this.mapSettings.maxHeight = data.settings.maxHeight;
                    this.mapSettings.heightmapResolution = data.settings.heightmapResolution;

                    document.getElementById('map-width').value = this.mapSettings.width;
                    document.getElementById('map-height').value = this.mapSettings.height;
                    document.getElementById('max-height').value = this.mapSettings.maxHeight;
                    document.getElementById('heightmap-res').value = this.mapSettings.heightmapResolution;
                }

                // Load heightmap
                if (data.heightmap) {
                    const hm = this.heightmapEditor.heightmap;
                    hm.resize(data.heightmap.width, data.heightmap.height);
                    if (data.heightmap.data) {
                        hm.data = new Float32Array(data.heightmap.data);
                    }
                    hm._notifyListeners('load');
                }

                // Load buildings
                this.buildings.clear();
                if (data.buildings) {
                    for (const bData of data.buildings) {
                        const building = Building.fromJSON(bData);
                        this.buildings.set(building.id, building);
                        if (building.id >= this.nextBuildingId) {
                            this.nextBuildingId = building.id + 1;
                        }
                    }
                }

                // Load walls
                this.walls.clear();
                if (data.walls) {
                    for (const wData of data.walls) {
                        const wall = Wall.fromJSON(wData);
                        this.walls.set(wall.id, wall);
                        if (wall.id >= this.nextWallId) {
                            this.nextWallId = wall.id + 1;
                        }
                    }
                }

                this.heightmapEditor.render();
                this._syncTerrainTo3D();
                this._rebuild3DObjects();

                document.getElementById('status-text').textContent = 'Map loaded successfully';
            } catch (err) {
                console.error('Failed to load map:', err);
                alert('Failed to load map file');
            }
        };
        reader.readAsText(file);
    }

    _rebuild3DObjects() {
        if (!this.sceneManager) return;

        // Clear existing
        this.sceneManager.clearObjects();

        // Add buildings
        for (const building of this.buildings.values()) {
            const mesh = Building3D.createMesh(
                building,
                this.heightmapEditor.heightmap,
                this.mapSettings,
                this.sceneManager.materials.building
            );
            this.sceneManager.addBuildingMesh(building.id, mesh);
        }

        // Add walls
        for (const wall of this.walls.values()) {
            const subdivisionDistance = wall.subdivisionDistance || 4;
            const mesh = Wall3D.createMeshFollowingTerrain(
                wall,
                this.heightmapEditor.heightmap,
                this.mapSettings,
                this.sceneManager.materials.wall,
                'stone',
                subdivisionDistance
            );
            if (mesh) {
                this.sceneManager.addWallMesh(wall.id, mesh);
            }
        }
    }

    _setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ignore if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            switch (e.key.toLowerCase()) {
                case '1':
                    this._activateTab('heightmap');
                    break;
                case '2':
                    this._activateTab('3d');
                    break;
                case 'r':
                    if (this.tabManager.getActiveTabId() === 'heightmap') {
                        this._selectTool('raise');
                    } else if (this.tabManager.getActiveTabId() === '3d') {
                        const rotationAmount = e.shiftKey ? -Math.PI / 8 : Math.PI / 8;
                        if (this.previewMesh) {
                            // Rotate building preview
                            this.previewMesh.rotation.y += rotationAmount;
                        } else if (this.currentTool === 'select' && this.sceneManager?.selectedObject) {
                            // Rotate selected building
                            this._rotateSelectedBuilding(rotationAmount);
                        }
                    }
                    break;
                case 'l':
                    if (this.tabManager.getActiveTabId() === 'heightmap') {
                        this._selectTool('lower');
                    }
                    break;
                case 's':
                    if (e.ctrlKey) {
                        e.preventDefault();
                        this._saveMap();
                    } else if (this.tabManager.getActiveTabId() === 'heightmap') {
                        this._selectTool('smooth');
                    }
                    break;
                case 'f':
                    if (this.tabManager.getActiveTabId() === 'heightmap') {
                        this._selectTool('flatten');
                    }
                    break;
                case 'escape':
                    this._cancelPlacement();
                    break;
                case 'enter':
                    if (this.currentTool === 'wall' && this.wallPoints.length >= 2) {
                        this._finishWall();
                    }
                    break;
                case 'delete':
                case 'backspace':
                    if (this.tabManager.getActiveTabId() === '3d') {
                        this._deleteSelected();
                    }
                    break;
            }
        });
    }

    _setup3DInteraction() {
        const container = document.getElementById('three-container');
        let mouseDownPos = { x: 0, y: 0 };
        let mouseDownTime = 0;

        container.addEventListener('mousedown', (e) => {
            if (this.tabManager.getActiveTabId() !== '3d') return;
            if (!this.sceneManager) return;
            if (e.button !== 0) return; // Left click only

            mouseDownPos = { x: e.clientX, y: e.clientY };
            mouseDownTime = Date.now();

            const worldPos = this.sceneManager.raycastTerrain(e.clientX, e.clientY);
            if (!worldPos) return;

            // Check if clicking on a vertex helper (for wall editing)
            if (this.currentTool === 'select' && this.vertexHelpers.length > 0) {
                const vertexIndex = this._raycastVertexHelpers(e.clientX, e.clientY);
                if (vertexIndex >= 0) {
                    this.selectedVertexIndex = vertexIndex;
                    this.isDragging = true;
                    this.dragStartPos = worldPos.clone();
                    this.sceneManager.controls.enabled = false;
                    return;
                }
            }

            // Check if clicking on selected object (for dragging)
            if (this.currentTool === 'select' && this.sceneManager.selectedObject) {
                const obj = this.sceneManager.selectedObject;
                // Check if we clicked on the selected object
                const clickedObj = this._raycastObjects(e.clientX, e.clientY);
                if (clickedObj && clickedObj.userData.id === obj.userData.id) {
                    this.isDragging = true;
                    this.dragStartPos = worldPos.clone();
                    this.dragObject = obj;
                    this.sceneManager.controls.enabled = false;
                    return;
                }
            }
        });

        container.addEventListener('mousemove', (e) => {
            if (this.tabManager.getActiveTabId() !== '3d') return;
            if (!this.sceneManager) return;

            const worldPos = this.sceneManager.raycastTerrain(e.clientX, e.clientY);
            if (worldPos) {
                document.getElementById('coords-indicator').textContent =
                    `X: ${worldPos.x.toFixed(1)} Z: ${worldPos.z.toFixed(1)}`;

                // Handle dragging
                if (this.isDragging && this.dragStartPos) {
                    if (this.selectedVertexIndex >= 0 && this.editingWall) {
                        // Dragging a wall vertex
                        this._moveWallVertex(worldPos);
                    } else if (this.dragObject) {
                        // Dragging an object
                        this._moveObject(worldPos);
                    }
                    return;
                }

                // Update preview position
                if (this.currentTool === 'building' && this.previewMesh) {
                    this.previewMesh.position.copy(worldPos);
                    this.previewMesh.position.y += Building3D.getHeight(this.selectedBuildingType) / 2;
                }

                // Update wall preview
                if (this.currentTool === 'wall' && this.wallPoints.length > 0) {
                    this._updateWallPreview(worldPos);
                }
            }
        });

        container.addEventListener('mouseup', (e) => {
            if (this.isDragging) {
                this.isDragging = false;
                this.dragStartPos = null;
                this.dragObject = null;
                this.selectedVertexIndex = -1;
                this.sceneManager.controls.enabled = true;
            }

            // Check if it was a click (not a drag)
            const dx = e.clientX - mouseDownPos.x;
            const dy = e.clientY - mouseDownPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const timeDiff = Date.now() - mouseDownTime;

            if (dist < 5 && timeDiff < 300) {
                // It's a click
                this._handleClick(e);
            }
        });

        container.addEventListener('dblclick', (e) => {
            if (this.currentTool === 'wall' && this.wallPoints.length >= 2) {
                this._finishWall();
            }
        });

        container.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (this.currentTool === 'wall' && this.wallPoints.length >= 2) {
                this._finishWall();
            }
        });
    }

    _handleClick(e) {
        if (this.tabManager.getActiveTabId() !== '3d') return;
        if (!this.sceneManager) return;

        const worldPos = this.sceneManager.raycastTerrain(e.clientX, e.clientY);
        if (!worldPos) return;

        switch (this.currentTool) {
            case 'building':
                this._placeBuilding(worldPos);
                break;
            case 'wall':
                this._addWallPoint(worldPos);
                break;
            case 'select':
                this._handleSelection(e.clientX, e.clientY);
                break;
        }
    }

    _handleSelection(screenX, screenY) {
        // First check vertex helpers
        if (this.vertexHelpers.length > 0) {
            const vertexIndex = this._raycastVertexHelpers(screenX, screenY);
            if (vertexIndex >= 0) {
                this.selectedVertexIndex = vertexIndex;
                this._updatePropertiesPanel();
                return;
            }
        }

        // Then check objects
        const clickedObj = this._raycastObjects(screenX, screenY);

        // Clear previous selection helpers
        this._clearVertexHelpers();
        this.editingWall = null;

        if (clickedObj) {
            this.sceneManager.selectObject(clickedObj);

            // Show vertex helpers for walls
            if (clickedObj.userData.type === 'wall') {
                const wallId = clickedObj.userData.id;
                const wall = this.walls.get(wallId);
                if (wall) {
                    this.editingWall = wall;
                    this._showVertexHelpers(wall);
                }
            }

            this._updatePropertiesPanel();
        } else {
            this.sceneManager.selectObject(null);
            this._updatePropertiesPanel();
        }
    }

    _raycastObjects(screenX, screenY) {
        const rect = this.sceneManager.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((screenX - rect.left) / rect.width) * 2 - 1,
            -((screenY - rect.top) / rect.height) * 2 + 1
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.sceneManager.camera);

        const pickables = [];
        for (const mesh of this.sceneManager.buildingMeshes.values()) {
            pickables.push(mesh);
        }
        for (const mesh of this.sceneManager.wallMeshes.values()) {
            pickables.push(mesh);
        }

        const intersects = raycaster.intersectObjects(pickables, true);
        if (intersects.length > 0) {
            // Find the parent with userData
            let obj = intersects[0].object;
            while (obj && !obj.userData.type) {
                obj = obj.parent;
            }
            return obj;
        }
        return null;
    }

    _raycastVertexHelpers(screenX, screenY) {
        if (this.vertexHelpers.length === 0) return -1;

        const rect = this.sceneManager.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((screenX - rect.left) / rect.width) * 2 - 1,
            -((screenY - rect.top) / rect.height) * 2 + 1
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.sceneManager.camera);

        const intersects = raycaster.intersectObjects(this.vertexHelpers);
        if (intersects.length > 0) {
            return intersects[0].object.userData.vertexIndex;
        }
        return -1;
    }

    _showVertexHelpers(wall) {
        this._clearVertexHelpers();

        const sphereGeometry = new THREE.SphereGeometry(1.5, 16, 16);
        const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });

        wall.points.forEach((point, index) => {
            const h = this.heightmapEditor.heightmap.sampleWorld(
                point.x, point.y,
                this.mapSettings.width, this.mapSettings.height
            ) * this.mapSettings.maxHeight;

            const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial.clone());
            sphere.position.set(point.x, h + 2, point.y);
            sphere.userData.vertexIndex = index;
            sphere.userData.type = 'vertexHelper';

            this.sceneManager.scene.add(sphere);
            this.vertexHelpers.push(sphere);
        });
    }

    _clearVertexHelpers() {
        for (const helper of this.vertexHelpers) {
            this.sceneManager.scene.remove(helper);
            helper.geometry.dispose();
            helper.material.dispose();
        }
        this.vertexHelpers = [];
    }

    _moveWallVertex(worldPos) {
        if (!this.editingWall || this.selectedVertexIndex < 0) return;

        // Update wall point
        this.editingWall.points[this.selectedVertexIndex].x = worldPos.x;
        this.editingWall.points[this.selectedVertexIndex].y = worldPos.z;
        this.editingWall.updateVertices();

        // Update vertex helper position
        const helper = this.vertexHelpers[this.selectedVertexIndex];
        if (helper) {
            const h = this.heightmapEditor.heightmap.sampleWorld(
                worldPos.x, worldPos.z,
                this.mapSettings.width, this.mapSettings.height
            ) * this.mapSettings.maxHeight;
            helper.position.set(worldPos.x, h + 2, worldPos.z);
        }

        // Rebuild wall mesh
        this._rebuildWallMesh(this.editingWall);
    }

    _moveObject(worldPos) {
        if (!this.dragObject) return;

        const type = this.dragObject.userData.type;
        const id = this.dragObject.userData.id;

        if (type === 'building') {
            const building = this.buildings.get(id);
            if (building) {
                building.position.x = worldPos.x;
                building.position.y = worldPos.z;
                building.regenerateBase();

                // Update mesh position
                Building3D.updatePosition(
                    this.dragObject,
                    building,
                    this.heightmapEditor.heightmap,
                    this.mapSettings
                );
            }
        } else if (type === 'wall') {
            const wall = this.walls.get(id);
            if (wall && this.dragStartPos) {
                // Move all wall points by the delta
                const dx = worldPos.x - this.dragStartPos.x;
                const dz = worldPos.z - this.dragStartPos.z;

                for (const point of wall.points) {
                    point.x += dx;
                    point.y += dz;
                }
                wall.updateVertices();

                this.dragStartPos = worldPos.clone();

                // Rebuild mesh and helpers
                this._rebuildWallMesh(wall);
                this._showVertexHelpers(wall);
            }
        }
    }

    _rebuildWallMesh(wall) {
        // Remove old mesh
        this.sceneManager.removeWallMesh(wall.id);

        // Create new mesh with subdivision distance
        const subdivisionDistance = wall.subdivisionDistance || 4;
        const mesh = Wall3D.createMeshFollowingTerrain(
            wall,
            this.heightmapEditor.heightmap,
            this.mapSettings,
            this.sceneManager.materials.wall,
            'stone',
            subdivisionDistance
        );
        if (mesh) {
            this.sceneManager.addWallMesh(wall.id, mesh);
        }
    }

    _updatePropertiesPanel() {
        const panel = document.getElementById('properties-panel');
        const content = document.getElementById('properties-content');
        const obj = this.sceneManager?.selectedObject;

        if (!obj) {
            panel.classList.add('hidden');
            return;
        }

        panel.classList.remove('hidden');
        const type = obj.userData.type;
        const id = obj.userData.id;

        if (type === 'building') {
            const building = this.buildings.get(id);
            if (building) {
                content.innerHTML = `
                    <div class="property-row">
                        <span class="property-label">Type:</span>
                        <span class="property-value">${building.templateId}</span>
                    </div>
                    <div class="property-row">
                        <span class="property-label">Position:</span>
                        <span class="property-value">${building.position.x.toFixed(1)}, ${building.position.y.toFixed(1)}</span>
                    </div>
                    <div class="property-row">
                        <span class="property-label">Rotation:</span>
                        <span class="property-value">${(building.rotation * 180 / Math.PI).toFixed(1)}°</span>
                    </div>
                    <div class="property-actions">
                        <label class="slider-label">
                            Rotation:
                            <input type="range" id="edit-rotation" min="0" max="360" value="${building.rotation * 180 / Math.PI}">
                        </label>
                    </div>
                `;

                // Add rotation handler
                document.getElementById('edit-rotation').addEventListener('input', (e) => {
                    const rotationDeg = parseFloat(e.target.value);
                    building.rotation = rotationDeg * Math.PI / 180;
                    building.regenerateBase();

                    // Update mesh
                    const mesh = this.sceneManager.buildingMeshes.get(id);
                    if (mesh) {
                        mesh.rotation.y = -building.rotation;
                    }

                    // Update display
                    content.querySelector('.property-value:last-of-type').textContent =
                        `${rotationDeg.toFixed(1)}°`;
                });
            }
        } else if (type === 'wall') {
            const wall = this.walls.get(id);
            if (wall) {
                // Get current subdivision (default 4)
                wall.subdivisionDistance = wall.subdivisionDistance || 4;

                content.innerHTML = `
                    <div class="property-row">
                        <span class="property-label">Type:</span>
                        <span class="property-value">Wall</span>
                    </div>
                    <div class="property-row">
                        <span class="property-label">Points:</span>
                        <span class="property-value">${wall.points.length}</span>
                    </div>
                    <div class="property-row">
                        <span class="property-label">Thickness:</span>
                        <span class="property-value" id="thickness-val">${wall.thickness}m</span>
                    </div>
                    <div class="property-row">
                        <span class="property-label">Terrain Detail:</span>
                        <span class="property-value" id="subdiv-val">${wall.subdivisionDistance}m</span>
                    </div>
                    <div class="property-actions">
                        <label class="slider-label">
                            Thickness:
                            <input type="range" id="edit-thickness" min="1" max="10" step="0.5" value="${wall.thickness}">
                        </label>
                        <label class="slider-label">
                            Terrain Detail (lower = more precise):
                            <input type="range" id="edit-subdivision" min="1" max="20" step="1" value="${wall.subdivisionDistance}">
                        </label>
                        <p class="help-text">Drag red spheres to move vertices</p>
                    </div>
                `;

                // Add thickness handler
                document.getElementById('edit-thickness').addEventListener('input', (e) => {
                    wall.thickness = parseFloat(e.target.value);
                    wall.updateVertices();
                    this._rebuildWallMesh(wall);
                    document.getElementById('thickness-val').textContent = `${wall.thickness}m`;
                });

                // Add subdivision handler
                document.getElementById('edit-subdivision').addEventListener('input', (e) => {
                    wall.subdivisionDistance = parseFloat(e.target.value);
                    this._rebuildWallMesh(wall);
                    document.getElementById('subdiv-val').textContent = `${wall.subdivisionDistance}m`;
                });
            }
        }
    }

    _placeBuilding(worldPos) {
        const id = this.nextBuildingId++;

        const building = new Building({
            id: id,
            templateId: this.selectedBuildingType,
            position: { x: worldPos.x, y: worldPos.z }, // 2D position (x, z in 3D)
            rotation: this.previewMesh ? this.previewMesh.rotation.y : 0
        });

        this.buildings.set(id, building);

        // Create 3D mesh
        const mesh = Building3D.createMesh(
            building,
            this.heightmapEditor.heightmap,
            this.mapSettings,
            this.sceneManager.materials.building
        );
        this.sceneManager.addBuildingMesh(id, mesh);

        document.getElementById('status-text').textContent =
            `Building ${this.selectedBuildingType} placed at (${worldPos.x.toFixed(1)}, ${worldPos.z.toFixed(1)})`;
    }

    _addWallPoint(worldPos) {
        this.wallPoints.push({
            x: worldPos.x,
            y: worldPos.z  // 2D coordinate
        });

        // Create preview line if first point
        if (this.wallPoints.length === 1) {
            const material = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });
            const geometry = new THREE.BufferGeometry();
            this.wallPreviewLine = new THREE.Line(geometry, material);
            this.sceneManager.scene.add(this.wallPreviewLine);
        }

        this._updateWallPreview(worldPos);

        document.getElementById('status-text').textContent =
            `Wall point ${this.wallPoints.length} added. Double-click or Enter to finish, Escape to cancel.`;
    }

    _updateWallPreview(currentPos) {
        if (!this.wallPreviewLine || this.wallPoints.length === 0) return;

        const points = [...this.wallPoints];
        if (currentPos) {
            points.push({ x: currentPos.x, y: currentPos.z });
        }

        const positions = new Float32Array(points.length * 3);
        for (let i = 0; i < points.length; i++) {
            const h = this.heightmapEditor.heightmap.sampleWorld(
                points[i].x, points[i].y,
                this.mapSettings.width, this.mapSettings.height
            ) * this.mapSettings.maxHeight;

            positions[i * 3] = points[i].x;
            positions[i * 3 + 1] = h + 2; // Slightly above terrain
            positions[i * 3 + 2] = points[i].y;
        }

        this.wallPreviewLine.geometry.dispose();
        this.wallPreviewLine.geometry = new THREE.BufferGeometry();
        this.wallPreviewLine.geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(positions, 3)
        );
    }

    _finishWall() {
        if (this.wallPoints.length < 2) return;

        const id = this.nextWallId++;

        const wall = new Wall({
            id: id,
            points: this.wallPoints.map((p, i) => ({ x: p.x, y: p.y, id: `wp_${i}` })),
            thickness: 2
        });

        this.walls.set(id, wall);

        // Create 3D mesh
        const mesh = Wall3D.createMeshFollowingTerrain(
            wall,
            this.heightmapEditor.heightmap,
            this.mapSettings,
            this.sceneManager.materials.wall
        );
        if (mesh) {
            this.sceneManager.addWallMesh(id, mesh);
        }

        // Cleanup preview
        if (this.wallPreviewLine) {
            this.sceneManager.scene.remove(this.wallPreviewLine);
            this.wallPreviewLine.geometry.dispose();
            this.wallPreviewLine = null;
        }
        this.wallPoints = [];

        document.getElementById('status-text').textContent =
            `Wall created with ${wall.points.length} points`;
    }

    _cancelPlacement() {
        // Cancel wall drawing
        if (this.wallPreviewLine) {
            this.sceneManager.scene.remove(this.wallPreviewLine);
            this.wallPreviewLine.geometry.dispose();
            this.wallPreviewLine = null;
        }
        this.wallPoints = [];

        // Remove building preview
        if (this.previewMesh) {
            this.sceneManager.scene.remove(this.previewMesh);
            this.previewMesh.geometry.dispose();
            this.previewMesh.material.dispose();
            this.previewMesh = null;
        }

        // Clear vertex helpers
        this._clearVertexHelpers();
        this.editingWall = null;
        this.selectedVertexIndex = -1;

        // Deselect object
        if (this.sceneManager) {
            this.sceneManager.selectObject(null);
        }

        // Hide properties panel
        document.getElementById('properties-panel').classList.add('hidden');

        document.getElementById('status-text').textContent = 'Placement cancelled';
    }

    _deleteSelected() {
        if (!this.sceneManager || !this.sceneManager.selectedObject) return;

        const obj = this.sceneManager.selectedObject;
        const type = obj.userData.type;
        const id = obj.userData.id;

        if (type === 'building') {
            this.buildings.delete(id);
            this.sceneManager.removeBuildingMesh(id);
            document.getElementById('status-text').textContent = `Building ${id} deleted`;
        } else if (type === 'wall') {
            this.walls.delete(id);
            this.sceneManager.removeWallMesh(id);
            document.getElementById('status-text').textContent = `Wall ${id} deleted`;
        }

        this.sceneManager.selectObject(null);
    }

    _createBuildingPreview() {
        if (this.previewMesh) {
            this.sceneManager.scene.remove(this.previewMesh);
            this.previewMesh.geometry.dispose();
            this.previewMesh.material.dispose();
        }

        const geometry = Building3D.createPreviewGeometry(this.selectedBuildingType);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.5,
            wireframe: true
        });

        this.previewMesh = new THREE.Mesh(geometry, material);
        this.sceneManager.scene.add(this.previewMesh);
    }

    _removeBuildingPreview() {
        if (this.previewMesh) {
            this.sceneManager.scene.remove(this.previewMesh);
            this.previewMesh.geometry.dispose();
            this.previewMesh.material.dispose();
            this.previewMesh = null;
        }
    }

    _rotateSelectedBuilding(deltaRotation) {
        const obj = this.sceneManager?.selectedObject;
        if (!obj || obj.userData.type !== 'building') return;

        const id = obj.userData.id;
        const building = this.buildings.get(id);
        if (!building) return;

        // Update building rotation
        building.rotation += deltaRotation;
        building.regenerateBase();

        // Update mesh
        obj.rotation.y = -building.rotation;

        // Update properties panel if open
        const slider = document.getElementById('edit-rotation');
        if (slider) {
            slider.value = building.rotation * 180 / Math.PI;
        }

        this._updatePropertiesPanel();
    }

    _activateTab(tabId) {
        document.querySelectorAll('#mode-tabs .tab-btn').forEach(b =>
            b.classList.remove('active'));
        document.querySelector(`#mode-tabs .tab-btn[data-tab="${tabId}"]`).classList.add('active');
        this.tabManager.activateTab(tabId);
    }

    _selectTool(tool) {
        document.querySelectorAll('#heightmap-tools .tool-btn').forEach(b =>
            b.classList.remove('active'));
        document.querySelector(`#heightmap-tools .tool-btn[data-tool="${tool}"]`).classList.add('active');
        this.currentTool = tool;
        this.heightmapEditor.setTool(tool);
    }

    _resize() {
        const container = document.getElementById('heightmap-container');
        if (this.heightmapEditor && container.offsetWidth > 0) {
            this.heightmapEditor.resize(container.offsetWidth, container.offsetHeight);
            this.heightmapEditor.fitToView();
        }

        if (this.sceneManager) {
            this.sceneManager.resize();
        }
    }
}

// Start the editor
document.addEventListener('DOMContentLoaded', () => {
    window.editor = new Editor3D();
});
