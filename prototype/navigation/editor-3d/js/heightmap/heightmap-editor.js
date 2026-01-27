/**
 * Heightmap canvas editor
 * Provides 2D painting interface for heightmap editing
 */
import { HeightmapData } from './heightmap-data.js';
import { HeightmapTools, BrushSettings, ToolType } from './heightmap-tools.js';

export class HeightmapEditor {
    constructor(canvas, mapSettings) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.mapSettings = mapSettings;

        // Initialize heightmap data
        this.heightmap = new HeightmapData(
            mapSettings.heightmapResolution,
            mapSettings.heightmapResolution
        );

        // Brush settings
        this.brush = new BrushSettings();

        // View settings
        this.showGrid = true;
        this.gridSize = 64; // Grid in world units
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;

        // Interaction state
        this._isPainting = false;
        this._isPanning = false;
        this._lastPanX = 0;
        this._lastPanY = 0;
        this._lastBrushX = -1;
        this._lastBrushY = -1;

        // Off-screen buffer for heightmap visualization
        this._buffer = document.createElement('canvas');
        this._bufferCtx = this._buffer.getContext('2d');
        this._bufferDirty = true;

        // Listeners
        this._listeners = new Set();

        // Listen to heightmap changes
        this.heightmap.addListener(() => {
            this._bufferDirty = true;
            this.render();
        });

        // Listen to settings changes
        mapSettings.addListener(() => {
            this._updateForSettings();
        });

        this._setupEventListeners();
        this._updateForSettings();
    }

    _updateForSettings() {
        // Resize heightmap if resolution changed
        if (this.heightmap.width !== this.mapSettings.heightmapResolution) {
            this.heightmap.resize(
                this.mapSettings.heightmapResolution,
                this.mapSettings.heightmapResolution
            );
        }
        this._bufferDirty = true;
        this.render();
    }

    _setupEventListeners() {
        this.canvas.addEventListener('mousedown', this._onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this._onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this._onMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this._onMouseLeave.bind(this));
        this.canvas.addEventListener('wheel', this._onWheel.bind(this));
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    /**
     * Convert canvas coordinates to heightmap pixel coordinates
     */
    _canvasToHeightmap(canvasX, canvasY) {
        // Get canvas dimensions
        const rect = this.canvas.getBoundingClientRect();

        // Normalize to 0-1 range considering zoom and pan
        const viewWidth = this.canvas.width / this.zoom;
        const viewHeight = this.canvas.height / this.zoom;

        const worldX = (canvasX - this.canvas.width / 2) / this.zoom - this.panX + this.mapSettings.width / 2;
        const worldY = (canvasY - this.canvas.height / 2) / this.zoom - this.panY + this.mapSettings.height / 2;

        // Convert to heightmap coordinates
        const hmX = (worldX / this.mapSettings.width) * this.heightmap.width;
        const hmY = (worldY / this.mapSettings.height) * this.heightmap.height;

        return { x: hmX, y: hmY };
    }

    /**
     * Convert heightmap coordinates to canvas coordinates
     */
    _heightmapToCanvas(hmX, hmY) {
        const worldX = (hmX / this.heightmap.width) * this.mapSettings.width;
        const worldY = (hmY / this.heightmap.height) * this.mapSettings.height;

        const canvasX = (worldX - this.mapSettings.width / 2 + this.panX) * this.zoom + this.canvas.width / 2;
        const canvasY = (worldY - this.mapSettings.height / 2 + this.panY) * this.zoom + this.canvas.height / 2;

        return { x: canvasX, y: canvasY };
    }

    _onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            // Middle mouse or Alt+left = pan
            this._isPanning = true;
            this._lastPanX = x;
            this._lastPanY = y;
            this.canvas.style.cursor = 'grabbing';
        } else if (e.button === 0) {
            // Left mouse = paint
            this._isPainting = true;
            this._applyBrushAt(x, y);
        }
    }

    _onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (this._isPanning) {
            const dx = x - this._lastPanX;
            const dy = y - this._lastPanY;
            this.panX += dx / this.zoom;
            this.panY += dy / this.zoom;
            this._lastPanX = x;
            this._lastPanY = y;
            this.render();
        } else if (this._isPainting) {
            this._applyBrushAt(x, y);
        } else {
            // Just update cursor position for preview
            this._cursorX = x;
            this._cursorY = y;
            this.render();
        }
    }

    _onMouseUp(e) {
        if (this._isPanning) {
            this._isPanning = false;
            this.canvas.style.cursor = 'crosshair';
        }
        if (this._isPainting) {
            this._isPainting = false;
            this._lastBrushX = -1;
            this._lastBrushY = -1;
            this._notifyListeners('paintEnd');
        }
    }

    _onMouseLeave(e) {
        this._isPainting = false;
        this._isPanning = false;
        this._cursorX = -1;
        this._cursorY = -1;
        this.render();
    }

    _onWheel(e) {
        e.preventDefault();

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Zoom around mouse position
        const oldZoom = this.zoom;
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        this.zoom = Math.max(0.1, Math.min(10, this.zoom * zoomFactor));

        // Adjust pan to zoom around cursor
        const zoomDelta = this.zoom - oldZoom;
        this.panX -= (x - this.canvas.width / 2) * zoomDelta / (this.zoom * oldZoom);
        this.panY -= (y - this.canvas.height / 2) * zoomDelta / (this.zoom * oldZoom);

        this.render();
    }

    _applyBrushAt(canvasX, canvasY) {
        const hmCoords = this._canvasToHeightmap(canvasX, canvasY);

        // Calculate brush radius in heightmap coordinates
        const worldBrushRadius = this.brush.radius;
        const hmBrushRadius = (worldBrushRadius / this.mapSettings.width) * this.heightmap.width;

        // Create a temporary brush with adjusted radius
        const adjustedBrush = this.brush.clone();
        adjustedBrush.radius = hmBrushRadius;

        // Apply with interpolation for smooth strokes
        if (this._lastBrushX >= 0) {
            const dist = Math.sqrt(
                (hmCoords.x - this._lastBrushX) ** 2 +
                (hmCoords.y - this._lastBrushY) ** 2
            );

            const steps = Math.max(1, Math.ceil(dist / (hmBrushRadius * 0.5)));
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const bx = this._lastBrushX + (hmCoords.x - this._lastBrushX) * t;
                const by = this._lastBrushY + (hmCoords.y - this._lastBrushY) * t;
                HeightmapTools.applyBrush(this.heightmap, bx, by, adjustedBrush);
            }
        } else {
            HeightmapTools.applyBrush(this.heightmap, hmCoords.x, hmCoords.y, adjustedBrush);
        }

        this._lastBrushX = hmCoords.x;
        this._lastBrushY = hmCoords.y;
    }

    /**
     * Update the off-screen buffer with heightmap visualization
     */
    _updateBuffer() {
        if (!this._bufferDirty) return;

        this._buffer.width = this.heightmap.width;
        this._buffer.height = this.heightmap.height;

        const imageData = this._bufferCtx.createImageData(this.heightmap.width, this.heightmap.height);

        for (let i = 0; i < this.heightmap.data.length; i++) {
            const h = this.heightmap.data[i];
            // Grayscale visualization
            const value = Math.round(h * 255);
            const idx = i * 4;
            imageData.data[idx] = value;
            imageData.data[idx + 1] = value;
            imageData.data[idx + 2] = value;
            imageData.data[idx + 3] = 255;
        }

        this._bufferCtx.putImageData(imageData, 0, 0);
        this._bufferDirty = false;
    }

    /**
     * Render the editor
     */
    render() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Clear canvas
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, width, height);

        // Save transform
        ctx.save();

        // Apply view transform
        ctx.translate(width / 2, height / 2);
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(this.panX, this.panY);
        ctx.translate(-this.mapSettings.width / 2, -this.mapSettings.height / 2);

        // Draw heightmap
        this._updateBuffer();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this._buffer, 0, 0, this.mapSettings.width, this.mapSettings.height);

        // Draw grid
        if (this.showGrid) {
            this._drawGrid(ctx);
        }

        // Draw map boundary
        ctx.strokeStyle = '#ff0';
        ctx.lineWidth = 2 / this.zoom;
        ctx.strokeRect(0, 0, this.mapSettings.width, this.mapSettings.height);

        ctx.restore();

        // Draw brush cursor
        if (this._cursorX >= 0 && !this._isPanning) {
            this._drawBrushCursor(ctx, this._cursorX, this._cursorY);
        }

        // Draw info overlay
        this._drawInfoOverlay(ctx);
    }

    _drawGrid(ctx) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1 / this.zoom;

        const gridStep = this.gridSize;

        // Vertical lines
        for (let x = 0; x <= this.mapSettings.width; x += gridStep) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.mapSettings.height);
            ctx.stroke();
        }

        // Horizontal lines
        for (let y = 0; y <= this.mapSettings.height; y += gridStep) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.mapSettings.width, y);
            ctx.stroke();
        }
    }

    _drawBrushCursor(ctx, x, y) {
        ctx.save();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        // Draw circle at brush radius in screen space
        const radius = this.brush.radius * this.zoom;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Draw center point
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    _drawInfoOverlay(ctx) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(10, 10, 180, 80);

        ctx.fillStyle = '#fff';
        ctx.font = '12px monospace';
        ctx.fillText(`Map: ${this.mapSettings.width}x${this.mapSettings.height}m`, 20, 30);
        ctx.fillText(`Heightmap: ${this.heightmap.width}x${this.heightmap.height}`, 20, 45);
        ctx.fillText(`Tool: ${this.brush.tool}`, 20, 60);
        ctx.fillText(`Brush: R=${this.brush.radius} S=${this.brush.strength.toFixed(2)}`, 20, 75);
        ctx.restore();
    }

    /**
     * Set the current tool
     */
    setTool(toolType) {
        this.brush.tool = toolType;
        this.render();
    }

    /**
     * Fit view to map
     */
    fitToView() {
        const padding = 20;
        const scaleX = (this.canvas.width - padding * 2) / this.mapSettings.width;
        const scaleY = (this.canvas.height - padding * 2) / this.mapSettings.height;
        this.zoom = Math.min(scaleX, scaleY);
        this.panX = 0;
        this.panY = 0;
        this.render();
    }

    /**
     * Resize canvas to fit container
     */
    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.render();
    }

    /**
     * Export heightmap as PNG
     */
    exportPNG() {
        return this.heightmap.toPNG();
    }

    /**
     * Import heightmap from image file
     */
    importImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    this.heightmap.fromImage(img);
                    this._bufferDirty = true;
                    this.render();
                    resolve();
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Generate procedural terrain
     */
    generateTerrain(options = {}) {
        HeightmapTools.generateTerrain(this.heightmap, options);
        this._bufferDirty = true;
        this.render();
    }

    /**
     * Clear heightmap
     */
    clear() {
        this.heightmap.clear();
        this._bufferDirty = true;
        this.render();
    }

    addListener(callback) {
        this._listeners.add(callback);
    }

    removeListener(callback) {
        this._listeners.delete(callback);
    }

    _notifyListeners(event, data) {
        for (const listener of this._listeners) {
            listener(event, data);
        }
    }
}

export { ToolType };
