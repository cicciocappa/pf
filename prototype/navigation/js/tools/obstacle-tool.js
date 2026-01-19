import { Tool } from './tool.js';
import { Obstacle } from '../models/obstacle.js';

/**
 * ObstacleTool - For drawing non-destructible obstacle polygons
 * Similar to DrawAreaTool but creates Obstacle objects
 */
export class ObstacleTool extends Tool {
    constructor(editor) {
        super(editor);
        this.name = 'obstacle';

        this.points = [];
        this.previewPoint = null;
    }

    activate() {
        super.activate();
        this.points = [];
        this.previewPoint = null;
    }

    deactivate() {
        super.deactivate();
        this.points = [];
        this.previewPoint = null;
    }

    onMouseDown(x, y, event) {
        if (event.button === 0) {
            // Left click - add point
            const point = this.applySnap(x, y);
            this.points.push({ ...point });
            this.editor.render();
        } else if (event.button === 2) {
            // Right click - complete polygon
            this.completePolygon();
        }
    }

    onMouseMove(x, y, event) {
        this.previewPoint = this.applySnap(x, y);

        // Update snap indicator
        if (this.editor.snapEnabled) {
            const snapped = this.editor.mapData.findNearestVertex(x, y, 15 / this.editor.camera.zoom);
            this.editor.snapPoint = snapped;
        }

        // Update edge snap indicator
        if (this.editor.snapToEdgeEnabled && !this.editor.snapPoint) {
            const edgeSnap = this.editor.mapData.findNearestEdge(x, y, 15 / this.editor.camera.zoom);
            this.editor.edgeSnapInfo = edgeSnap;
        } else {
            this.editor.edgeSnapInfo = null;
        }

        this.editor.render();
    }

    onKeyDown(event) {
        if (event.key === 'Enter') {
            this.completePolygon();
            event.preventDefault();
        } else if (event.key === 'Escape') {
            this.cancelDrawing();
            event.preventDefault();
        } else if (event.key === 'Backspace' || event.key === 'Delete') {
            // Remove last point
            if (this.points.length > 0) {
                this.points.pop();
                this.editor.render();
            }
            event.preventDefault();
        }
    }

    completePolygon() {
        if (this.points.length >= 3) {
            // Create obstacle with the drawn vertices
            const obstacle = new Obstacle({
                vertices: this.points.map(p => ({ x: p.x, y: p.y }))
            });

            // Ensure clockwise winding for holes (obstacles are holes in the navmesh)
            if (obstacle.signedArea() > 0) {
                obstacle.vertices.reverse();
            }

            this.editor.mapData.addObstacle(obstacle);
            this.editor.navmesh = null; // Invalidate navmesh

            this.points = [];
            this.previewPoint = null;
            this.editor.snapPoint = null;
            this.editor.edgeSnapInfo = null;
            this.editor.render();
        }
    }

    cancelDrawing() {
        this.points = [];
        this.previewPoint = null;
        this.editor.snapPoint = null;
        this.editor.edgeSnapInfo = null;
        this.editor.render();
    }

    /**
     * Apply snap with support for grid, vertex, and edge snap
     * @override
     */
    applySnap(x, y) {
        // First try vertex snap (highest priority)
        if (this.editor.snapEnabled) {
            const snapped = this.editor.mapData.findNearestVertex(x, y, 15 / this.editor.camera.zoom);
            if (snapped) {
                return snapped;
            }
        }

        // Then try edge snap
        if (this.editor.snapToEdgeEnabled) {
            const edgeSnap = this.editor.mapData.findNearestEdge(x, y, 15 / this.editor.camera.zoom);
            if (edgeSnap) {
                return edgeSnap.point;
            }
        }

        // Finally try grid snap
        if (this.editor.gridSnapEnabled) {
            const gridSize = this.editor.gridSize;
            return {
                x: Math.round(x / gridSize) * gridSize,
                y: Math.round(y / gridSize) * gridSize
            };
        }

        return { x, y };
    }

    drawPreview(ctx) {
        if (this.points.length === 0 && !this.previewPoint) return;

        const allPoints = [...this.points];
        if (this.previewPoint) {
            allPoints.push(this.previewPoint);
        }

        // Draw with obstacle color (different from outer poly)
        this.drawObstaclePreview(ctx, allPoints, this.points.length >= 3);

        // Draw closing line if we have enough points
        if (this.points.length >= 2 && this.previewPoint) {
            ctx.beginPath();
            ctx.moveTo(this.previewPoint.x, this.previewPoint.y);
            ctx.lineTo(this.points[0].x, this.points[0].y);
            ctx.strokeStyle = 'rgba(128, 128, 128, 0.5)';
            ctx.lineWidth = 1 / this.editor.camera.zoom;
            ctx.setLineDash([5 / this.editor.camera.zoom, 5 / this.editor.camera.zoom]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    drawObstaclePreview(ctx, vertices, closed = false) {
        if (vertices.length < 1) return;

        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
            ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        if (closed && vertices.length >= 3) {
            ctx.closePath();
            ctx.fillStyle = 'rgba(128, 128, 128, 0.2)';
            ctx.fill();
        }

        ctx.strokeStyle = 'rgba(128, 128, 128, 0.8)';
        ctx.lineWidth = 2 / this.editor.camera.zoom;
        ctx.setLineDash([5 / this.editor.camera.zoom, 5 / this.editor.camera.zoom]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw vertices
        const radius = 4 / this.editor.camera.zoom;
        ctx.fillStyle = 'rgba(128, 128, 128, 0.8)';
        for (const v of vertices) {
            ctx.beginPath();
            ctx.arc(v.x, v.y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    getStatusText() {
        if (this.points.length === 0) {
            return 'Click to start drawing an obstacle (non-destructible)';
        }
        return `Drawing obstacle: ${this.points.length} points | Right-click or Enter to complete | Esc to cancel`;
    }

    getCursor() {
        return 'crosshair';
    }
}
