# Integrazione NavMesh nel Gioco

## Come Usare il Sistema NavMesh

### 1. Carica la NavMesh

```c
#include "pathfinding_navmesh.h"

// Nel tuo codice di inizializzazione del livello
NavMesh navmesh;
if (!navmesh_load_from_file(&navmesh, "resources/levels/level1_navmesh.txt")) {
    printf("Errore: impossibile caricare navmesh!\n");
}
```

### 2. Usa NavMesh per Pathfinding

```c
// Invece di usare pathfinding_find_path (grid-based):
Path* grid_path = pathfinding_find_path(level, start, goal, -1);

// Usa navmesh_find_path:
Path* navmesh_path = navmesh_find_path(level, &navmesh, start, goal);

// Opzionale: smooth il path
if (navmesh_path) {
    navmesh_smooth_path(navmesh_path, &navmesh);
}
```

### 3. Visualizza la NavMesh (Debug)

```c
// Nel tuo rendering loop di debug
vec3 navmesh_color = {0.0f, 1.0f, 1.0f}; // Ciano
navmesh_debug_draw(&navmesh, viewProj, navmesh_color);

// Per visualizzare il path
if (navmesh_path) {
    vec3 path_color = {1.0f, 0.0f, 1.0f}; // Magenta
    navmesh_debug_draw_path(navmesh_path, viewProj, path_color);
}
```

### 4. Cleanup

```c
// Quando chiudi il livello
navmesh_cleanup(&navmesh);
if (navmesh_path) {
    path_free(navmesh_path);
}
```

## Confronto tra i Due Sistemi

### Grid-Based (Attuale)
**Pro:**
- Semplice da implementare
- Veloce per livelli piccoli
- Facile debug (griglia visibile)

**Contro:**
- Path "a scalini" (richiede smoothing)
- Memoria proporzionale alla risoluzione griglia
- Difficile gestire terreni complessi

### NavMesh
**Pro:**
- Path più naturali e fluidi
- Memoria proporzionale alla complessità del terreno
- Ottimo per grandi livelli aperti
- Supporta facilmente terreni multi-livello

**Contro:**
- Richiede preprocessing (generazione navmesh)
- Più complesso da debuggare
- A* leggermente più lento su livelli molto semplici

## Benchmark

Per confrontare le prestazioni:

```c
// Testa grid-based
pathfinding_run_benchmark(level);

// Testa navmesh
navmesh_run_benchmark(level, &navmesh, 1000);
```

## Esempio di Integrazione nel Player

```c
// In player.h, aggiungi:
typedef enum {
    PATHFINDING_GRID,
    PATHFINDING_NAVMESH
} PathfindingMode;

// In player.c, modifica player_handle_input:
void player_handle_input(Player *p, Game *g, mat4 view, mat4 proj,
                         Level *level, NavMesh* navmesh, PathfindingMode mode) {
    // ... ray casting ...

    if (ray_level_intersect(level, rayOrigin, rayDir, hitPoint)) {
        Path* path = NULL;

        if (mode == PATHFINDING_NAVMESH && navmesh) {
            path = navmesh_find_path(level, navmesh, p->position, hitPoint);
            if (path) navmesh_smooth_path(path, navmesh);
        } else {
            path = pathfinding_find_path(level, p->position, hitPoint, -1);
        }

        if (path) {
            player_set_path(p, path);
        }
    }
}
```

## Toggle Runtime tra i Due Sistemi

```c
// Aggiungi un tasto per switchare
if (glfwGetKey(g->window, GLFW_KEY_N) == GLFW_PRESS) {
    g->pathfindingMode = (g->pathfindingMode == PATHFINDING_GRID)
                         ? PATHFINDING_NAVMESH
                         : PATHFINDING_GRID;
    printf("Pathfinding mode: %s\n",
           (g->pathfindingMode == PATHFINDING_GRID) ? "GRID" : "NAVMESH");
}
```
