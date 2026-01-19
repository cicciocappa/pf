# NavMesh Editor - JSON File Formats

This document describes the JSON file formats produced by the NavMesh Editor.

## Overview

The editor produces two separate JSON files:

| File | Description | Export Button |
|------|-------------|---------------|
| `map.json` | The navigable area with obstacles | "Export Map" |
| `navmesh.json` | The generated navigation mesh | "Export NavMesh" |

---

## Map File (`map.json`)

The map file defines the navigable area as a polygon with holes (obstacles).

### Structure

```json
{
  "outer": [
    { "x": number, "y": number },
    { "x": number, "y": number },
    ...
  ],
  "holes": [
    [
      { "x": number, "y": number },
      { "x": number, "y": number },
      ...
    ],
    ...
  ]
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `outer` | `Point[]` | Array of vertices defining the outer boundary of the navigable area. Points are in drawing order (typically counter-clockwise). |
| `holes` | `Point[][]` | Array of polygons representing obstacles/holes. Each hole is an array of vertices in drawing order. Can be empty `[]` if there are no obstacles. |

### Point Object

| Field | Type | Description |
|-------|------|-------------|
| `x` | `number` | X coordinate in pixels |
| `y` | `number` | Y coordinate in pixels |

### Example

```json
{
  "outer": [
    { "x": 50, "y": 50 },
    { "x": 750, "y": 50 },
    { "x": 750, "y": 550 },
    { "x": 50, "y": 550 }
  ],
  "holes": [
    [
      { "x": 200, "y": 200 },
      { "x": 300, "y": 200 },
      { "x": 300, "y": 300 },
      { "x": 200, "y": 300 }
    ],
    [
      { "x": 450, "y": 150 },
      { "x": 550, "y": 200 },
      { "x": 500, "y": 350 },
      { "x": 400, "y": 280 }
    ]
  ]
}
```

---

## NavMesh File (`navmesh.json`)

The navmesh file contains the navigation mesh generated from the map using Constrained Delaunay Triangulation followed by the Hertel-Mehlhorn algorithm for convex polygon merging.

### Structure

```json
{
  "navMesh": [
    [
      { "x": number, "y": number },
      { "x": number, "y": number },
      ...
    ],
    ...
  ]
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `navMesh` | `Point[][]` | Array of convex polygons. Each polygon is an array of vertices. Polygons are guaranteed to be convex and cover the navigable area (outer polygon minus holes). |

### Polygon Properties

- Each polygon in the navmesh is **convex**
- Polygons **do not overlap**
- Polygons **share edges** with adjacent polygons (no gaps)
- The union of all polygons equals the navigable area
- Polygons have **3 or more vertices** (triangles or larger convex polygons)

### Example

```json
{
  "navMesh": [
    [
      { "x": 50, "y": 50 },
      { "x": 200, "y": 50 },
      { "x": 200, "y": 200 },
      { "x": 50, "y": 200 }
    ],
    [
      { "x": 200, "y": 50 },
      { "x": 400, "y": 50 },
      { "x": 400, "y": 150 },
      { "x": 200, "y": 200 }
    ],
    [
      { "x": 300, "y": 300 },
      { "x": 450, "y": 280 },
      { "x": 500, "y": 350 },
      { "x": 400, "y": 400 },
      { "x": 300, "y": 380 }
    ]
  ]
}
```

---

## Coordinate System

- **Origin**: Top-left corner of the canvas
- **X-axis**: Increases to the right
- **Y-axis**: Increases downward (standard canvas/screen coordinates)
- **Units**: Pixels

```
(0,0) ────────────────► X
  │
  │
  │
  │
  ▼
  Y
```

---

## Usage with Player

To use these files with the NavMesh Player (`player.html`):

1. Load the map file using "Load Map" button
2. Load the navmesh file using "Load NavMesh" button
3. Click on the canvas to set start and end points
4. The player will compute the shortest path using A* and smooth it using the Funnel Algorithm

---

## Algorithms

### Map to NavMesh Generation

1. **Constrained Delaunay Triangulation (CDT)**: The map polygon with holes is triangulated using the poly2tri library, respecting the boundaries and holes as constraints.

2. **Hertel-Mehlhorn Algorithm**: Adjacent triangles are merged into larger convex polygons when possible, reducing the total number of polygons while maintaining convexity.

### Pathfinding (in Player)

1. **A* Search**: Finds the optimal path through the navmesh polygons using polygon centers as nodes and shared edges as connections.

2. **Funnel Algorithm (String Pulling)**: Smooths the path by finding the shortest path through the portal edges, eliminating unnecessary waypoints.
