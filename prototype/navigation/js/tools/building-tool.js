import { Tool } from './tool.js';
import { Building } from '../models/building.js';

/**
 * BuildingTool - For placing regular polygon buildings
 * Supports snap to edge for aligning building sides with existing edges
 */
export class BuildingTool extends Tool {
    constructor(editor) {
        super(editor);
        this.name = 'building';

        // Building preview state
        this.position = { x: 0, y: 0 };
        this.rotation = 0;
        this.scaleX = 50;
        this.scaleY = 50;
        this.sides = 4;

        // Scale constraint
        this.scaleConstraint = null; // null = uniform, 'x' = only X, 'y' = only Y

        // Edge snap state
        this.edgeSnapInfo = null; // Current edge snap info for preview
        this.alignedEdgeIndex = 0; // Which edge of the building to align (0 = bottom)
    }

    activate() {
        super.activate();
        this.rotation = 0;
        this.scaleX = 50;
        this.scaleY = 50;
        this.sides = 4;
        this.scaleConstraint = null;
        this.edgeSnapInfo = null;
        this.alignedEdgeIndex = 0;
    }

    deactivate() {
        super.deactivate();
        this.edgeSnapInfo = null;
        this.editor.edgeSnapInfo = null;
    }

    onMouseDown(x, y, event) {
        if (event.button === 0) {
            // Left click - place building
            // Use the position calculated in onMouseMove (which handles edge snap)
            const building = new Building({
                position: { ...this.position },
                rotation: this.rotation,
                scaleX: this.scaleX,
                scaleY: this.scaleY,
                sides: this.sides
            });

            this.editor.mapData.addBuilding(building);
            this.editor.selectObject(building);
            this.editor.navmesh = null; // Invalidate navmesh
            this.editor.edgeSnapInfo = null;
            this.edgeSnapInfo = null;
            this.editor.render();
        }
    }

    onMouseMove(x, y, event) {
        const threshold = 15 / this.editor.camera.zoom;

        // First try vertex snap
        if (this.editor.snapEnabled) {
            const snapped = this.editor.mapData.findNearestVertex(x, y, threshold);
            if (snapped) {
                this.position = { ...snapped };
                this.editor.snapPoint = snapped;
                this.editor.edgeSnapInfo = null;
                this.edgeSnapInfo = null;
                this.editor.render();
                return;
            }
        }

        // Then try edge snap - align building edge with target edge
        if (this.editor.snapToEdgeEnabled) {
            const edgeResult = this.editor.mapData.findNearestEdge(x, y, threshold * 2);
            if (edgeResult) {
                this.edgeSnapInfo = edgeResult;
                this.editor.edgeSnapInfo = edgeResult;
                this.editor.snapPoint = null;

                // Calculate the rotation to align the selected building edge with target edge
                const edgeDir = this.normalize({
                    x: edgeResult.edge.p2.x - edgeResult.edge.p1.x,
                    y: edgeResult.edge.p2.y - edgeResult.edge.p1.y
                });
                const edgeAngle = Math.atan2(edgeDir.y, edgeDir.x);

                // For a regular polygon, calculate the angle for the selected edge (alignedEdgeIndex)
                // Each edge is rotated by 2*PI/sides from the previous one
                // Edge 0 midpoint is at angle -PI/2 + PI/sides from center
                const baseEdgeMidAngle = -Math.PI / 2 + Math.PI / this.sides;
                const selectedEdgeOffset = (this.alignedEdgeIndex * 2 * Math.PI) / this.sides;
                const edgeMidAngle = baseEdgeMidAngle + selectedEdgeOffset;

                // Set rotation so that the selected edge aligns with target edge
                this.rotation = edgeAngle - edgeMidAngle - Math.PI / 2;

                // Calculate position: offset from edge point perpendicular to edge
                // The distance depends on which edge is aligned
                // For edge 0 and 2 (top/bottom on a quad), use scaleY
                // For edge 1 and 3 (left/right on a quad), use scaleX
                let distToCenter;
                if (this.sides === 4) {
                    // For rectangles, alternate between scaleY and scaleX
                    distToCenter = (this.alignedEdgeIndex % 2 === 0) ?
                        this.scaleY * Math.cos(Math.PI / this.sides) :
                        this.scaleX * Math.cos(Math.PI / this.sides);
                } else {
                    // For other polygons, use average scale
                    distToCenter = ((this.scaleX + this.scaleY) / 2) * Math.cos(Math.PI / this.sides);
                }

                const perpDir = { x: -edgeDir.y, y: edgeDir.x }; // Perpendicular (into the polygon)

                this.position = {
                    x: edgeResult.point.x + perpDir.x * distToCenter,
                    y: edgeResult.point.y + perpDir.y * distToCenter
                };

                this.editor.render();
                return;
            }
        }

        // Grid snap as fallback
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

    /**
     * Normalize a vector
     */
    normalize(v) {
        const len = Math.sqrt(v.x * v.x + v.y * v.y);
        if (len < 0.001) return { x: 0, y: 0 };
        return { x: v.x / len, y: v.y / len };
    }

    onWheel(x, y, deltaY, event) {
        const scaleFactor = deltaY > 0 ? 0.9 : 1.1;

        if (event.shiftKey) {
            // Shift+wheel - rotate by 5 degrees
            const rotationDelta = deltaY > 0 ? -5 : 5;
            this.rotation += rotationDelta * Math.PI / 180;
            event.preventDefault();
        } else if (event.ctrlKey) {
            // Ctrl+wheel - change rotation (fine)
            const rotationDelta = deltaY > 0 ? -0.1 : 0.1;
            this.rotation += rotationDelta;
            event.preventDefault();
        } else {
            // Wheel - change scale
            if (this.scaleConstraint === 'x') {
                this.scaleX = Math.max(10, this.scaleX * scaleFactor);
            } else if (this.scaleConstraint === 'y') {
                this.scaleY = Math.max(10, this.scaleY * scaleFactor);
            } else {
                // Uniform scale
                this.scaleX = Math.max(10, this.scaleX * scaleFactor);
                this.scaleY = Math.max(10, this.scaleY * scaleFactor);
            }
        }

        this.editor.render();
    }

    onKeyDown(event) {
        const key = event.key.toLowerCase();

        // Toggle scale constraint
        if (key === 'x') {
            this.scaleConstraint = this.scaleConstraint === 'x' ? null : 'x';
            this.editor.render();
            event.preventDefault();
        } else if (key === 'y') {
            this.scaleConstraint = this.scaleConstraint === 'y' ? null : 'y';
            this.editor.render();
            event.preventDefault();
        }

        // Tab - cycle aligned edge for snap-to-edge
        if (event.key === 'Tab') {
            this.alignedEdgeIndex = (this.alignedEdgeIndex + 1) % this.sides;
            this.editor.render();
            event.preventDefault();
        }

        // Change number of sides (3-12)
        // Keys 3-9 map to 3-9 sides
        // Key 0 maps to 10 sides
        // Keys 1, 2 map to 11, 12 sides
        const numKey = parseInt(event.key);
        if (!isNaN(numKey)) {
            const oldSides = this.sides;
            if (numKey >= 3 && numKey <= 9) {
                this.sides = numKey;
            } else if (numKey === 0) {
                this.sides = 10;
            } else if (numKey === 1) {
                this.sides = 11;
            } else if (numKey === 2) {
                this.sides = 12;
            }
            // Reset aligned edge if sides changed and index is now out of range
            if (this.sides !== oldSides && this.alignedEdgeIndex >= this.sides) {
                this.alignedEdgeIndex = 0;
            }
            this.editor.render();
            event.preventDefault();
        }

        // Escape to cancel/reset
        if (event.key === 'Escape') {
            this.rotation = 0;
            this.scaleX = 50;
            this.scaleY = 50;
            this.sides = 4;
            this.scaleConstraint = null;
            this.alignedEdgeIndex = 0;
            this.editor.render();
        }
    }

    drawPreview(ctx) {
        this.editor.renderer.drawBuildingPreview(
            this.position,
            this.rotation,
            this.scaleX,
            this.scaleY,
            this.sides
        );
    }

    getStatusText() {
        let constraint = '';
        if (this.scaleConstraint === 'x') {
            constraint = ' [X constrained]';
        } else if (this.scaleConstraint === 'y') {
            constraint = ' [Y constrained]';
        }

        let snapStatus = '';
        if (this.edgeSnapInfo) {
            snapStatus = ` [Edge ${this.alignedEdgeIndex + 1}/${this.sides} aligned, Tab to cycle]`;
        }

        return `Building: ${this.sides} sides | Scale: ${this.scaleX.toFixed(0)}x${this.scaleY.toFixed(0)} | Rot: ${(this.rotation * 180 / Math.PI).toFixed(0)}°${constraint}${snapStatus} | Wheel: scale | Shift+Wheel: ±5° | Ctrl+Wheel: fine`;
    }

    getCursor() {
        return 'crosshair';
    }
}
