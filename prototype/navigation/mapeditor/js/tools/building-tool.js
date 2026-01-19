import { Tool } from './tool.js';
import { Building } from '../models/building.js';
import { GeometryFactory } from '../factories/geometry-factory.js'; // Assicurati che il percorso sia corretto

/**
 * BuildingTool - Posiziona edifici con geometria esplicita.
 * Supporta n-gon regolari (3-12 lati) e template predefiniti.
 */
export class BuildingTool extends Tool {
    constructor(editor) {
        super(editor);
        this.name = 'building';

        // Stato dell'anteprima
        this.position = { x: 0, y: 0 };
        this.rotation = 0;
        this.scaleX = 50;
        this.scaleY = 50;

        // n-gon state
        this.sides = 4;
        this.currentTemplateId = 'ngon'; // 'ngon' o id specifico come 'TOWER'

        this.scaleConstraint = null;
        this.edgeSnapInfo = null;
        this.alignedEdgeIndex = 0;
    }

    activate() {
        super.activate();
        this.resetState();
    }

    resetState() {
        this.rotation = 0;
        this.scaleX = 50;
        this.scaleY = 50;
        this.sides = 4;
        this.currentTemplateId = 'ngon';
        this.scaleConstraint = null;
        this.edgeSnapInfo = null;
        this.alignedEdgeIndex = 0;
    }

    onMouseDown(x, y, event) {
        if (event.button === 0) {
            // Salvataggio per Undo
            if (this.editor.history) this.editor.history.save();

            // Determiniamo il templateId
            const templateId = this.currentTemplateId === 'ngon'
                ? `ngon_${this.sides}`
                : this.currentTemplateId;

            // Creiamo l'edificio passandogli TUTTI i parametri di trasformazione
            const building = new Building({
                id: this.editor.mapData.generateId('bldg'),
                templateId: templateId,
                // Parametri fondamentali per il reset della base
                position: { ...this.position },
                rotation: this.rotation,
                scaleX: this.scaleX,
                scaleY: this.scaleY,
                // Nota: non passiamo 'vertices' perché il costruttore 
                // chiamerà automaticamente regenerateBase()
            });

            this.editor.mapData.addBuilding(building);
            this.editor.selectObject(building);

            // Reset stato snap
            this.edgeSnapInfo = null;
            this.editor.edgeSnapInfo = null;
            this.editor.render();
        }
    }

    onMouseMove(x, y, event) {
        const threshold = 15 / this.editor.camera.zoom;

        // 1. Vertex Snap
        if (this.editor.snapEnabled) {
            const snapped = this.editor.mapData.findNearestVertex(x, y, threshold);
            if (snapped) {
                this.position = { ...snapped.point }; // snapped ora restituisce l'oggetto con .point
                this.editor.snapPoint = snapped.point;
                this.editor.render();
                return;
            }
        }

        // 2. Edge Snap (Allineamento basato sulla geometria n-gon)
        if (this.editor.snapToEdgeEnabled) {
            const edgeResult = this.editor.mapData.findNearestEdge(x, y, threshold * 2);
            if (edgeResult) {
                this.edgeSnapInfo = edgeResult;
                this.editor.edgeSnapInfo = edgeResult;
                this.editor.snapPoint = null;

                const edgeDir = this.normalize({
                    x: edgeResult.edge.p2.x - edgeResult.edge.p1.x,
                    y: edgeResult.edge.p2.y - edgeResult.edge.p1.y
                });
                const edgeAngle = Math.atan2(edgeDir.y, edgeDir.x);

                // La logica degli n-gon regolari per l'allineamento rimane valida
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

                this.editor.render();
                return;
            }
        }

        // 3. Grid Snap
        if (this.editor.gridSnapEnabled) {
            const gridSize = this.editor.gridSize;
            this.position = {
                x: Math.round(x / gridSize) * gridSize,
                y: Math.round(y / gridSize) * gridSize
            };
        } else {
            this.position = { x, y };
        }

        this.editor.snapPoint = null;
        this.editor.edgeSnapInfo = null;
        this.edgeSnapInfo = null;
        this.editor.render();
    }

    onWheel(x, y, deltaY, event) {
        const scaleFactor = deltaY > 0 ? 0.9 : 1.1;

        if (event.shiftKey) {
            this.rotation += (deltaY > 0 ? -15 : 15) * Math.PI / 180;
        } else if (event.ctrlKey) {
            this.rotation += (deltaY > 0 ? -1 : 1) * Math.PI / 180;
        } else {
            if (this.scaleConstraint === 'x') {
                this.scaleX = Math.max(10, this.scaleX * scaleFactor);
            } else if (this.scaleConstraint === 'y') {
                this.scaleY = Math.max(10, this.scaleY * scaleFactor);
            } else {
                this.scaleX = Math.max(10, this.scaleX * scaleFactor);
                this.scaleY = Math.max(10, this.scaleY * scaleFactor);
            }
        }
        this.editor.render();
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

        // Tasti 3-9, 0, 1, 2 per i lati (n-gon mode)
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

        // Tasto 'T' per simulare il cambio template (esempio)
        if (key === 't') {
            this.currentTemplateId = 'RECT_LONG';
            this.sides = 4; // I lati del template per lo snap
            event.preventDefault();
        }

        if (event.key === 'Escape') this.resetState();

        this.editor.render();
    }

    drawPreview(ctx) {
        const localVertices = (this.currentTemplateId === 'ngon')
            ? GeometryFactory.createNGon(this.sides)
            : GeometryFactory.getTemplate(this.currentTemplateId);

        // Passiamo i parametri al renderer che simulerà la proiezione
        this.editor.renderer.drawBuildingPreview(
            this.position,
            this.rotation,
            this.scaleX,
            this.scaleY,
            localVertices
        );

        // Feedback visivo sugli assi di scala
        this.editor.renderer.drawLocalAxes(
            this.position,
            this.rotation,
            this.scaleX,
            this.scaleY,
            this.scaleConstraint
        );
    }

    normalize(v) {
        const len = Math.sqrt(v.x * v.x + v.y * v.y);
        return len < 0.001 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
    }
}