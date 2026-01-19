import { Tool } from './tool.js';

/**
 * EditTool - For editing vertices of shapes
 */
export class EditTool extends Tool {
    constructor(editor) {
        super(editor);
        this.name = 'edit';

        // Edit state
        this.editingObject = null; // 'outer', Building, Wall, or Obstacle
        this.vertices = []; // Reference to vertices array
        this.selectedVertexIndex = -1;
        this.selectedEdgeIndex = -1;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };

        // Visual settings
        this.vertexRadius = 8;
        this.edgeHitDistance = 10;
    }

    activate() {
        super.activate();
        this.exitEditMode();
    }

    deactivate() {
        super.deactivate();
        this.exitEditMode();
    }

    /**
     * Enter edit mode for an object
     */
    enterEditMode(obj) {
        this.editingObject = obj;
        this.selectedVertexIndex = -1;
        this.selectedEdgeIndex = -1;

        if (obj === 'outer') {
            this.vertices = this.editor.mapData.outerPoly;
        } else if (obj.type === 'building') {
            // For buildings, we edit the base vertices (before transform)
            // We need to work with transformed vertices but update position/scale
            this.vertices = obj.getVertices();
        } else if (obj.type === 'wall') {
            this.vertices = obj.points;
        } else if (obj.type === 'obstacle') {
            // For obstacles, we directly edit the vertices array
            this.vertices = obj.vertices;
        }

        this.editor.selectObject(obj);
        this.editor.render();
    }

    /**
     * Exit edit mode
     */
    exitEditMode() {
        this.editingObject = null;
        this.vertices = [];
        this.selectedVertexIndex = -1;
        this.selectedEdgeIndex = -1;
        this.isDragging = false;
        this.editor.render();
    }

    onMouseDown(x, y, event) {
        if (event.button !== 0) return;

        const threshold = this.vertexRadius / this.editor.camera.zoom;

        // If already in edit mode
        if (this.editingObject) {
            // Check if clicking on a vertex
            const vertexIndex = this.findVertexAt(x, y, threshold);
            if (vertexIndex !== -1) {
                this.selectedVertexIndex = vertexIndex;
                this.selectedEdgeIndex = -1;
                this.isDragging = true;
                this.dragOffset = {
                    x: x - this.vertices[vertexIndex].x,
                    y: y - this.vertices[vertexIndex].y
                };
                this.editor.render();
                return;
            }

            // Check if clicking on an edge
            const edgeIndex = this.findEdgeAt(x, y);
            if (edgeIndex !== -1) {
                this.selectedEdgeIndex = edgeIndex;
                this.selectedVertexIndex = -1;
                this.editor.render();
                return;
            }

            // Click on empty space - exit edit mode and try to select something else
            this.exitEditMode();
        }

        // Not in edit mode - try to find object to edit
        const hitObject = this.editor.mapData.findObjectAt(x, y);

        if (hitObject) {
            this.enterEditMode(hitObject);
        } else if (this.isPointInOuterPoly(x, y)) {
            // Clicked inside outer polygon area
            this.enterEditMode('outer');
        }
    }

    onMouseMove(x, y, event) {
        if (this.isDragging && this.selectedVertexIndex !== -1) {
            // Apply snap if enabled
            let newPos = this.applySnapExcluding(x - this.dragOffset.x, y - this.dragOffset.y, this.selectedVertexIndex);

            // Update vertex position
            if (this.editingObject === 'outer') {
                this.editor.mapData.outerPoly[this.selectedVertexIndex] = newPos;
                this.vertices = this.editor.mapData.outerPoly;
            } else if (this.editingObject.type === 'wall') {
                this.editingObject.points[this.selectedVertexIndex] = newPos;
                this.vertices = this.editingObject.points;
            } else if (this.editingObject.type === 'building') {
                // For buildings, moving vertices is complex - we'd need to recalculate
                // the building parameters. For now, update the cached vertices for preview
                this.vertices[this.selectedVertexIndex] = newPos;
            } else if (this.editingObject.type === 'obstacle') {
                // For obstacles, directly update the vertex
                this.editingObject.vertices[this.selectedVertexIndex] = newPos;
                this.vertices = this.editingObject.vertices;
            }

            // Invalidate navmesh
            this.editor.navmesh = null;
            this.editor.render();
        }
    }

    onMouseUp(x, y, event) {
        if (this.isDragging && this.editingObject && this.editingObject.type === 'building') {
            // For buildings, we need to recalculate the building from the new vertices
            // This is complex - for simplicity, we'll just update the position
            // to the centroid of the new vertices
            const centroid = this.calculateCentroid(this.vertices);
            this.editingObject.position = centroid;
            // Refresh vertices
            this.vertices = this.editingObject.getVertices();
        }

        this.isDragging = false;
    }

    onKeyDown(event) {
        if (event.key === 'Escape') {
            this.exitEditMode();
            event.preventDefault();
            return;
        }

        if (!this.editingObject) return;

        // Delete vertex
        if (event.key === 'Delete' && this.selectedVertexIndex !== -1) {
            this.deleteSelectedVertex();
            event.preventDefault();
            return;
        }

        // Insert vertex on edge
        if (event.key === 'Insert' && this.selectedEdgeIndex !== -1) {
            this.insertVertexOnEdge();
            event.preventDefault();
            return;
        }
    }

    /**
     * Delete the selected vertex
     */
    deleteSelectedVertex() {
        if (this.selectedVertexIndex === -1) return;

        // Check minimum vertices
        let minVertices = 3;
        if (this.editingObject === 'outer') {
            minVertices = 3;
        } else if (this.editingObject.type === 'wall') {
            minVertices = 2;
        } else if (this.editingObject.type === 'obstacle') {
            minVertices = 3;
        } else if (this.editingObject.type === 'building') {
            minVertices = 3;
        }

        if (this.vertices.length <= minVertices) {
            return; // Can't delete - would make shape invalid
        }

        if (this.editingObject === 'outer') {
            this.editor.mapData.outerPoly.splice(this.selectedVertexIndex, 1);
            this.vertices = this.editor.mapData.outerPoly;
        } else if (this.editingObject.type === 'wall') {
            this.editingObject.points.splice(this.selectedVertexIndex, 1);
            this.vertices = this.editingObject.points;
        } else if (this.editingObject.type === 'obstacle') {
            this.editingObject.vertices.splice(this.selectedVertexIndex, 1);
            this.vertices = this.editingObject.vertices;
        }
        // Buildings: deleting vertices would change the polygon shape fundamentally
        // For regular polygons, this doesn't make sense, so we skip it

        this.selectedVertexIndex = -1;
        this.editor.navmesh = null;
        this.editor.render();
    }

    /**
     * Insert a vertex on the selected edge
     */
    insertVertexOnEdge() {
        if (this.selectedEdgeIndex === -1) return;

        const i = this.selectedEdgeIndex;
        const j = (i + 1) % this.vertices.length;

        // For walls, j might be out of bounds if not closed
        if (this.editingObject.type === 'wall' && i >= this.vertices.length - 1) {
            return;
        }

        const midpoint = {
            x: (this.vertices[i].x + this.vertices[j].x) / 2,
            y: (this.vertices[i].y + this.vertices[j].y) / 2
        };

        if (this.editingObject === 'outer') {
            this.editor.mapData.outerPoly.splice(j, 0, midpoint);
            this.vertices = this.editor.mapData.outerPoly;
        } else if (this.editingObject.type === 'wall') {
            this.editingObject.points.splice(j, 0, midpoint);
            this.vertices = this.editingObject.points;
        } else if (this.editingObject.type === 'obstacle') {
            this.editingObject.vertices.splice(j, 0, midpoint);
            this.vertices = this.editingObject.vertices;
        }
        // Buildings: inserting vertices would change the polygon type, skip it

        this.selectedEdgeIndex = -1;
        this.selectedVertexIndex = j;
        this.editor.navmesh = null;
        this.editor.render();
    }

    /**
     * Find vertex at position
     */
    findVertexAt(x, y, threshold) {
        for (let i = 0; i < this.vertices.length; i++) {
            const v = this.vertices[i];
            const dist = Math.sqrt((v.x - x) ** 2 + (v.y - y) ** 2);
            if (dist <= threshold) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Find edge at position
     */
    findEdgeAt(x, y) {
        const threshold = this.edgeHitDistance / this.editor.camera.zoom;
        // Walls are open polylines, others are closed polygons
        const numEdges = (this.editingObject.type === 'wall') ?
            this.vertices.length - 1 : this.vertices.length;

        for (let i = 0; i < numEdges; i++) {
            const j = (i + 1) % this.vertices.length;
            const dist = this.pointToSegmentDistance(
                x, y,
                this.vertices[i].x, this.vertices[i].y,
                this.vertices[j].x, this.vertices[j].y
            );
            if (dist <= threshold) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Calculate distance from point to line segment
     */
    pointToSegmentDistance(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSq = dx * dx + dy * dy;

        if (lengthSq === 0) {
            return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
        }

        let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
        t = Math.max(0, Math.min(1, t));

        const nearestX = x1 + t * dx;
        const nearestY = y1 + t * dy;

        return Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2);
    }

    /**
     * Check if point is inside outer polygon
     */
    isPointInOuterPoly(x, y) {
        const poly = this.editor.mapData.outerPoly;
        if (poly.length < 3) return false;

        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i].x, yi = poly[i].y;
            const xj = poly[j].x, yj = poly[j].y;

            if (((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    /**
     * Apply snap excluding current vertex
     */
    applySnapExcluding(x, y, excludeIndex) {
        if (!this.editor.snapEnabled) {
            return { x, y };
        }

        const threshold = 15 / this.editor.camera.zoom;
        const allVertices = this.editor.mapData.getAllVertices();

        // Filter out the current vertex
        const currentVertex = this.vertices[excludeIndex];

        let nearest = null;
        let minDist = threshold;

        for (const v of allVertices) {
            // Skip if same as current vertex
            if (Math.abs(v.x - currentVertex.x) < 0.1 &&
                Math.abs(v.y - currentVertex.y) < 0.1) {
                continue;
            }

            const dist = Math.sqrt((v.x - x) ** 2 + (v.y - y) ** 2);
            if (dist < minDist) {
                minDist = dist;
                nearest = v;
            }
        }

        if (nearest) {
            this.editor.snapPoint = nearest;
            return { x: nearest.x, y: nearest.y };
        }

        this.editor.snapPoint = null;
        return { x, y };
    }

    /**
     * Calculate centroid of vertices
     */
    calculateCentroid(vertices) {
        let cx = 0, cy = 0;
        for (const v of vertices) {
            cx += v.x;
            cy += v.y;
        }
        return { x: cx / vertices.length, y: cy / vertices.length };
    }

    drawPreview(ctx) {
        if (!this.editingObject || this.vertices.length === 0) return;

        const zoom = this.editor.camera.zoom;
        const vertexRadius = this.vertexRadius / zoom;

        // Draw vertices
        for (let i = 0; i < this.vertices.length; i++) {
            const v = this.vertices[i];
            const isSelected = i === this.selectedVertexIndex;

            ctx.beginPath();
            ctx.arc(v.x, v.y, vertexRadius, 0, Math.PI * 2);

            if (isSelected) {
                ctx.fillStyle = '#00ff00';
                ctx.strokeStyle = '#ffffff';
            } else {
                ctx.fillStyle = '#ffffff';
                ctx.strokeStyle = '#000000';
            }

            ctx.fill();
            ctx.lineWidth = 2 / zoom;
            ctx.stroke();
        }

        // Highlight selected edge
        if (this.selectedEdgeIndex !== -1) {
            const i = this.selectedEdgeIndex;
            const j = (i + 1) % this.vertices.length;

            // For walls, check bounds
            if (this.editingObject.type === 'wall' && i >= this.vertices.length - 1) {
                return;
            }

            ctx.beginPath();
            ctx.moveTo(this.vertices[i].x, this.vertices[i].y);
            ctx.lineTo(this.vertices[j].x, this.vertices[j].y);
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 4 / zoom;
            ctx.stroke();
        }
    }

    getStatusText() {
        if (!this.editingObject) {
            return 'Edit Shape: Click on a building, wall, obstacle, or inside the outer area to edit vertices';
        }

        let objType = 'Unknown';
        if (this.editingObject === 'outer') {
            objType = 'Outer Polygon';
        } else if (this.editingObject.type === 'building') {
            objType = 'Building';
        } else if (this.editingObject.type === 'wall') {
            objType = 'Wall';
        } else if (this.editingObject.type === 'obstacle') {
            objType = 'Obstacle';
        }

        if (this.selectedVertexIndex !== -1) {
            return `Editing ${objType}: Drag to move vertex | DEL to delete | Esc to exit`;
        }

        if (this.selectedEdgeIndex !== -1) {
            return `Editing ${objType}: INS to add vertex on edge | Esc to exit`;
        }

        return `Editing ${objType}: Click vertex to select | Click edge to select | Esc to exit`;
    }

    getCursor() {
        if (this.isDragging) {
            return 'grabbing';
        }
        return 'crosshair';
    }
}
