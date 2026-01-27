/**
 * Map settings configuration for 3D editor
 * Handles dimensions (multiples of 64m), heightmap resolution, and tile settings
 */
export class MapSettings {
    constructor(options = {}) {
        // Map dimensions in meters (must be multiples of 64)
        this._width = this._roundToMultiple(options.width || 256, 64);
        this._height = this._roundToMultiple(options.height || 256, 64);

        // Height settings
        this.maxHeight = options.maxHeight || 50; // Max terrain height in meters

        // Tile settings for navmesh
        this.tileSize = options.tileSize || 64; // Tile size in meters

        // Heightmap resolution (independent of map size)
        this.heightmapResolution = options.heightmapResolution || 128;

        // Listeners for settings changes
        this._listeners = new Set();
    }

    get width() {
        return this._width;
    }

    set width(value) {
        const newWidth = this._roundToMultiple(value, 64);
        if (newWidth !== this._width) {
            this._width = newWidth;
            this._notifyListeners('width');
        }
    }

    get height() {
        return this._height;
    }

    set height(value) {
        const newHeight = this._roundToMultiple(value, 64);
        if (newHeight !== this._height) {
            this._height = newHeight;
            this._notifyListeners('height');
        }
    }

    get tilesX() {
        return Math.ceil(this._width / this.tileSize);
    }

    get tilesZ() {
        return Math.ceil(this._height / this.tileSize);
    }

    /**
     * Round value to nearest multiple
     */
    _roundToMultiple(value, multiple) {
        return Math.max(multiple, Math.round(value / multiple) * multiple);
    }

    /**
     * Add a listener for settings changes
     */
    addListener(callback) {
        this._listeners.add(callback);
    }

    /**
     * Remove a listener
     */
    removeListener(callback) {
        this._listeners.delete(callback);
    }

    _notifyListeners(changedProperty) {
        for (const listener of this._listeners) {
            listener(changedProperty, this);
        }
    }

    /**
     * Validate and constrain a value to valid dimensions
     */
    static validateDimension(value, min = 64, max = 2048) {
        const clamped = Math.max(min, Math.min(max, value));
        return Math.round(clamped / 64) * 64;
    }

    toJSON() {
        return {
            width: this._width,
            height: this._height,
            maxHeight: this.maxHeight,
            tileSize: this.tileSize,
            heightmapResolution: this.heightmapResolution
        };
    }

    static fromJSON(json) {
        return new MapSettings({
            width: json.width,
            height: json.height,
            maxHeight: json.maxHeight,
            tileSize: json.tileSize,
            heightmapResolution: json.heightmapResolution
        });
    }
}
