// ========================================
// editor3d-tools.js
// Interactive tools for 3D editor
// ========================================

import { Building3D, Wall3D, Obstacle3D } from './editor3d-models.js';
import * as THREE from 'three';

// ========================================
// Base Tool
// ========================================
class Tool {
    constructor(editor) {
        this.editor = editor;
    }

    activate() {}
    deactivate() {}
    onMouseDown(worldX, worldY, event) {}
    onMouseMove(worldX, worldY, event) {}
    onMouseUp(worldX, worldY, event) {}
    onKeyDown(event) {}
    onWheel(deltaY) {}
    getStatusText() { return ''; }
    getCursor() { return 'default'; }
    renderPreview(renderer) {}
}

// ========================================
// Building3D Tool
// ========================================
export class Building3DTool extends Tool {
    constructor(editor) {
        super(editor);
        this.previewBuilding = null;
        this.isPlacing = false;
        this.dragStart = null;
        this.currentHeight = 3;
        this.currentSides = 4;
    }

    activate() {
        this.previewBuilding = null;
        this.isPlacing = false;
        this.currentHeight = parseFloat(document.getElementById('heightInput')?.value) || 3;
    }

    deactivate() {
        this.previewBuilding = null;
        this.isPlacing = false;
    }

    onMouseDown(worldX, worldY, event) {
        if (event.button !== 0) return;

        this.isPlacing = true;
        this.dragStart = { x: worldX, y: worldY };

        const id = this.editor.editorData.generateId('bldg');
        this.previewBuilding = new Building3D({
            id: id,
            position: { x: worldX, y: worldY, z: 0 },
            scaleX: 1,
            scaleY: 1,
            height: this.currentHeight,
            baseShape: 'ngon',
            sides: this.currentSides
        });
        this.previewBuilding.regenerateBase();
    }

    onMouseMove(worldX, worldY, event) {
        if (this.isPlacing && this.previewBuilding && this.dragStart) {
            const dx = worldX - this.dragStart.x;
            const dy = worldY - this.dragStart.y;

            this.previewBuilding.scaleX = Math.max(0.5, Math.abs(dx) * 2);
            this.previewBuilding.scaleY = Math.max(0.5, Math.abs(dy) * 2);

            if (event.shiftKey) {
                // Constrain to square
                const size = Math.max(this.previewBuilding.scaleX, this.previewBuilding.scaleY);
                this.previewBuilding.scaleX = size;
                this.previewBuilding.scaleY = size;
            }

            this.previewBuilding.regenerateBase();
        }
    }

    onMouseUp(worldX, worldY, event) {
        if (this.isPlacing && this.previewBuilding) {
            // Commit building
            if (this.previewBuilding.scaleX > 0.5 && this.previewBuilding.scaleY > 0.5) {
                this.editor.editorData.addBuilding(this.previewBuilding);
            }

            this.previewBuilding = null;
            this.isPlacing = false;
            this.dragStart = null;
        }
    }

    onKeyDown(event) {
        // Change sides with number keys 3-9
        const key = parseInt(event.key);
        if (key >= 3 && key <= 9) {
            this.currentSides = key;
            if (this.previewBuilding) {
                this.previewBuilding.sides = key;
                this.previewBuilding.regenerateBase();
            }
        }

        if (event.key === 'Escape') {
            this.previewBuilding = null;
            this.isPlacing = false;
            this.dragStart = null;
        }
    }

    onWheel(deltaY, event) {
        // Adjust height with wheel
        this.currentHeight = Math.max(0.1, this.currentHeight + (deltaY > 0 ? -0.2 : 0.2));
        document.getElementById('heightInput').value = this.currentHeight.toFixed(1);

        if (this.previewBuilding) {
            this.previewBuilding.height = this.currentHeight;
        }
    }

    getStatusText() {
        return 'Click and drag to create building. Scroll to change height. 3-9 to change sides.';
    }

    getCursor() {
        return 'crosshair';
    }

    renderPreview(renderer) {
        if (this.previewBuilding) {
            const geometry = renderer.editor.editorData.buildings.has(this.previewBuilding.id) ?
                null : this.createPreviewGeometry();

            if (geometry) {
                const material = new THREE.MeshStandardMaterial({
                    color: 0x8b4513,
                    transparent: true,
                    opacity: 0.5,
                    wireframe: false
                });

                const mesh = new THREE.Mesh(geometry, material);
                renderer.scene.add(mesh);
            }
        }
    }

    createPreviewGeometry() {
        // Inline geometry creation for preview
        const shape = new THREE.Shape();
        const verts = this.previewBuilding.vertices;

        if (verts.length === 0) return null;

        shape.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) {
            shape.lineTo(verts[i].x, verts[i].y);
        }
        shape.closePath();

        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: this.previewBuilding.height,
            bevelEnabled: false
        });

        geometry.rotateX(Math.PI / 2);
        geometry.translate(0, this.previewBuilding.height / 2, 0);

        return geometry;
    }
}

// ========================================
// Wall3D Tool - Same as 2D editor, creates polyline first
// ========================================
export class Wall3DTool extends Tool {
    constructor(editor) {
        super(editor);
        this.points = [];
        this.previewPoint = null;
        this.currentHeight = 3;
        this.currentThickness = 0.5;
    }

    activate() {
        this._reset();
        this.currentHeight = parseFloat(document.getElementById('heightInput')?.value) || 3;
        this.currentThickness = parseFloat(document.getElementById('thicknessInput')?.value) || 0.5;
    }

    deactivate() {
        this._reset();
    }

    _reset() {
        this.points = [];
        this.previewPoint = null;
    }

    onMouseDown(worldX, worldY, event) {
        if (event.button === 0) {
            // Left click: add point
            this.points.push({ x: worldX, y: worldY, z: 0 });
        } else if (event.button === 2) {
            // Right click: complete wall
            this._completeWall();
        }
    }

    onMouseMove(worldX, worldY, event) {
        this.previewPoint = { x: worldX, y: worldY, z: 0 };
    }

    onMouseUp(worldX, worldY, event) {
        // Nothing to do
    }

    onKeyDown(event) {
        if (event.key === 'Enter') {
            this._completeWall();
            event.preventDefault();
        } else if (event.key === 'Escape') {
            this._reset();
            event.preventDefault();
        } else if (event.key === 'Backspace' || event.key === 'Delete') {
            if (this.points.length > 0) {
                this.points.pop();
                event.preventDefault();
            }
        }
    }

    _completeWall() {
        if (this.points.length < 2) return;

        const wall = new Wall3D({
            id: this.editor.editorData.generateId('wall'),
            points: [...this.points],
            thickness: this.currentThickness,
            height: this.currentHeight
        });

        this.editor.editorData.addWall(wall);
        this.editor.selectObject(wall);
        this._reset();
    }

    onWheel(deltaY, event) {
        if (event && event.ctrlKey) {
            // Adjust thickness
            this.currentThickness = Math.max(0.1, this.currentThickness + (deltaY > 0 ? -0.05 : 0.05));
            if (document.getElementById('thicknessInput')) {
                document.getElementById('thicknessInput').value = this.currentThickness.toFixed(2);
            }
        } else {
            // Adjust height
            this.currentHeight = Math.max(0.1, this.currentHeight + (deltaY > 0 ? -0.2 : 0.2));
            if (document.getElementById('heightInput')) {
                document.getElementById('heightInput').value = this.currentHeight.toFixed(1);
            }
        }
    }

    getStatusText() {
        if (this.points.length === 0) {
            return 'Wall: Click to add points. Scroll=height, Ctrl+Scroll=thickness';
        }
        return `Wall: ${this.points.length} points. Click to add, Enter/RClick to finish, Backspace to undo`;
    }

    getCursor() {
        return 'crosshair';
    }

    renderPreview(renderer) {
        if (this.points.length > 0) {
            // Create preview wall with current points + preview point
            const previewPoints = [...this.points];
            if (this.previewPoint) {
                previewPoints.push(this.previewPoint);
            }

            if (previewPoints.length < 2) return;

            // Draw line segments
            const geometry = new THREE.BufferGeometry();
            const positions = [];

            for (let i = 0; i < previewPoints.length; i++) {
                const p = previewPoints[i];
                positions.push(p.x, 0.1, p.y);
            }

            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

            const material = new THREE.LineBasicMaterial({
                color: 0xff00ff,
                linewidth: 2
            });

            const line = new THREE.Line(geometry, material);
            renderer.scene.add(line);

            // Draw points
            for (const p of this.points) {
                const pointGeom = new THREE.SphereGeometry(0.2, 8, 8);
                const pointMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
                const pointMesh = new THREE.Mesh(pointGeom, pointMat);
                pointMesh.position.set(p.x, 0.1, p.y);
                renderer.scene.add(pointMesh);
            }
        }
    }
}

// ========================================
// Obstacle3D Tool
// ========================================
export class Obstacle3DTool extends Tool {
    constructor(editor) {
        super(editor);
        this.dragStart = null;
        this.previewObstacle = null;
        this.currentType = 'hole';
        this.currentDepth = 1;
        this.currentHeight = 1;
    }

    activate() {
        this.dragStart = null;
        this.previewObstacle = null;
    }

    deactivate() {
        this.previewObstacle = null;
    }

    onMouseDown(worldX, worldY, event) {
        if (event.button !== 0) return;

        this.dragStart = { x: worldX, y: worldY };

        const id = this.editor.editorData.generateId('obs');
        this.previewObstacle = new Obstacle3D({
            id: id,
            obstacleType: this.currentType,
            vertices: [{ x: worldX, y: worldY }],
            depth: this.currentDepth,
            height: this.currentHeight
        });
    }

    onMouseMove(worldX, worldY, event) {
        if (this.previewObstacle && this.dragStart) {
            // Create rectangle
            const minX = Math.min(this.dragStart.x, worldX);
            const maxX = Math.max(this.dragStart.x, worldX);
            const minY = Math.min(this.dragStart.y, worldY);
            const maxY = Math.max(this.dragStart.y, worldY);

            this.previewObstacle.vertices = [
                { x: minX, y: minY },
                { x: maxX, y: minY },
                { x: maxX, y: maxY },
                { x: minX, y: maxY }
            ];
        }
    }

    onMouseUp(worldX, worldY, event) {
        if (this.previewObstacle && this.previewObstacle.vertices.length >= 3) {
            // Check minimum size
            const bounds = this.getBounds(this.previewObstacle.vertices);
            if (bounds.width > 0.5 && bounds.height > 0.5) {
                this.editor.editorData.addObstacle(this.previewObstacle);
            }
        }

        this.previewObstacle = null;
        this.dragStart = null;
    }

    onKeyDown(event) {
        if (event.key === 'Tab') {
            event.preventDefault();
            this.currentType = this.currentType === 'hole' ? 'prism' : 'hole';
            if (this.previewObstacle) {
                this.previewObstacle.obstacleType = this.currentType;
            }
            this.editor.setStatus(`Obstacle type: ${this.currentType}`);
        }

        if (event.key === 'Escape') {
            this.previewObstacle = null;
            this.dragStart = null;
        }
    }

    onWheel(deltaY, event) {
        if (this.currentType === 'hole') {
            this.currentDepth = Math.max(0.1, this.currentDepth + (deltaY > 0 ? -0.1 : 0.1));
            if (this.previewObstacle) {
                this.previewObstacle.depth = this.currentDepth;
            }
        } else {
            this.currentHeight = Math.max(0.1, this.currentHeight + (deltaY > 0 ? -0.1 : 0.1));
            if (this.previewObstacle) {
                this.previewObstacle.height = this.currentHeight;
            }
        }
    }

    getBounds(vertices) {
        if (vertices.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };

        let minX = vertices[0].x, maxX = vertices[0].x;
        let minY = vertices[0].y, maxY = vertices[0].y;

        for (const v of vertices) {
            minX = Math.min(minX, v.x);
            maxX = Math.max(maxX, v.x);
            minY = Math.min(minY, v.y);
            maxY = Math.max(maxY, v.y);
        }

        return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
    }

    getStatusText() {
        return `Obstacle (${this.currentType}): Click and drag to create. Tab to toggle type. Scroll to adjust depth/height.`;
    }

    getCursor() {
        return 'crosshair';
    }

    renderPreview(renderer) {
        if (this.previewObstacle && this.previewObstacle.vertices.length >= 3) {
            if (this.previewObstacle.obstacleType === 'prism') {
                const geometry = this.createObstaclePreviewGeometry();
                if (geometry) {
                    const material = new THREE.MeshStandardMaterial({
                        color: 0xff6b6b,
                        transparent: true,
                        opacity: 0.5
                    });

                    const mesh = new THREE.Mesh(geometry, material);
                    renderer.scene.add(mesh);
                }
            } else {
                // Draw hole outline on ground
                const points = this.previewObstacle.vertices.map(v =>
                    new THREE.Vector3(v.x, 0.05, v.y)
                );
                points.push(points[0]); // Close loop

                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                const material = new THREE.LineBasicMaterial({ color: 0xff6b6b, linewidth: 2 });
                const line = new THREE.Line(geometry, material);
                renderer.scene.add(line);
            }
        }
    }

    createObstaclePreviewGeometry() {
        const verts = this.previewObstacle.vertices;
        if (verts.length < 3) return null;

        const shape = new THREE.Shape();
        shape.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) {
            shape.lineTo(verts[i].x, verts[i].y);
        }
        shape.closePath();

        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: this.previewObstacle.height,
            bevelEnabled: false
        });

        geometry.rotateX(Math.PI / 2);
        geometry.translate(0, this.previewObstacle.height / 2, 0);

        return geometry;
    }
}

// ========================================
// Select Tool
// ========================================
export class SelectTool extends Tool {
    constructor(editor) {
        super(editor);
        this.isDragging = false;
        this.dragStart = null;
    }

    activate() {
        this.isDragging = false;
    }

    deactivate() {
        this.isDragging = false;
    }

    onMouseDown(worldX, worldY, event) {
        if (event.button !== 0) return;

        // Find object at position
        const obj = this.editor.editorData.findObjectAt(worldX, worldY);

        if (obj) {
            this.editor.selectObject(obj);
            this.isDragging = true;
            this.dragStart = { x: worldX, y: worldY };
        } else {
            this.editor.selectObject(null);
        }
    }

    onMouseMove(worldX, worldY, event) {
        if (this.isDragging && this.editor.selectedObject && this.dragStart) {
            const dx = worldX - this.dragStart.x;
            const dy = worldY - this.dragStart.y;

            this.editor.selectedObject.translate(dx, dy);
            this.dragStart = { x: worldX, y: worldY };
        }
    }

    onMouseUp(worldX, worldY, event) {
        this.isDragging = false;
        this.dragStart = null;
    }

    onKeyDown(event) {
        if (event.key === 'Delete' || event.key === 'Backspace') {
            if (this.editor.selectedObject) {
                const obj = this.editor.selectedObject;
                if (obj.type === 'building') {
                    this.editor.editorData.removeBuilding(obj.id);
                } else if (obj.type === 'wall') {
                    this.editor.editorData.removeWall(obj.id);
                } else if (obj.type === 'obstacle') {
                    this.editor.editorData.removeObstacle(obj.id);
                }
                this.editor.selectObject(null);
            }
        }
    }

    getStatusText() {
        if (this.editor.selectedObject) {
            return `Selected: ${this.editor.selectedObject.type} (${this.editor.selectedObject.id}). Drag to move, Delete to remove.`;
        }
        return 'Click to select objects. Drag to move. Delete to remove.';
    }

    getCursor() {
        return this.isDragging ? 'grabbing' : 'default';
    }
}
