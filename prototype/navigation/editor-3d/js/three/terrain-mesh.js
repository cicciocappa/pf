/**
 * Terrain mesh generator
 * Creates a PlaneGeometry with Y displacement from heightmap
 */
import * as THREE from 'three';

export class TerrainMesh {
    /**
     * Create terrain mesh from heightmap data
     * @param {HeightmapData} heightmap - Heightmap data
     * @param {MapSettings} settings - Map settings
     * @param {THREE.Material} material - Material to use
     * @returns {THREE.Mesh} The terrain mesh
     */
    static create(heightmap, settings, material) {
        // Determine mesh resolution (match heightmap or use subdivisions)
        const segmentsX = heightmap.width - 1;
        const segmentsZ = heightmap.height - 1;

        // Create plane geometry
        const geometry = new THREE.PlaneGeometry(
            settings.width,
            settings.height,
            segmentsX,
            segmentsZ
        );

        // Rotate to XZ plane (Three.js PlaneGeometry is in XY by default)
        geometry.rotateX(-Math.PI / 2);

        // Get position attribute
        const positions = geometry.attributes.position.array;
        const vertexCount = positions.length / 3;

        // Apply heightmap to Y coordinates
        for (let i = 0; i < vertexCount; i++) {
            const x = positions[i * 3];     // X position in world space
            const z = positions[i * 3 + 2]; // Z position in world space

            // Convert world position to heightmap UV
            const u = (x + settings.width / 2) / settings.width;
            const v = (z + settings.height / 2) / settings.height;

            // Sample heightmap with bilinear interpolation
            const h = heightmap.sampleBilinear(u, v);

            // Set Y position
            positions[i * 3 + 1] = h * settings.maxHeight;
        }

        // Update geometry
        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        // Create mesh
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(settings.width / 2, 0, settings.height / 2);

        return mesh;
    }

    /**
     * Update existing terrain mesh with new heightmap data
     * @param {THREE.Mesh} mesh - Existing terrain mesh
     * @param {HeightmapData} heightmap - New heightmap data
     * @param {MapSettings} settings - Map settings
     */
    static update(mesh, heightmap, settings) {
        const geometry = mesh.geometry;
        const positions = geometry.attributes.position.array;
        const vertexCount = positions.length / 3;

        // Update Y coordinates from heightmap
        for (let i = 0; i < vertexCount; i++) {
            const x = positions[i * 3];
            const z = positions[i * 3 + 2];

            // Local coordinates to UV (mesh is centered at origin in geometry)
            const u = (x + settings.width / 2) / settings.width;
            const v = (z + settings.height / 2) / settings.height;

            const h = heightmap.sampleBilinear(u, v);
            positions[i * 3 + 1] = h * settings.maxHeight;
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
    }

    /**
     * Sample height at world position
     * @param {HeightmapData} heightmap - Heightmap data
     * @param {MapSettings} settings - Map settings
     * @param {number} worldX - World X coordinate
     * @param {number} worldZ - World Z coordinate
     * @returns {number} World Y coordinate
     */
    static sampleHeight(heightmap, settings, worldX, worldZ) {
        const h = heightmap.sampleWorld(worldX, worldZ, settings.width, settings.height);
        return h * settings.maxHeight;
    }

    /**
     * Create a low-resolution preview mesh
     * @param {HeightmapData} heightmap - Heightmap data
     * @param {MapSettings} settings - Map settings
     * @param {THREE.Material} material - Material to use
     * @param {number} resolution - Number of segments (default 32)
     * @returns {THREE.Mesh} Preview mesh
     */
    static createPreview(heightmap, settings, material, resolution = 32) {
        const geometry = new THREE.PlaneGeometry(
            settings.width,
            settings.height,
            resolution,
            resolution
        );

        geometry.rotateX(-Math.PI / 2);

        const positions = geometry.attributes.position.array;
        const vertexCount = positions.length / 3;

        for (let i = 0; i < vertexCount; i++) {
            const x = positions[i * 3];
            const z = positions[i * 3 + 2];

            const u = (x + settings.width / 2) / settings.width;
            const v = (z + settings.height / 2) / settings.height;

            const h = heightmap.sampleBilinear(u, v);
            positions[i * 3 + 1] = h * settings.maxHeight;
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(settings.width / 2, 0, settings.height / 2);

        return mesh;
    }

    /**
     * Generate terrain normals texture for advanced shading
     * @param {HeightmapData} heightmap - Heightmap data
     * @returns {THREE.DataTexture} Normal map texture
     */
    static generateNormalMap(heightmap) {
        const width = heightmap.width;
        const height = heightmap.height;
        const data = new Uint8Array(width * height * 4);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // Sample neighboring heights
                const hL = heightmap.getHeight(x - 1, y);
                const hR = heightmap.getHeight(x + 1, y);
                const hD = heightmap.getHeight(x, y - 1);
                const hU = heightmap.getHeight(x, y + 1);

                // Calculate normal using Sobel-like operator
                const nx = (hL - hR) * 0.5;
                const ny = 1.0;
                const nz = (hD - hU) * 0.5;

                // Normalize
                const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
                const nnx = nx / len;
                const nny = ny / len;
                const nnz = nz / len;

                // Convert to 0-255 range
                const idx = (y * width + x) * 4;
                data[idx] = Math.round((nnx * 0.5 + 0.5) * 255);
                data[idx + 1] = Math.round((nny * 0.5 + 0.5) * 255);
                data[idx + 2] = Math.round((nnz * 0.5 + 0.5) * 255);
                data[idx + 3] = 255;
            }
        }

        const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
        texture.needsUpdate = true;
        return texture;
    }
}
