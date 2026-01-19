import { Tool } from './tool.js';

/**
 * SelectTool - For selecting, dragging objects and opening properties
 */
export class SelectTool extends Tool {
    constructor(editor) {
        super(editor);
        this.name = 'select';

        this.isDragging = false;
        this.dragStart = null;
        this.dragOffset = null;
    }

    activate() {
        super.activate();
    }

    deactivate() {
        super.deactivate();
        this.isDragging = false;
        this.dragStart = null;
        this.dragOffset = null;
    }

    onMouseDown(x, y, event) {
        if (event.button !== 0) return; // Left button only

        // Find object at click position
        const obj = this.editor.mapData.findObjectAt(x, y);

        if (obj) {
            this.editor.selectObject(obj);
            this.isDragging = true;
            this.dragStart = { x, y };

            // Calculate offset from object center
            if (obj.type === 'building') {
                this.dragOffset = {
                    x: x - obj.position.x,
                    y: y - obj.position.y
                };
            } else if (obj.type === 'wall') {
                // For walls, calculate center of points
                const center = this.getWallCenter(obj);
                this.dragOffset = {
                    x: x - center.x,
                    y: y - center.y
                };
            }
        } else {
            this.editor.selectObject(null);
        }

        this.editor.render();
    }

    onMouseMove(x, y, event) {
        if (!this.isDragging) return;

        const obj = this.editor.selectedObject;
        if (!obj) return;

        let targetX = x - this.dragOffset.x;
        let targetY = y - this.dragOffset.y;

        // Apply snap if enabled
        if (this.editor.snapEnabled) {
            const snapped = this.editor.mapData.findNearestVertex(targetX, targetY, 15 / this.editor.camera.zoom);
            if (snapped) {
                targetX = snapped.x;
                targetY = snapped.y;
                this.editor.snapPoint = snapped;
            } else {
                this.editor.snapPoint = null;
            }
        }

        if (obj.type === 'building') {
            obj.position.x = targetX;
            obj.position.y = targetY;
        } else if (obj.type === 'wall') {
            // Move all wall points
            const center = this.getWallCenter(obj);
            const dx = targetX - center.x;
            const dy = targetY - center.y;

            for (const point of obj.points) {
                point.x += dx;
                point.y += dy;
            }
        }

        this.editor.render();
    }

    onMouseUp(x, y, event) {
        this.isDragging = false;
        this.dragStart = null;
        this.dragOffset = null;
        this.editor.snapPoint = null;
        this.editor.render();
    }

    onDoubleClick(x, y, event) {
        const obj = this.editor.mapData.findObjectAt(x, y);
        if (obj) {
            this.editor.selectObject(obj);
            this.editor.showPropertiesDialog(obj);
        }
    }

    onKeyDown(event) {
        if (event.key === 'Delete' || event.key === 'Backspace') {
            const obj = this.editor.selectedObject;
            if (obj && obj.type) {
                this.editor.mapData.removeObject(obj);
                this.editor.selectObject(null);
                this.editor.render();
            }
            event.preventDefault();
        }
    }

    getWallCenter(wall) {
        if (wall.points.length === 0) return { x: 0, y: 0 };

        let sumX = 0, sumY = 0;
        for (const p of wall.points) {
            sumX += p.x;
            sumY += p.y;
        }

        return {
            x: sumX / wall.points.length,
            y: sumY / wall.points.length
        };
    }

    getStatusText() {
        if (this.editor.selectedObject) {
            const obj = this.editor.selectedObject;
            if (obj.type === 'building') {
                return `Selected: Building (${obj.sides} sides) | Double-click to edit | DEL to delete`;
            } else if (obj.type === 'wall') {
                return `Selected: Wall (${obj.points.length} points) | Double-click to edit | DEL to delete`;
            }
        }
        return 'Click to select | Drag to move | Double-click to edit properties';
    }

    getCursor() {
        if (this.isDragging) {
            return 'grabbing';
        }
        return 'default';
    }
}
