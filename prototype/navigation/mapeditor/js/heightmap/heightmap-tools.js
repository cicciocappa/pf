/**
 * Heightmap brush tools
 * Raise, Lower, Smooth, Flatten with configurable parameters
 */

export const ToolType = {
    RAISE: 'raise',
    LOWER: 'lower',
    SMOOTH: 'smooth',
    FLATTEN: 'flatten',
    NOISE: 'noise'
};

/**
 * Base brush parameters
 */
export class BrushSettings {
    constructor() {
        this.radius = 10;        // Brush radius in pixels
        this.strength = 0.1;     // Effect strength (0-1)
        this.falloff = 0.5;      // Falloff curve (0=hard, 1=soft)
        this.tool = ToolType.RAISE;
        this.flattenHeight = 0.5; // Target height for flatten tool
    }

    clone() {
        const copy = new BrushSettings();
        copy.radius = this.radius;
        copy.strength = this.strength;
        copy.falloff = this.falloff;
        copy.tool = this.tool;
        copy.flattenHeight = this.flattenHeight;
        return copy;
    }
}

/**
 * Heightmap tool operations
 */
export class HeightmapTools {
    /**
     * Calculate brush falloff at a given distance
     * @param {number} distance - Distance from brush center
     * @param {number} radius - Brush radius
     * @param {number} falloff - Falloff factor (0=hard, 1=soft)
     * @returns {number} Falloff multiplier (0-1)
     */
    static calculateFalloff(distance, radius, falloff) {
        if (distance >= radius) return 0;
        if (distance <= 0) return 1;

        const normalizedDist = distance / radius;

        // Smooth falloff using cosine interpolation
        if (falloff <= 0) {
            // Hard brush
            return 1;
        } else if (falloff >= 1) {
            // Full smooth falloff
            return 0.5 * (1 + Math.cos(Math.PI * normalizedDist));
        } else {
            // Blend between hard and soft
            const hard = 1;
            const soft = 0.5 * (1 + Math.cos(Math.PI * normalizedDist));
            return hard * (1 - falloff) + soft * falloff;
        }
    }

    /**
     * Apply brush stroke to heightmap
     * @param {HeightmapData} heightmap - The heightmap to modify
     * @param {number} cx - Center X in heightmap coordinates
     * @param {number} cy - Center Y in heightmap coordinates
     * @param {BrushSettings} brush - Brush settings
     */
    static applyBrush(heightmap, cx, cy, brush) {
        const radius = brush.radius;
        const intRadius = Math.ceil(radius);

        // Affected region bounds
        const minX = Math.max(0, Math.floor(cx - intRadius));
        const maxX = Math.min(heightmap.width - 1, Math.ceil(cx + intRadius));
        const minY = Math.max(0, Math.floor(cy - intRadius));
        const maxY = Math.min(heightmap.height - 1, Math.ceil(cy + intRadius));

        // For smooth tool, we need to sample the average first
        let averageHeight = 0;
        if (brush.tool === ToolType.SMOOTH) {
            let sum = 0;
            let count = 0;
            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
                    if (dist <= radius) {
                        sum += heightmap.getHeight(x, y);
                        count++;
                    }
                }
            }
            averageHeight = count > 0 ? sum / count : 0;
        }

        // For flatten, sample center height if not set
        let flattenTarget = brush.flattenHeight;
        if (brush.tool === ToolType.FLATTEN && brush._autoFlattenHeight) {
            flattenTarget = heightmap.getHeight(Math.round(cx), Math.round(cy));
        }

        // Apply brush
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
                if (dist > radius) continue;

                const falloffMult = this.calculateFalloff(dist, radius, brush.falloff);
                const currentHeight = heightmap.getHeight(x, y);
                let newHeight = currentHeight;

                switch (brush.tool) {
                    case ToolType.RAISE:
                        newHeight = currentHeight + brush.strength * falloffMult;
                        break;

                    case ToolType.LOWER:
                        newHeight = currentHeight - brush.strength * falloffMult;
                        break;

                    case ToolType.SMOOTH:
                        newHeight = currentHeight + (averageHeight - currentHeight) * brush.strength * falloffMult;
                        break;

                    case ToolType.FLATTEN:
                        newHeight = currentHeight + (flattenTarget - currentHeight) * brush.strength * falloffMult;
                        break;

                    case ToolType.NOISE:
                        const noise = (Math.random() - 0.5) * 2 * brush.strength * falloffMult;
                        newHeight = currentHeight + noise;
                        break;
                }

                heightmap.setHeight(x, y, newHeight);
            }
        }

        // Notify heightmap of the changed region
        heightmap.notifyRegionChanged(
            minX, minY,
            maxX - minX + 1,
            maxY - minY + 1
        );
    }

    /**
     * Get neighbor heights for edge detection
     */
    static getNeighborHeights(heightmap, x, y) {
        const neighbors = [];
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                neighbors.push(heightmap.getHeight(x + dx, y + dy));
            }
        }
        return neighbors;
    }

    /**
     * Generate procedural terrain
     * @param {HeightmapData} heightmap - The heightmap to modify
     * @param {object} options - Generation options
     */
    static generateTerrain(heightmap, options = {}) {
        const {
            octaves = 4,
            persistence = 0.5,
            lacunarity = 2,
            scale = 50,
            seed = Math.random() * 10000
        } = options;

        // Simple value noise implementation
        const noise2D = (x, y, s) => {
            const xi = Math.floor(x / s);
            const yi = Math.floor(y / s);
            const fx = (x / s) - xi;
            const fy = (y / s) - yi;

            // Hash function for pseudo-random values
            const hash = (x, y) => {
                const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
                return n - Math.floor(n);
            };

            // Smooth interpolation
            const smoothstep = t => t * t * (3 - 2 * t);
            const sx = smoothstep(fx);
            const sy = smoothstep(fy);

            // Bilinear interpolation of random values
            const n00 = hash(xi, yi);
            const n10 = hash(xi + 1, yi);
            const n01 = hash(xi, yi + 1);
            const n11 = hash(xi + 1, yi + 1);

            const nx0 = n00 * (1 - sx) + n10 * sx;
            const nx1 = n01 * (1 - sx) + n11 * sx;
            return nx0 * (1 - sy) + nx1 * sy;
        };

        // Generate fractal noise
        for (let y = 0; y < heightmap.height; y++) {
            for (let x = 0; x < heightmap.width; x++) {
                let amplitude = 1;
                let frequency = 1;
                let height = 0;
                let maxAmplitude = 0;

                for (let i = 0; i < octaves; i++) {
                    height += noise2D(x * frequency, y * frequency, scale) * amplitude;
                    maxAmplitude += amplitude;
                    amplitude *= persistence;
                    frequency *= lacunarity;
                }

                heightmap.setHeight(x, y, height / maxAmplitude);
            }
        }

        heightmap._notifyListeners('generate');
    }

    /**
     * Apply global smoothing pass
     */
    static globalSmooth(heightmap, iterations = 1) {
        for (let iter = 0; iter < iterations; iter++) {
            const tempData = new Float32Array(heightmap.data.length);

            for (let y = 0; y < heightmap.height; y++) {
                for (let x = 0; x < heightmap.width; x++) {
                    let sum = 0;
                    let count = 0;

                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const nx = x + dx;
                            const ny = y + dy;
                            if (nx >= 0 && nx < heightmap.width && ny >= 0 && ny < heightmap.height) {
                                sum += heightmap.getHeight(nx, ny);
                                count++;
                            }
                        }
                    }

                    tempData[y * heightmap.width + x] = sum / count;
                }
            }

            heightmap.data.set(tempData);
        }

        heightmap._notifyListeners('smooth');
    }

    /**
     * Normalize heightmap to 0-1 range
     */
    static normalize(heightmap) {
        let min = Infinity;
        let max = -Infinity;

        for (let i = 0; i < heightmap.data.length; i++) {
            min = Math.min(min, heightmap.data[i]);
            max = Math.max(max, heightmap.data[i]);
        }

        if (max > min) {
            const range = max - min;
            for (let i = 0; i < heightmap.data.length; i++) {
                heightmap.data[i] = (heightmap.data[i] - min) / range;
            }
        }

        heightmap._notifyListeners('normalize');
    }
}
