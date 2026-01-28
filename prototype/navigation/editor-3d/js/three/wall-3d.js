/**
 * 3D Wall geometry generator
 * Creates extruded geometry from wall centerline with thickness and height
 */
import * as THREE from 'three';

// Default heights per wall type
export const WallHeights = {
    stone: 4,
    wooden: 3,
    castle: 8,
    palisade: 3,
    fortress: 10,
    DEFAULT: 4
};

export class Wall3D {
    /**
     * Get wall height based on type
     */
    static getHeight(wallType) {
        const lowerType = wallType?.toLowerCase() || '';

        for (const [key, height] of Object.entries(WallHeights)) {
            if (lowerType.includes(key)) {
                return height;
            }
        }

        return WallHeights.DEFAULT;
    }

    /**
     * Create 3D mesh for a wall
     * @param {Wall} wall - Wall data from map-data
     * @param {HeightmapData} heightmap - Heightmap for Y positioning
     * @param {MapSettings} settings - Map settings
     * @param {THREE.Material} material - Material to use
     * @param {string} wallType - Type of wall for height
     * @returns {THREE.Mesh} The wall mesh
     */
    static createMesh(wall, heightmap, settings, material, wallType = 'stone') {
        const height = this.getHeight(wallType);
        const points = wall.points;
        const thickness = wall.thickness || 2;

        if (points.length < 2) return null;

        // Get wall outline (2D polygon with thickness)
        const outline = wall.getOutline();
        if (!outline || outline.length < 3) return null;

        // Find average center Y from heightmap
        let avgY = 0;
        for (const p of points) {
            const h = heightmap ?
                heightmap.sampleWorld(p.x, p.y, settings.width, settings.height) * settings.maxHeight :
                0;
            avgY += h;
        }
        avgY /= points.length;

        // Create shape from outline
        const shape = new THREE.Shape();
        shape.moveTo(outline[0].x, outline[0].y);
        for (let i = 1; i < outline.length; i++) {
            shape.lineTo(outline[i].x, outline[i].y);
        }
        shape.closePath();

        const extrudeSettings = {
            depth: height,
            bevelEnabled: false
        };

        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        // Rotate so extrusion is in Y direction
        geometry.rotateX(-Math.PI / 2);

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(0, avgY, 0);

        return mesh;
    }

    /**
     * Create wall mesh with per-segment height sampling
     * This creates a more accurate wall that follows the terrain
     * @param {number} subdivisionDistance - Distance between subdivision points (default 4 meters)
     */
    static createMeshFollowingTerrain(wall, heightmap, settings, material, wallType = 'stone', subdivisionDistance = 4) {
        const wallHeight = this.getHeight(wallType);
        const points = wall.points;
        const thickness = wall.thickness || 2;

        if (points.length < 2) return null;

        // First, subdivide the wall points to follow terrain
        const subdividedPoints = this._subdivideWallPoints(points, heightmap, settings, subdivisionDistance);

        // Build wall geometry segment by segment
        const vertices = [];
        const indices = [];
        let vertexOffset = 0;

        for (let i = 0; i < subdividedPoints.length - 1; i++) {
            const p1 = subdividedPoints[i];
            const p2 = subdividedPoints[i + 1];

            // Heights are already computed in subdivided points
            const h1 = p1.h;
            const h2 = p2.h;

            // Calculate perpendicular direction
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.sqrt(dx * dx + dy * dy);

            if (len < 0.001) continue; // Skip degenerate segments

            const nx = -dy / len * thickness / 2;
            const ny = dx / len * thickness / 2;

            // 8 vertices per segment (box)
            // Bottom face
            const v0 = [p1.x - nx, h1, p1.y - ny];           // left bottom start
            const v1 = [p1.x + nx, h1, p1.y + ny];           // right bottom start
            const v2 = [p2.x + nx, h2, p2.y + ny];           // right bottom end
            const v3 = [p2.x - nx, h2, p2.y - ny];           // left bottom end

            // Top face
            const v4 = [p1.x - nx, h1 + wallHeight, p1.y - ny];
            const v5 = [p1.x + nx, h1 + wallHeight, p1.y + ny];
            const v6 = [p2.x + nx, h2 + wallHeight, p2.y + ny];
            const v7 = [p2.x - nx, h2 + wallHeight, p2.y - ny];

            // Add vertices
            vertices.push(
                ...v0, ...v1, ...v2, ...v3,
                ...v4, ...v5, ...v6, ...v7
            );

            // Add indices for 6 faces (2 triangles each = 12 triangles)
            const o = vertexOffset;

            // Bottom face
            indices.push(o + 0, o + 2, o + 1);
            indices.push(o + 0, o + 3, o + 2);

            // Top face
            indices.push(o + 4, o + 5, o + 6);
            indices.push(o + 4, o + 6, o + 7);

            // Front face (along wall direction)
            indices.push(o + 1, o + 2, o + 6);
            indices.push(o + 1, o + 6, o + 5);

            // Back face
            indices.push(o + 0, o + 4, o + 7);
            indices.push(o + 0, o + 7, o + 3);

            // Start cap
            if (i === 0) {
                indices.push(o + 0, o + 1, o + 5);
                indices.push(o + 0, o + 5, o + 4);
            }

            // End cap
            if (i === subdividedPoints.length - 2) {
                indices.push(o + 2, o + 3, o + 7);
                indices.push(o + 2, o + 7, o + 6);
            }

            vertexOffset += 8;
        }

        if (vertices.length === 0) return null;

        // Create buffer geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        return new THREE.Mesh(geometry, material);
    }

    /**
     * Subdivide wall points to follow terrain
     * Inserts intermediate points between each pair of original points
     */
    static _subdivideWallPoints(points, heightmap, settings, maxDistance) {
        const result = [];

        for (let i = 0; i < points.length; i++) {
            const p1 = points[i];

            // Sample height for this point
            const h1 = heightmap ?
                heightmap.sampleWorld(p1.x, p1.y, settings.width, settings.height) * settings.maxHeight :
                0;

            // Add original point with height
            result.push({ x: p1.x, y: p1.y, h: h1, isOriginal: true, originalIndex: i });

            // If not the last point, add intermediate points
            if (i < points.length - 1) {
                const p2 = points[i + 1];

                // Calculate segment length
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const segmentLength = Math.sqrt(dx * dx + dy * dy);

                // Determine how many subdivisions we need
                const numSubdivisions = Math.max(1, Math.ceil(segmentLength / maxDistance));

                // Add intermediate points
                for (let j = 1; j < numSubdivisions; j++) {
                    const t = j / numSubdivisions;
                    const ix = p1.x + dx * t;
                    const iy = p1.y + dy * t;

                    // Sample terrain height at intermediate point
                    const ih = heightmap ?
                        heightmap.sampleWorld(ix, iy, settings.width, settings.height) * settings.maxHeight :
                        0;

                    result.push({ x: ix, y: iy, h: ih, isOriginal: false });
                }
            }
        }

        return result;
    }

    /**
     * Create a simple wall segment for preview
     */
    static createPreviewSegment(p1, p2, height, thickness, material) {
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const length = Math.sqrt(dx * dx + dz * dz);

        const geometry = new THREE.BoxGeometry(length, height, thickness);
        const mesh = new THREE.Mesh(geometry, material);

        // Position at center
        mesh.position.set(
            (p1.x + p2.x) / 2,
            (p1.y + p2.y) / 2 + height / 2,
            (p1.z + p2.z) / 2
        );

        // Rotate to align with wall direction
        mesh.rotation.y = -Math.atan2(dz, dx);

        return mesh;
    }

    /**
     * Create wall preview line
     */
    static createPreviewLine(points, material) {
        if (points.length < 2) return null;

        const positions = new Float32Array(points.length * 3);
        for (let i = 0; i < points.length; i++) {
            positions[i * 3] = points[i].x;
            positions[i * 3 + 1] = points[i].y + 0.5;
            positions[i * 3 + 2] = points[i].z;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        return new THREE.Line(geometry, material);
    }

    /**
     * Update wall mesh position based on heightmap
     */
    static updatePosition(mesh, wall, heightmap, settings) {
        const points = wall.points;

        // Recalculate average Y
        let avgY = 0;
        for (const p of points) {
            const h = heightmap ?
                heightmap.sampleWorld(p.x, p.y, settings.width, settings.height) * settings.maxHeight :
                0;
            avgY += h;
        }
        avgY /= points.length;

        mesh.position.y = avgY;
    }
}
