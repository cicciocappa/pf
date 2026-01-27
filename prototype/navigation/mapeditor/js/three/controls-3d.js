/**
 * 3D Controls for the editor
 * Handles camera controls, object selection, and placement tools
 */
import * as THREE from 'three';

export const ToolMode = {
    SELECT: 'select',
    PLACE_BUILDING: 'place_building',
    DRAW_WALL: 'draw_wall',
    PAN: 'pan'
};

export class Controls3D {
    constructor(sceneManager, mapData) {
        this.sceneManager = sceneManager;
        this.mapData = mapData;

        // Current mode
        this.mode = ToolMode.SELECT;

        // Building placement
        this.pendingBuildingTemplate = null;
        this.previewMesh = null;

        // Wall drawing
        this.wallPoints = [];
        this.wallPreviewLine = null;

        // Grid snapping
        this.snapToGrid = true;
        this.gridSize = 1;

        // Listeners
        this._listeners = new Set();

        this._setupEventListeners();
    }

    _setupEventListeners() {
        const domElement = this.sceneManager.renderer.domElement;

        domElement.addEventListener('mousedown', this._onMouseDown.bind(this));
        domElement.addEventListener('mousemove', this._onMouseMove.bind(this));
        domElement.addEventListener('mouseup', this._onMouseUp.bind(this));
        domElement.addEventListener('dblclick', this._onDoubleClick.bind(this));
        document.addEventListener('keydown', this._onKeyDown.bind(this));
        document.addEventListener('keyup', this._onKeyUp.bind(this));
    }

    /**
     * Set the current tool mode
     */
    setMode(mode) {
        // Clean up previous mode
        this._cleanupMode();
        this.mode = mode;
        this._notifyListeners('modeChange', mode);
    }

    _cleanupMode() {
        // Remove preview mesh
        if (this.previewMesh) {
            this.sceneManager.scene.remove(this.previewMesh);
            this.previewMesh.geometry?.dispose();
            this.previewMesh = null;
        }

        // Remove wall preview
        if (this.wallPreviewLine) {
            this.sceneManager.scene.remove(this.wallPreviewLine);
            this.wallPreviewLine.geometry?.dispose();
            this.wallPreviewLine = null;
        }

        this.wallPoints = [];
        this.pendingBuildingTemplate = null;
    }

    /**
     * Start building placement mode
     */
    startBuildingPlacement(templateId, buildingFactory) {
        this.setMode(ToolMode.PLACE_BUILDING);
        this.pendingBuildingTemplate = templateId;

        // Create preview mesh
        const previewGeometry = buildingFactory.createGeometry(templateId);
        const previewMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.5,
            wireframe: true
        });
        this.previewMesh = new THREE.Mesh(previewGeometry, previewMaterial);
        this.previewMesh.visible = false;
        this.sceneManager.scene.add(this.previewMesh);
    }

    /**
     * Start wall drawing mode
     */
    startWallDrawing() {
        this.setMode(ToolMode.DRAW_WALL);
        this.wallPoints = [];

        // Create preview line
        const material = new THREE.LineBasicMaterial({ color: 0xffff00 });
        const geometry = new THREE.BufferGeometry();
        this.wallPreviewLine = new THREE.Line(geometry, material);
        this.sceneManager.scene.add(this.wallPreviewLine);
    }

    _onMouseDown(e) {
        if (e.button !== 0) return; // Left click only

        const worldPos = this.sceneManager.raycastTerrain(e.clientX, e.clientY);
        if (!worldPos) return;

        const snappedPos = this._snapPosition(worldPos);

        switch (this.mode) {
            case ToolMode.PLACE_BUILDING:
                this._placeBuilding(snappedPos);
                break;

            case ToolMode.DRAW_WALL:
                this._addWallPoint(snappedPos);
                break;

            case ToolMode.SELECT:
                // Selection is handled in SceneManager._onClick
                break;
        }
    }

    _onMouseMove(e) {
        const worldPos = this.sceneManager.raycastTerrain(e.clientX, e.clientY);
        if (!worldPos) return;

        const snappedPos = this._snapPosition(worldPos);

        switch (this.mode) {
            case ToolMode.PLACE_BUILDING:
                if (this.previewMesh) {
                    this.previewMesh.visible = true;
                    this.previewMesh.position.set(snappedPos.x, snappedPos.y, snappedPos.z);
                }
                break;

            case ToolMode.DRAW_WALL:
                this._updateWallPreview(snappedPos);
                break;
        }
    }

    _onMouseUp(e) {
        // Nothing specific for now
    }

    _onDoubleClick(e) {
        if (this.mode === ToolMode.DRAW_WALL && this.wallPoints.length >= 2) {
            // Finish wall drawing
            this._finishWall();
        }
    }

    _onKeyDown(e) {
        switch (e.key) {
            case 'Escape':
                this._cleanupMode();
                this.setMode(ToolMode.SELECT);
                break;

            case 'Enter':
                if (this.mode === ToolMode.DRAW_WALL && this.wallPoints.length >= 2) {
                    this._finishWall();
                }
                break;

            case 'g':
                this.snapToGrid = !this.snapToGrid;
                this._notifyListeners('snapChange', this.snapToGrid);
                break;

            case 'Delete':
            case 'Backspace':
                if (this.sceneManager.selectedObject) {
                    this._deleteSelectedObject();
                }
                break;

            case 'r':
                if (this.previewMesh) {
                    this.previewMesh.rotation.y += Math.PI / 8;
                }
                break;
        }
    }

    _onKeyUp(e) {
        // Nothing specific for now
    }

    _snapPosition(pos) {
        if (!this.snapToGrid) return pos;

        return new THREE.Vector3(
            Math.round(pos.x / this.gridSize) * this.gridSize,
            pos.y,
            Math.round(pos.z / this.gridSize) * this.gridSize
        );
    }

    _placeBuilding(position) {
        if (!this.pendingBuildingTemplate) return;

        const rotation = this.previewMesh ? this.previewMesh.rotation.y : 0;

        this._notifyListeners('placeBuilding', {
            templateId: this.pendingBuildingTemplate,
            x: position.x,
            y: position.y,
            z: position.z,
            rotation: rotation
        });
    }

    _addWallPoint(position) {
        this.wallPoints.push({
            x: position.x,
            y: position.y,
            z: position.z
        });

        this._updateWallPreview(position);
    }

    _updateWallPreview(currentPos) {
        if (!this.wallPreviewLine) return;

        const points = [...this.wallPoints];
        if (currentPos) {
            points.push({ x: currentPos.x, y: currentPos.y, z: currentPos.z });
        }

        if (points.length < 2) return;

        const positions = new Float32Array(points.length * 3);
        for (let i = 0; i < points.length; i++) {
            positions[i * 3] = points[i].x;
            positions[i * 3 + 1] = points[i].y + 0.5; // Slightly above ground
            positions[i * 3 + 2] = points[i].z;
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

        this._notifyListeners('createWall', {
            points: [...this.wallPoints]
        });

        // Reset for new wall
        this.wallPoints = [];
        this._updateWallPreview(null);
    }

    _deleteSelectedObject() {
        const obj = this.sceneManager.selectedObject;
        if (!obj) return;

        this._notifyListeners('deleteObject', {
            type: obj.userData.type,
            id: obj.userData.id
        });

        this.sceneManager.selectObject(null);
    }

    /**
     * Get world position under mouse cursor
     */
    getWorldPosition(screenX, screenY) {
        return this.sceneManager.raycastTerrain(screenX, screenY);
    }

    addListener(callback) {
        this._listeners.add(callback);
    }

    removeListener(callback) {
        this._listeners.delete(callback);
    }

    _notifyListeners(event, data) {
        for (const listener of this._listeners) {
            listener(event, data);
        }
    }

    dispose() {
        this._cleanupMode();
    }
}
