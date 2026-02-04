// ========================================
// editor3d-geometry.js
// 3D geometry utilities for mesh generation
// ========================================

import * as THREE from 'three';

// ========================================
// Building Geometry
// ========================================
export function createBuildingGeometry(building) {
    // Create extruded geometry from 2D footprint
    const shape = new THREE.Shape();

    if (building.vertices.length === 0) return null;

    // Create shape from vertices
    shape.moveTo(building.vertices[0].x, building.vertices[0].y);
    for (let i = 1; i < building.vertices.length; i++) {
        shape.lineTo(building.vertices[i].x, building.vertices[i].y);
    }
    shape.closePath();

    const extrudeSettings = {
        depth: building.height,
        bevelEnabled: false
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // Rotate to make it stand up (Three.js extrudes along Z)
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, building.height / 2, 0);

    return geometry;
}

// ========================================
// Wall Geometry
// ========================================
export function createWallGeometry(wall) {
    if (wall.points.length < 2) return null;

    const geometries = [];
    const halfThick = wall.thickness / 2;

    for (let i = 0; i < wall.points.length - 1; i++) {
        const p1 = wall.points[i];
        const p2 = wall.points[i + 1];

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);

        if (len < 0.01) continue;

        // Create box for segment
        const segmentGeom = new THREE.BoxGeometry(wall.thickness, wall.height, len);

        // Position and rotate (IMPORTANT: rotate first, then translate!)
        const cx = (p1.x + p2.x) / 2;
        const cy = (p1.y + p2.y) / 2;
        const angle = Math.atan2(dy, dx);

        // First rotate around Y axis
        segmentGeom.rotateY(-angle);
        // Then translate to final position
        segmentGeom.translate(cx, wall.height / 2, cy);

        geometries.push(segmentGeom);
    }

    if (geometries.length === 0) return null;

    // Merge all segments
    return THREE.BufferGeometryUtils ?
        THREE.BufferGeometryUtils.mergeGeometries(geometries) :
        mergeGeometriesManual(geometries);
}

// ========================================
// Terrain Geometry with Holes
// ========================================
export function createTerrainGeometry(terrain, obstacles) {
    const { minX, maxX, minY, maxY } = terrain.bounds;

    // Create main terrain shape
    const terrainShape = new THREE.Shape();
    terrainShape.moveTo(minX, minY);
    terrainShape.lineTo(maxX, minY);
    terrainShape.lineTo(maxX, maxY);
    terrainShape.lineTo(minX, maxY);
    terrainShape.closePath();

    // Add holes for obstacles with obstacleType === 'hole'
    for (const obs of obstacles.values()) {
        if (obs.obstacleType === 'hole' && obs.vertices.length >= 3) {
            const holePath = new THREE.Path();
            holePath.moveTo(obs.vertices[0].x, obs.vertices[0].y);
            for (let i = 1; i < obs.vertices.length; i++) {
                holePath.lineTo(obs.vertices[i].x, obs.vertices[i].y);
            }
            holePath.closePath();
            terrainShape.holes.push(holePath);
        }
    }

    const extrudeSettings = {
        depth: 0.1,
        bevelEnabled: false
    };

    const geometry = new THREE.ExtrudeGeometry(terrainShape, extrudeSettings);

    // Rotate to make it horizontal
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, -0.05, 0);

    return geometry;
}

// ========================================
// Obstacle Geometry (Prism type)
// ========================================
export function createObstacleGeometry(obstacle) {
    if (obstacle.obstacleType !== 'prism' || obstacle.vertices.length < 3) {
        return null;
    }

    const shape = new THREE.Shape();
    shape.moveTo(obstacle.vertices[0].x, obstacle.vertices[0].y);
    for (let i = 1; i < obstacle.vertices.length; i++) {
        shape.lineTo(obstacle.vertices[i].x, obstacle.vertices[i].y);
    }
    shape.closePath();

    const extrudeSettings = {
        depth: obstacle.height,
        bevelEnabled: false
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // Rotate to make it stand up
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, obstacle.height / 2, 0);

    return geometry;
}

// ========================================
// Convert Geometry to Positions/Indices
// ========================================
export function geometryToArrays(geometry) {
    if (!geometry) return { positions: [], indices: [] };

    const posAttr = geometry.getAttribute('position');
    const positions = Array.from(posAttr.array);

    let indices = [];
    if (geometry.index) {
        indices = Array.from(geometry.index.array);
    } else {
        // Non-indexed geometry
        indices = Array.from({ length: positions.length / 3 }, (_, i) => i);
    }

    return { positions, indices };
}

// ========================================
// Manual Geometry Merging (fallback)
// ========================================
function mergeGeometriesManual(geometries) {
    if (geometries.length === 0) return null;
    if (geometries.length === 1) return geometries[0];

    let totalPositions = 0;
    let totalIndices = 0;

    for (const geom of geometries) {
        const posCount = geom.getAttribute('position').count;
        totalPositions += posCount;
        totalIndices += geom.index ? geom.index.count : posCount;
    }

    const mergedPositions = new Float32Array(totalPositions * 3);
    const mergedNormals = new Float32Array(totalPositions * 3);
    const mergedIndices = new Uint32Array(totalIndices);

    let posOffset = 0;
    let indexOffset = 0;
    let vertexOffset = 0;

    for (const geom of geometries) {
        const positions = geom.getAttribute('position');
        const normals = geom.getAttribute('normal');
        const indices = geom.index;

        mergedPositions.set(positions.array, posOffset);
        if (normals) mergedNormals.set(normals.array, posOffset);

        if (indices) {
            for (let i = 0; i < indices.count; i++) {
                mergedIndices[indexOffset + i] = indices.array[i] + vertexOffset;
            }
            indexOffset += indices.count;
        } else {
            for (let i = 0; i < positions.count; i++) {
                mergedIndices[indexOffset + i] = i + vertexOffset;
            }
            indexOffset += positions.count;
        }

        posOffset += positions.count * 3;
        vertexOffset += positions.count;
    }

    const mergedGeometry = new THREE.BufferGeometry();
    mergedGeometry.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
    mergedGeometry.setAttribute('normal', new THREE.BufferAttribute(mergedNormals, 3));
    mergedGeometry.setIndex(new THREE.BufferAttribute(mergedIndices, 1));

    return mergedGeometry;
}

// ========================================
// Grid Helper
// ========================================
export function createGridGeometry(size = 50, divisions = 50) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];

    const step = size / divisions;
    const halfSize = size / 2;

    for (let i = 0; i <= divisions; i++) {
        const pos = -halfSize + i * step;
        // X lines
        vertices.push(-halfSize, 0, pos, halfSize, 0, pos);
        // Z lines
        vertices.push(pos, 0, -halfSize, pos, 0, halfSize);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return geometry;
}
