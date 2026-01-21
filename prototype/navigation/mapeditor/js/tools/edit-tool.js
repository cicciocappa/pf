import { Tool } from './tool.js';

export class EditTool extends Tool {
    constructor(editor) {
        super(editor);
        this.name = 'edit';
        this.editingObject = null;
        this.selectedVertexId = null; // Usiamo l'ID invece dell'indice
        this.selectedEdgeId = null;
        this.isDragging = false;
        this.vertexRadius = 8;
    }

    enterEditMode(obj) {
        // Filtriamo gli edifici: non sono editabili a livello di vertice in questo sistema
        if (obj && obj.type === 'building') {
            console.log("Buildings can only be moved or rotated via Selection Tool.");
            return;
        }

        this.editingObject = obj;
        this.selectedVertexId = null;
        this.selectedEdgeId = null;
        this.editor.selectObject(obj);
        this.editor.render();
    }

    exitEditMode() {
        this.editingObject = null;
        this.selectedVertexId = null;
        this.selectedEdgeId = null;
        this.isDragging = false;
        this.editor.render();
    }

    onMouseDown(x, y, event) {
        if (event.button !== 0) return;

        const zoom = this.editor.camera.zoom;
        const threshold = this.vertexRadius / zoom;

        if (this.editingObject) {
            const points = this._getEditingPoints();
            
            // 1. Check Vertici
            for (const p of points) {
                if (Math.hypot(p.x - x, p.y - y) < threshold) {
                    this.selectedVertexId = p.id;
                    this.selectedEdgeId = null;
                    this.isDragging = true;
                    return;
                }
            }

            // 2. Check Edge (per inserimento nuovi punti)
            const edgeIndex = this._findEdgeAt(x, y, points);
            if (edgeIndex !== -1) {
                this.selectedEdgeId = `e_${points[edgeIndex].id}`;
                this.selectedVertexId = null;
                this.editor.render();
                return;
            }
        }

        // Se non siamo in edit mode o abbiamo cliccato fuori, cerchiamo un nuovo oggetto
        const hit = this.editor.mapData.findObjectAt(x, y);
        if (hit && hit.type !== 'building') {
            this.enterEditMode(hit);
        } else {
            this.exitEditMode();
        }
    }

    onMouseMove(x, y, event) {
        if (!this.isDragging || !this.selectedVertexId) return;

        const points = this._getEditingPoints();
        const vertex = points.find(p => p.id === this.selectedVertexId);
        
        if (vertex) {
            // Applichiamo lo Snap se attivo (escludendo se stessi)
            let targetX = x;
            let targetY = y;

            if (this.editor.snapEnabled) {
                const snap = this.editor.mapData.findNearestVertex(x, y, 15 / this.editor.camera.zoom);
                if (snap && snap.id !== this.selectedVertexId) {
                    targetX = snap.point.x;
                    targetY = snap.point.y;
                }
            }

            vertex.x = targetX;
            vertex.y = targetY;

            // Ricalcoliamo tutta la geometria (connessioni incluse!)
            this.editor.mapData.updateAllGeometry();
            this.editor.render();
        }
    }

    onMouseUp() {
        if (this.isDragging && this.editor.history) {
            this.editor.history.save();
        }
        this.isDragging = false;
    }

    onKeyDown(event) {
        if (event.key === 'Escape') this.exitEditMode();
        
        if (!this.editingObject) return;

        if (event.key === 'Delete' || event.key === 'Backspace') {
            this._deleteVertex();
        }
        
        if (event.key === 'i' || event.key === 'Insert') {
            this._insertVertex(this.editor.lastMousePos); // Assumendo che l'editor tracci il mouse
        }
    }

    // --- HELPER METHODS ---

    _getEditingPoints() {
        if (!this.editingObject) return [];
        if (this.editingObject === 'outer') return this.editor.mapData.outerPoly;
        return this.editingObject.points || this.editingObject.vertices;
    }

    _findEdgeAt(x, y, points) {
        const threshold = 10 / this.editor.camera.zoom;
        const isClosed = this.editingObject !== 'wall';
        const limit = isClosed ? points.length : points.length - 1;

        for (let i = 0; i < limit; i++) {
            const p1 = points[i];
            const p2 = points[(i + 1) % points.length];
            const dist = this._pointToSegmentDist(x, y, p1, p2);
            if (dist < threshold) return i;
        }
        return -1;
    }

    _pointToSegmentDist(px, py, p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const l2 = dx * dx + dy * dy;
        if (l2 === 0) return Math.hypot(px - p1.x, py - p1.y);
        let t = ((px - p1.x) * dx + (py - p1.y) * dy) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (p1.x + t * dx), py - (p1.y + t * dy));
    }

    _insertVertex() {
        if (!this.selectedEdgeId) return;
        const points = this._getEditingPoints();
        const idx = points.findIndex(p => `e_${p.id}` === this.selectedEdgeId);
        
        if (idx !== -1) {
            const p1 = points[idx];
            const p2 = points[(idx + 1) % points.length];
            const newPoint = {
                id: `p_edit_${Date.now()}`,
                x: (p1.x + p2.x) / 2,
                y: (p1.y + p2.y) / 2
            };
            points.splice(idx + 1, 0, newPoint);
            this.selectedVertexId = newPoint.id;
            this.selectedEdgeId = null;
            this.editor.mapData.updateAllGeometry();
            this.editor.render();
        }
    }

    _deleteVertex() {
        if (!this.selectedVertexId) return;
        const points = this._getEditingPoints();
        if (points.length <= (this.editingObject.type === 'wall' ? 2 : 3)) return;

        const idx = points.findIndex(p => p.id === this.selectedVertexId);
        if (idx !== -1) {
            points.splice(idx, 1);
            this.selectedVertexId = null;
            this.editor.mapData.updateAllGeometry();
            this.editor.render();
        }
    }
}