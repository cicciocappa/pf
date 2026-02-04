# Quick Start Guide - 3D NavMesh Editor

Get started with the 3D NavMesh Editor in 5 minutes!

## Step 1: Open the Editor

Simply open `index.html` in your web browser:

```bash
# Using a simple HTTP server (recommended)
cd editor3d
python3 -m http.server 8000
# Then visit http://localhost:8000

# Or just open directly
# Double-click index.html or drag it into your browser
```

## Step 2: Load Example Project

1. Click the **Load** button in the toolbar
2. Select `example-project.json`
3. You should see:
   - 3 buildings (square, hexagon, rectangle)
   - 2 walls (perimeter and divider)
   - 2 obstacles (prism and hole)

## Step 3: Explore the Scene

**Camera Controls:**
- **Orbit**: Hold Shift + drag left mouse
- **Pan**: Drag middle mouse button
- **Zoom**: Scroll mouse wheel

Try rotating the view to see the 3D geometry!

## Step 4: Create Your First Building

1. Press **B** (or click "Building" in toolbar)
2. Click and drag on the ground to create a building
3. **Scroll mouse wheel** to adjust height
4. **Press 6** to make it a hexagon
5. Release to place

## Step 5: Create a Wall

1. Press **W** (or click "Wall")
2. Click multiple points to create a wall path
3. **Scroll** to adjust height
4. **Ctrl+Scroll** to adjust thickness
5. Press **Enter** to finish

## Step 6: Create an Obstacle

1. Press **O** (or click "Obstacle")
2. Click and drag to create a rectangular obstacle
3. Press **Tab** to toggle between:
   - **Hole**: Cut-out in the terrain
   - **Prism**: Solid obstacle
4. **Scroll** to adjust depth/height

## Step 7: Select and Edit

1. Press **S** (or click "Select")
2. Click on any object to select it
3. **Drag** to move the object
4. **Delete** key to remove it
5. Properties panel shows object details

## Step 8: Test Your Level!

1. Click **Test Level** button in toolbar
2. The 3D player opens in a new tab
3. Your level is automatically loaded
4. **Left-click** anywhere to spawn agents
5. **Right-click** to move agents to a target
6. Watch them navigate around buildings and walls!

### Player Controls

- **Left Click**: Spawn agent
- **Right Click**: Set movement target
- **Shift + Drag**: Orbit camera
- **Middle Mouse**: Pan camera
- **Scroll**: Zoom

## Step 9: Export for Navcat (Optional)

1. Click **Export Navcat** in toolbar
2. Save the JSON file
3. The file contains:
   - 3D geometry (positions and indices)
   - Navmesh generation config
   - Original editor data

## Step 10: Advanced Testing

1. Open `player3d.html` directly
2. Click "Load NavMesh"
3. Select your exported JSON file
4. Test agent navigation

## Step 11: Integrate with Navcat (Optional)

See `INTEGRATION.md` for complete integration guide.

Quick example:

```javascript
import { generateTiledNavMesh } from 'navcat/blocks';

// Load exported JSON
const data = await fetch('your-export.json').then(r => r.json());

// Generate navmesh
const navmesh = generateTiledNavMesh(
  {
    positions: new Float32Array(data.geometry.positions),
    indices: new Uint32Array(data.geometry.indices)
  },
  data.navmeshConfig
);
```

## Keyboard Shortcuts Cheat Sheet

### Tools
- **B**: Building tool
- **W**: Wall tool
- **O**: Obstacle tool
- **S**: Select tool

### Building Tool
- **3-9**: Change number of sides
- **Scroll**: Adjust height
- **Shift+Drag**: Square constraint

### Wall Tool
- **Scroll**: Adjust height
- **Ctrl+Scroll**: Adjust thickness
- **Enter**: Finish wall
- **Esc**: Cancel

### Obstacle Tool
- **Tab**: Toggle hole/prism
- **Scroll**: Adjust depth/height

### Select Tool
- **Delete**: Remove selected object

### Camera
- **Shift+Drag**: Orbit
- **Middle Drag**: Pan
- **Scroll**: Zoom

## Tips and Tricks

### Creating Complex Buildings
1. Start with a simple shape
2. Adjust height and scale
3. Use different polygon sides for variety
4. Combine multiple buildings for complex structures

### Making Enclosures
1. Use Wall tool to create perimeter
2. Connect points back to start
3. Press Enter to complete
4. Adjust thickness to suit your needs

### Terrain Holes
1. Use Obstacle tool
2. Press Tab until it says "hole"
3. Draw where you want cut-out
4. Perfect for pits, water, etc.

### Organizing Your Scene
1. Use Select tool to rearrange
2. Buildings can be moved after creation
3. Walls and obstacles can also be relocated
4. Save often!

### Performance
- The editor handles hundreds of objects smoothly
- Complex walls are automatically segmented
- Mesh caching keeps rendering fast

## Troubleshooting

### Nothing appears when I create objects
- Make sure you're not at extreme zoom levels
- Try zooming out or resetting camera view
- Check that you completed the tool action (e.g., Enter for walls)

### Export button does nothing
- Open browser console (F12) to check for errors
- Ensure you have objects in the scene
- Try creating at least one building or wall first

### Can't move camera
- Release any tool actions first
- Try pressing Esc to cancel current operation
- Make sure you're using Shift+drag for orbit

### Objects appear black
- This is normal - they're receiving lighting
- Try rotating the view to see surfaces better
- The editor uses realistic 3D lighting

## Next Steps

1. ✅ Create a simple test level
2. ✅ Export to navcat format
3. ✅ Load in test viewer
4. 📖 Read `INTEGRATION.md` for navcat integration
5. 🚀 Build your game/simulation!

## Example Workflow

**Creating a City Block:**

1. Press **B**, create 3-4 buildings of various sizes
2. Use **3-9** keys to vary shapes (squares, hexagons, etc.)
3. Adjust heights with scroll wheel (2-6 meters)
4. Press **W**, draw perimeter walls around the block
5. Press **O**, add some prism obstacles (crates, barriers)
6. Press **Tab**, add hole obstacles (manholes, pits)
7. Press **S**, fine-tune positions
8. Click **Test Level** to see it in action!
9. Spawn some agents and watch them navigate
10. Return to editor, refine, and test again!

## Resources

- `README.md` - Full feature documentation
- `INTEGRATION.md` - Navcat integration guide
- `IMPLEMENTATION_SUMMARY.md` - Technical details
- `example-project.json` - Sample project to load

## Getting Help

Check the help overlay in the bottom-right corner of the editor for quick reference of all controls!

---

**Have fun building 3D navmeshes!** 🎉🏗️
