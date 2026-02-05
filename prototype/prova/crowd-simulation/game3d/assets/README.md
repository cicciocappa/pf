# Assets Structure

This folder contains 3D assets for the game.

## Buildings

Each building type has its own folder with GLTF files for different damage states:

```
buildings/
  guard_tower/
    intact.glb      - Full health (100% - 76% HP)
    damaged.glb     - Damaged (75% - 36% HP)
    critical.glb    - Critical (35% - 1% HP)
    destroyed.glb   - Destroyed (0% HP)
  ballista_tower/
    ...
  barracks/
    ...
  temple/
    ...
  treasury/
    ...
  gatehouse/
    ...
```

### Building Types

| Type | Description | Has Animated Element |
|------|-------------|---------------------|
| GUARD_TOWER | Basic defensive tower with archers | Yes (archer billboard) |
| BALLISTA_TOWER | Heavy siege defense tower | Yes (rotating ballista) |
| BARRACKS | Spawns defender units | No |
| TEMPLE | Sacred building with magical properties | No |
| TREASURY | Objective - player must reach this | No |
| GATEHOUSE | Gate in walls - can be opened/closed | No |

## Walls

```
walls/
  wall_segment.glb    - Template for procedural walls (future)
  wall_damaged.glb    - Damaged wall section
  wall_rubble.glb     - Destroyed wall rubble
```

## Effects

```
effects/
  smoke_particles.png - Smoke sprite sheet
  fire_sprite.png     - Fire sprite sheet
```

## Animated Elements

```
animated/
  ballista.glb        - Rotating ballista model
  cannon.glb          - Cannon with recoil animation
  archer_sprite.png   - Archer billboard sprite sheet
```

## Asset Guidelines

### Scale
- Buildings are designed at scale 1.0 = 1 meter
- Editor places buildings with configurable scale (default 5m)
- Y is up axis

### Origin
- Building origin should be at ground level, centered

### Materials
- Use simple PBR materials
- Keep texture count low for performance
- Prefer vertex colors for low-poly style

### File Format
- Use GLB (binary GLTF) for smaller file size
- Include materials in the GLB file
