#ifndef PATHFINDING_H
#define PATHFINDING_H

#include <stdbool.h>
#include <stdint.h>
#include <cglm/cglm.h>

// Forward declarations (opaque pointers)
struct Level;
struct Terrain;

// ============================================================================
// PATHFINDING GRID
// ============================================================================

#define PATHGRID_SIZE 64  // 64x64 grid per chunk (1m risoluzione)

typedef struct {
    uint8_t* grid;           // 64x64 walkability grid (0=blocked, 1=walkable)
    int layer_id;            // ID del layer verticale (0 = ground level)
    float grid_cell_size;    // Dimensione cella in metri (tipicamente 1.0m)
    int grid_width;          // Larghezza griglia (64)
    int grid_height;         // Altezza griglia (64)
} PathGrid;

// ============================================================================
// PATH REPRESENTATION
// ============================================================================

typedef struct {
    vec3* waypoints;         // Array di posizioni world
    int waypoint_count;      // Numero totale di waypoints
    int capacity;            // Capacità allocata
    int layer_id;            // Layer su cui si trova questo path
} Path;

// ============================================================================
// PATHFINDING CORE API
// ============================================================================

// Inizializzazione/cleanup sistema pathfinding
void pathfinding_init(void);
void pathfinding_cleanup(void);

// PathGrid management
bool pathgrid_init(PathGrid* pg, int width, int height, float cell_size);
void pathgrid_cleanup(PathGrid* pg);

// Build pathgrid da walkmap ad alta risoluzione
// walkmap: array unsigned char (0-255, >128 = walkable)
// walkmap_width/height: dimensioni della walkmap originale (es. 1024x1024)
bool pathgrid_build(PathGrid* pg, unsigned char* walkmap, int walkmap_width, int walkmap_height);

// Verifica se una cella della griglia è walkable
bool pathgrid_is_walkable(PathGrid* pg, int grid_x, int grid_z);

// ============================================================================
// PATHFINDING A*
// ============================================================================

// Trova path tra due posizioni world
// start/goal: posizioni in coordinate world
// level: puntatore al livello (per accesso ai chunk)
// zone_id: -1 per nessuna restrizione, >=0 per limitare a zona specifica
// Returns: Path* (da liberare con path_free) o NULL se non trovato
Path* pathfinding_find_path(struct Level* lvl, vec3 start, vec3 goal, int zone_id);


// ============================================================================
// PATH MANIPULATION
// ============================================================================

// Crea nuovo path
Path* path_create(int initial_capacity);

// Aggiungi waypoint al path
bool path_add_waypoint(Path* path, vec3 waypoint);

// Path smoothing (string-pulling per rimuovere zigzag)
void path_smooth(Path* path);

// Libera memoria path
void path_free(Path* path);

// Clona path esistente
Path* path_clone(Path* path);

// ============================================================================
// COORDINATE CONVERSION
// ============================================================================

// Converti coordinate world → grid (all'interno di un chunk)
// Returns: true se la posizione è dentro il chunk, false altrimenti
bool world_to_grid(struct Terrain* chunk, vec3 world_pos, int* out_x, int* out_z);

// Converti coordinate grid → world (centro della cella)
void grid_to_world(struct Terrain* chunk, int grid_x, int grid_z, vec3 out_world);

// ============================================================================
// DEBUG UTILITIES
// ============================================================================

// Render pathgrid overlay (verde=walkable, rosso=blocked)
void pathfinding_debug_draw_grid(struct Level* lvl, int chunk_idx, mat4 viewProj);

// Render path come linea colorata
void pathfinding_debug_draw_path(Path* path, mat4 viewProj, vec3 color);

// Stampa statistiche performance
void pathfinding_print_stats(void);
void pathfinding_reset_stats(void);

#endif // PATHFINDING_H
