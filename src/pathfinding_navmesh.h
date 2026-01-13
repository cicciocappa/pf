#ifndef PATHFINDING_NAVMESH_H
#define PATHFINDING_NAVMESH_H

#include <cglm/cglm.h>
#include <stdbool.h>
#include <stdint.h>
#include "pathfinding.h"

// Forward declarations
struct Level;

// ============================================================================
// NAVMESH DATA STRUCTURES
// ============================================================================

// Un vertice del navmesh
typedef struct NavVertex {
    vec3 position;  // Posizione 3D del vertice
    int index;      // Indice per riferimenti
} NavVertex;

// Un triangolo del navmesh
typedef struct NavTriangle {
    int vertices[3];     // Indici dei 3 vertici
    int neighbors[3];    // Indici dei 3 triangoli adiacenti (-1 se bordo)
    vec3 center;         // Centro del triangolo (per A*)
    float area;          // Area del triangolo
    bool walkable;       // Se questo triangolo è camminabile
} NavTriangle;

// Struttura principale del Navmesh
typedef struct NavMesh {
    NavVertex* vertices;      // Array di vertici
    int vertex_count;
    int vertex_capacity;

    NavTriangle* triangles;   // Array di triangoli
    int triangle_count;
    int triangle_capacity;

    // Bounds del navmesh per queries veloci
    vec3 min_bounds;
    vec3 max_bounds;

    // Metadati
    float grid_cell_size;     // Dimensione cella griglia usata per generare
    int layer_id;             // ID del layer (per multi-layer navmesh futuro)
} NavMesh;

// ============================================================================
// NAVMESH LOADING & INITIALIZATION
// ============================================================================

// Inizializza un navmesh vuoto
bool navmesh_init(NavMesh* nm, int initial_tri_capacity);

// Pulisce un navmesh
void navmesh_cleanup(NavMesh* nm);

// Carica un navmesh da file (formato custom o OBJ)
bool navmesh_load_from_file(NavMesh* nm, const char* filepath);

// Calcola bounds e metadati dopo il caricamento
void navmesh_calculate_metadata(NavMesh* nm);

// ============================================================================
// NAVMESH QUERIES
// ============================================================================

// Trova il triangolo che contiene un punto world (x, z)
int navmesh_find_triangle(NavMesh* nm, float world_x, float world_z);

// Verifica se un punto è dentro un triangolo (test 2D su piano XZ)
bool navmesh_point_in_triangle(NavMesh* nm, int tri_index, float x, float z);

// Ottiene l'altezza Y interpolata su un triangolo
float navmesh_get_height_on_triangle(NavMesh* nm, int tri_index, float x, float z);

// ============================================================================
// PATHFINDING ON NAVMESH
// ============================================================================

// Trova un path usando A* sul navmesh
// Ritorna un Path* (stesso tipo del sistema grid-based per compatibilità)
Path* navmesh_find_path(struct Level* lvl, NavMesh* nm, vec3 start, vec3 goal);

// Smoothing del path usando Funnel Algorithm
void navmesh_smooth_path(Path* path, NavMesh* nm);

// ============================================================================
// DEBUG & VISUALIZATION
// ============================================================================

// Disegna il navmesh (wireframe dei triangoli)
void navmesh_debug_draw(NavMesh* nm, mat4 viewProj, vec3 color);

// Disegna un path calcolato sul navmesh
void navmesh_debug_draw_path(Path* path, mat4 viewProj, vec3 color);

// Stampa statistiche del navmesh
void navmesh_print_stats(NavMesh* nm);

// ============================================================================
// BENCHMARK
// ============================================================================

// Esegue un benchmark confrontando grid vs navmesh
void navmesh_run_benchmark(struct Level* lvl, NavMesh* nm, int iterations);

#endif // PATHFINDING_NAVMESH_H
