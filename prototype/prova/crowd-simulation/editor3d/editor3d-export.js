// ========================================
// editor3d-export.js
// Export to navcat-compatible format
// ========================================

import {
    createBuildingGeometry,
    createWallGeometry,
    createTerrainGeometry,
    createObstacleGeometry,
    geometryToArrays
} from './editor3d-geometry.js';

export class NavcatExporter {
    constructor(editorData) {
        this.editorData = editorData;
    }

    export() {
        const meshes = [];

        // 1. Export terrain (with holes)
        const terrainMesh = this.exportTerrain();
        if (terrainMesh) meshes.push(terrainMesh);

        // 2. Export buildings
        for (const building of this.editorData.buildings.values()) {
            const mesh = this.exportBuilding(building);
            if (mesh) meshes.push(mesh);
        }

        // 3. Export walls
        for (const wall of this.editorData.walls.values()) {
            const mesh = this.exportWall(wall);
            if (mesh) meshes.push(mesh);
        }

        // 4. Export obstacles (prism type only)
        for (const obstacle of this.editorData.obstacles.values()) {
            if (obstacle.obstacleType === 'prism') {
                const mesh = this.exportObstacle(obstacle);
                if (mesh) meshes.push(mesh);
            }
        }

        // 5. Merge all meshes
        const { positions, indices } = this.mergeMeshes(meshes);

        return {
            version: '1.0',
            navmeshType: 'tiled',
            geometry: {
                positions: Array.from(positions),
                indices: Array.from(indices)
            },
            navmeshConfig: {
                cellSize: 0.15,
                cellHeight: 0.15,
                tileSizeVoxels: 32,
                walkableRadiusWorld: 0.3,
                walkableClimbWorld: 0.4,
                walkableHeightWorld: 2.0,
                walkableSlopeAngleDegrees: 45
            },
            editorData: this.editorData.toJSON()
        };
    }

    exportTerrain() {
        const geometry = createTerrainGeometry(
            this.editorData.terrain,
            this.editorData.obstacles
        );

        if (!geometry) return null;

        return geometryToArrays(geometry);
    }

    exportBuilding(building) {
        const geometry = createBuildingGeometry(building);
        if (!geometry) return null;

        return geometryToArrays(geometry);
    }

    exportWall(wall) {
        const geometry = createWallGeometry(wall);
        if (!geometry) return null;

        return geometryToArrays(geometry);
    }

    exportObstacle(obstacle) {
        const geometry = createObstacleGeometry(obstacle);
        if (!geometry) return null;

        return geometryToArrays(geometry);
    }

    mergeMeshes(meshes) {
        if (meshes.length === 0) {
            return {
                positions: new Float32Array(0),
                indices: new Uint32Array(0)
            };
        }

        const mergedPositions = [];
        const mergedIndices = [];
        const posMap = new Map();
        let vertexIndex = 0;

        for (const mesh of meshes) {
            const positions = mesh.positions;
            const indices = mesh.indices;

            // Build index mapping
            const indexMap = new Map();

            for (let i = 0; i < indices.length; i++) {
                const idx = indices[i];
                const x = positions[idx * 3];
                const y = positions[idx * 3 + 1];
                const z = positions[idx * 3 + 2];

                // Create position key with small epsilon for deduplication
                const key = `${x.toFixed(6)}_${y.toFixed(6)}_${z.toFixed(6)}`;

                if (!posMap.has(key)) {
                    posMap.set(key, vertexIndex);
                    mergedPositions.push(x, y, z);
                    vertexIndex++;
                }

                mergedIndices.push(posMap.get(key));
            }
        }

        return {
            positions: new Float32Array(mergedPositions),
            indices: new Uint32Array(mergedIndices)
        };
    }
}

// ========================================
// GLTF Exporter (optional)
// ========================================
export class GLTFExporter {
    constructor(editorData) {
        this.editorData = editorData;
    }

    async export() {
        // Placeholder for GLTF export
        // Would use THREE.GLTFExporter
        console.warn('GLTF export not yet implemented');
        return null;
    }
}
