/**
 * NavMesh Exporter for 3D terrain
 * Generates 3D navmesh by projecting 2D triangles onto heightmap
 * Exports in navcat format (Float32Array positions, Uint32Array indices)
 */
import * as THREE from 'three';

export class NavmeshExporter {
    constructor(mapData, heightmap, settings, geometry) {
        this.mapData = mapData;
        this.heightmap = heightmap;
        this.settings = settings;
        this.geometry = geometry; // Geometry class from geometry.js
    }

    /**
     * Generate 3D navmesh from 2D map data
     * @param {object} options - Generation options
     * @returns {object} - { triangles, positions, indices }
     */
    generate(options = {}) {
        const {
            mergeTriangles = true,
            agentRadius = 1,
            gridStep = 50
        } = options;

        // Get navigation input data from MapData
        const navInput = this.mapData.getNavInputData();
        if (!navInput.outer || navInput.outer.length < 3) {
            console.warn('No valid outer boundary for navmesh');
            return null;
        }

        // Generate 2D navmesh using existing geometry utilities
        const navmeshResult = this.geometry.generateNavMesh(
            navInput.outer,
            navInput.holes || [],
            { agentRadius, gridStep, mergeTriangles }
        );

        if (!navmeshResult.triangles || navmeshResult.triangles.length === 0) {
            console.warn('Triangulation produced no triangles');
            return null;
        }

        // Project triangles onto heightmap to create 3D navmesh
        const triangles3D = this._projectToHeightmap(navmeshResult.triangles);

        // Convert to navcat format
        const { positions, indices } = this._toNavcatFormat(triangles3D);

        return {
            triangles: triangles3D,
            positions,
            indices,
            stats: {
                triangleCount: triangles3D.length,
                vertexCount: positions.length / 3,
                indexCount: indices.length
            }
        };
    }

    /**
     * Generate tiled navmesh for large maps
     * @param {object} options - Generation options
     * @returns {object} - { metadata, tiles }
     */
    generateTiled(options = {}) {
        const result = this.generate(options);
        if (!result) return null;

        const tileSize = this.settings.tileSize;
        const tilesX = this.settings.tilesX;
        const tilesZ = this.settings.tilesZ;

        const tiles = [];

        // Assign triangles to tiles
        for (let tz = 0; tz < tilesZ; tz++) {
            for (let tx = 0; tx < tilesX; tx++) {
                const tileMinX = tx * tileSize;
                const tileMaxX = (tx + 1) * tileSize;
                const tileMinZ = tz * tileSize;
                const tileMaxZ = (tz + 1) * tileSize;

                const tileTriangles = [];

                // Find triangles that belong to this tile (by centroid)
                for (const tri of result.triangles) {
                    const cx = (tri[0].x + tri[1].x + tri[2].x) / 3;
                    const cz = (tri[0].z + tri[1].z + tri[2].z) / 3;

                    if (cx >= tileMinX && cx < tileMaxX &&
                        cz >= tileMinZ && cz < tileMaxZ) {
                        tileTriangles.push(tri);
                    }
                }

                if (tileTriangles.length > 0) {
                    const tileData = this._toNavcatFormat(tileTriangles);
                    tiles.push({
                        x: tx,
                        z: tz,
                        positions: tileData.positions,
                        indices: tileData.indices
                    });
                }
            }
        }

        return {
            metadata: {
                tileSize,
                tilesX,
                tilesZ,
                mapWidth: this.settings.width,
                mapHeight: this.settings.height,
                maxHeight: this.settings.maxHeight
            },
            tiles
        };
    }

    /**
     * Project 2D triangles onto heightmap
     */
    _projectToHeightmap(triangles2D) {
        const triangles3D = [];

        for (const tri of triangles2D) {
            const projected = tri.map(v => ({
                x: v.x,
                y: this._sampleHeight(v.x, v.y),
                z: v.y  // 2D Y becomes 3D Z
            }));

            triangles3D.push(projected);
        }

        return triangles3D;
    }

    /**
     * Sample height from heightmap at world position
     */
    _sampleHeight(worldX, worldZ) {
        if (!this.heightmap) return 0;

        const h = this.heightmap.sampleWorld(
            worldX,
            worldZ,
            this.settings.width,
            this.settings.height
        );

        return h * this.settings.maxHeight;
    }

    /**
     * Convert triangles to navcat format (indexed mesh)
     */
    _toNavcatFormat(triangles) {
        const vertexMap = new Map(); // "x,y,z" -> index
        const positions = [];
        const indices = [];

        const PRECISION = 3; // Decimal places for vertex comparison

        const getOrCreateVertex = (v) => {
            const key = `${v.x.toFixed(PRECISION)},${v.y.toFixed(PRECISION)},${v.z.toFixed(PRECISION)}`;

            if (vertexMap.has(key)) {
                return vertexMap.get(key);
            }

            const index = positions.length / 3;
            positions.push(v.x, v.y, v.z);
            vertexMap.set(key, index);
            return index;
        };

        for (const tri of triangles) {
            // Ensure CCW winding order for navcat
            const i0 = getOrCreateVertex(tri[0]);
            const i1 = getOrCreateVertex(tri[1]);
            const i2 = getOrCreateVertex(tri[2]);

            // Check winding and reverse if necessary
            if (this._isClockwise3D(tri[0], tri[1], tri[2])) {
                indices.push(i0, i2, i1);
            } else {
                indices.push(i0, i1, i2);
            }
        }

        return {
            positions: new Float32Array(positions),
            indices: new Uint32Array(indices)
        };
    }

    /**
     * Check if triangle is clockwise in XZ plane
     */
    _isClockwise3D(a, b, c) {
        // Cross product in XZ plane
        const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
        return cross < 0;
    }

    /**
     * Create Three.js mesh for visualization
     */
    createVisualizationMesh(navmeshData, material) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(navmeshData.positions, 3));
        geometry.setIndex(new THREE.BufferAttribute(navmeshData.indices, 1));
        geometry.computeVertexNormals();

        return new THREE.Mesh(geometry, material);
    }

    /**
     * Create wireframe visualization
     */
    createWireframeMesh(navmeshData, material) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(navmeshData.positions, 3));
        geometry.setIndex(new THREE.BufferAttribute(navmeshData.indices, 1));

        const wireframe = new THREE.WireframeGeometry(geometry);
        return new THREE.LineSegments(wireframe, material);
    }

    /**
     * Export navmesh to JSON
     */
    exportJSON(navmeshData) {
        return JSON.stringify({
            format: 'navcat',
            version: '1.0',
            mapWidth: this.settings.width,
            mapHeight: this.settings.height,
            maxHeight: this.settings.maxHeight,
            positions: Array.from(navmeshData.positions),
            indices: Array.from(navmeshData.indices),
            stats: navmeshData.stats
        });
    }

    /**
     * Export tiled navmesh to JSON
     */
    exportTiledJSON(tiledData) {
        return JSON.stringify({
            format: 'navcat-tiled',
            version: '1.0',
            metadata: tiledData.metadata,
            tiles: tiledData.tiles.map(tile => ({
                x: tile.x,
                z: tile.z,
                positions: Array.from(tile.positions),
                indices: Array.from(tile.indices)
            }))
        });
    }

    /**
     * Export to binary format (more compact)
     */
    exportBinary(navmeshData) {
        // Header: magic (4) + version (4) + numVerts (4) + numIndices (4) = 16 bytes
        const numVerts = navmeshData.positions.length / 3;
        const numIndices = navmeshData.indices.length;

        const headerSize = 16;
        const positionsSize = navmeshData.positions.byteLength;
        const indicesSize = navmeshData.indices.byteLength;
        const totalSize = headerSize + positionsSize + indicesSize;

        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);

        // Magic "NCAT"
        view.setUint8(0, 0x4E); // N
        view.setUint8(1, 0x43); // C
        view.setUint8(2, 0x41); // A
        view.setUint8(3, 0x54); // T

        // Version
        view.setUint32(4, 1, true);

        // Vertex count
        view.setUint32(8, numVerts, true);

        // Index count
        view.setUint32(12, numIndices, true);

        // Positions
        const positionsView = new Float32Array(buffer, headerSize, navmeshData.positions.length);
        positionsView.set(navmeshData.positions);

        // Indices
        const indicesView = new Uint32Array(buffer, headerSize + positionsSize, navmeshData.indices.length);
        indicesView.set(navmeshData.indices);

        return buffer;
    }

    /**
     * Parse binary navcat format
     */
    static parseBinary(buffer) {
        const view = new DataView(buffer);

        // Check magic
        const magic = String.fromCharCode(
            view.getUint8(0),
            view.getUint8(1),
            view.getUint8(2),
            view.getUint8(3)
        );
        if (magic !== 'NCAT') {
            throw new Error('Invalid navcat file format');
        }

        const version = view.getUint32(4, true);
        const numVerts = view.getUint32(8, true);
        const numIndices = view.getUint32(12, true);

        const headerSize = 16;
        const positions = new Float32Array(buffer, headerSize, numVerts * 3);
        const indicesOffset = headerSize + positions.byteLength;
        const indices = new Uint32Array(buffer, indicesOffset, numIndices);

        return {
            version,
            positions: new Float32Array(positions), // Copy
            indices: new Uint32Array(indices) // Copy
        };
    }
}
