// ========================================
// editor-tools.js
// 8 tools: Select, Boundary, Building, Wall, Obstacle, OffMesh, Merge, Split
// ========================================

import { GeometryFactory, polygonAreaArray } from './editor-geometry.js';
import { Building, Wall, Obstacle, Boundary } from './editor-models.js';

// ========================================
// Base Tool
// ========================================
class Tool {
    constructor(editor) {
        this.editor = editor;
        this.name = 'base';
    }

    activate() {}
    deactivate() {}
    onMouseDown(x, y, event) {}
    onMouseMove(x, y, event) {}
    onMouseUp(x, y, event) {}
    onWheel(x, y, deltaY, event) {}
    onKeyDown(event) {}
    onDblClick(x, y, event) {}
    drawPreview(ctx) {}
    getStatusText() { return ''; }
    getCursor() { return 'default'; }
}

// ========================================
// SelectTool (S)
// ========================================
export class SelectTool extends Tool {
    constructor(editor) {
        super(editor);
        this.name = 'select';
        this.isDragging = false;
        this.dragStart = null;
        this.dragTarget = null;
    }

    activate() {
        this.isDragging = false;
        this.dragTarget = null;
    }

    onMouseDown(x, y, event) {
        if (event.button !== 0) return;

        // Try to find object at position
        const obj = this.editor.editorData.findObjectAt(x, y);

        // Check off-mesh links
        const linkIdx = this._findLinkAt(x, y);

        if (obj) {
            this.editor.saveUndo();
            this.editor.selectObject(obj);
            this.isDragging = true;
            this.dragStart = { x, y };
            this.dragTarget = obj;
        } else if (linkIdx >= 0) {
            this.editor.selectedLink = linkIdx;
            this.editor.selectedObject = null;
        } else {
            // Check boundary vertex
            const bv = this._findBoundaryVertex(x, y);
            if (bv) {
                this.editor.saveUndo();
                this.editor.selectedVertex = bv;
                this.isDragging = true;
                this.dragStart = { x, y };
                this.dragTarget = null;
            } else {
                this.editor.selectObject(null);
                this.editor.selectedLink = -1;
                this.editor.selectedVertex = null;
            }
        }
    }

    onMouseMove(x, y, event) {
        if (!this.isDragging || !this.dragStart) return;

        const dx = x - this.dragStart.x;
        const dy = y - this.dragStart.y;

        if (this.dragTarget) {
            this.dragTarget.translate(dx, dy);
            this.editor.editorData._snapCacheDirty = true;
    
        } else if (this.editor.selectedVertex) {
            const sv = this.editor.selectedVertex;
            if (sv.type === 'boundary') {
                const bd = this.editor.editorData.boundaries[sv.boundaryIdx];
                bd.vertices[sv.vertexIdx] = [x, y];
                this.editor.editorData._snapCacheDirty = true;
        
            }
        }

        this.dragStart = { x, y };
    }

    onMouseUp(x, y, event) {
        this.isDragging = false;
        this.dragStart = null;
    }

    onKeyDown(event) {
        if (event.key === 'Delete' || event.key === 'Backspace') {
            this._deleteSelected();
            event.preventDefault();
        }
    }

    _deleteSelected() {
        const sel = this.editor.selectedObject;
        if (sel) {
            this.editor.saveUndo();
            if (sel.type === 'building') {
                this.editor.editorData.removeBuilding(sel.id);
            } else if (sel.type === 'wall') {
                this.editor.editorData.removeWall(sel.id);
            } else if (sel.type === 'obstacle') {
                this.editor.editorData.removeObstacle(sel.id);
            }
            this.editor.selectObject(null);
    
        } else if (this.editor.selectedLink >= 0) {
            this.editor.saveUndo();
            this.editor.editorData.offMeshLinks.splice(this.editor.selectedLink, 1);
            this.editor.selectedLink = -1;
        } else if (this.editor.selectedVertex) {
            const sv = this.editor.selectedVertex;
            if (sv.type === 'boundary') {
                const bd = this.editor.editorData.boundaries[sv.boundaryIdx];
                if (bd.vertices.length > 3) {
                    this.editor.saveUndo();
                    bd.vertices.splice(sv.vertexIdx, 1);
                    this.editor.selectedVertex = null;
            
                }
            }
        }
    }

    _findLinkAt(x, y) {
        const threshold = 0.8;
        const links = this.editor.editorData.offMeshLinks;
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            const dx = link.end[0] - link.start[0];
            const dy = link.end[1] - link.start[1];
            const len2 = dx * dx + dy * dy;
            if (len2 === 0) continue;
            let t = ((x - link.start[0]) * dx + (y - link.start[1]) * dy) / len2;
            t = Math.max(0, Math.min(1, t));
            const px = link.start[0] + t * dx;
            const py = link.start[1] + t * dy;
            if (Math.hypot(x - px, y - py) < threshold) return i;
        }
        return -1;
    }

    _findBoundaryVertex(x, y) {
        const threshold = 0.5;
        const boundaries = this.editor.editorData.boundaries;
        for (let bi = 0; bi < boundaries.length; bi++) {
            const verts = boundaries[bi].vertices;
            for (let vi = 0; vi < verts.length; vi++) {
                if (Math.hypot(x - verts[vi][0], y - verts[vi][1]) < threshold) {
                    return { type: 'boundary', boundaryIdx: bi, vertexIdx: vi };
                }
            }
        }
        return null;
    }

    getStatusText() {
        if (this.editor.selectedObject) {
            const sel = this.editor.selectedObject;
            return `Selected: ${sel.type} (${sel.id}) | Delete to remove | Drag to move`;
        }
        return 'Select: click to select, drag to move, Delete to remove';
    }

    getCursor() { return 'pointer'; }
}

// ========================================
// BoundaryTool (B)
// ========================================
export class BoundaryTool extends Tool {
    constructor(editor) {
        super(editor);
        this.name = 'boundary';
        this.currentPolygon = [];
    }

    activate() {
        this.currentPolygon = [];
    }

    deactivate() {
        this.currentPolygon = [];
    }

    onMouseDown(x, y, event) {
        if (event.button !== 0) return;

        // Close if clicking near first point
        if (this.currentPolygon.length >= 3) {
            const first = this.currentPolygon[0];
            if (Math.hypot(x - first[0], y - first[1]) < 0.5) {
                this._closePolygon();
                return;
            }
        }

        this.currentPolygon.push([x, y]);
    }

    onDblClick(x, y, event) {
        if (this.currentPolygon.length >= 3) {
            this._closePolygon();
        }
    }

    onKeyDown(event) {
        if (event.key === 'Escape') {
            this.currentPolygon = [];
            event.preventDefault();
        }
    }

    _closePolygon() {
        if (this.currentPolygon.length < 3) return;

        this.editor.saveUndo();

        // Ensure CCW
        if (polygonAreaArray(this.currentPolygon) < 0) {
            this.currentPolygon.reverse();
        }

        const boundary = new Boundary({
            id: this.editor.editorData.generateId('bd'),
            vertices: this.currentPolygon.map(v => [...v])
        });

        this.editor.editorData.addBoundary(boundary);
        this.currentPolygon = [];

    }

    getStatusText() {
        if (this.currentPolygon.length === 0) return 'Boundary: click to add vertices, double-click to close';
        return `Boundary: ${this.currentPolygon.length} vertices - double-click or click first point to close`;
    }

    getCursor() { return 'crosshair'; }
}

// ========================================
// BuildingTool (F)
// ========================================
export class BuildingTool extends Tool {
    constructor(editor) {
        super(editor);
        this.name = 'building';
        this.position = { x: 0, y: 0 };
        this.rotation = 0;
        this.scaleX = 5;
        this.scaleY = 5;
        this.sides = 4;
        this.currentTemplateId = 'ngon';
        this.scaleConstraint = null;
        this.edgeSnapInfo = null;
        this.alignedEdgeIndex = 0;
    }

    activate() {
        this._resetTransform();
    }

    _resetTransform() {
        this.rotation = 0;
        this.scaleX = 5;
        this.scaleY = 5;
        this.scaleConstraint = null;
        this.edgeSnapInfo = null;
        this.alignedEdgeIndex = 0;
    }

    setTemplate(templateId) {
        this.currentTemplateId = templateId;
        if (templateId === 'ngon') {
            // keep sides
        } else {
            // Determine sides from template for edge snap
            const verts = GeometryFactory.getTemplate(templateId);
            this.sides = verts.length;
        }
    }

    onMouseDown(x, y, event) {
        if (event.button !== 0) return;

        this.editor.saveUndo();

        const templateId = this.currentTemplateId === 'ngon'
            ? `ngon_${this.sides}`
            : this.currentTemplateId;

        const building = new Building({
            id: this.editor.editorData.generateId('bldg'),
            templateId: templateId,
            position: { ...this.position },
            rotation: this.rotation,
            scaleX: this.scaleX,
            scaleY: this.scaleY
        });

        this.editor.editorData.addBuilding(building);
        this.editor.selectObject(building);

        this.edgeSnapInfo = null;
        this.editor.edgeSnapInfo = null;

    }

    onMouseMove(x, y, event) {
        const threshold = 15 / this.editor.camera.zoom;

        // 1. Vertex Snap
        if (this.editor.snapEnabled) {
            const snapped = this.editor.editorData.findNearestVertex(x, y, threshold);
            if (snapped) {
                this.position = { x: snapped.point.x, y: snapped.point.y };
                this.editor.snapPoint = snapped.point;
                return;
            }
        }

        // 2. Edge Snap
        if (this.editor.snapToEdgeEnabled) {
            const edgeResult = this.editor.editorData.findNearestEdge(x, y, threshold * 2);
            if (edgeResult) {
                this.edgeSnapInfo = edgeResult;
                this.editor.edgeSnapInfo = edgeResult;
                this.editor.snapPoint = null;

                const edgeDir = this._normalize({
                    x: edgeResult.edge.p2.x - edgeResult.edge.p1.x,
                    y: edgeResult.edge.p2.y - edgeResult.edge.p1.y
                });
                const edgeAngle = Math.atan2(edgeDir.y, edgeDir.x);

                const baseOffset = (this.sides === 4) ? Math.PI / 4 : 0;
                const baseEdgeMidAngle = -Math.PI / 2 + baseOffset + Math.PI / this.sides;
                const selectedEdgeOffset = (this.alignedEdgeIndex * 2 * Math.PI) / this.sides;
                const edgeMidAngle = baseEdgeMidAngle + selectedEdgeOffset;

                this.rotation = edgeAngle - edgeMidAngle - Math.PI / 2;

                let distToCenter;
                if (this.sides === 4) {
                    distToCenter = (this.alignedEdgeIndex % 2 === 0) ?
                        this.scaleY * Math.cos(Math.PI / this.sides) :
                        this.scaleX * Math.cos(Math.PI / this.sides);
                } else {
                    distToCenter = ((this.scaleX + this.scaleY) / 2) * Math.cos(Math.PI / this.sides);
                }

                const perpDir = { x: -edgeDir.y, y: edgeDir.x };
                this.position = {
                    x: edgeResult.point.x + perpDir.x * distToCenter,
                    y: edgeResult.point.y + perpDir.y * distToCenter
                };
                return;
            }
        }

        // 3. Grid Snap
        if (this.editor.gridSnapEnabled) {
            const gs = this.editor.gridSize;
            this.position = { x: Math.round(x / gs) * gs, y: Math.round(y / gs) * gs };
        } else {
            this.position = { x, y };
        }

        this.editor.snapPoint = null;
        this.editor.edgeSnapInfo = null;
        this.edgeSnapInfo = null;
    }

    onWheel(x, y, deltaY, event) {
        const scaleFactor = deltaY > 0 ? 0.9 : 1.1;

        if (event.shiftKey) {
            this.rotation += (deltaY > 0 ? -15 : 15) * Math.PI / 180;
        } else if (event.ctrlKey) {
            this.rotation += (deltaY > 0 ? -1 : 1) * Math.PI / 180;
        } else {
            if (this.scaleConstraint === 'x') {
                this.scaleX = Math.max(1, this.scaleX * scaleFactor);
            } else if (this.scaleConstraint === 'y') {
                this.scaleY = Math.max(1, this.scaleY * scaleFactor);
            } else {
                this.scaleX = Math.max(1, this.scaleX * scaleFactor);
                this.scaleY = Math.max(1, this.scaleY * scaleFactor);
            }
        }
        event.preventDefault();
    }

    onKeyDown(event) {
        const key = event.key.toLowerCase();

        if (key === 'x') this.scaleConstraint = this.scaleConstraint === 'x' ? null : 'x';
        if (key === 'y') this.scaleConstraint = this.scaleConstraint === 'y' ? null : 'y';

        if (event.key === 'Tab') {
            this.alignedEdgeIndex = (this.alignedEdgeIndex + 1) % this.sides;
            event.preventDefault();
        }

        const numKey = parseInt(event.key);
        if (!isNaN(numKey)) {
            this.currentTemplateId = 'ngon';
            if (numKey >= 3 && numKey <= 9) this.sides = numKey;
            else if (numKey === 0) this.sides = 10;
            else if (numKey === 1) this.sides = 11;
            else if (numKey === 2) this.sides = 12;

            if (this.alignedEdgeIndex >= this.sides) this.alignedEdgeIndex = 0;
            event.preventDefault();
        }

        if (event.key === 'Escape') {
            this._resetTransform();
            this.sides = 4;
            this.currentTemplateId = 'ngon';
        }
    }

    drawPreview(ctx) {
        const localVertices = (this.currentTemplateId === 'ngon')
            ? GeometryFactory.createNGon(this.sides)
            : GeometryFactory.getTemplate(this.currentTemplateId);

        this.editor.renderer.drawBuildingPreview(
            this.position, this.rotation, this.scaleX, this.scaleY, localVertices
        );

        this.editor.renderer.drawLocalAxes(
            this.position, this.rotation, this.scaleX, this.scaleY, this.scaleConstraint
        );
    }

    _normalize(v) {
        const len = Math.sqrt(v.x * v.x + v.y * v.y);
        return len < 0.001 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
    }

    getStatusText() {
        const tmpl = this.currentTemplateId === 'ngon' ? `${this.sides}-gon` : this.currentTemplateId;
        return `Building: ${tmpl} | Scale ${this.scaleX.toFixed(1)}x${this.scaleY.toFixed(1)}m | Rot ${Math.round(this.rotation * 180 / Math.PI)}deg | Wheel: scale, Shift+Wheel: rotate`;
    }

    getCursor() { return 'crosshair'; }
}

// ========================================
// WallTool (W)
// ========================================
export class WallTool extends Tool {
    constructor(editor) {
        super(editor);
        this.name = 'wall';
        this.points = [];
        this.previewPoint = null;
        this.thickness = 2;
        this.maxSegmentLength = 3;
        this.startSnapInfo = null;
        this.endSnapInfo = null;
        this.currentSnapInfo = null;
    }

    activate() {
        this._reset();
    }

    deactivate() {
        this._reset();
        this.editor.edgeSnapInfo = null;
    }

    _reset() {
        this.points = [];
        this.previewPoint = null;
        this.startSnapInfo = null;
        this.endSnapInfo = null;
        this.currentSnapInfo = null;
        this.editor.snapPoint = null;
        this.editor.edgeSnapInfo = null;
    }

    onMouseDown(x, y, event) {
        if (event.button === 0) {
            const snapResult = this._getSnappedPoint(x, y);
            const point = snapResult.point;

            if (this.points.length === 0) {
                this.startSnapInfo = this._buildSnapInfo(snapResult);
            }

            this.points.push({ ...point });
            this.endSnapInfo = this._buildSnapInfo(snapResult);
        } else if (event.button === 2) {
            this._completeWall();
        }
    }

    onMouseMove(x, y, event) {
        const snapResult = this._getSnappedPoint(x, y);
        this.previewPoint = snapResult.point;
        this.currentSnapInfo = snapResult.vertexSnap || snapResult.edgeSnap;

        if (snapResult.vertexSnap) {
            this.editor.snapPoint = snapResult.vertexSnap.point;
            this.editor.edgeSnapInfo = null;
        } else if (snapResult.edgeSnap) {
            this.editor.snapPoint = null;
            this.editor.edgeSnapInfo = snapResult.edgeSnap;
        } else {
            this.editor.snapPoint = null;
            this.editor.edgeSnapInfo = null;
        }
    }

    onWheel(x, y, deltaY, event) {
        if (event.ctrlKey) {
            const delta = deltaY > 0 ? -0.5 : 0.5;
            this.maxSegmentLength = Math.max(1, Math.min(20, this.maxSegmentLength + delta));
            event.preventDefault();
        } else {
            const delta = deltaY > 0 ? -0.2 : 0.2;
            this.thickness = Math.max(0.2, Math.min(10, this.thickness + delta));
        }
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
                if (this.points.length === 0) this.startSnapInfo = null;
                this.endSnapInfo = null;
                event.preventDefault();
            }
        }
    }

    _completeWall() {
        if (this.points.length < 2) return;

        this.editor.saveUndo();

        const pointsWithIds = this.points.map((p, index) => {
            const id = `p_${Date.now()}_${index}`;
            return { id, edgeId: `e_${id}`, x: p.x, y: p.y };
        });

        const wall = new Wall({
            id: this.editor.editorData.generateId('wall'),
            points: pointsWithIds,
            thickness: this.thickness,
            maxSegmentLength: this.maxSegmentLength
        });

        this.editor.editorData.addWall(wall);

        if (this.startSnapInfo) {
            this._registerConnection(wall.id, 'start', this.startSnapInfo);
        }
        if (this.endSnapInfo) {
            this._registerConnection(wall.id, 'end', this.endSnapInfo);
        }

        this.editor.editorData.updateAllGeometry();
        this.editor.selectObject(wall);
        this._reset();

    }

    _getSnappedPoint(x, y) {
        const threshold = 15 / this.editor.camera.zoom;
        let point = { x, y };
        let vertexSnap = null;
        let edgeSnap = null;

        if (this.editor.snapEnabled) {
            const snapped = this.editor.editorData.findNearestVertex(x, y, threshold);
            if (snapped) {
                point = { x: snapped.point.x, y: snapped.point.y };
                vertexSnap = snapped;
            }
        }

        if (!vertexSnap && this.editor.snapToEdgeEnabled) {
            const edgeResult = this.editor.editorData.findNearestEdge(x, y, threshold);
            if (edgeResult) {
                point = { ...edgeResult.point };
                edgeSnap = edgeResult;
            }
        }

        if (!vertexSnap && !edgeSnap && this.editor.gridSnapEnabled) {
            const gs = this.editor.gridSize;
            point = { x: Math.round(x / gs) * gs, y: Math.round(y / gs) * gs };
        }

        return { point, vertexSnap, edgeSnap };
    }

    _buildSnapInfo(snapResult) {
        if (snapResult.vertexSnap) {
            const vs = snapResult.vertexSnap;
            return {
                type: vs.type, targetId: vs.targetId,
                vertexIndex: vs.vertexIndex, targetVertexId: vs.point.id,
                vertex: { ...vs.point }, isEndpoint: vs.isEndpoint,
                endpointType: vs.endpointType, snapType: 'vertex'
            };
        } else if (snapResult.edgeSnap) {
            const es = snapResult.edgeSnap;
            return {
                type: es.type, targetId: es.targetId,
                edge: { p1: { ...es.edge.p1 }, p2: { ...es.edge.p2 } },
                edgeIndex: es.edgeIndex, targetEdgeId: es.targetEdgeId,
                snapType: 'edge'
            };
        }
        return null;
    }

    _registerConnection(wallId, wallEnd, snapInfo) {
        if (!snapInfo) return;

        let type = '';
        if (snapInfo.snapType === 'vertex') {
            if (snapInfo.type === 'building') type = 'WALL_TO_BUILDING_VERTEX';
            else if (snapInfo.type === 'wall' && snapInfo.isEndpoint) type = 'WALL_TO_WALL_VERTEX';
        } else if (snapInfo.snapType === 'edge') {
            if (snapInfo.type === 'building' || snapInfo.type === 'obstacle' || snapInfo.type === 'boundary') {
                type = 'WALL_TO_EDGE';
            } else if (snapInfo.type === 'wall') {
                type = 'WALL_TO_WALL_EDGE';
            }
        }

        if (type) {
            this.editor.editorData.connectionManager.add({
                type, wallId, wallEnd,
                targetId: snapInfo.targetId,
                targetType: snapInfo.type,
                targetVertexIndex: snapInfo.vertexIndex,
                targetVertexId: snapInfo.targetVertexId,
                targetEdge: snapInfo.edge,
                targetEdgeIndex: snapInfo.edgeIndex,
                targetEdgeId: snapInfo.targetEdgeId,
                targetWallId: snapInfo.targetId,
                targetWallEnd: snapInfo.endpointType
            });
        }
    }

    drawPreview(ctx) {
        const allPoints = [...this.points];
        if (this.previewPoint && this.points.length > 0) {
            allPoints.push(this.previewPoint);
        }

        if (allPoints.length > 0) {
            this.editor.renderer.drawWallPreview(allPoints, this.thickness, this.maxSegmentLength);
        }
    }

    getStatusText() {
        if (this.points.length === 0) {
            return `Wall: Thickness ${this.thickness.toFixed(1)}m | Segment ${this.maxSegmentLength.toFixed(1)}m | Click to start`;
        }
        return `Wall: ${this.points.length} points | Thickness ${this.thickness.toFixed(1)}m | Right-click/Enter to complete`;
    }

    getCursor() { return 'crosshair'; }
}

// ========================================
// ObstacleTool (O)
// ========================================
export class ObstacleTool extends Tool {
    constructor(editor) {
        super(editor);
        this.name = 'obstacle';
        this.currentPolygon = [];
        this.isDrawingRect = false;
        this.rectStart = null;
    }

    activate() {
        this.currentPolygon = [];
        this.isDrawingRect = false;
        this.rectStart = null;
    }

    deactivate() {
        this.currentPolygon = [];
        this.isDrawingRect = false;
        this.rectStart = null;
    }

    onMouseDown(x, y, event) {
        if (event.button !== 0) return;

        if (event.shiftKey) {
            this.isDrawingRect = true;
            this.rectStart = { x, y };
            return;
        }

        if (this.currentPolygon.length >= 3) {
            const first = this.currentPolygon[0];
            if (Math.hypot(x - first[0], y - first[1]) < 0.5) {
                this._closePolygon();
                return;
            }
        }

        this.currentPolygon.push([x, y]);
    }

    onMouseUp(x, y, event) {
        if (this.isDrawingRect && this.rectStart) {
            const x1 = Math.min(this.rectStart.x, x);
            const y1 = Math.min(this.rectStart.y, y);
            const x2 = Math.max(this.rectStart.x, x);
            const y2 = Math.max(this.rectStart.y, y);

            if (Math.abs(x2 - x1) > 0.1 && Math.abs(y2 - y1) > 0.1) {
                this.editor.saveUndo();
                const obs = new Obstacle({
                    id: this.editor.editorData.generateId('obs'),
                    vertices: [
                        { x: x1, y: y1 }, { x: x2, y: y1 },
                        { x: x2, y: y2 }, { x: x1, y: y2 }
                    ]
                });
                this.editor.editorData.addObstacle(obs);
        
            }

            this.isDrawingRect = false;
            this.rectStart = null;
        }
    }

    onDblClick(x, y, event) {
        if (this.currentPolygon.length >= 3) {
            this._closePolygon();
        }
    }

    onKeyDown(event) {
        if (event.key === 'Escape') {
            this.currentPolygon = [];
            this.isDrawingRect = false;
            this.rectStart = null;
            event.preventDefault();
        }
    }

    _closePolygon() {
        if (this.currentPolygon.length < 3) return;

        this.editor.saveUndo();

        // Ensure CW winding
        if (polygonAreaArray(this.currentPolygon) > 0) {
            this.currentPolygon.reverse();
        }

        const obs = new Obstacle({
            id: this.editor.editorData.generateId('obs'),
            vertices: this.currentPolygon.map(v => ({ x: v[0], y: v[1] }))
        });

        this.editor.editorData.addObstacle(obs);
        this.currentPolygon = [];

    }

    drawPreview(ctx) {
        if (this.isDrawingRect && this.rectStart) {
            this.editor.renderer.drawRectPreview(
                this.rectStart.x, this.rectStart.y,
                this.editor.mouseWorld.x, this.editor.mouseWorld.y
            );
        }
    }

    getStatusText() {
        if (this.currentPolygon.length === 0) return 'Obstacle: click to add vertices, Shift+drag for rectangle';
        return `Obstacle: ${this.currentPolygon.length} vertices - double-click to close`;
    }

    getCursor() { return 'crosshair'; }
}

// ========================================
// OffMeshTool (L)
// ========================================
export class OffMeshTool extends Tool {
    constructor(editor) {
        super(editor);
        this.name = 'offmesh';
        this.startPoint = null;
    }

    activate() {
        this.startPoint = null;
    }

    deactivate() {
        this.startPoint = null;
    }

    onMouseDown(x, y, event) {
        if (event.button !== 0) return;

        if (!this.startPoint) {
            this.startPoint = [x, y];
        } else {
            this.editor.saveUndo();
            this.editor.editorData.offMeshLinks.push({
                start: this.startPoint,
                end: [x, y],
                bidirectional: !event.shiftKey,
                radius: 0.5
            });
            this.startPoint = null;
        }
    }

    onKeyDown(event) {
        if (event.key === 'Escape') {
            this.startPoint = null;
            event.preventDefault();
        }
    }

    drawPreview(ctx) {
        if (this.startPoint) {
            this.editor.renderer.drawOffMeshPreview(
                this.startPoint,
                [this.editor.mouseWorld.x, this.editor.mouseWorld.y]
            );
        }
    }

    getStatusText() {
        if (!this.startPoint) return 'OffMesh: click start point';
        return 'OffMesh: click end point (Shift for unidirectional)';
    }

    getCursor() { return 'crosshair'; }
}

// ========================================
// Seed Point Tool
// ========================================
export class SeedPointTool extends Tool {
    constructor(editor) {
        super(editor);
        this.name = 'seed';
    }

    onMouseDown(x, y, event) {
        if (event.button !== 0) return;

        // Shift+click: remove nearest seed point
        if (event.shiftKey) {
            const seeds = this.editor.editorData.seedPoints;
            if (seeds.length === 0) return;
            let minDist = Infinity, minIdx = -1;
            for (let i = 0; i < seeds.length; i++) {
                const dx = seeds[i][0] - x;
                const dy = seeds[i][1] - y;
                const d = dx * dx + dy * dy;
                if (d < minDist) { minDist = d; minIdx = i; }
            }
            const threshold = 10 / this.editor.camera.zoom;
            if (Math.sqrt(minDist) < threshold) {
                this.editor.saveUndo();
                seeds.splice(minIdx, 1);
                this.editor.updateInfoBar();
            }
            return;
        }

        this.editor.saveUndo();
        this.editor.editorData.seedPoints.push([x, y]);
        this.editor.updateInfoBar();
    }

    getStatusText() {
        return 'Seed: click to place, Shift+click to remove';
    }

    getCursor() { return 'crosshair'; }
}

// ========================================
// Starting Position Tool
// ========================================
export class StartingPositionTool extends Tool {
    constructor(editor) {
        super(editor);
        this.name = 'startpos';
    }

    onMouseDown(x, y, event) {
        if (event.button !== 0) return;

        // Shift+click: remove starting position
        if (event.shiftKey) {
            if (this.editor.editorData.startingPosition) {
                this.editor.saveUndo();
                this.editor.editorData.startingPosition = null;
                this.editor.updateInfoBar();
            }
            return;
        }

        this.editor.saveUndo();
        this.editor.editorData.startingPosition = [x, y];
        this.editor.updateInfoBar();
    }

    getStatusText() {
        const has = this.editor.editorData.startingPosition ? 'SET' : 'NOT SET';
        return `Starting Position (${has}): click to place, Shift+click to remove`;
    }

    getCursor() { return 'crosshair'; }
}

