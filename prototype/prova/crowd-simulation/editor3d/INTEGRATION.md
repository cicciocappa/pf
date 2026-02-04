# Navcat Integration Guide

This guide explains how to integrate the 3D editor's exported geometry with the navcat library.

## Export Format

The 3D editor exports data in this structure:

```json
{
  "version": "1.0",
  "navmeshType": "tiled",
  "geometry": {
    "positions": [x, y, z, ...],  // Float32Array as array
    "indices": [i1, i2, i3, ...]  // Uint32Array as array
  },
  "navmeshConfig": {
    "cellSize": 0.15,
    "cellHeight": 0.15,
    "tileSizeVoxels": 32,
    "walkableRadiusWorld": 0.3,
    "walkableClimbWorld": 0.4,
    "walkableHeightWorld": 2.0,
    "walkableSlopeAngleDegrees": 45
  },
  "editorData": {
    "terrain": {...},
    "buildings": [...],
    "walls": [...],
    "obstacles": [...]
  }
}
```

## Loading into Navcat

### Step 1: Import navcat functions

```javascript
import { generateTiledNavMesh } from 'navcat/blocks';
import { getPositionsAndIndices } from 'navcat/three';
```

### Step 2: Load exported JSON

```javascript
// Load from file
const response = await fetch('navmesh3d.json');
const exportData = await response.json();
```

### Step 3: Convert to navcat format

```javascript
const positions = new Float32Array(exportData.geometry.positions);
const indices = new Uint32Array(exportData.geometry.indices);

// Create Three.js geometry (navcat expects this format)
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setIndex(new THREE.BufferAttribute(indices, 1));
```

### Step 4: Generate tiled navmesh

```javascript
const navmeshInput = {
  positions,
  indices
};

const navmeshOptions = {
  ...exportData.navmeshConfig,
  borderSize: 4,
  minRegionArea: 8,
  mergeRegionArea: 20,
  maxSimplificationError: 1.3,
  maxEdgeLength: 12,
  maxVerticesPerPoly: 5,
  detailSampleDistance: 6,
  detailSampleMaxError: 1
};

const tiledNavMesh = generateTiledNavMesh(navmeshInput, navmeshOptions);
```

### Step 5: Create debug helpers (optional)

```javascript
import { createNavMeshHelper } from 'navcat/three';

const navMeshHelper = createNavMeshHelper(tiledNavMesh);
scene.add(navMeshHelper);
```

## Complete Example

```javascript
import * as THREE from 'three';
import { generateTiledNavMesh } from 'navcat/blocks';
import { createNavMeshHelper } from 'navcat/three';

async function loadAndGenerateNavMesh(jsonPath) {
  // Load export
  const response = await fetch(jsonPath);
  const exportData = await response.json();

  // Prepare input
  const positions = new Float32Array(exportData.geometry.positions);
  const indices = new Uint32Array(exportData.geometry.indices);

  const navmeshInput = { positions, indices };

  // Configure navmesh generation
  const navmeshOptions = {
    cellSize: exportData.navmeshConfig.cellSize,
    cellHeight: exportData.navmeshConfig.cellHeight,
    tileSizeVoxels: exportData.navmeshConfig.tileSizeVoxels,
    walkableRadiusWorld: exportData.navmeshConfig.walkableRadiusWorld,
    walkableClimbWorld: exportData.navmeshConfig.walkableClimbWorld,
    walkableHeightWorld: exportData.navmeshConfig.walkableHeightWorld,
    walkableSlopeAngleDegrees: exportData.navmeshConfig.walkableSlopeAngleDegrees,

    // Additional navcat parameters
    borderSize: 4,
    minRegionArea: 8,
    mergeRegionArea: 20,
    maxSimplificationError: 1.3,
    maxEdgeLength: 12,
    maxVerticesPerPoly: 5,
    detailSampleDistance: 6,
    detailSampleMaxError: 1
  };

  // Generate navmesh
  console.log('Generating tiled navmesh...');
  const tiledNavMesh = generateTiledNavMesh(navmeshInput, navmeshOptions);
  console.log('Navmesh generated:', tiledNavMesh);

  return { tiledNavMesh, exportData };
}

// Usage
const scene = new THREE.Scene();
const { tiledNavMesh, exportData } = await loadAndGenerateNavMesh('navmesh3d.json');

// Visualize navmesh
const navMeshHelper = createNavMeshHelper(tiledNavMesh);
scene.add(navMeshHelper);

// Visualize original geometry
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(
  new Float32Array(exportData.geometry.positions), 3
));
geometry.setIndex(new THREE.BufferAttribute(
  new Uint32Array(exportData.geometry.indices), 1
));
geometry.computeVertexNormals();

const mesh = new THREE.Mesh(
  geometry,
  new THREE.MeshStandardMaterial({ color: 0x3a5a40 })
);
scene.add(mesh);
```

## Dynamic Navmesh Updates

For destructible environments, you can regenerate tiles:

```javascript
// Remove a wall from editorData
const wallId = 'wall_123';
exportData.editorData.walls = exportData.editorData.walls.filter(
  w => w.id !== wallId
);

// Re-export geometry (in practice, do this in the editor)
// Then regenerate affected tiles
const affectedTiles = tiledNavMesh.getTilesInBounds(wallBounds);

for (const tile of affectedTiles) {
  // Regenerate tile
  const newTile = generateTiledNavMesh(navmeshInput, navmeshOptions, tile.x, tile.y);
  tiledNavMesh.updateTile(tile.x, tile.y, newTile);
}
```

## Path Finding

```javascript
import { findPath } from 'navcat';

const start = { x: 0, y: 0, z: 0 };
const end = { x: 10, y: 0, z: 10 };

const path = findPath(tiledNavMesh, start, end);

if (path) {
  console.log('Path found:', path.waypoints);
} else {
  console.log('No path found');
}
```

## Agent Spawning

```javascript
import { createCrowd } from 'navcat';

const crowd = createCrowd(tiledNavMesh, {
  maxAgents: 100,
  maxAgentRadius: 0.6
});

// Add agent
const agentId = crowd.addAgent({
  position: { x: 0, y: 0, z: 0 },
  radius: 0.3,
  height: 2.0,
  maxSpeed: 3.5,
  maxAcceleration: 8.0
});

// Set target
crowd.setAgentTarget(agentId, { x: 10, y: 0, z: 10 });

// Update (in animation loop)
function animate() {
  const deltaTime = 1 / 60;
  crowd.update(deltaTime);

  const agentPosition = crowd.getAgentPosition(agentId);
  // Update agent visual mesh position
}
```

## Coordinate System Notes

The 3D editor uses:
- **X**: Right
- **Y**: Up (height)
- **Z**: Forward

This matches Three.js standard coordinates and navcat expectations.

## Troubleshooting

### Navmesh not generating
- Check that positions and indices are valid Float32Array/Uint32Array
- Verify geometry has valid triangles (no degenerate faces)
- Ensure walkableHeightWorld is sufficient for your agents

### Holes not working
- Holes are created by excluding geometry from the terrain mesh
- Ensure obstacle type is set to 'hole' in the editor
- Terrain must be regenerated after adding/removing holes

### Agents getting stuck
- Increase walkableRadiusWorld if agents are too close to walls
- Adjust walkableClimbWorld for stairs/slopes
- Check for gaps in navmesh connectivity

## Performance Tips

- Use larger tileSizeVoxels for faster generation (but larger tiles)
- Increase cellSize/cellHeight for lower precision but faster generation
- Cache navmesh tiles and only regenerate changed tiles for dynamic updates
- Use NavMesh BVTree for faster pathfinding queries

## Next Steps

1. Test basic navmesh generation with simple geometry
2. Add agent spawning and pathfinding
3. Implement dynamic tile regeneration for destructibles
4. Integrate with game/simulation logic
