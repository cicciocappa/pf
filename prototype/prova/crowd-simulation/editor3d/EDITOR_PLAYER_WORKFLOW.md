# Editor → Player Workflow

Complete workflow for creating and testing 3D navmesh levels.

## Overview

The 3D Editor and 3D Player work together seamlessly:

```
┌─────────────┐
│   Editor    │  Create buildings, walls, obstacles
│  (Design)   │  Adjust heights, positions, shapes
└──────┬──────┘
       │
       │ Click "Test Level"
       │
       ↓
┌─────────────┐
│   Player    │  Spawn agents, test navigation
│   (Test)    │  Watch crowd simulation
└──────┬──────┘
       │
       │ Identify issues
       │
       ↓
┌─────────────┐
│   Editor    │  Refine level design
│  (Refine)   │  Adjust problem areas
└─────────────┘
```

## Step-by-Step Workflow

### Phase 1: Design in Editor

1. **Open Editor**
   ```
   Open editor3d/index.html
   ```

2. **Create Geometry**
   - **Buildings**: Press B, drag to create, scroll for height
   - **Walls**: Press W, click points, Enter to finish
   - **Obstacles**: Press O, drag area, Tab to toggle type

3. **Arrange Layout**
   - Press S to select and move objects
   - Use properties panel to fine-tune values
   - Save project for later (Save button)

### Phase 2: Test in Player

4. **Launch Player**
   - Click **"Test Level"** button
   - Player opens in new tab automatically
   - Level is loaded instantly (no file export needed)

5. **Spawn Agents**
   - **Left-click** on ground to spawn agents
   - Agents appear as blue cylinders
   - Increase "Agents" number to spawn multiple at once

6. **Test Navigation**
   - **Right-click** on target location
   - All agents pathfind to target
   - Watch them navigate around obstacles

7. **Observe Behavior**
   - Do agents get stuck?
   - Are there unreachable areas?
   - Is the navmesh continuous?
   - Do narrow passages work?

### Phase 3: Refine

8. **Identify Issues**
   - Toggle "Show NavMesh" to see walkable areas
   - Look for gaps or discontinuities
   - Note areas where agents struggle

9. **Return to Editor**
   - Switch back to editor tab (don't close it!)
   - Your level is still there

10. **Make Adjustments**
    - Widen narrow passages
    - Remove problematic obstacles
    - Adjust wall positions
    - Fix disconnected areas

11. **Test Again**
    - Click "Test Level" again
    - Player reloads with updated level
    - Verify improvements

### Phase 4: Finalize

12. **Export (Optional)**
    - Once satisfied, click "Export Navcat"
    - Save JSON for integration with your app
    - Or save project for future editing

## Data Flow

### Editor → Player

```javascript
// Editor saves to localStorage
const exporter = new NavcatExporter(this.editorData);
const data = exporter.export();
localStorage.setItem('editor3DNavMesh', JSON.stringify(data));

// Opens player in new window
window.open('player3d.html?fromEditor=1', '_blank');
```

### Player Loads

```javascript
// Player checks URL parameter
if (urlParams.get('fromEditor') === '1') {
  const data = localStorage.getItem('editor3DNavMesh');
  loadNavMesh(JSON.parse(data));
}
```

### NavMesh Generation

```javascript
// Player generates navmesh from geometry
const tiledNavMesh = generateTiledNavMesh(
  {
    positions: new Float32Array(data.geometry.positions),
    indices: new Uint32Array(data.geometry.indices)
  },
  data.navmeshConfig
);
```

## Testing Checklist

### Basic Connectivity
- [ ] All areas are reachable
- [ ] No isolated islands (unless intended)
- [ ] NavMesh is continuous

### Navigation Quality
- [ ] Agents can navigate around buildings
- [ ] Walls block agents properly
- [ ] Holes prevent agents from falling in
- [ ] Narrow passages work correctly

### Performance
- [ ] 60 FPS with 10+ agents
- [ ] NavMesh generates in < 5 seconds
- [ ] No stuttering during movement

### Edge Cases
- [ ] Corners and tight turns work
- [ ] Agents don't get stuck on walls
- [ ] Multiple agents can pass each other
- [ ] Agent size (radius) is appropriate

## Common Issues and Solutions

### Issue: Agents spawn but don't move

**Cause**: Not on valid navmesh
**Solution**:
- Toggle "Show NavMesh" in player
- Spawn agents only on green areas
- Return to editor and ensure terrain covers spawn area

### Issue: Agents get stuck in corners

**Cause**: Geometry too tight for agent radius
**Solution**:
- Increase gap between walls in editor
- Reduce `walkableRadiusWorld` in config
- Round sharp corners

### Issue: Agents can't pass through doorways

**Cause**: Opening narrower than 2x agent radius
**Solution**:
- Widen doorways in editor (at least 1m for 0.3m radius)
- Adjust wall positions
- Test with "Show NavMesh" to verify passage

### Issue: NavMesh has gaps

**Cause**: Buildings/walls overlap or geometry errors
**Solution**:
- Check for overlapping objects in editor
- Ensure buildings don't intersect walls
- Verify terrain mesh is continuous

### Issue: Low FPS in player

**Cause**: Too many agents or complex geometry
**Solution**:
- Reduce agent count
- Simplify geometry in editor
- Increase tile size in config

## Advanced Techniques

### Testing Different Agent Sizes

Modify in `player3d.js`:
```javascript
const agentParams = {
  radius: 0.5,  // Larger agent
  height: 2.0,
  maxSpeed: 3.0
};
```

Test how different sizes navigate your level.

### Stress Testing

1. Spawn 50+ agents at once
2. Set distant target
3. Watch for:
   - Performance degradation
   - Traffic jams
   - Stuck agents

### Visualization Tips

In player:
- **Toggle NavMesh**: See walkable surface
- **Toggle Geometry**: Focus on navmesh only
- **Top View (press 1)**: Better overview
- **Perspective View (press 2)**: Realistic view

## Iterative Design Process

### Iteration 1: Basic Layout
- Create main buildings and perimeter
- Test: Can agents move around?

### Iteration 2: Add Details
- Add interior walls and obstacles
- Test: Are all areas accessible?

### Iteration 3: Fine-tuning
- Adjust dimensions based on agent behavior
- Test: Smooth navigation everywhere?

### Iteration 4: Polish
- Add decorative obstacles (prisms)
- Add hazards (holes)
- Test: Final verification

## Best Practices

### In Editor

1. **Start simple**: Basic shapes first
2. **Test early**: Test after major changes
3. **Save often**: Use Save button frequently
4. **Organize**: Group related objects logically

### In Player

1. **Multiple angles**: Use camera controls
2. **Different spawn points**: Test various locations
3. **Multiple targets**: Try different destinations
4. **Agent counts**: Test with 1, 10, 50 agents

### General

1. **Keep editor tab open**: Switch back and forth
2. **Document issues**: Note problems as you find them
3. **Incremental changes**: Small adjustments, then re-test
4. **Version control**: Save different iterations

## Keyboard Shortcuts Summary

### Editor
- **B**: Building tool
- **W**: Wall tool
- **O**: Obstacle tool
- **S**: Select tool
- **3-9**: Building sides
- **Tab**: Toggle obstacle type
- **Del**: Delete selected

### Player
- **1**: Top view
- **2**: Perspective view
- **Left Click**: Spawn agent
- **Right Click**: Move agents
- **Shift+Drag**: Orbit camera

## Example Session

```
09:00 - Open editor, create basic layout (4 buildings, perimeter wall)
09:15 - Test Level → Spawn agents → Works!
09:20 - Return to editor, add interior walls
09:30 - Test Level → Agents get stuck in corner
09:35 - Edit corner wall, widen passage
09:40 - Test Level → Smooth navigation!
09:45 - Add obstacles and holes
09:55 - Final test with 50 agents → Success!
10:00 - Export Navcat, save project
```

## Conclusion

The Editor → Player workflow enables rapid iteration:

1. **Design** in editor (3D visual tools)
2. **Test** in player (real agents, real simulation)
3. **Refine** based on observed behavior
4. **Repeat** until perfect!

This tight feedback loop dramatically speeds up level design and ensures your navmesh works correctly before integration.

---

**Happy level designing!** 🏗️➡️🎮
