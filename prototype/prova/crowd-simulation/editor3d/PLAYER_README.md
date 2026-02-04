# 3D Player - Crowd Simulation

The 3D Player is a real-time crowd simulation environment for testing navmeshes created in the 3D Editor.

## Features

- **Real-time 3D rendering** with Three.js
- **Navcat integration** for pathfinding and crowd simulation
- **Agent spawning** with click interactions
- **Dynamic pathfinding** with obstacle avoidance
- **Camera controls** (orbit, pan, zoom)
- **NavMesh visualization** toggle
- **FPS monitoring**

## Quick Start

### From Editor

1. Open the 3D Editor (`index.html`)
2. Create or load a level
3. Click **"Test Level"** button
4. The player will open in a new tab with your level loaded

### Standalone

1. Open `player3d.html` directly
2. Click **"Load NavMesh"**
3. Select a navmesh export JSON file
4. The navmesh will be generated and ready for testing

## Controls

### Mouse Controls

- **Left Click**: Spawn agent at clicked position
- **Right Click**: Move all agents to clicked target
- **Shift + Drag**: Orbit camera around scene
- **Middle Mouse + Drag**: Pan camera
- **Scroll Wheel**: Zoom in/out

### Keyboard Shortcuts

- **1**: Switch to top-down view
- **2**: Switch to perspective view

### UI Controls

- **Spawn Agent**: Spawn agents at random positions
- **Clear Agents**: Remove all agents from scene
- **Show NavMesh**: Toggle navmesh visualization (green wireframe)
- **Show Geometry**: Toggle original geometry visibility
- **Agents Input**: Set number of agents to spawn at once

## How It Works

### NavMesh Generation

The player uses navcat's `generateTiledNavMesh` to create a walkable navigation mesh from the editor's exported geometry:

```javascript
const tiledNavMesh = generateTiledNavMesh(
  {
    positions: Float32Array,
    indices: Uint32Array
  },
  {
    cellSize: 0.15,
    cellHeight: 0.15,
    tileSizeVoxels: 32,
    // ... other parameters
  }
);
```

### Crowd Simulation

The crowd system manages all agents:

- **Pathfinding**: A* algorithm on navmesh polygons
- **Steering**: Smooth movement along computed paths
- **Obstacle Avoidance**: Dynamic avoidance between agents
- **Separation**: Prevents agents from overlapping

### Agent Spawning

Agents are spawned by:
1. Clicking on the geometry surface
2. Raycasting to find 3D position
3. Creating an agent on the navmesh
4. Visualizing with a cylinder mesh

### Movement

When you right-click:
1. Target position is found via raycasting
2. All agents compute paths to target
3. Crowd simulation updates agent positions
4. Visual meshes follow agent positions

## Visualization

### NavMesh (Green Wireframe)

Shows the walkable surface computed by navcat. This is the actual navigation mesh that agents use for pathfinding.

- **Polygons**: Individual walkable areas
- **Connections**: How polygons connect to each other
- **Tiles**: Tiled structure for efficient updates

### Geometry (Solid Color)

The original 3D geometry from the editor:
- Buildings (brown)
- Walls (gray)
- Terrain (green)
- Obstacles (red for prisms, holes in terrain)

### Agents (Blue Cylinders)

- **Radius**: 0.3m (configurable)
- **Height**: 2.0m (configurable)
- **Color**: Blue (normal), Red (selected)
- **Rotation**: Faces movement direction

## Performance

The player is optimized for smooth performance:

- **Target**: 60 FPS
- **Max Agents**: 100 (configurable)
- **Tiled NavMesh**: Efficient for large levels
- **Update Rate**: ~16ms per frame

### Performance Tips

1. **Reduce agent count** if FPS drops
2. **Simplify geometry** in the editor
3. **Increase tile size** for faster generation
4. **Lower detail settings** in navmesh config

## Troubleshooting

### NavMesh doesn't generate

- Check browser console for errors
- Verify geometry has valid triangles
- Ensure positions/indices are valid arrays
- Try simpler geometry first

### Agents spawn but don't move

- Check if agents are on valid navmesh
- Verify navmesh was generated successfully
- Toggle "Show NavMesh" to see walkable areas
- Try right-clicking on visible navmesh areas

### Agents get stuck

- Increase `walkableRadiusWorld` in config
- Check for narrow passages
- Verify building/wall geometry doesn't overlap
- Look for gaps in navmesh connectivity

### Low FPS

- Reduce number of agents
- Simplify geometry in editor
- Disable shadows if needed
- Use smaller navmesh area

## Integration with Editor

The player integrates seamlessly with the editor:

```javascript
// Editor exports to localStorage
localStorage.setItem('editor3DNavMesh', JSON.stringify(exportData));

// Player loads from localStorage
const data = localStorage.getItem('editor3DNavMesh');
const navmesh = await loadNavMesh(JSON.parse(data));
```

This allows instant testing without saving/loading files.

## Advanced Usage

### Custom Agent Parameters

Modify agent spawning in `player3d.js`:

```javascript
const agentParams = {
  radius: 0.3,          // Agent radius
  height: 2.0,          // Agent height
  maxSpeed: 3.5,        // Max movement speed
  maxAcceleration: 8.0, // How fast agent can accelerate
  separationWeight: 2.0 // Strength of separation force
};
```

### Camera Presets

Add custom camera positions:

```javascript
// Top-down orthographic view
camera.position.set(0, 100, 0);
camera.lookAt(0, 0, 0);

// Isometric view
camera.position.set(30, 30, 30);
camera.lookAt(0, 0, 0);
```

### NavMesh Debug Helpers

Toggle different visualizations:

```javascript
import {
  createNavMeshHelper,
  createNavMeshPortalsHelper,
  createNavMeshBvTreeHelper
} from 'navcat/three';

// Show portals between tiles
const portalsHelper = createNavMeshPortalsHelper(tiledNavMesh);
scene.add(portalsHelper);
```

## Data Flow

```
Editor 3D
  ↓ (Export geometry)
  ↓ positions + indices
  ↓ (localStorage)
Player 3D
  ↓ (generateTiledNavMesh)
NavMesh
  ↓ (crowd.create)
Crowd Simulation
  ↓ (addAgent, agentGoto)
Agents
  ↓ (update loop)
Visual Update
```

## Comparison with 2D Player

| Feature | 2D Player | 3D Player |
|---------|-----------|-----------|
| Rendering | Canvas 2D | Three.js WebGL |
| Camera | Pan/Zoom | Orbit/Pan/Zoom |
| NavMesh | Flat 2D | Full 3D |
| Buildings | 2D polygons | 3D meshes with height |
| Walls | 2D thickness | 3D prisms |
| Obstacles | 2D holes | 3D holes/prisms |
| Agent View | Top-down only | Multiple angles |
| Performance | Very fast | Fast (WebGL) |

## Future Enhancements

- [ ] Agent selection with click
- [ ] Formation movement
- [ ] Different agent types (sizes, speeds)
- [ ] Debug overlays (paths, velocities)
- [ ] Recording/playback
- [ ] Export agent data to CSV
- [ ] Multiple target points
- [ ] Waypoint system

## Technical Details

### NavMesh Config

```javascript
{
  cellSize: 0.15,              // Voxel size
  cellHeight: 0.15,            // Voxel height
  tileSizeVoxels: 32,          // Tile size in voxels
  walkableRadiusWorld: 0.3,    // Agent radius
  walkableClimbWorld: 0.4,     // Max step height
  walkableHeightWorld: 2.0,    // Min ceiling height
  walkableSlopeAngleDegrees: 45 // Max slope
}
```

### Crowd Parameters

```javascript
{
  maxAgents: 100,        // Max concurrent agents
  maxAgentRadius: 0.6    // Max agent size
}
```

## Resources

- [Navcat Documentation](https://github.com/isaac-mason/navcat)
- [Three.js Documentation](https://threejs.org/docs/)
- [Recast/Detour](https://github.com/recastnavigation/recastnavigation) (navcat is based on this)

---

**Enjoy testing your 3D navmeshes!** 🎮🚶‍♂️
