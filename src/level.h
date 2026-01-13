#ifndef LEVEL_H
#define LEVEL_H

#include "terrain.h"
#include <cglm/cglm.h>
#include <stdbool.h>

// ============================================================================
// STRUTTURA LEVEL (Multi-Chunk Terrain)
// ============================================================================

typedef struct Level {
    Terrain* chunks;        // Array 1D (row-major) di chunk
    int chunksCountX;       // Numero chunk in X
    int chunksCountZ;       // Numero chunk in Z
    float chunkSize;        // Dimensione di ogni chunk (es. 64.0m)

    // Bounds totali del livello
    float totalSizeX;       // chunksCountX * chunkSize
    float totalSizeZ;       // chunksCountZ * chunkSize

    // Origine del livello (angolo min X, min Z)
    // Con origine centrata: originX = -totalSizeX/2, originZ = -totalSizeZ/2
    float originX;
    float originZ;

    // Statistiche (per debug)
    int chunksRendered;     // Chunk disegnati nell'ultimo frame
    int totalChunks;        // Numero totale di chunk

} Level;

// ============================================================================
// API LIVELLO
// ============================================================================

// Carica un livello da file config (.lvl)
bool level_load(Level* lvl, const char* configPath);

// Libera tutte le risorse
void level_cleanup(Level* lvl);

// ============================================================================
// WRAPPER FUNCTIONS (delegano al chunk corretto)
// ============================================================================

// Ottiene l'altezza in un punto world
// Ritorna 0.0 se fuori dai bounds
float level_get_height(Level* lvl, float worldX, float worldZ);

// Ottiene la normale del terreno
void level_get_normal(Level* lvl, float worldX, float worldZ, vec3 outNormal);

// Verifica se un punto è camminabile
bool level_is_walkable(Level* lvl, float worldX, float worldZ);

// Ottiene il chunk che contiene un punto (o NULL se fuori bounds)
Terrain* level_get_chunk_at(Level* lvl, float worldX, float worldZ);

// ============================================================================
// RENDERING
// ============================================================================

// Disegna tutti i chunk visibili (con frustum culling)
void level_draw(Level* lvl, mat4 viewProj);

// ============================================================================
// FRUSTUM CULLING UTILITIES
// ============================================================================

// Estrae i 6 piani del frustum dalla matrice viewProj
// planes[0-5]: left, right, bottom, top, near, far
void frustum_extract_planes(mat4 viewProj, vec4 planes[6]);

// Testa se un AABB interseca il frustum
// Ritorna true se almeno parzialmente visibile
bool frustum_test_aabb(vec4 planes[6], vec3 min, vec3 max);

#endif // LEVEL_H
