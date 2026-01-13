#ifndef TERRAIN_H
#define TERRAIN_H

#include <glad/glad.h>
#include <cglm/cglm.h>
#include <stdbool.h>
#include "pathfinding.h"

// ============================================================================
// CONFIGURAZIONE GLOBALE (Da usare anche nel Node Setup di Blender!)
// ============================================================================
// Con 16-bit, possiamo permetterci un range ampio senza perdere precisione.
// 0 (Nero) = -64 metri
// 65535 (Bianco) = +192 metri
#define TERRAIN_BAKE_MIN_HEIGHT  -64.0f  
#define TERRAIN_BAKE_MAX_HEIGHT   192.0f  

typedef struct Terrain {
    // --- DATI LOGICI (FISICA) ---
    float* heightMap;       // Array di float (metri reali)
    unsigned char* walkMap; // Array di byte (0 = bloccato, 255 = libero)

    int gridWidth;          // Risoluzione della griglia (es. 1024)
    int gridHeight;

    // --- PATHFINDING ---
    PathGrid pathgrid;      // Griglia 64x64 per A* pathfinding

// --- GPU Resources ---
    GLuint vao;
    GLuint vbo;
    int vertexCount; // <--- FONDAMENTALE per glDrawArrays
    
    // Shader & Uniforms
    GLuint shader;
    GLint loc_uVP, loc_uModel, loc_uTexture, loc_uLightDir, loc_uAmbient;
    
    // Texture Diffuse (Albedo)
    GLuint texture;
    
    // Trasformazione locale (se serve, altrimenti Identity)
    mat4 modelMatrix;
    
    // Dimensioni del chunk nel mondo (per convertire WorldPos -> GridCoords)
    float worldSize;        // Es. 64.0f o 100.0f metri
    float halfSize;         // Cache per calcoli veloci

    // Offset del chunk nel mondo (per sistema multi-chunk)
    float offsetX;          // Posizione X dell'angolo del chunk
    float offsetZ;          // Posizione Z dell'angolo del chunk

    // Bounds per frustum culling (calcolati da heightmap)
    float minY;             // Altezza minima nel chunk
    float maxY;             // Altezza massima nel chunk

} Terrain;

// Inizializza caricando i dati "baked"
// offsetX, offsetZ: posizione dell'angolo del chunk nel mondo
bool terrain_init_hybrid(Terrain* t,
                         const char* objPath,
                         const char* heightMapPath,
                         const char* walkMaskPath,
                         float worldSize,
                         float offsetX,
                         float offsetZ);

// Verifica se un punto è dentro i bounds del chunk
bool terrain_contains_point(Terrain* t, float worldX, float worldZ);

// Ottiene i bounds 3D del chunk (per frustum culling)
void terrain_get_bounds(Terrain* t, vec3 outMin, vec3 outMax);

// Ottiene l'altezza esatta (interpolata) in un punto (x, z)
float terrain_get_height(Terrain* t, float worldX, float worldZ);

// Ottiene la normale del terreno in un punto (per slope detection, lighting)
void terrain_get_normal(Terrain* t, float worldX, float worldZ, vec3 outNormal);

// Converte coordinate world in UV (0-1) per sampling heightmap/walkmap
void terrain_world_to_uv(Terrain* t, float worldX, float worldZ, float* u, float* v);

// Verifica se un punto è camminabile (dentro bounds, sulla walk mask, pendenza OK)
bool terrain_is_walkable(Terrain* t, float worldX, float worldZ);

// Rendering del terreno (passa viewProj già moltiplicata)
void terrain_draw(Terrain* t, mat4 viewProj);

// Pulisce la memoria
void terrain_cleanup(Terrain* t);

// ============================================================================
// DEBUG: Visualizzazione heightmap e walkmap come nuvola di punti
// ============================================================================

// Inizializza il renderer di debug (chiamare dopo terrain_init_hybrid)
void terrain_debug_init(Terrain* t);

// Disegna la nuvola di punti della heightmap
// step: ogni quanti punti campionare (1 = tutti, 4 = ogni 4, etc.)
void terrain_debug_draw(Terrain* t, mat4 viewProj, int step);

// Disegna la walk map come nuvola di punti colorati
// step: ogni quanti punti campionare (1 = tutti, 4 = ogni 4, etc.)
// Verde = walkable, Rosso = non walkable
void terrain_debug_draw_walkmap(Terrain* t, mat4 viewProj, int step);

// Disegna il pathfinding grid 64x64
// Verde = walkable, Rosso = bloccato
void terrain_debug_draw_pathgrid(Terrain* t, mat4 viewProj);

// Libera risorse debug
void terrain_debug_cleanup(void);

#endif