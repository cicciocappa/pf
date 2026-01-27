/**
 * Heightmap data model
 * Stores height values as Float32Array (0-1 range)
 */
export class HeightmapData {
    constructor(width = 128, height = 128) {
        this.width = width;
        this.height = height;
        this.data = new Float32Array(width * height);
        this._listeners = new Set();
    }

    /**
     * Get height at integer coordinates
     */
    getHeight(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return 0;
        }
        return this.data[y * this.width + x];
    }

    /**
     * Set height at integer coordinates
     */
    setHeight(x, y, value) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return;
        }
        this.data[y * this.width + x] = Math.max(0, Math.min(1, value));
    }

    /**
     * Sample height with bilinear interpolation
     * @param {number} u - Normalized X coordinate (0-1)
     * @param {number} v - Normalized Y coordinate (0-1)
     * @returns {number} Interpolated height (0-1)
     */
    sampleBilinear(u, v) {
        // Convert to pixel coordinates
        const px = u * (this.width - 1);
        const py = v * (this.height - 1);

        // Get integer coordinates
        const x0 = Math.floor(px);
        const y0 = Math.floor(py);
        const x1 = Math.min(x0 + 1, this.width - 1);
        const y1 = Math.min(y0 + 1, this.height - 1);

        // Fractional parts
        const fx = px - x0;
        const fy = py - y0;

        // Get four corner heights
        const h00 = this.getHeight(x0, y0);
        const h10 = this.getHeight(x1, y0);
        const h01 = this.getHeight(x0, y1);
        const h11 = this.getHeight(x1, y1);

        // Bilinear interpolation
        const h0 = h00 * (1 - fx) + h10 * fx;
        const h1 = h01 * (1 - fx) + h11 * fx;
        return h0 * (1 - fy) + h1 * fy;
    }

    /**
     * Sample height from world coordinates
     * @param {number} worldX - World X coordinate
     * @param {number} worldZ - World Z coordinate
     * @param {number} mapWidth - Map width in world units
     * @param {number} mapHeight - Map height in world units
     * @returns {number} Height (0-1)
     */
    sampleWorld(worldX, worldZ, mapWidth, mapHeight) {
        const u = worldX / mapWidth;
        const v = worldZ / mapHeight;
        return this.sampleBilinear(
            Math.max(0, Math.min(1, u)),
            Math.max(0, Math.min(1, v))
        );
    }

    /**
     * Clear all height data
     */
    clear() {
        this.data.fill(0);
        this._notifyListeners('clear');
    }

    /**
     * Fill with a constant value
     */
    fill(value) {
        this.data.fill(Math.max(0, Math.min(1, value)));
        this._notifyListeners('fill');
    }

    /**
     * Resize the heightmap
     */
    resize(newWidth, newHeight) {
        if (newWidth === this.width && newHeight === this.height) {
            return;
        }

        const oldData = this.data;
        const oldWidth = this.width;
        const oldHeight = this.height;

        // Create new data array
        this.width = newWidth;
        this.height = newHeight;
        this.data = new Float32Array(newWidth * newHeight);

        // Resample old data using bilinear interpolation
        for (let y = 0; y < newHeight; y++) {
            for (let x = 0; x < newWidth; x++) {
                const u = x / (newWidth - 1);
                const v = y / (newHeight - 1);

                // Sample from old data
                const oldX = u * (oldWidth - 1);
                const oldY = v * (oldHeight - 1);

                const x0 = Math.floor(oldX);
                const y0 = Math.floor(oldY);
                const x1 = Math.min(x0 + 1, oldWidth - 1);
                const y1 = Math.min(y0 + 1, oldHeight - 1);

                const fx = oldX - x0;
                const fy = oldY - y0;

                const h00 = oldData[y0 * oldWidth + x0];
                const h10 = oldData[y0 * oldWidth + x1];
                const h01 = oldData[y1 * oldWidth + x0];
                const h11 = oldData[y1 * oldWidth + x1];

                const h0 = h00 * (1 - fx) + h10 * fx;
                const h1 = h01 * (1 - fx) + h11 * fx;
                this.data[y * newWidth + x] = h0 * (1 - fy) + h1 * fy;
            }
        }

        this._notifyListeners('resize');
    }

    /**
     * Add listener for data changes
     */
    addListener(callback) {
        this._listeners.add(callback);
    }

    removeListener(callback) {
        this._listeners.delete(callback);
    }

    _notifyListeners(type, region = null) {
        for (const listener of this._listeners) {
            listener(type, region);
        }
    }

    /**
     * Notify that a region has changed
     */
    notifyRegionChanged(x, y, width, height) {
        this._notifyListeners('region', { x, y, width, height });
    }

    /**
     * Export to PNG data URL
     */
    toPNG() {
        const canvas = document.createElement('canvas');
        canvas.width = this.width;
        canvas.height = this.height;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(this.width, this.height);

        for (let i = 0; i < this.data.length; i++) {
            const value = Math.round(this.data[i] * 255);
            const idx = i * 4;
            imageData.data[idx] = value;     // R
            imageData.data[idx + 1] = value; // G
            imageData.data[idx + 2] = value; // B
            imageData.data[idx + 3] = 255;   // A
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas.toDataURL('image/png');
    }

    /**
     * Import from image
     */
    fromImage(img) {
        const canvas = document.createElement('canvas');
        canvas.width = this.width;
        canvas.height = this.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, this.width, this.height);
        const imageData = ctx.getImageData(0, 0, this.width, this.height);

        for (let i = 0; i < this.data.length; i++) {
            // Use red channel (or average of RGB for color images)
            const idx = i * 4;
            const r = imageData.data[idx];
            const g = imageData.data[idx + 1];
            const b = imageData.data[idx + 2];
            this.data[i] = (r + g + b) / (3 * 255);
        }

        this._notifyListeners('load');
    }

    toJSON() {
        return {
            width: this.width,
            height: this.height,
            data: Array.from(this.data)
        };
    }

    static fromJSON(json) {
        const heightmap = new HeightmapData(json.width, json.height);
        if (json.data) {
            heightmap.data = new Float32Array(json.data);
        }
        return heightmap;
    }

    /**
     * Create a clone of this heightmap
     */
    clone() {
        const copy = new HeightmapData(this.width, this.height);
        copy.data.set(this.data);
        return copy;
    }
}
