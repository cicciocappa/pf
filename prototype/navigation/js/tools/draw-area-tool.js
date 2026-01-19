import { Tool } from './tool.js';

/**
 * DrawAreaTool - For drawing the outer polygon (map boundary)
 */
export class DrawAreaTool extends Tool {
    constructor(editor) {
        super(editor);
        this.name = 'draw-area';

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
            // Ensure counter-clockwise winding for outer polygon
            if (this.signedArea(this.points) < 0) {
                this.points.reverse();
            }

            this.editor.mapData.setOuterPoly(this.points);
            this.points = [];
            this.previewPoint = null;
            this.editor.snapPoint = null;
            this.editor.render();
        }
    }

    cancelDrawing() {
        this.points = [];
        this.previewPoint = null;
        this.editor.snapPoint = null;
        this.editor.render();
    }

    signedArea(poly) {
        let area = 0;
        for (let i = 0; i < poly.length; i++) {
            const j = (i + 1) % poly.length;
            area += poly[i].x * poly[j].y;
            area -= poly[j].x * poly[i].y;
        }
        return area / 2;
    }

    drawPreview(ctx) {
        if (this.points.length === 0 && !this.previewPoint) return;

        const allPoints = [...this.points];
        if (this.previewPoint) {
            allPoints.push(this.previewPoint);
        }

        this.editor.renderer.drawPolygonPreview(allPoints, this.points.length >= 3);

        // Draw closing line if we have enough points
        if (this.points.length >= 2 && this.previewPoint) {
            ctx.beginPath();
            ctx.moveTo(this.previewPoint.x, this.previewPoint.y);
            ctx.lineTo(this.points[0].x, this.points[0].y);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1 / this.editor.camera.zoom;
            ctx.setLineDash([5 / this.editor.camera.zoom, 5 / this.editor.camera.zoom]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    getStatusText() {
        if (this.points.length === 0) {
            return 'Click to start drawing the outer boundary';
        }
        return `Drawing area: ${this.points.length} points | Right-click or Enter to complete | Esc to cancel`;
    }

    getCursor() {
        return 'crosshair';
    }
}
