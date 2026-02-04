# 3D NavMesh Editor

A 3D editor for creating navmesh geometry compatible with navcat, supporting buildings, walls, and obstacles with height information.

## Features

- **3D Geometry**: Buildings, walls, and obstacles with configurable heights
- **Flat Terrain**: Ground plane at Z=0 with optional holes
- **Two Obstacle Types**:
  - **Holes**: Cut-outs in the terrain
  - **Prisms**: Solid obstacles standing on the terrain
- **Interactive 3D View**: Orbit, pan, and zoom controls
- **Navcat Export**: Export to navcat-compatible format with positions/indices
- **Integrated 3D Player**: Test your levels instantly with crowd simulation

## Getting Started

1. Open `editor3d/index.html` in a web browser
2. Use the toolbar to select tools and create geometry
3. Click **"Test Level"** to test in the 3D player
4. Export to navcat format when ready

### Quick Test Workflow

1. Create some buildings and walls in the editor
2. Click **"Test Level"** button
3. The 3D player opens automatically
4. Click to spawn agents, right-click to move them
5. Return to editor to refine the level

## Tools

### Building Tool (B)
- **Click and drag** to create a building footprint
- **Mouse wheel** to adjust height
- **Number keys 3-9** to change the number of sides (n-gon)
- **Shift + drag** to constrain to square proportions

### Wall Tool (W)
- **Click** to add wall path points
- **Enter** or **Esc** to finish the wall
- **Mouse wheel** to adjust wall height
- **Ctrl + Mouse wheel** to adjust wall thickness

### Obstacle Tool (O)
- **Click and drag** to create obstacle area
- **Tab** to toggle between hole and prism types
- **Mouse wheel** to adjust depth (holes) or height (prisms)

### Select Tool (S)
- **Click** to select objects
- **Drag** to move selected objects
- **Delete** to remove selected objects

## Camera Controls

- **Shift + Left drag**: Orbit camera around target
- **Middle mouse drag**: Pan camera
- **Mouse wheel**: Zoom in/out (when not using tools)

## Export

### Navcat Export
Exports geometry in navcat-compatible format:
```json
{
  "version": "1.0",
  "navmeshType": "tiled",
  "geometry": {
    "positions": [...],  // Float32Array
    "indices": [...]     // Uint32Array
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
  "editorData": {...}
}
```

## Architecture

### File Structure
```
editor3d/
├── index.html              # Editor entry point
├── editor3d.js            # Main orchestrator
├── editor3d-models.js     # Data models (Building3D, Wall3D, etc.)
├── editor3d-renderer.js   # Three.js rendering
├── editor3d-tools.js      # Interactive tools
├── editor3d-geometry.js   # 3D geometry utilities
├── editor3d-export.js     # Export to navcat format
├── player3d.html          # 3D player for testing
├── player3d.js            # Player logic with crowd simulation
└── docs/                  # Documentation files
```

### Data Models

- **Building3D**: Extruded polygon with configurable height
- **Wall3D**: Path of points with thickness and height
- **Obstacle3D**: Either a hole in terrain or a prism obstacle
- **Terrain**: Flat ground plane with bounds

### Coordinate System

- **X**: Right
- **Y**: Up (height)
- **Z**: Forward (mapped from editor Y axis)
- **Ground**: Y = 0

## Navcat Integration

The exported geometry can be loaded into navcat using:

```javascript
import { createNavMesh } from 'navcat';

const data = /* loaded JSON */;
const navmesh = await createNavMesh({
  positions: new Float32Array(data.geometry.positions),
  indices: new Uint32Array(data.geometry.indices),
  ...data.navmeshConfig
});
```

## Future Enhancements

- Non-flat terrain (heightmaps)
- Multi-level buildings with stairs
- Variable-height walls
- GLTF import/export
- Paint tools for area types (water, slow zones, etc.)
- Template building shapes
- Wall-to-building snapping
