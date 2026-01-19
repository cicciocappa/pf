/**
 * Tool - Abstract base class for editor tools
 */
export class Tool {
    constructor(editor) {
        this.editor = editor;
        this.name = 'tool';
        this.isActive = false;
        this.snapOptions = {
            excludeOuter: true // Di base escludiamo il perimetro per tutti
        };
    }

    /**
     * Called when tool is activated
     */
    activate() {
        this.isActive = true;
    }

    /**
     * Called when tool is deactivated
     */
    deactivate() {
        this.isActive = false;
    }

    /**
     * Handle mouse down event
     * @param {number} x - World X coordinate
     * @param {number} y - World Y coordinate
     * @param {MouseEvent} event - Original event
     */
    onMouseDown(x, y, event) { }

    /**
     * Handle mouse move event
     * @param {number} x - World X coordinate
     * @param {number} y - World Y coordinate
     * @param {MouseEvent} event - Original event
     */
    onMouseMove(x, y, event) { }

    /**
     * Handle mouse up event
     * @param {number} x - World X coordinate
     * @param {number} y - World Y coordinate
     * @param {MouseEvent} event - Original event
     */
    onMouseUp(x, y, event) { }

    /**
     * Handle double click event
     * @param {number} x - World X coordinate
     * @param {number} y - World Y coordinate
     * @param {MouseEvent} event - Original event
     */
    onDoubleClick(x, y, event) { }

    /**
     * Handle wheel event
     * @param {number} x - World X coordinate
     * @param {number} y - World Y coordinate
     * @param {number} deltaY - Wheel delta
     * @param {WheelEvent} event - Original event
     */
    onWheel(x, y, deltaY, event) { }

    /**
     * Handle key down event
     * @param {KeyboardEvent} event
     */
    onKeyDown(event) { }

    /**
     * Handle key up event
     * @param {KeyboardEvent} event
     */
    onKeyUp(event) { }

    /**
     * Draw tool preview/ghost on canvas
     * @param {CanvasRenderingContext2D} ctx
     */
    drawPreview(ctx) { }

    /**
     * Get status text for status bar
     * @returns {string}
     */
    getStatusText() {
        return '';
    }

    /**
     * Get cursor style for this tool
     * @returns {string}
     */
    getCursor() {
        return 'crosshair';
    }

    /**
     * Apply snap if enabled (priority: vertex > edge > grid)
     * @param {number} x
     * @param {number} y
     * @returns {{x: number, y: number}}
     */
    applySnap(x, y) {
        // Vertex snap
        if (this.editor.snapEnabled) {
            const snapped = this.editor.mapData.findNearestVertex(
                x, y,
                15 / this.editor.camera.zoom,
                this.snapOptions // Passiamo le opzioni di esclusione
            );
            if (snapped) return snapped;
        }

        // Edge snap
        if (this.editor.snapToEdgeEnabled) {
            const edgeSnap = this.editor.mapData.findNearestEdge(
                x, y,
                15 / this.editor.camera.zoom,
                this.snapOptions // Passiamo le opzioni qui
            );
            if (edgeSnap) return edgeSnap.point;
        }

        // Grid snap (rimane invariato)
        if (this.editor.gridSnapEnabled) {
            const gridSize = this.editor.gridSize;
            return {
                x: Math.round(x / gridSize) * gridSize,
                y: Math.round(y / gridSize) * gridSize
            };
        }

        return { x, y };
    }
}
