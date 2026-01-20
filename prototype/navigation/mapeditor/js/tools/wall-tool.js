import { Tool } from './tool.js';
import { Wall } from '../models/wall.js';

/**
 * WallTool - For drawing walls (polylines with thickness)
 * Supports snap to edge for proper wall connections
 */
export class WallTool extends Tool {
    constructor(editor) {
        super(editor);
        this.name = 'wall';

        // Wall drawing state
        this.points = [];
        this.previewPoint = null;
        this.thickness = 30;
        this.maxSegmentLength = 50;

        // Snap info for start and end points
        this.startSnapInfo = null;
        this.endSnapInfo = null;
        this.currentSnapInfo = null; // For preview
    }

    activate() {
        super.activate();
        this.points = [];
        this.previewPoint = null;
        this.thickness = 30;
        this.maxSegmentLength = 50;
        this.startSnapInfo = null;
        this.endSnapInfo = null;
        this.currentSnapInfo = null;
    }

    deactivate() {
        super.deactivate();
        this.points = [];
        this.previewPoint = null;
        this.startSnapInfo = null;
        this.endSnapInfo = null;
        this.currentSnapInfo = null;
        this.editor.edgeSnapInfo = null;
    }

    onMouseDown(x, y, event) {
        if (event.button === 0) {
            // Left click - add point
            const snapResult = this.getSnappedPoint(x, y);

            const point = snapResult.point;

            // If this is the first point, store start snap info
            if (this.points.length === 0) {
                if (snapResult.vertexSnap) {
                    // Snap to vertex - store vertex info for connection to vertex
                    this.startSnapInfo = {
                        type: snapResult.vertexSnap.type,
                        targetId: snapResult.vertexSnap.targetId,
                        vertexIndex: snapResult.vertexSnap.vertexIndex,
                        targetVertexId: snapResult.vertexSnap.point.id,
                        vertex: { ...snapResult.vertexSnap.point },
                        snapType: 'vertex'
                    };
                    // If snapping to wall endpoint, also store endpoint info
                    if (snapResult.vertexSnap.isEndpoint) {
                        this.startSnapInfo.endpointType = snapResult.vertexSnap.endpointType;
                    }
                } else if (snapResult.edgeSnap) {
                    // Snap to edge
                    this.startSnapInfo = {
                        type: snapResult.edgeSnap.type,
                        targetId: snapResult.edgeSnap.targetId,
                        edge: {
                            p1: { ...snapResult.edgeSnap.edge.p1 },
                            p2: { ...snapResult.edgeSnap.edge.p2 }
                        },
                        edgeIndex: snapResult.edgeSnap.edgeIndex,
                        targetEdgeId: snapResult.edgeSnap.targetEdgeId,
                        snapType: 'edge'
                    };
                } else {
                    this.startSnapInfo = null;
                }
            }

            this.points.push({ ...point });

            // Store current snap info as potential end snap (will be overwritten if more points added)
            if (snapResult.vertexSnap) {
                this.endSnapInfo = {
                    type: snapResult.vertexSnap.type,
                    targetId: snapResult.vertexSnap.targetId,
                    vertexIndex: snapResult.vertexSnap.vertexIndex,
                    targetVertexId: snapResult.vertexSnap.point.id,
                    vertex: { ...snapResult.vertexSnap.point },
                    snapType: 'vertex'
                };
                if (snapResult.vertexSnap.isEndpoint) {
                    this.endSnapInfo.endpointType = snapResult.vertexSnap.endpointType;
                }
            } else if (snapResult.edgeSnap) {
                this.endSnapInfo = {
                    type: snapResult.edgeSnap.type,
                    targetId: snapResult.edgeSnap.targetId,
                    edge: {
                        p1: { ...snapResult.edgeSnap.edge.p1 },
                        p2: { ...snapResult.edgeSnap.edge.p2 }
                    },
                    edgeIndex: snapResult.edgeSnap.edgeIndex,
                    targetEdgeId: snapResult.edgeSnap.targetEdgeId,
                    snapType: 'edge'
                };
            } else {
                this.endSnapInfo = null;
            }

            this.editor.render();

        } else if (event.button === 2) {
            // Right click - complete wall
            this.completeWall();
        }
    }

    onMouseMove(x, y, event) {
        const snapResult = this.getSnappedPoint(x, y);
        this.previewPoint = snapResult.point;
        this.currentSnapInfo = snapResult.vertexSnap || snapResult.edgeSnap;

        // Update snap indicators
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

        this.editor.render();
    }

    /**
     * Get snapped point considering both vertex and edge snap
     * Vertex snap has priority over edge snap
     */
    getSnappedPoint(x, y) {
        const threshold = 15 / this.editor.camera.zoom;
        let point = { x, y };
        let vertexSnap = null;
        let edgeSnap = null;

        // First try vertex snap with full info
        if (this.editor.snapEnabled) {
            const snapped = this.editor.mapData.findNearestVertex(x, y, threshold);
            if (snapped) {
                //console.log(snapped);
                point = { ...snapped.point };
                vertexSnap = snapped;
            }
        }

        // If no vertex snap, try edge snap
        if (!vertexSnap && this.editor.snapToEdgeEnabled) {
            const edgeResult = this.editor.mapData.findNearestEdge(x, y, threshold);

            if (edgeResult) {
                point = { ...edgeResult.point };
                edgeSnap = edgeResult;

            }
        }

        // Finally try grid snap if no other snap
        if (!vertexSnap && !edgeSnap && this.editor.gridSnapEnabled) {
            const gridSize = this.editor.gridSize;
            point = {
                x: Math.round(x / gridSize) * gridSize,
                y: Math.round(y / gridSize) * gridSize
            };
        }

        return { point, vertexSnap, edgeSnap };
    }

    onWheel(x, y, deltaY, event) {
        if (event.ctrlKey) {
            // Ctrl+wheel - change max segment length
            const delta = deltaY > 0 ? -5 : 5;
            this.maxSegmentLength = Math.max(10, Math.min(200, this.maxSegmentLength + delta));
            event.preventDefault();
        } else {
            // Wheel - change thickness
            const delta = deltaY > 0 ? -2 : 2;
            this.thickness = Math.max(2, Math.min(100, this.thickness + delta));
        }

        this.editor.render();
    }

    onKeyDown(event) {
        if (event.key === 'Enter') {
            this.completeWall();
            event.preventDefault();
        } else if (event.key === 'Escape') {
            this.cancelDrawing();
            event.preventDefault();
        } else if (event.key === 'Backspace' || event.key === 'Delete') {
            // Remove last point
            if (this.points.length > 0) {
                this.points.pop();
                // If we removed the first point, clear start snap
                if (this.points.length === 0) {
                    this.startSnapInfo = null;
                }
                // Clear end snap since we removed a point
                this.endSnapInfo = null;
                this.editor.render();
            }
            event.preventDefault();
        }
    }

    completeWall() {
        if (this.points.length >= 2) {
            // 1. Snapshot per l'Undo
            if (this.editor.history) {
                this.editor.history.save();
            }

            // 1. Generiamo punti con ID persistenti
            const pointsWithIds = this.points.map((p, index) => ({
                id: `p_${Date.now()}_${index}`, // ID unico universale
                x: p.x,
                y: p.y
            }));

            // 2. Creazione del muro semplificato (senza logica di snap interna)
            const wall = new Wall({
                id: this.editor.mapData.generateId('wall'),
                points: pointsWithIds,
                thickness: this.thickness,
                maxSegmentLength: this.maxSegmentLength
            });

            // 3. Aggiunta alla mappa
            this.editor.mapData.addWall(wall);

            console.log("muro completato con le seguenti info di snap", this.startSnapInfo, this.endSnapInfo);

            if (this.startSnapInfo) {
                this.registerConnection(wall.id, 'start', this.startSnapInfo);
            }

            // L'ultimo punto cliccato è memorizzato in endSnapInfo
            if (this.endSnapInfo) {
                this.registerConnection(wall.id, 'end', this.endSnapInfo);
            }

            // 5. Risoluzione geometrica globale
            // Questo sposterà i vertici del muro e degli edifici e genererà le unità distruttibili
            this.editor.mapData.updateAllGeometry();

            this.editor.selectObject(wall);
            this.resetToolState();
            this.editor.render();
        }
    }

    resetToolState() {
        this.points = [];
        this.previewPoint = null;
        this.startSnapInfo = null;
        this.endSnapInfo = null;
        this.currentSnapInfo = null;
        this.editor.snapPoint = null;
        this.editor.edgeSnapInfo = null;
    }

    /**
     * Converte le informazioni di snap del Tool in una connessione formale nel Manager
     */
    registerConnection(wallId, wallEnd, snapInfo) {

        console.log(wallId, wallEnd, snapInfo);

        const connManager = this.editor.mapData.connectionManager;
        let type = '';

        // Mappatura dei casi che abbiamo discusso
        if (snapInfo.snapType === 'vertex') {
            if (snapInfo.type === 'building') {
                type = 'WALL_TO_BUILDING_VERTEX'; // Caso 2
            } else if (snapInfo.type === 'wall' && snapInfo.isEndpoint) {
                type = 'WALL_TO_WALL_END'; // Caso 4
            }
        } else if (snapInfo.snapType === 'edge') {
            if (snapInfo.type === 'building') {
                type = 'WALL_TO_BUILDING_EDGE'; // Caso 1
            } else if (snapInfo.type === 'wall') {
                type = 'WALL_TO_WALL_EDGE'; // Caso 3
            }
        }


        if (type) {
            connManager.add({
                type: type,
                wallId: wallId,
                wallEnd: wallEnd,
                targetId: snapInfo.targetId,
                // Dati extra a seconda del tipo
                targetVertexIndex: snapInfo.vertexIndex,
                targetVertexId: snapInfo.targetVertexId,
                targetEdge: snapInfo.edge,
                targetEdgeIndex: snapInfo.edgeIndex,
                targetEdgeId: snapInfo.targetEdgeId
            });
        }
    }

    cancelDrawing() {
        this.points = [];
        this.previewPoint = null;
        this.startSnapInfo = null;
        this.endSnapInfo = null;
        this.currentSnapInfo = null;
        this.editor.snapPoint = null;
        this.editor.edgeSnapInfo = null;
        this.editor.render();
    }

    drawPreview(ctx) {
        const allPoints = [...this.points];
        if (this.previewPoint && this.points.length > 0) {
            allPoints.push(this.previewPoint);
        } else if (this.previewPoint && this.points.length === 0) {
            // Just show a single point preview
            allPoints.push(this.previewPoint);
        }

        if (allPoints.length > 0) {
            this.editor.renderer.drawWallPreview(
                allPoints,
                this.thickness,
                this.maxSegmentLength
            );
        }

        // Draw snap indicators at start and current position
        this.drawSnapMarkers(ctx);
    }

    /**
     * Draw markers showing where snaps are active
     */
    drawSnapMarkers(ctx) {
        const zoom = this.editor.camera.zoom;
        const snap = this.currentSnapInfo;
        if (!snap || !this.previewPoint) return;

        ctx.save();
        ctx.lineWidth = 2 / zoom;
        ctx.strokeStyle = snap.vertexIndex !== undefined ? '#00ff00' : '#00ffff';

        ctx.beginPath();
        if (snap.vertexIndex !== undefined) {
            // Cerchio per i vertici
            ctx.arc(this.previewPoint.x, this.previewPoint.y, 8 / zoom, 0, Math.PI * 2);
        } else {
            // Rombo/Quadrato per gli edge
            const s = 6 / zoom;
            ctx.rect(this.previewPoint.x - s, this.previewPoint.y - s, s * 2, s * 2);
        }
        ctx.stroke();
        ctx.restore();
    }

    getStatusText() {
        let snapStatus = '';
        if (this.editor.snapToEdgeEnabled) {
            snapStatus = ' | Edge snap ON';
        }

        if (this.points.length === 0) {
            return `Wall: Thickness ${this.thickness}px | Segment ${this.maxSegmentLength}px | Click to start${snapStatus}`;
        }

        let startInfo = this.startSnapInfo ? ' [Start snapped]' : '';
        let endInfo = this.currentSnapInfo ? ' [End snapping]' : '';

        return `Wall: ${this.points.length} points${startInfo}${endInfo} | Thickness ${this.thickness}px | Right-click/Enter to complete${snapStatus}`;
    }

    getCursor() {
        return 'crosshair';
    }
}
