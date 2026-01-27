/**
 * 3D Building geometry generator
 * Creates BoxGeometry and CylinderGeometry (12 sides) for buildings
 */
import * as THREE from 'three';

// Default heights per building type
export const BuildingHeights = {
    TOWER: 15,
    MAGIC_TOWER: 20,
    SMALL_HOUSE: 5,
    BARRACKS: 6,
    HOUSE: 6,
    LARGE_HOUSE: 7,
    CASTLE: 25,
    KEEP: 20,
    GATEHOUSE: 10,
    WALL_TOWER: 12,
    DEFAULT: 8
};

export class Building3D {
    /**
     * Get building height based on template type
     */
    static getHeight(templateId) {
        const upperTemplate = templateId?.toUpperCase() || '';

        // Check for specific types
        for (const [key, height] of Object.entries(BuildingHeights)) {
            if (upperTemplate.includes(key)) {
                return height;
            }
        }

        return BuildingHeights.DEFAULT;
    }

    /**
     * Create 3D mesh for a building
     * @param {Building} building - Building data from map-data
     * @param {HeightmapData} heightmap - Heightmap for Y positioning
     * @param {MapSettings} settings - Map settings
     * @param {THREE.Material} material - Material to use
     * @returns {THREE.Mesh} The building mesh
     */
    static createMesh(building, heightmap, settings, material) {
        const height = this.getHeight(building.templateId);
        const vertices = building.getVertices();

        // Calculate bounding box for size
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        for (const v of vertices) {
            minX = Math.min(minX, v.x);
            maxX = Math.max(maxX, v.x);
            minY = Math.min(minY, v.y);
            maxY = Math.max(maxY, v.y);
        }

        const width = maxX - minX;
        const depth = maxY - minY;
        const centerX = (minX + maxX) / 2;
        const centerZ = (minY + maxY) / 2;

        // Sample terrain height at center
        const terrainY = heightmap ?
            heightmap.sampleWorld(centerX, centerZ, settings.width, settings.height) * settings.maxHeight :
            0;

        let geometry;
        const sideCount = vertices.length;

        if (sideCount <= 4 || building.templateId?.includes('ngon_4')) {
            // Box geometry
            geometry = new THREE.BoxGeometry(width, height, depth);
        } else if (sideCount >= 8 && sideCount <= 16) {
            // Cylinder for circular buildings (use radial segments matching vertex count)
            const radius = Math.max(width, depth) / 2;
            geometry = new THREE.CylinderGeometry(radius, radius, height, 12);
        } else {
            // For other polygons, use extrusion
            geometry = this._createExtrudedGeometry(vertices, height, centerX, centerZ);
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(centerX, terrainY + height / 2, centerZ);

        // Apply rotation if building has rotation
        if (building.rotation) {
            mesh.rotation.y = -building.rotation;
        }

        return mesh;
    }

    /**
     * Create extruded geometry from 2D polygon vertices
     */
    static _createExtrudedGeometry(vertices, height, centerX, centerZ) {
        const shape = new THREE.Shape();

        // Create shape from vertices (relative to center)
        if (vertices.length > 0) {
            shape.moveTo(vertices[0].x - centerX, vertices[0].y - centerZ);
            for (let i = 1; i < vertices.length; i++) {
                shape.lineTo(vertices[i].x - centerX, vertices[i].y - centerZ);
            }
            shape.closePath();
        }

        const extrudeSettings = {
            depth: height,
            bevelEnabled: false
        };

        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        // Rotate so extrusion is in Y direction
        geometry.rotateX(-Math.PI / 2);
        geometry.translate(0, height / 2, 0);

        return geometry;
    }

    /**
     * Create a simple box building
     */
    static createBox(width, depth, height, material) {
        const geometry = new THREE.BoxGeometry(width, height, depth);
        return new THREE.Mesh(geometry, material);
    }

    /**
     * Create a cylindrical tower (12 sides)
     */
    static createCylinder(radius, height, material, sides = 12) {
        const geometry = new THREE.CylinderGeometry(radius, radius, height, sides);
        return new THREE.Mesh(geometry, material);
    }

    /**
     * Create geometry preview for building placement
     */
    static createPreviewGeometry(templateId, scale = 1) {
        const height = this.getHeight(templateId);
        const upperTemplate = templateId?.toUpperCase() || '';

        // Determine base size based on template
        let size = 10 * scale;
        if (upperTemplate.includes('SMALL')) size = 6 * scale;
        if (upperTemplate.includes('LARGE')) size = 15 * scale;
        if (upperTemplate.includes('TOWER')) size = 8 * scale;

        // Check if circular
        const isCircular = upperTemplate.includes('TOWER') ||
            upperTemplate.includes('CYLINDER') ||
            (templateId?.startsWith('ngon_') &&
                parseInt(templateId.split('_')[1]) >= 8);

        if (isCircular) {
            return new THREE.CylinderGeometry(size / 2, size / 2, height, 12);
        } else {
            return new THREE.BoxGeometry(size, height, size);
        }
    }

    /**
     * Update building mesh position based on heightmap
     */
    static updatePosition(mesh, building, heightmap, settings) {
        const vertices = building.getVertices();

        // Calculate center
        let sumX = 0, sumY = 0;
        for (const v of vertices) {
            sumX += v.x;
            sumY += v.y;
        }
        const centerX = sumX / vertices.length;
        const centerZ = sumY / vertices.length;

        // Sample terrain height at center
        const terrainY = heightmap ?
            heightmap.sampleWorld(centerX, centerZ, settings.width, settings.height) * settings.maxHeight :
            0;

        const height = this.getHeight(building.templateId);
        mesh.position.set(centerX, terrainY + height / 2, centerZ);

        if (building.rotation) {
            mesh.rotation.y = -building.rotation;
        }
    }
}
